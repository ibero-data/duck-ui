import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import * as duckdb from "@duckdb/duckdb-wasm";
import { toast } from "sonner";

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

//
// TYPES
//

declare global {
  interface Window {
    env?: {
      DUCK_UI_EXTERNAL_CONNECTION_NAME: string;
      DUCK_UI_EXTERNAL_HOST: string;
      DUCK_UI_EXTERNAL_PORT: string;
      DUCK_UI_EXTERNAL_USER: string;
      DUCK_UI_EXTERNAL_PASS: string;
      DUCK_UI_EXTERNAL_DATABASE_NAME: string;
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: boolean;
    };
  }
}

export interface CurrentConnection {
  environment: "APP" | "ENV" | "BUILT_IN";
  id: string;
  name: string;
  scope: "WASM" | "External";
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  authMode?: "none" | "password" | "api_key";
}

export interface ConnectionProvider {
  environment: "APP" | "ENV" | "BUILT_IN";
  id: string;
  name: string;
  scope: "WASM" | "External" | "OPFS";
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  authMode?: "none" | "password" | "api_key";
  path?: string;
}

export interface ConnectionList {
  connections: ConnectionProvider[];
}

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

export interface DuckStoreState {
  // Database state
  db: duckdb.AsyncDuckDB | null;
  connection: duckdb.AsyncDuckDBConnection | null;
  isInitialized: boolean;
  currentDatabase: string;
  currentConnection: CurrentConnection | null;
  connectionList: ConnectionList;

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

  // Data Explorer State (renamed to fix typo)
  isLoadingDbTablesFetch: boolean;

  isLoadingExternalConnection: boolean;

  // Actions
  initialize: () => Promise<void>;
  executeQuery: (query: string, tabId?: string) => Promise<QueryResult | void>;
  importFile: (
    fileName: string,
    fileContent: ArrayBuffer,
    tableName: string,
    fileType: string,
    database?: string,
    options?: Record<string, any>
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
  exportParquet: (query: string) => Promise<Blob>;

  // Connection Management Actions
  addConnection: (connection: ConnectionProvider) => Promise<void>;
  updateConnection: (connection: ConnectionProvider) => void;
  deleteConnection: (id: string) => void;
  setCurrentConnection: (connectionId: string) => Promise<void>;
  getConnection: (connectionId: string) => ConnectionProvider | undefined;
}

//
// HELPER FUNCTIONS
//

// Validate a DuckDB connection.
const validateConnection = (
  connection: duckdb.AsyncDuckDBConnection | null
): duckdb.AsyncDuckDBConnection => {
  if (!connection || typeof connection.query !== "function") {
    throw new Error("Database connection is not valid");
  }
  return connection;
};

// Converts a raw result (from an external HTTP endpoint) into a QueryResult.
const rawResultToJSON = (rawResult: any): QueryResult => {
  try {
    const parsed = JSON.parse(rawResult);
    if (
      !parsed.meta ||
      !parsed.data ||
      !Array.isArray(parsed.meta) ||
      !Array.isArray(parsed.data)
    ) {
      throw new Error(
        "Invalid raw result format: meta or data are missing or have the wrong format"
      );
    }
    const columns = parsed.meta.map((m: any) => m.name);
    const columnTypes = parsed.meta.map((m: any) => m.type);
    const data = parsed.data.map((row: any) => {
      const rowObject: Record<string, any> = {};
      columns.forEach((col: any, index: number) => {
        rowObject[col] = row[index];
      });
      return rowObject;
    });
    return {
      columns,
      columnTypes,
      data,
      rowCount: parsed.rows || data.length,
    };
  } catch (error) {
    console.error("Failed to parse raw result:", error);
    throw new Error(
      `Failed to parse raw result: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

// Converts a WASM query result into a QueryResult.
const resultToJSON = (result: any): QueryResult => {
  const data = result.toArray().map((row: any) => {
    const jsonRow = row.toJSON();
    result.schema.fields.forEach((field: any) => {
      const col = field.name;
      const type = field.type.toString();
      try {
        let value = jsonRow[col];
        if (value === null || value === undefined) return;
        if (type === "Date32<DAY>") {
          value = new Date(value).toLocaleDateString();
          jsonRow[col] = value;
        }
        if (
          type === "Date64<MILLISECOND>" ||
          type === "Timestamp<MICROSECOND>"
        ) {
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

/**
 * Executes a query against an external connection.
 * @param query The query string.
 * @param connection The external connection details.
 */

const executeExternalQuery = async (
  query: string,
  connection: CurrentConnection
): Promise<QueryResult> => {
  if (!connection.host || !connection.port) {
    throw new Error("Host and port must be defined for external connections.");
  }
  const url = `${connection.host}:${connection.port}/`;
  const authHeader = btoa(`${connection.user}:${connection.password}`);
  const body = query;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${authHeader}`,
    },
    body,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! Status: ${response.status}, Message: ${errorText}`
    );
  }
  const rawResult = await response.text();
  return rawResultToJSON(rawResult);
};

/**
 * Initializes a new DuckDB WASM connection.
 */
const initializeWasmConnection = async (): Promise<{
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}> => {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();

  // Check if unsigned extensions are allowed from environment
  const allowUnsignedExtensions =
    window.env?.DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS || false;

  // Create database with configuration
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule);

  const dbConfig: duckdb.DuckDBConfig = {
    allowUnsignedExtensions: allowUnsignedExtensions,
  };

  await db.open(dbConfig);

  const connection = await db.connect();
  // Validate immediately
  validateConnection(connection);

  // Install and load extensions
  await Promise.all([
    connection.query(`INSTALL excel`),
    connection.query(`LOAD excel`),
  ]);
  return { db, connection };
};

/**
 * Tests an external connection by executing a basic query.
 */
const testExternalConnection = async (
  connection: ConnectionProvider
): Promise<void> => {
  if (!connection.host || !connection.port) {
    throw new Error("Host and port must be defined for external connections.");
  }
  const url = `${connection.host}:${connection.port}/`;
  const authHeader = btoa(`${connection.user}:${connection.password}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${authHeader}`,
    },
    body: `SELECT 1`,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Connection test failed! Status: ${response.status}, Message: ${errorText}`
    );
  }
};

