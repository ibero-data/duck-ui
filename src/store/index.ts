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

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  rowCount: number;
  createdAt: string;
}

export interface DatabaseInfo {
  name: string;
  tables: TableInfo[];
}

export interface QueryResult {
  columns: string[];
  columnTypes: string[];
  data: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
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

export interface DuckDBConfig {
  max_memory: number;
}

export interface DuckStoreState {
  // Database state
  db: duckdb.AsyncDuckDB | null;
  connection: duckdb.AsyncDuckDBConnection | null;
  isInitialized: boolean;
  currentDatabase: string;

  // Data Explorer State
  databases: DatabaseInfo[];

  // Query management
  queryHistory: QueryHistoryItem[];
  isExecuting: boolean;

  // Tab Management
  tabs: EditorTab[];
  activeTabId: string | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // DuckDB configurations
  duckDbConfigState: DuckDBConfig;

  // Actions
  initialize: () => Promise<void>;
  executeQuery: (query: string, tabId?: string) => Promise<QueryResult | void>;
  duckDbConfig: (config: DuckDBConfig) => Promise<void>;
  importFile: (
    fileName: string,
    fileContent: ArrayBuffer,
    tableName: string,
    fileType: string,
    database?: string
  ) => Promise<void>;
  createTab: (
    type?: EditorTabType,
    title?: string,
    content?: EditorTab["content"]
  ) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabQuery: (tabId: string, query: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  moveTab: (oldIndex: number, newIndex: number) => void;
  closeAllTabs: () => void;
  deleteTable: (tableName: string, database?: string) => Promise<void>;
  clearHistory: () => void;
  cleanup: () => Promise<void>;
  fetchDatabasesAndTablesInfo: () => Promise<void>;
  switchDatabase: (databaseName: string) => Promise<void>;
  exportParquet: (query: string) => Promise<Blob>;
}

// Utility function for connection validation
const validateConnection = (
  connection: duckdb.AsyncDuckDBConnection | null
) => {
  if (!connection || typeof connection.query !== "function") {
    throw new Error("Database connection is not valid");
  }
  return connection;
};

const resultToJSON = (result: any): QueryResult => {
  const data = result.toArray().map((row: any) => {
    const jsonRow = row.toJSON();
    result.schema.fields.forEach((field: any) => {
      const col = field.name;
      const type = field.type.toString();

      try {
        let value = jsonRow[col];
        if (value === null || value === undefined) return;

        if (type == "Date32<DAY>") {
          value = new Date(value).toLocaleDateString();
          jsonRow[col] = value;
        }

        if (type == "Date64<MILLISECOND>" || type == "Timestamp<MICROSECOND>") {
          value = new Date(value);
          jsonRow[col] = value;
        }
      } catch (error) {
        console.error(`Error processing column ${col}:`, error);
      }
    });
    return jsonRow;
  });

  return {
    columns: result.schema.fields.map((field: any) => field.name),
    columnTypes: result.schema.fields.map((field: any) =>
      field.type.toString()
    ),
    data,
    rowCount: result.numRows,
  };
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
        currentDatabase: "memory",
        databases: [],
        queryHistory: [],
        duckDbConfigState: { max_memory: 3.1 },
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
          const state = get();
          if (state.isInitialized) return;

          try {
            set({ isLoading: true, error: null });

            const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
            const worker = new Worker(bundle.mainWorker!);
            const logger = new duckdb.VoidLogger();
            const db = new duckdb.AsyncDuckDB(logger, worker);

            await db.instantiate(bundle.mainModule);
            const connection = await db.connect();

            // Validate connection immediately
            validateConnection(connection);

            await Promise.all([
              connection.query(`SET enable_http_metadata_cache=true`),
              connection.query(`SET enable_object_cache=true`),
              connection.query(`INSTALL arrow`),
              connection.query(`INSTALL parquet`),
            ]);

            set({
              db,
              connection,
              isInitialized: true,
              isLoading: false,
              currentDatabase: "memory",
            });

            await get().fetchDatabasesAndTablesInfo();
          } catch (error) {
            set({
              error: `Initialization failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              isLoading: false,
              isInitialized: false,
              db: null,
              connection: null,
            });
          }
        },

        // Database configuration
        duckDbConfig: async (config) => {
          try {
            const connection = validateConnection(get().connection);
            await connection.query(`SET memory_limit='${config.max_memory}GB'`);
            set({ duckDbConfigState: config });
          } catch (error) {
            set({
              error: `Configuration failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
        },

        // Execute query with proper error handling
        executeQuery: async (query, tabId?) => {
          try {
            const connection = validateConnection(get().connection);
            set({ isExecuting: true, error: null });

            const result = await connection.query(query);

            const queryResult = resultToJSON(result);

            if (!tabId) {
              set({ isExecuting: false, error: null });
              return queryResult;
            }

            // Update state
            set((state) => {
              const existingQueryIndex = state.queryHistory.findIndex(
                (item) => item.query === query
              );

              let newQueryHistory = [...state.queryHistory];

              if (existingQueryIndex !== -1) {
                // Query already exists, move to the top and update timestamp
                newQueryHistory = [
                  {
                    ...state.queryHistory[existingQueryIndex],
                    timestamp: new Date(),
                  },
                  ...state.queryHistory.filter(
                    (_, index) => index !== existingQueryIndex
                  ),
                ];
              } else {
                // Query doesn't exist, add a new one
                newQueryHistory = [
                  {
                    id: crypto.randomUUID(),
                    query,
                    timestamp: new Date(),
                  },
                  ...state.queryHistory,
                ];
              }

              // Limit history to 15 entries
              newQueryHistory = newQueryHistory.slice(0, 15);

              return {
                queryHistory: newQueryHistory,
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, result: queryResult } : tab
                ),
                isExecuting: false,
              };
            });

            // Refresh schema if DDL
            if (/^(CREATE|ALTER|DROP|ATTACH)/i.test(query.trim())) {
              await get().fetchDatabasesAndTablesInfo();
            }

            return;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            // Prepare error result
            const errorResult: QueryResult = {
              columns: [],
              columnTypes: [],
              data: [],
              rowCount: 0,
              error: errorMessage,
            };

            set((state) => {
              const existingQueryIndex = state.queryHistory.findIndex(
                (item) => item.query === query
              );

              let newQueryHistory = [...state.queryHistory];

              if (existingQueryIndex !== -1) {
                // Query already exists, move to the top and update timestamp
                newQueryHistory = [
                  {
                    ...state.queryHistory[existingQueryIndex],
                    timestamp: new Date(),
                    error: errorMessage,
                  },
                  ...state.queryHistory.filter(
                    (_, index) => index !== existingQueryIndex
                  ),
                ];
              } else {
                // Query doesn't exist, add a new one
                newQueryHistory = [
                  {
                    id: crypto.randomUUID(),
                    query,
                    timestamp: new Date(),
                    error: errorMessage,
                  },
                  ...state.queryHistory,
                ];
              }

              // Limit history to 15 entries
              newQueryHistory = newQueryHistory.slice(0, 15);

              return {
                isExecuting: false,
                error: errorMessage,
                queryHistory: newQueryHistory,
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, result: errorResult } : tab
                ),
              };
            });
          }
        },

