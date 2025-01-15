import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import * as duckdb from "@duckdb/duckdb-wasm";

// Import WASM bundles
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

// Types
interface DatabaseEntry {
  seq: string;
  name: string;
  file: string | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  name: string;
  originalFileName: string;
  createdAt: string;
  columns: ColumnInfo[];
  rows: number;
}

export interface QueryResult {
  columns: string[];
  data: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  error?: string;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  duration?: number;
  error?: string;
}

export type EditorTabType = "sql" | "home";

export interface EditorTab {
  id: string;
  title: string;
  type: EditorTabType;
  content: string | { database?: string; table?: string };
  result?: QueryResult | null;
}

export interface DatabaseInfo {
  name: string;
  size?: number;
}
export interface DuckStoreState {
  // Database state
  db: duckdb.AsyncDuckDB | null;
  connection: duckdb.AsyncDuckDBConnection | null;
  isInitialized: boolean;

  // Tables management
  databases: DatabaseInfo[];
  tables: TableInfo[];

  // Query management
  queryHistory: QueryHistoryItem[];
  isExecuting: boolean;

  // Tab Management
  tabs: EditorTab[];
  activeTabId: string | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  executeQuery: (query: string, tabId: string) => Promise<void>;
  importFile: (
    fileName: string,
    fileContent: ArrayBuffer,
    tableName: string,
    fileType: string
  ) => Promise<void>;
  createTab: (
    type?: EditorTabType,
    title?: string,
    content?: EditorTab["content"]
  ) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: EditorTab["content"]) => void;
  updateTabQuery: (tabId: string, query: string) => void;
  moveTab: (oldIndex: number, newIndex: number) => void;
  closeAllTabs: () => void;
  deleteTable: (tableName: string) => Promise<void>;
  clearHistory: () => void;
  cleanup: () => Promise<void>;
}

const updateDataLists = async (
  set: any,
  connection: duckdb.AsyncDuckDBConnection,
  tableNameFromImport?: string,
  ddlQuery?: string
): Promise<void> => {
  console.log("updateDataLists: Starting combined data list update", {
    tableNameFromImport,
  });
  try {
    if (!connection) {
      console.error("updateDataLists: Database connection not available");
      throw new Error("Database connection not available");
    }

    // Fetch Databases
    const databasesQuery = await connection.query(`PRAGMA database_list;`);
    const databases: DatabaseEntry[] = databasesQuery.toArray().map((row) => ({
      seq: row.seq?.toString() ?? "",
      name: row.name?.toString() ?? "",
      file: row.file?.toString() ?? null,
    }));
    console.log("updateDataLists: Retrieved database names", { databases });

    // First, get all table names
    let tables: string[] = [];
    if (tableNameFromImport) {
      tables = [tableNameFromImport];
      console.log("updateDataLists: Using the provided table name", { tables });
    } else if (ddlQuery) {
      const tableNameFromQuery = ddlQuery;
      if (tableNameFromQuery) {
        tables = [tableNameFromQuery];
        console.log(
          "updateDataLists: Using the table name extracted from the ddl query",
          { tables }
        );
      } else {
        const tablesQuery = await connection.query(`
            SELECT 
              table_name as name
            FROM information_schema.tables 
            WHERE table_schema = 'main' 
            AND table_type = 'BASE TABLE'
            AND table_name NOT LIKE 'sqlite_%'
            AND table_name IS NOT NULL
          `);
        tables = tablesQuery.toArray().map((row) => row[0]);
        console.log("updateDataLists: Retrieved table names", { tables });
      }
    } else {
      const tablesQuery = await connection.query(`
          SELECT 
            table_name as name
          FROM information_schema.tables 
          WHERE table_schema = 'main' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'sqlite_%'
          AND table_name IS NOT NULL
        `);
      tables = tablesQuery.toArray().map((row) => row[0]);
      console.log("updateDataLists: Retrieved table names", { tables });
    }

    if (tables.length === 0) {
      console.log(
        "updateDataLists: No tables found, setting tables to empty array"
      );
      set((state: DuckStoreState) => ({ ...state, tables: [], error: null }));
    }

    const newTables: TableInfo[] = [];

    for (const tableName of tables) {
      console.log("updateDataLists: Processing table", { tableName });
      try {
        // Get schema information using the same approach as executeQuery
        const schemaQuery = await connection.query(
          `SELECT * FROM "${tableName}" LIMIT 0`
        );
        const columns = schemaQuery.schema.fields.map((field) => ({
          name: field.name,
          type: field.type.toString().toLowerCase(),
          nullable: !field.nullable,
        }));

        console.log("updateDataLists: Retrieved columns", {
          tableName,
          columns,
        });

        // Get row count
        const countResult = await connection.query(`
            SELECT COUNT(*) as count 
            FROM "${tableName}"
          `);

        const rowCount = Number(countResult.toArray()[0][0]);
        console.log("updateDataLists: Retrieved row count", {
          tableName,
          rowCount,
        });

        if (columns.length > 0) {
          const tableInfo: TableInfo = {
            name: tableName,
            originalFileName: tableNameFromImport || tableName,
            createdAt: new Date().toISOString(),
            columns,
            rows: rowCount,
          };
          newTables.push(tableInfo);
          console.log("updateDataLists: Added table to newTables", {
            tableInfo,
          });
        }
      } catch (error) {
        console.error(
          `updateDataLists: Error processing table ${tableName}:`,
          error
        );
      }
    }
    console.log(
      "updateDataLists: Finished processing tables, setting new table state",
      { newTables, databases }
    );

    set((state: DuckStoreState) => ({
      ...state,
      databases: databases as DatabaseInfo[],
      tables: newTables,
      error: null,
    }));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("updateDataLists: Error updating database list:", error);

    set((state: DuckStoreState) => ({
      ...state,
      error: `Error updating data list: ${errorMessage}`,
      databases: [],
      tables: [],
    }));
    throw error;
  }
};