/**
 * Tests an OPFS connection by executing a basic query.
 */
const testOPFSConnection = async (conn: ConnectionProvider): Promise<{
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}> => {
  const { path } = conn;
  if (!path) {
    throw new Error("Path must be defined for OPFS connections.");
  }

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule);

  let opfsPath = path;
  if (path.startsWith('/')) {
    opfsPath = path.slice(1);
  }

  await db.open({
    path: `opfs://${opfsPath}`,
    accessMode: duckdb.DuckDBAccessMode.AUTOMATIC
  });

  const connection = await db.connect();
  // Validate immediately
  validateConnection(connection);

  await connection.query(`show tables`);

  return { db, connection };
};

/**
 * Helper to update query history.
 */

const updateHistory = (
  currentHistory: QueryHistoryItem[],
  query: string,
  errorMsg?: string
): QueryHistoryItem[] => {
  const newItem: QueryHistoryItem = {
    id: crypto.randomUUID(),
    query,
    timestamp: new Date(),
    ...(errorMsg ? { error: errorMsg } : {}),
  };
  const existingIndex = currentHistory.findIndex(
    (item) => item.query === query
  );
  const newHistory =
    existingIndex !== -1
      ? [newItem, ...currentHistory.filter((_, idx) => idx !== existingIndex)]
      : [newItem, ...currentHistory];
  return newHistory.slice(0, 15);
};

/**
 * Fetches databases and tables for an external connection. TODO
 */

/**
 * Fetches databases and tables using the WASM connection.
 */
