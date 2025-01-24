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
  rowCount: number;
  createdAt: string;
}

export interface DatabaseInfo {
  name: string;
  tables: TableInfo[];
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
  executeQuery: (query: string, tabId: string) => Promise<void>;
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
  updateTabContent: (tabId: string, content: EditorTab["content"]) => void;
  updateTabQuery: (tabId: string, query: string) => void;
  moveTab: (oldIndex: number, newIndex: number) => void;
  closeAllTabs: () => void;
  deleteTable: (tableName: string, database?: string) => Promise<void>;
  clearHistory: () => void;
  cleanup: () => Promise<void>;
  fetchDatabasesAndTablesInfo: () => Promise<void>;
  switchDatabase: (databaseName: string) => Promise<void>;
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
  const columns = result.schema.fields.map((field: any) => ({
    name: field.name,
    type: field.type,
  }));


  const data = result.toArray().map((row: any) => {
    const jsonRow = row.toJSON();

    columns.forEach((col: any) => {
      try {
        const rawValue = jsonRow[col.name];

        console.log(col.type.typeId);
        console.log(rawValue);

        // Only process if value exists
        if (rawValue === null || rawValue === undefined) return;

        // Handle DATE type (days since epoch)
        if (col.type.typeId === 8) {
          // Ensure numeric value
          const days = Number(rawValue);
          if (!isNaN(days)) {
            const date = new Date(days * 86400000);
            // Validate date before setting
            if (!isNaN(date.getTime())) {
              jsonRow[col.name] = date.toISOString().split("T")[0];
            }
          }
        }
        // Handle TIMESTAMP (microseconds since epoch)
        else if (col.type.typeId === 9) {
          // Convert to number and validate
          const micros = Number(rawValue);
          if (!isNaN(micros)) {
            const date = new Date(micros / 1000);
            if (!isNaN(date.getTime())) {
              jsonRow[col.name] = date.toISOString();
            }
          }
        }
      } catch (error) {
        console.warn(`Error processing column ${col.name}:`, error);
        // Leave original value if conversion fails
      }
    });

    return jsonRow;
  });

  return {
    columns: columns.map((c) => c.name),
    columnTypes: columns.map((c) => c.type),
    data,
    rowCount: result.numRows,
    duration: 0,
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
        currentDatabase: "main",
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
          {
            id: crypto.randomUUID(),
            title: "Query 1",
            type: "sql",
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
            const logger = new duckdb.ConsoleLogger();
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
              currentDatabase: "main",
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
            set({ isLoading: true });
            const connection = validateConnection(get().connection);
            await connection.query(`SET memory_limit='${config.max_memory}GB'`);
            set({ duckDbConfigState: config, isLoading: false });
          } catch (error) {
            set({
              error: `Configuration failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              isLoading: false,
            });
          }
        },

        // Execute query with proper error handling
        executeQuery: async (query, tabId) => {
          try {
            const connection = validateConnection(get().connection);
            set({ isExecuting: true, error: null });

            const startTime = performance.now();
            const result = await connection.query(query);
            const duration = performance.now() - startTime;

            const queryResult = resultToJSON(result);
            queryResult.duration = duration;

            // Update state
            set((state) => ({
              queryHistory: [
                {
                  id: crypto.randomUUID(),
                  query,
                  timestamp: new Date(),
                  duration,
                },
                ...state.queryHistory.slice(0, 19),
              ],
              tabs: state.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, result: queryResult } : tab
              ),
              isExecuting: false,
            }));

            // Refresh schema if DDL
            if (/^(CREATE|ALTER|DROP|ATTACH)/i.test(query.trim())) {
              await get().fetchDatabasesAndTablesInfo();
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            // Prepare error result
            const errorResult: QueryResult = {
              columns: [],
              data: [],
              rowCount: 0,
              duration: 0,
              error: errorMessage,
            };

            set((state) => ({
              isExecuting: false,
              error: errorMessage,
              queryHistory: [
                {
                  id: crypto.randomUUID(),
                  query,
                  timestamp: new Date(),
                  error: errorMessage,
                },
                ...state.queryHistory,
              ],
              tabs: state.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, result: errorResult } : tab
              ),
            }));
          }
        },

        // Improved file import
        importFile: async (
          fileName,
          fileContent,
          tableName,
          fileType,
          database = "main"
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

            // Ensure database exists
            await connection.query(`CREATE DATABASE IF NOT EXISTS ${database}`);
            await connection.query(`USE ${database}`);

            // Create table
            await connection.query(`
              CREATE OR REPLACE TABLE "${tableName}" AS 
              SELECT * FROM read_${fileType.toLowerCase()}_auto('${fileName}')
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

            const databasesResult = await connection.query(
              `PRAGMA database_list`
            );
            const databases = await Promise.all(
              databasesResult.toArray().map(async (db: any) => {
                const dbName = db.name.toString();
                await connection.query(`USE ${dbName}`);

                const tablesResult = await connection.query(`
                  SELECT table_name as name 
                  FROM information_schema.tables 
                  WHERE table_schema = 'main'
                  AND table_type = 'BASE TABLE'
                `);

                const tables = await Promise.all(
                  tablesResult.toArray().map(async (tbl: any) => {
                    const tableName = tbl.name.toString();

                    const columnsResult = await connection.query(
                      `DESCRIBE "${tableName}"`
                    );
                    const columns = columnsResult.toArray().map((col: any) => ({
                      name: col.column_name.toString(),
                      type: col.column_type.toString(),
                      nullable: col.null === "YES",
                    }));

                    const countResult = await connection.query(
                      `SELECT COUNT(*) as count FROM "${tableName}"`
                    );

                    return {
                      name: tableName,
                      schema: dbName,
                      columns,
                      rowCount: Number(countResult.toArray()[0][0]),
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
            title:
              typeof title === "string" ? title : `Query ${get().tabs.length}`,
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

        updateTabContent: (tabId, content) => {
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, content } : tab
            ),
          }));
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
        deleteTable: async (tableName, database = "main") => {
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
              currentDatabase: "main",
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