        // Improved file import
        importFile: async (
          fileName,
          fileContent,
          tableName,
          fileType,
          database = "memory"
        ) => {
          try {
            const { db, connection } = get();
            if (!db || !connection) throw new Error("Database not initialized");

            const buffer = new Uint8Array(fileContent);

            // Cleanup previous registration
            try {
              await db.dropFile(fileName);
            } catch {}

            await db.registerFileBuffer(fileName, buffer);

            if (fileType === "duckdb") {
              await connection.query(
                `ATTACH DATABASE '${fileName}' AS ${tableName}`
              );
              await get().fetchDatabasesAndTablesInfo();
              return;
            }

            // Create table
            await connection.query(`
              CREATE OR REPLACE TABLE "${tableName}" AS 
              SELECT * FROM read_${fileType.toLowerCase()}('${fileName}')
            `);

            // Verify creation
            const verification = await connection.query(`
              SELECT COUNT(*) AS count 
              FROM information_schema.tables 
              WHERE table_name = '${tableName}'
                AND table_schema = '${database}'
            `);

            if (verification.toArray()[0][0] === 0) {
              throw new Error("Table creation verification failed");
            }

            await get().fetchDatabasesAndTablesInfo();
          } catch (error) {
            await get().fetchDatabasesAndTablesInfo();
            throw new Error(
              `Import failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        },

        // Complete data explorer implementation
        fetchDatabasesAndTablesInfo: async () => {
          try {
            const connection = validateConnection(get().connection);

            // Get the list of databases
            const databasesResult = await connection.query(
              `PRAGMA database_list`
            );

            const databases = await Promise.all(
              databasesResult.toArray().map(async (db: any) => {
                const dbName = db.name.toString();
                //Get all tables for a specific database
                const tablesResult = await connection.query(`
                  SELECT table_name
                  FROM information_schema.tables
                  WHERE table_catalog = '${dbName}'
                `);

                const tables = await Promise.all(
                  tablesResult.toArray().map(async (tbl: any) => {
                    const tableName = tbl.table_name.toString();

                    const columnsResult = await connection.query(
                      `DESCRIBE "${dbName}"."${tableName}"`
                    );
                    const columns = columnsResult.toArray().map((col: any) => ({
                      name: col.column_name.toString(),
                      type: col.column_type.toString(),
                      nullable: col.null === "YES",
                    }));

                    const countResult = await connection.query(
                      `SELECT COUNT(*) as count FROM "${dbName}"."${tableName}"`
                    );

                    return {
                      name: tableName,
                      schema: dbName,
                      columns,
                      rowCount: Number(countResult),
                      createdAt: new Date().toISOString(),
                    };
                  })
                );

                return { name: dbName, tables };
              })
            );

            set({ databases, error: null });
          } catch (error) {
            set({
              error: `Failed to load schema: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
        },

        // Database switching
        switchDatabase: async (databaseName) => {
          try {
            const connection = validateConnection(get().connection);
            set({ isLoading: true });
            await connection.query(`USE ${databaseName}`);
            set({ currentDatabase: databaseName, isLoading: false });
            await get().fetchDatabasesAndTablesInfo();
          } catch (error) {
            set({
              isLoading: false,
              error: `Database switch failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          }
        },

        // Rest of the tab management functions remain the same
        createTab: (type = "sql", content = "", title) => {
          const newTab: EditorTab = {
            id: crypto.randomUUID(),
            title: typeof title === "string" ? title : `Untitled Query`,
            type,
            content,
          };
          set((state) => ({
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          }));
        },

        closeTab: (tabId) => {
          set((state) => {
            const updatedTabs = state.tabs.filter((tab) => tab.id !== tabId);
            let newActiveTabId = state.activeTabId;
            if (updatedTabs.length === 0) {
              const newTab: EditorTab = {
                id: crypto.randomUUID(),
                title: "Query 1",
                type: "sql",
                content: "",
              };
              return {
                tabs: [newTab],
                activeTabId: newTab.id,
              };
            }
            if (state.activeTabId === tabId) {
              newActiveTabId = updatedTabs[0]?.id || null;
            }
            return {
              tabs: updatedTabs,
              activeTabId: newActiveTabId,
            };
          });
        },

        setActiveTab: (tabId) => {
          set({ activeTabId: tabId });
        },

        updateTabQuery: (tabId, query) => {
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId && tab.type === "sql"
                ? { ...tab, content: query }
                : tab
            ),
          }));
        },

        moveTab: (oldIndex, newIndex) => {
          set((state) => {
            const newTabs = [...state.tabs];
            const [movedTab] = newTabs.splice(oldIndex, 1);
            newTabs.splice(newIndex, 0, movedTab);
            return { tabs: newTabs };
          });
        },

        updateTabTitle: (tabId: string, title: string) => {
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, title } : tab
            ),
          }));
        },

        closeAllTabs: () => {
          set((state) => {
            const homeTab = state.tabs.find((tab) => tab.id === "home");
            const newTab: EditorTab = {
              id: crypto.randomUUID(),
              title: "Query 1",
              type: "sql",
              content: "",
            };
            const newTabs = homeTab ? [homeTab, newTab] : [newTab];
            return {
              tabs: newTabs,
              activeTabId: newTabs[0].id,
            };
          });
        },
        deleteTable: async (tableName, database = "memory") => {
          try {
            const connection = validateConnection(get().connection);
            set({ isLoading: true });
            await connection.query(
              `DROP TABLE IF EXISTS "${database}"."${tableName}"`
            );
            await get().fetchDatabasesAndTablesInfo();
            set({ isLoading: false });
          } catch (error) {
            set({
              isLoading: false,
              error: `Failed to delete table: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
            throw error;
          }
        },
        clearHistory: () => {
          set({ queryHistory: [] });
        },

        exportParquet: async (query: any) => {
          try {
            const { connection, db } = get();
            if (!connection || !db) {
              throw new Error("Database not initialized");
            }

            const now = new Date()
              .toISOString()
              .split(".")[0]
              .replace(/[:]/g, "-");
            const fileName = `result-${now}.parquet`;

            await connection.query(
              `COPY (${query}) TO '${fileName}' (FORMAT 'parquet')`
            );

            const parquet_buffer = await db.copyFileToBuffer(fileName);
            await db.dropFile(fileName);
            return new Blob([parquet_buffer], { type: "application/parquet" });
          } catch (error) {
            console.error("Failed to export to parquet:", error);
            throw new Error(
              `Parquet export failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        },

        cleanup: async () => {
          const { connection, db } = get();
          try {
            if (connection) await connection.close();
            if (db) await db.terminate();
          } finally {
            set({
              db: null,
              connection: null,
              isInitialized: false,
              databases: [],
              currentDatabase: "memory",
              error: null,
              queryHistory: [],
              tabs: [
                {
                  id: "home",
                  title: "Home",
                  type: "home",
                  content: "",
                },
              ],
              activeTabId: "home",
            });
          }
        },
      }),
      {
        name: "duck-ui-storage",
        partialize: (state) => ({
          queryHistory: state.queryHistory,
          duckDbConfigState: state.duckDbConfigState,
          databases: state.databases,
          tabs: state.tabs.map((tab) => ({ ...tab, result: undefined })),
          currentDatabase: state.currentDatabase,
        }),
      }
    )
  )
);