const fetchWasmDatabases = async (
  connection: duckdb.AsyncDuckDBConnection
): Promise<DatabaseInfo[]> => {
  const dbListResult = await connection.query(`PRAGMA database_list`);
  return Promise.all(
    dbListResult.toArray().map(async (db: any) => {
      const dbName = db.name.toString();
      const tablesResult = await connection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_catalog = '${dbName}'`
      );
      const tables: TableInfo[] = await Promise.all(
        tablesResult.toArray().map(async (tbl: any) => {
          const tableName = tbl.table_name.toString();
          const columnsResult = await connection.query(
            `DESCRIBE "${dbName}"."${tableName}"`
          );
          const columns: ColumnInfo[] = columnsResult
            .toArray()
            .map((col: any) => ({
              name: col.column_name.toString(),
              type: col.column_type.toString(),
              nullable: col.null === "YES",
            }));
          const countResult = await connection.query(
            `SELECT COUNT(*) as count FROM "${dbName}"."${tableName}"`
          );
          // Assumes countResult.toArray() returns a 2D array where the first element is the count.
          const countValue = Number(countResult.toArray()[0][0]);
          return {
            name: tableName,
            schema: dbName,
            columns,
            rowCount: countValue,
            createdAt: new Date().toISOString(),
          };
        })
      );
      return { name: dbName, tables };
    })
  );
};

//
// STORE DEFINITION
//

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
        isLoadingDbTablesFetch: true,
        isLoadingExternalConnection: false,
        error: null,
        currentConnection: null,
        connectionList: {
          connections: [],
        },

        // Initialize DuckDB using WASM or External.
        initialize: async () => {
          const initialConnections: ConnectionProvider[] = [];

          // Extract environment variables if available
          const envVars: Window["env"] = window.env || {
            DUCK_UI_EXTERNAL_CONNECTION_NAME: "",
            DUCK_UI_EXTERNAL_HOST: "",
            DUCK_UI_EXTERNAL_PORT: "",
            DUCK_UI_EXTERNAL_USER: "",
            DUCK_UI_EXTERNAL_PASS: "",
            DUCK_UI_EXTERNAL_DATABASE_NAME: "",
            DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: false,
          };
          const {
            DUCK_UI_EXTERNAL_CONNECTION_NAME: externalConnectionName = "",
            DUCK_UI_EXTERNAL_HOST: externalHost = "",
            DUCK_UI_EXTERNAL_PORT: externalPort = "",
            DUCK_UI_EXTERNAL_USER: externalUser = "",
            DUCK_UI_EXTERNAL_PASS: externalPass = "",
            DUCK_UI_EXTERNAL_DATABASE_NAME: externalDatabaseName = "",
            DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: allowUnsignedExtensions = false,
          } = envVars;

          // Log config for debugging
          console.log("DuckDB Config:", {
            allowUnsignedExtensions,
            hasExternalConnection: Boolean(
              externalConnectionName && externalHost && externalPort
            ),
          });

          const wasmConnection: ConnectionProvider = {
            environment: "APP",
            id: "WASM",
            name: "WASM",
            scope: "WASM",
          };

          initialConnections.push(wasmConnection);

          if (externalConnectionName && externalHost && externalPort) {
            initialConnections.push({
              environment: "ENV",
              id: externalConnectionName,
              name: externalConnectionName,
              scope: "External",
              host: externalHost,
              port: Number(externalPort),
              user: externalUser,
              password: externalPass,
              database: externalDatabaseName,
              authMode: "password", // Assuming password auth
            });
          }

          set({
            connectionList: { connections: initialConnections },
          });

          if (initialConnections.length > 0) {
            // Initialize WASM and set "memory" as default
            const { db, connection } = await initializeWasmConnection();
            set({
              db,
              connection,
              isInitialized: true,
              currentDatabase: "memory",
            });
            await Promise.all([
              connection.query(`SET enable_http_metadata_cache=true`),
              connection.query(`INSTALL arrow`),
              connection.query(`INSTALL parquet`),
            ]);

            //Then automatically connect to the first connection.
            await get().setCurrentConnection(initialConnections[0].id);
          } else {
            set({ isLoading: false, isInitialized: true }); // Set as initialized if no connections are configured.
          }
        },

        // Execute a query with proper error handling.
        executeQuery: async (query, tabId?) => {
          const { currentConnection, connection } = get();
          try {
            set({ isExecuting: true, error: null });
            let queryResult: QueryResult;
            if (currentConnection?.scope === "External") {
              queryResult = await executeExternalQuery(
                query,
                currentConnection
              );
            } else {
              if (!connection)
                throw new Error("WASM connection not initialized");
              const wasmConnection = validateConnection(connection);
              const result = await wasmConnection.query(query);
              queryResult = resultToJSON(result);
            }
            // Update query history and update tab result if applicable.
            set((state) => ({
              queryHistory: updateHistory(state.queryHistory, query),
              tabs: state.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, result: queryResult } : tab
              ),
              isExecuting: false,
            }));
            // If the query is DDL, refresh schema.
            if (/^(CREATE|ALTER|DROP|ATTACH)/i.test(query.trim())) {
              await get().fetchDatabasesAndTablesInfo();
            }
            return tabId ? undefined : queryResult;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            const errorResult: QueryResult = {
              columns: [],
              columnTypes: [],
              data: [],
              rowCount: 0,
              error: errorMessage,
            };
            set((state) => ({
              queryHistory: updateHistory(
                state.queryHistory,
                query,
                errorMessage
              ),
              tabs: state.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, result: errorResult } : tab
              ),
              isExecuting: false,
              error: errorMessage,
            }));
          }
        },

        // Import a file and create a table.
        importFile: async (
          fileName,
          fileContent,
          tableName,
          fileType,
          database = "memory",
          options = {}
        ) => {
          try {
            const { db, connection, currentConnection } = get();

            if (currentConnection?.scope === "External") {
              throw new Error(
                "File import is not supported for external connections."
              );
            }

            if (!db || !connection) throw new Error("Database not initialized");
            const buffer = new Uint8Array(fileContent);
            // Try to drop any previously registered file.
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

            // Enhanced import with format-specific options
            if (fileType.toLowerCase() === "csv") {
              // Use provided options or defaults
              const csvOptions = options.csv || {};
              const headerOption =
                csvOptions.header !== undefined ? csvOptions.header : true;
              const autoDetectOption =
                csvOptions.autoDetect !== undefined
                  ? csvOptions.autoDetect
                  : true;
              const ignoreErrorsOption =
                csvOptions.ignoreErrors !== undefined
                  ? csvOptions.ignoreErrors
                  : true;
              const nullPaddingOption =
                csvOptions.nullPadding !== undefined
                  ? csvOptions.nullPadding
                  : true;
              const allVarcharOption =
                csvOptions.allVarchar !== undefined
                  ? csvOptions.allVarchar
                  : false;
              const delimiterOption = csvOptions.delimiter || ",";

              // Build CSV options string
              const optionsString = `
                header=${headerOption}, 
                auto_detect=${autoDetectOption}, 
                all_varchar=${allVarcharOption}, 
                ignore_errors=${ignoreErrorsOption}, 
                null_padding=${nullPaddingOption},
                delim='${delimiterOption}'
              `;

              await connection.query(`
                CREATE OR REPLACE TABLE "${tableName}" AS 
                SELECT * FROM read_csv('${fileName}', ${optionsString})
              `);
            } else if (fileType.toLowerCase() === "json") {
              await connection.query(`
                CREATE OR REPLACE TABLE "${tableName}" AS 
                SELECT * FROM read_json('${fileName}', auto_detect=true, ignore_errors=true)
              `);
            } else {
              await connection.query(`
                CREATE OR REPLACE TABLE "${tableName}" AS 
                SELECT * FROM read_${fileType.toLowerCase()}('${fileName}')
              `);
            }
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

        // Fetch database and tables info.
        fetchDatabasesAndTablesInfo: async () => {
          const { currentConnection, connection } = get();
          try {
            set({ isLoadingDbTablesFetch: true, error: null });
            let databases: DatabaseInfo[] = [];
            if (currentConnection?.scope === "External") {
              // TODO: Implement fetch database logic for external connection.
              databases = [];
            } else {
              if (!connection) {
                set({ databases: [], error: null });
                return;
              }
              const wasmConnection = validateConnection(connection);
              databases = await fetchWasmDatabases(wasmConnection);
            }
            set({ databases, error: null });
          } catch (error) {
            set({
              error: `Failed to load schema: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          } finally {
            set({ isLoadingDbTablesFetch: false });
          }
        },

        // Tab management actions.
        createTab: (type = "sql", content = "", title) => {
          const newTab: EditorTab = {
            id: crypto.randomUUID(),
            title: typeof title === "string" ? title : "Untitled Query",
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

        updateTabTitle: (tabId, title) => {
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, title } : tab
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
          // Close all tabs except the home tab.
          try {
            set((state) => ({
              tabs: state.tabs.filter((tab) => tab.type === "home"),
              activeTabId: "home",
            }));
            toast.success("All tabs closed successfully!");
          } catch (error: any) {
            toast.error(`Failed to close tabs: ${error.message}`);
          }
        },

        deleteTable: async (tableName, database = "memory") => {
          try {
            const { connection, currentConnection } = get();
            if (currentConnection?.scope === "External") {
              throw new Error(
                "Table deletion is not supported for external connections."
              );
            }
            const wasmConnection = validateConnection(connection);
            set({ isLoading: true });
            await wasmConnection.query(
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

        exportParquet: async (query: string) => {
          try {
            const { connection, db, currentConnection } = get();
            if (currentConnection?.scope === "External") {
              throw new Error(
                "Exporting to parquet is not supported for external connections."
              );
            }
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
              currentConnection: null,
            });
          }
        },

        // Connection Management Actions
        addConnection: async (connection) => {
          try {
            // set loading state
            set({ isLoadingExternalConnection: true, error: null });

            if (
              get().connectionList.connections.find(
                (c) => c.name === connection.name
              )
            ) {
              throw new Error(
                `A connection with the name "${connection.name}" already exists.`
              );
            }
            console.log(connection);
            if (connection.scope === "External") {
              await testExternalConnection(connection);
            } else if (connection.scope === "OPFS") {
              await testOPFSConnection(connection);
            }
            set((state) => ({
              connectionList: {
                connections: [...state.connectionList.connections, connection],
              },
            }));
            toast.success(
              `Connection "${connection.name}" added successfully!`
            );
          } catch (error) {
            set({
              error: `Failed to add connection: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
            toast.error(
              `Failed to add connection: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          } finally {
            set({ isLoadingExternalConnection: false });
          }
        },

        updateConnection: (connection) => {
          set((state) => ({
            connectionList: {
              connections: state.connectionList.connections.map((c) =>
                c.id === connection.id ? connection : c
              ),
            },
          }));
        },

        deleteConnection: (id) => {
          set((state) => ({
            connectionList: {
              connections: state.connectionList.connections.filter(
                (c) => c.id !== id
              ),
            },
          }));
        },

        setCurrentConnection: async (connectionId) => {
          try {
            set({ isLoading: true });
            const connectionProvider = get().connectionList.connections.find(
              (c) => c.id === connectionId
            );
            if (!connectionProvider) {
              throw new Error(`Connection with ID ${connectionId} not found.`);
            }

            set({
              currentConnection: {
                environment: connectionProvider.environment,
                id: connectionProvider.id,
                name: connectionProvider.name,
                scope: connectionProvider.scope,
                host: connectionProvider.host,
                port: connectionProvider.port,
                user: connectionProvider.user,
                password: connectionProvider.password,
                database: connectionProvider.database,
                authMode: connectionProvider.authMode,
              },
              isLoading: false,
            });
            await get().fetchDatabasesAndTablesInfo();
            toast.success(`Connected to ${connectionProvider.name}`);
          } catch (error) {
            set({
              error: `Failed to set current connection: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              isLoading: false,
            });
          } finally {
            set({ isLoading: false });
          }
        },

        getConnection: (connectionId) => {
          return get().connectionList.connections.find(
            (c) => c.id === connectionId
          );
        },
      }),
      {
        name: "duck-ui-storage",
        // Persist only selected parts of the state.
        partialize: (state) => ({
          queryHistory: state.queryHistory,
          databases: state.databases,
          tabs: state.tabs.map((tab) => ({ ...tab, result: undefined })),
          currentDatabase: state.currentDatabase,
          currentConnection: state.currentConnection,
          connectionList: state.connectionList,
        }),
      }
    )
  )
);