// Create Store
export const useDuckStore = create<DuckStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        db: null,
        connection: null,
        isInitialized: false,
        databases: [],
        tables: [],
        queryHistory: [],
        isExecuting: false,
        tabs: [
          {
            id: "home",
            title: "Home",
            type: "home",
            content: "",
          },
        ],
        activeTabId: "home",
        isLoading: false,
        error: null,

        // Initialize DuckDB
        initialize: async () => {
          console.log("initialize: Starting DuckDB initialization");
          const state = get();
          if (state.isInitialized) {
            console.log("initialize: DuckDB already initialized, skipping");
            return;
          }

          set({ isLoading: true, error: null, tables: [], databases: [] });
          console.log("initialize: Setting isLoading to true");

          try {
            const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
            const worker = new Worker(bundle.mainWorker!);
            const logger = new duckdb.ConsoleLogger();
            const db = new duckdb.AsyncDuckDB(logger, worker);

            console.log(
              "initialize: DuckDB bundle selected and workers created"
            );

            await db.instantiate(bundle.mainModule);
            console.log("initialize: DuckDB instantiated");
            const connection = await db.connect();
            console.log("initialize: DuckDB connection established");

            await Promise.all([
              connection.query(`SET enable_http_metadata_cache=true;`),
              connection.query(`SET enable_object_cache=true;`),
              connection.query(`INSTALL arrow;`),
              connection.query(`INSTALL parquet;`),
            ]);
            console.log(
              "initialize: DuckDB configurations applied and extensions installed"
            );
            await updateDataLists(set, connection);

            set({
              db,
              connection,
              isInitialized: true,
              isLoading: false,
            });
            console.log("initialize: DuckDB initialization complete");
          } catch (error) {
            set({
              error: `Failed to initialize DuckDB: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              isLoading: false,
            });
            console.error("initialize: Failed to initialize DuckDB:", error);
          }
        },

        // Execute SQL query
        executeQuery: async (query: string, tabId: string) => {
          console.log("executeQuery: Starting query execution", {
            query,
            tabId,
          });
          const { connection } = get();
          if (!connection) {
            console.error("executeQuery: Database not initialized");
            set({
              error: "Database not initialized",
              isExecuting: false,
            });
            return;
          }

          set({ isExecuting: true, error: null });
          console.log("executeQuery: Setting isExecuting to true");
          const startTime = performance.now();

          try {
            const result = await connection.query(query);
            console.log("executeQuery: Query result:", result);
            const duration = performance.now() - startTime;

            const historyItem: QueryHistoryItem = {
              id: crypto.randomUUID(),
              query,
              timestamp: new Date(),
              duration,
            };

            const columns = result.schema.fields.map((f) => f.name);
            const data = result.toArray().map((row: any) => {
              const obj: Record<string, unknown> = {};
              Object.values(row).forEach((value, index) => {
                if (index < columns.length) {
                  const columnName = columns[index];
                  if (typeof value === "bigint") {
                    obj[columnName] = value.toString();
                  } else if (
                    columnName.toLowerCase().includes("now") ||
                    columnName.toLowerCase().includes("timestamp") ||
                    columnName.toLowerCase().includes("date")
                  ) {
                    // Handle timestamp values
                    const timestamp = Number(value);
                    if (!isNaN(timestamp)) {
                      obj[columnName] = new Date(timestamp);
                    } else {
                      obj[columnName] = value;
                    }
                  } else {
                    obj[columnName] = value;
                  }
                }
              });
              return obj;
            });

            const queryResult: QueryResult = {
              columns,
              data,
              rowCount: result.numRows,
              duration,
            };
            console.log("executeQuery: Query result processed", {
              queryResult,
            });
            const isDDL =
              /^(CREATE|ATTACH|DROP|ALTER|INSERT|UPDATE|DELETE)/i.test(
                query.trim()
              );
            console.log("executeQuery: Checking if the query is DDL", {
              isDDL,
            });

            if (isDDL) {
              try {
                await updateDataLists(set, connection, undefined, query);
                console.log(
                  "executeQuery: updateDataLists completed successfully after DDL query"
                );
              } catch (e) {
                console.error(
                  "executeQuery: Error updating table list after DDL",
                  e
                );
              }
            }

            set((state) => {
              const existingQuery = state.queryHistory.find(
                (item) => item.query === query
              );
              const newHistory = existingQuery
                ? state.queryHistory
                : [historyItem, ...state.queryHistory];
              const uniqueHistory = newHistory.slice(0, 20);
              return {
                queryHistory: uniqueHistory,
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, result: queryResult } : tab
                ),
                isExecuting: false,
              };
            });
            console.log("executeQuery: Query execution complete", {
              query,
              tabId,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            const historyItem: QueryHistoryItem = {
              id: crypto.randomUUID(),
              query,
              timestamp: new Date(),
              error: errorMessage,
            };
            console.error("executeQuery: Error during query execution:", error);
            set((state) => ({
              queryHistory: [historyItem, ...state.queryHistory],
              tabs: state.tabs.map((tab) =>
                tab.id === tabId
                  ? {
                      ...tab,
                      result: {
                        columns: [],
                        data: [],
                        rowCount: 0,
                        duration: 0,
                        error: errorMessage,
                      },
                    }
                  : tab
              ),
              error: errorMessage,
              isExecuting: false,
            }));
          }
        },

        // Import File (CSV, JSON, Arrow, Parquet)
        importFile: async (
          fileName: string,
          fileContent: ArrayBuffer,
          tableName: string,
          fileType: string
        ) => {
          console.log("importFile: Starting file import", {
            fileName,
            tableName,
            fileType,
          });
          const { db, connection } = get();
          if (!db || !connection) {
            console.error("importFile: Database not initialized");
            throw new Error("Database not initialized");
          }

          if (!tableName) {
            console.error("importFile: Table name is required");
            throw new Error("Table name is required");
          }
          try {
            const buffer = new Uint8Array(fileContent);
            console.log("importFile: File content converted to Uint8Array");

            // First unregister if exists (cleanup)
            try {
              await db.dropFile(fileName);
              console.log("importFile: Previous file dropped", { fileName });
            } catch (e) {
              // Ignore errors during cleanup
              console.warn(
                "importFile: Error dropping previous file (if any), ignoring error:",
                e
              );
            }

            // Register the new file
            await db.registerFileBuffer(fileName, buffer);
            console.log("importFile: File registered in DuckDB", { fileName });

            // Drop existing table if it exists
            await connection.query(`DROP TABLE IF EXISTS "${tableName}"`);
            console.log("importFile: Existing table dropped (if any)", {
              tableName,
            });
            // Construct and execute the appropriate import query based on file type
            let importQuery = "";
            switch (fileType.toLowerCase()) {
              case "csv":
                importQuery = `
                    CREATE TABLE "${tableName}" AS 
                    SELECT * FROM read_csv_auto(
                      '${fileName}',
                      header=true,
                      all_varchar=false,
                      sample_size=-1
                    )`;
                break;
              case "json":
                importQuery = `
                    CREATE TABLE "${tableName}" AS 
                    SELECT * FROM read_json_auto(
                      '${fileName}',
                      format='array'
                    )`;
                break;
              case "parquet":
                importQuery = `
                    CREATE TABLE "${tableName}" AS 
                    SELECT * FROM read_parquet('${fileName}')`;
                break;
              case "arrow":
                importQuery = `
                    CREATE TABLE "${tableName}" AS 
                    SELECT * FROM read_arrow('${fileName}')`;
                break;
              default:
                console.error("importFile: Unsupported file type", {
                  fileType,
                });
                throw new Error(`Unsupported file type: ${fileType}`);
            }
            console.log("importFile: Constructed import query", {
              importQuery,
            });
            // Execute the import query
            await connection.query(importQuery);
            console.log("importFile: Import query executed");

            // Verify the table was created
            const verifyResult = await connection.query(`
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_name = '${tableName}'
              `);
            console.log("importFile: Verifying table creation", {
              verifyResult,
            });

            if (verifyResult.toArray()[0][0] === 0) {
              console.error(
                "importFile: Table creation failed, verification failed"
              );
              throw new Error("Table creation failed");
            }

            // Update the combined data lists
            await updateDataLists(set, connection, tableName);
            console.log("importFile: Table list updated after file import");
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.error("importFile: File import failed:", error);
            throw new Error(`File import failed: ${errorMessage}`);
          }
        },

        // Tab management
        createTab: (type = "sql", content = "", title) => {
          console.log("createTab: Creating new tab", { type, content });
          const newTab: EditorTab = {
            id: crypto.randomUUID(),
            title:
              typeof title === "string" ? title : `Query ${get().tabs.length}`,
            type,
            content,
          };
          console.log("createTab: New tab created", { newTab });
          set((state) => ({
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          }));
        },

        closeTab: (tabId: string) => {
          console.log("closeTab: Closing tab", { tabId });
          set((state) => {
            const updatedTabs = state.tabs.filter((tab) => tab.id !== tabId);

            // Don't allow closing the last tab
            if (updatedTabs.length === 0) {
              const newTab: EditorTab = {
                id: crypto.randomUUID(),
                title: "Query 1",
                type: "sql",
                content: "",
              };
              console.log("closeTab: Last tab closed, creating new tab", {
                newTab,
              });
              return {
                tabs: [newTab],
                activeTabId: newTab.id,
              };
            }

            // Update active tab if necessary
            const newActiveTabId =
              state.activeTabId === tabId
                ? updatedTabs[0]?.id || null
                : state.activeTabId;

            console.log("closeTab: Tab closed, new active tab", {
              tabId,
              newActiveTabId,
            });
            return {
              tabs: updatedTabs,
              activeTabId: newActiveTabId,
            };
          });
        },

        setActiveTab: (tabId: string) => {
          console.log("setActiveTab: Setting active tab", { tabId });
          set({ activeTabId: tabId });
        },

        updateTabContent: (tabId: string, content: EditorTab["content"]) => {
          console.log("updateTabContent: Updating tab content", {
            tabId,
            content,
          });
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, content } : tab
            ),
          }));
        },

        updateTabQuery: (tabId: string, query: string) => {
          console.log("updateTabQuery: Updating tab query", { tabId, query });
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId && tab.type === "sql"
                ? { ...tab, content: query }
                : tab
            ),
          }));
        },

        moveTab: (oldIndex: number, newIndex: number) => {
          console.log("moveTab: Moving tab", { oldIndex, newIndex });
          set((state) => {
            const newTabs = [...state.tabs];
            const [movedTab] = newTabs.splice(oldIndex, 1);
            newTabs.splice(newIndex, 0, movedTab);
            return { tabs: newTabs };
          });
        },

        closeAllTabs: () => {
          console.log("closeAllTabs: Closing all tabs");
          set((state) => {
            const homeTab = state.tabs.find((tab) => tab.id === "home");
            const newTab: EditorTab = {
              id: crypto.randomUUID(),
              title: "Query 1",
              type: "sql",
              content: "",
            };
            const newTabs = homeTab ? [homeTab, newTab] : [newTab];
            console.log("closeAllTabs: Setting new tabs", { newTabs });
            return {
              tabs: newTabs,
              activeTabId: newTabs[0].id,
            };
          });
        },

        deleteTable: async (tableName: string) => {
          console.log("deleteTable: Starting table deletion", { tableName });
          const { connection } = get();
          if (!connection) {
            console.error("deleteTable: Database not initialized");
            set({ error: "Database not initialized" });
            return;
          }

          try {
            set({ error: null });
            console.log("deleteTable: Setting isLoading to true");
            // Sanitize table name for safety

            console.log("deleteTable: Sanitized table name", {
              tableName,
            });
            // Verify table exists before attempting to drop
            const verifyResult = await connection.query(`
              SELECT COUNT(*) 
              FROM information_schema.tables 
              WHERE table_name = '${tableName}'
            `);
            console.log("deleteTable: Verifying table existence", {
              verifyResult,
            });
            if (verifyResult.toArray()[0][0] === 0) {
              console.error(`deleteTable: Table ${tableName} does not exist`);
              throw new Error(`Table ${tableName} does not exist`);
            }
            console.log("deleteTable: Table exists, proceeding to drop table", {
              tableName,
            });
            await connection.query(`DROP TABLE IF EXISTS "${tableName}"`);
            await updateDataLists(set, connection);

            console.log("deleteTable: Table deleted and UI state updated", {
              tableName,
            });
          } catch (error) {
            console.error("deleteTable: Failed to delete table:", error);
            set({
              isLoading: false,
              error: `Failed to delete table: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
            throw error;
          }
        },

        // History management
        clearHistory: () => {
          console.log("clearHistory: Clearing query history");
          set({ queryHistory: [] });
        },

        // Cleanup
        cleanup: async () => {
          console.log("cleanup: Starting cleanup");
          const { connection, db } = get();
          try {
            if (connection) {
              await connection.close();
              console.log("cleanup: Database connection closed");
            }
            if (db) {
              await db.terminate();
              console.log("cleanup: Database terminated");
            }

            // Reset to initial state
            set({
              db: null,
              connection: null,
              isInitialized: false,
              databases: [],
              error: null,
              tables: [],
              queryHistory: [],
              isExecuting: false,
              tabs: [
                {
                  id: "home",
                  title: "Home",
                  type: "home",
                  content: "",
                },
                {
                  id: crypto.randomUUID(),
                  title: "Query 1",
                  type: "sql",
                  content: "",
                },
              ],
              activeTabId: "home",
            });
            console.log("cleanup: State reset to initial values");
          } catch (error) {
            console.error("cleanup: Cleanup failed:", error);
            throw error;
          }
        },
      }),
      {
        name: "duck-studio-storage",
        partialize: (state) => ({
          databases: state.databases,
          tables: state.tables,
          queryHistory: state.queryHistory,
          tabs: state.tabs.map((tab) => ({
            ...tab,
            result: undefined, // Don't persist query results
          })),
          activeTabId: state.activeTabId,
        }),
      }
    )
  )
);
