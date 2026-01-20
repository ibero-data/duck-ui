import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import * as duckdb from "@duckdb/duckdb-wasm";
import { toast } from "sonner";
import {
  cloudStorageService,
  type CloudConnection,
  type CloudSupportStatus,
} from "@/lib/cloudStorage";

// Re-export cloud storage types for use in components
export type { CloudConnection, CloudSupportStatus };

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
  scope: "WASM" | "External" | "OPFS";
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  authMode?: "none" | "password" | "api_key";
  apiKey?: string;
  path?: string;
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
  apiKey?: string;
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

export interface ColumnStats {
  column_name: string;
  column_type: string;
  min: string | null;
  max: string | null;
  approx_unique: string | null;
  avg: string | null;
  std: string | null;
  q25: string | null;
  q50: string | null;
  q75: string | null;
  count: string;
  null_percentage: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  rowCount: number;
  createdAt: string;
  columnStats?: ColumnStats[]; // Optional: fetched on demand
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

export interface QueryResultArtifact {
  status: "pending" | "running" | "success" | "error";
  data?: QueryResult;
  error?: string;
  executedAt?: Date;
}

export type AIProviderType = "webllm" | "openai" | "anthropic" | "openai-compatible";

export interface ProviderConfigs {
  openai?: { apiKey: string; modelId: string };
  anthropic?: { apiKey: string; modelId: string };
  "openai-compatible"?: { baseUrl: string; modelId: string; apiKey?: string };
}

export interface DuckBrainMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sql?: string; // Extracted SQL if role is assistant
  queryResult?: QueryResultArtifact; // Inline query result artifact
}

// Mounted folder info for store (metadata only - handle stored in IndexedDB)
export interface MountedFolderInfo {
  id: string;
  name: string;
  addedAt: Date;
  hasPermission: boolean;
}

export type EditorTabType = "sql" | "home" | "brain" | "connections";

// Advanced Chart Configuration Types
export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "area"
  | "scatter"
  | "combo"
  | "stacked_bar"
  | "grouped_bar"
  | "stacked_area"
  | "donut"
  | "heatmap"
  | "treemap"
  | "funnel"
  | "gauge"
  | "box"
  | "bubble";

export type AggregationType = "sum" | "avg" | "count" | "min" | "max" | "none";
export type SortOrder = "asc" | "desc" | "none";
export type AxisScale = "linear" | "log";

export interface SeriesConfig {
  column: string;
  label?: string;
  color?: string;
  type?: "bar" | "line" | "area"; // For combo charts
  yAxisId?: "left" | "right"; // For dual-axis
  aggregation?: AggregationType;
}

export interface AxisConfig {
  label?: string;
  scale?: AxisScale;
  min?: number;
  max?: number;
  format?: string; // Number format pattern
  showGrid?: boolean;
  rotate?: number; // Label rotation angle
}

export interface LegendConfig {
  show?: boolean;
  position?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export interface AnnotationConfig {
  id: string;
  type: "line" | "text" | "box";
  value?: number; // For reference lines
  text?: string;
  x?: number;
  y?: number;
  color?: string;
}

export interface DataTransform {
  groupBy?: string; // Column to group by
  aggregation?: AggregationType;
  sortBy?: string;
  sortOrder?: SortOrder;
  limit?: number; // Top N
  filter?: string; // WHERE clause
}

export interface ChartConfig {
  type: ChartType;

  // Axis configuration
  xAxis: string;
  xAxisConfig?: AxisConfig;
  yAxis?: string; // Single series (backward compatible)
  yAxisConfig?: AxisConfig;

  // Multi-series support
  series?: SeriesConfig[]; // Multiple Y columns
  colorBy?: string; // Column for color grouping
  sizeBy?: string; // For bubble charts

  // Data operations
  transform?: DataTransform;

  // Visual customization
  colors?: string[]; // Color palette
  legend?: LegendConfig;
  showValues?: boolean; // Show data labels
  showGrid?: boolean;
  enableAnimations?: boolean;
  annotations?: AnnotationConfig[];

  // Chart-specific options
  stacked?: boolean; // For bar/area charts
  smooth?: boolean; // For line charts
  innerRadius?: number; // For donut charts (0-100)

  // Title and description
  title?: string;
  subtitle?: string;
}

export interface EditorTab {
  id: string;
  title: string;
  type: EditorTabType;
  content: string | { database?: string; table?: string };
  result?: QueryResult | null;
  chartConfig?: ChartConfig;
}

export interface DuckStoreState {
  // Database state - active instances
  db: duckdb.AsyncDuckDB | null;
  connection: duckdb.AsyncDuckDBConnection | null;

  // Multiple DB instances support
  wasmDb: duckdb.AsyncDuckDB | null;
  wasmConnection: duckdb.AsyncDuckDBConnection | null;
  opfsDb: duckdb.AsyncDuckDB | null;
  opfsConnection: duckdb.AsyncDuckDBConnection | null;

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
  schemaFetchError: string | null;

  isLoadingExternalConnection: boolean;

  // Duck Brain AI State
  duckBrain: {
    modelStatus: "idle" | "checking" | "downloading" | "loading" | "ready" | "error";
    downloadProgress: number;
    downloadStatus: string;
    isWebGPUSupported: boolean | null;
    currentModel: string | null;
    error: string | null;
    messages: DuckBrainMessage[];
    isGenerating: boolean;
    streamingContent: string;
    isPanelOpen: boolean;
    // AI Provider settings
    aiProvider: AIProviderType;
    providerConfigs: ProviderConfigs;
  };

  // File System Access State
  mountedFolders: MountedFolderInfo[];
  isFileSystemSupported: boolean;

  // Cloud Storage State
  cloudConnections: CloudConnection[];
  cloudSupportStatus: CloudSupportStatus | null;
  isCloudStorageInitialized: boolean;

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
  updateTabChartConfig: (tabId: string, chartConfig: ChartConfig | undefined) => void;
  moveTab: (oldIndex: number, newIndex: number) => void;
  closeAllTabs: () => void;
  deleteTable: (tableName: string, database?: string) => Promise<void>;
  clearHistory: () => void;
  cleanup: () => Promise<void>;
  fetchDatabasesAndTablesInfo: () => Promise<void>;
  fetchTableColumnStats: (databaseName: string, tableName: string) => Promise<ColumnStats[]>;
  exportParquet: (query: string) => Promise<Blob>;

  // Connection Management Actions
  addConnection: (connection: ConnectionProvider) => Promise<void>;
  updateConnection: (connection: ConnectionProvider) => void;
  deleteConnection: (id: string) => void;
  setCurrentConnection: (connectionId: string) => Promise<void>;
  getConnection: (connectionId: string) => ConnectionProvider | undefined;

  // Duck Brain AI Actions
  initializeDuckBrain: (modelId?: string) => Promise<void>;
  generateSQL: (naturalLanguage: string) => Promise<string | null>;
  toggleBrainPanel: () => void;
  abortGeneration: () => void;
  clearBrainMessages: () => void;
  addBrainMessage: (message: Omit<DuckBrainMessage, "id" | "timestamp">) => void;
  setStreamingContent: (content: string) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  executeQueryInChat: (messageId: string, sql: string) => Promise<QueryResult | null>;
  updateMessageQueryResult: (messageId: string, queryResult: QueryResultArtifact) => void;
  // AI Provider actions
  setAIProvider: (provider: AIProviderType) => void;
  updateProviderConfig: (provider: "openai" | "anthropic" | "openai-compatible", config: { apiKey?: string; modelId: string; baseUrl?: string }) => void;
  initializeExternalProvider: () => Promise<void>;

  // File System Access Actions
  initFileSystem: () => Promise<void>;
  mountFolder: () => Promise<MountedFolderInfo | null>;
  unmountFolder: (id: string) => Promise<void>;
  refreshFolderPermissions: () => Promise<void>;

  // Cloud Storage Actions
  initCloudStorage: () => Promise<void>;
  addCloudConnection: (config: Omit<CloudConnection, "id" | "addedAt" | "isConnected">) => Promise<CloudConnection | null>;
  removeCloudConnection: (id: string) => Promise<void>;
  connectCloudStorage: (id: string) => Promise<boolean>;
  disconnectCloudStorage: (id: string) => Promise<void>;
  testCloudConnection: (id: string) => Promise<{ success: boolean; error?: string }>;
}

//
// HELPER FUNCTIONS
//

// OPFS connection tracking to prevent concurrent access
const opfsActivePaths = new Set<string>();

// Centralized OPFS connection cleanup with proper handle release
const cleanupOPFSConnection = async (
  db: duckdb.AsyncDuckDB | null,
  connection: duckdb.AsyncDuckDBConnection | null,
  path?: string
): Promise<void> => {
  if (db && connection) {
    try {
      await connection.close();
      await db.terminate();
      // Critical: Wait for file handles to be fully released by browser
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (path) {
        opfsActivePaths.delete(path);
      }
    } catch (error) {
      console.error("OPFS cleanup error:", error);
      // Still wait even if cleanup failed - handles may still release
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (path) {
        opfsActivePaths.delete(path);
      }
    }
  }
};

// Exponential backoff retry helper
const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Operation failed after retries");
};

// Validate a DuckDB connection.
const validateConnection = (
  connection: duckdb.AsyncDuckDBConnection | null
): duckdb.AsyncDuckDBConnection => {
  if (!connection || typeof connection.query !== "function") {
    throw new Error("Database connection is not valid");
  }
  return connection;
};

// Type for external query response
interface ExternalQueryResponse {
  meta: Array<{ name: string; type: string }>;
  data: unknown[][];
  rows?: number;
}

// Converts a raw result (from an external HTTP endpoint) into a QueryResult.
const rawResultToJSON = (rawResult: string): QueryResult => {
  try {
    // Try parsing as single JSON first (standard format)
    let parsed: Partial<ExternalQueryResponse>;

    try {
      parsed = JSON.parse(rawResult);
    } catch (singleJsonError) {
      // If single JSON fails, try NDJSON (newline-delimited JSON)
      // DuckDB httpserver may return multiple JSON objects, one per line
      const lines = rawResult.trim().split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        throw new Error("Empty response");
      }

      // Parse each line as JSON
      const objects = lines.map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`Failed to parse line ${idx + 1}: ${line.substring(0, 50)}...`);
        }
      });

      // Find the result object (has meta and data)
      const resultObj = objects.find(
        (obj): obj is ExternalQueryResponse =>
          obj && typeof obj === 'object' && 'meta' in obj && 'data' in obj
      );

      if (resultObj) {
        parsed = resultObj;
      } else {
        // If no single result object, try to merge (meta from one, data from others)
        const metaObj = objects.find(obj => obj?.meta);
        const dataObj = objects.find(obj => obj?.data);

        if (metaObj && dataObj) {
          parsed = {
            meta: metaObj.meta,
            data: dataObj.data,
            rows: dataObj.rows || dataObj.data?.length || 0,
          };
        } else {
          throw singleJsonError; // Re-throw original error
        }
      }
    }

    // Validate required fields
    if (!parsed || typeof parsed !== 'object') {
      throw new Error("Invalid response: not a valid JSON object");
    }

    if (!parsed.meta || !parsed.data || !Array.isArray(parsed.meta) || !Array.isArray(parsed.data)) {
      throw new Error("Invalid response: meta or data missing or wrong format");
    }

    // Convert to QueryResult format
    const columns = parsed.meta.map(m => m.name);
    const columnTypes = parsed.meta.map(m => m.type);
    const data = parsed.data.map((row: unknown) => {
      if (!Array.isArray(row)) {
        throw new Error("Invalid row format: expected array");
      }
      const rowObject: Record<string, unknown> = {};
      columns.forEach((col, index) => {
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
    throw new Error(
      `Failed to parse raw result: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

// Converts a WASM query result into a QueryResult.
const resultToJSON = (result: any): QueryResult => {
  try {
    const schema = result.schema;
    const fields = schema.fields;

    // Pre-extract column vectors for Decimal types
    const columnVectors = fields.map((_: any, colIdx: number) => result.getChildAt(colIdx));

    // Use the standard toArray().map() approach, but fix Decimal values from column vectors
    const data = result.toArray().map((row: any, rowIndex: number) => {
      const jsonRow = row.toJSON();

      // Fix Decimal types by reading directly from column vectors
      fields.forEach((field: any, columnIndex: number) => {
        const col = field.name;
        const type = field.type.toString();

        // Only fix Decimal types - they come as null from toJSON()
        if (type.includes("Decimal")) {
          try {
            // Get the value directly from the column vector
            const value = columnVectors[columnIndex].get(rowIndex);

            if (value !== null && value !== undefined) {
              // Convert Decimal object to number
              // Arrow Decimals store unscaled values - we need to apply the scale
              if (typeof value === "object" && typeof value.valueOf === "function") {
                const unscaledValue = Number(value.valueOf());
                const scale = field.type.scale || 0; // Get scale from Arrow type metadata
                const scaledValue = unscaledValue / Math.pow(10, scale);
                jsonRow[col] = scaledValue;
              } else if (typeof value === "number") {
                jsonRow[col] = value;
              } else if (typeof value === "string") {
                const parsed = parseFloat(value);
                jsonRow[col] = isNaN(parsed) ? null : parsed;
              } else {
                jsonRow[col] = null;
              }
            }
          } catch (error) {
            console.error(`Error processing Decimal column ${col} at row ${rowIndex}:`, error);
          }
        }
        // Fix Date types
        else if (type === "Date32<DAY>") {
          let value = jsonRow[col];
          if (value !== null && value !== undefined) {
            jsonRow[col] = new Date(value).toLocaleDateString();
          }
        }
        // Fix Timestamp types
        else if (
          type === "Date64<MILLISECOND>" ||
          type === "Timestamp<MICROSECOND>"
        ) {
          let value = jsonRow[col];
          if (value !== null && value !== undefined) {
            jsonRow[col] = new Date(value);
          }
        }
      });

      return jsonRow;
    });

    return {
      columns: fields.map((field: any) => field.name),
      columnTypes: fields.map((field: any) => field.type.toString()),
      data,
      rowCount: result.numRows,
    };
  } catch (error) {
    console.error("Error converting query result to JSON:", error);
    return {
      columns: [],
      columnTypes: [],
      data: [],
      rowCount: 0,
      error: `Failed to process query results: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
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
  if (!connection.host) {
    throw new Error("Host must be defined for external connections.");
  }

  // Construct URL properly - handle schemes and ports
  let url = connection.host;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  if (connection.port && !connection.host.includes(':')) {
    url = `${url}:${connection.port}`;
  }
  if (!url.endsWith('/')) {
    url = `${url}/`;
  }

  // Build headers based on auth mode
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    format: "JSONCompact",
  };

  if (connection.authMode === "api_key" && connection.apiKey) {
    headers["X-API-Key"] = connection.apiKey;
  } else if (connection.authMode === "password" && connection.user && connection.password) {
    const authHeader = btoa(`${connection.user}:${connection.password}`);
    headers["Authorization"] = `Basic ${authHeader}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error("Authentication failed - check your credentials");
      } else if (response.status === 404) {
        throw new Error(`Cannot reach server at ${url}`);
      }
      throw new Error(
        `HTTP error! Status: ${response.status}, Message: ${errorText}`
      );
    }

    const rawResult = await response.text();
    return rawResultToJSON(rawResult);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Cannot reach ${url}. Check your connection and CORS settings.`);
    }
    throw error;
  }
};

/**
 * Loads embedded databases from the public/databases directory.
 */
const loadEmbeddedDatabases = async (
  db: duckdb.AsyncDuckDB,
  connection: duckdb.AsyncDuckDBConnection
): Promise<void> => {
  try {
    // Fetch the manifest file
    const manifestResponse = await fetch('/databases/manifest.json');
    if (!manifestResponse.ok) {
      console.info('No embedded databases manifest found');
      return;
    }

    const manifest = await manifestResponse.json();
    const databases = manifest.databases || [];

    if (databases.length === 0) {
      console.info('No embedded databases configured');
      return;
    }

    console.info(`Loading ${databases.length} embedded database(s)...`);

    // Load each database
    for (const dbConfig of databases) {
      if (!dbConfig.autoLoad) {
        console.info(`Skipping ${dbConfig.name} (autoLoad: false)`);
        continue;
      }

      try {
        console.info(`Loading embedded database: ${dbConfig.name}`);

        // Fetch the database file
        const dbFileResponse = await fetch(`/databases/${dbConfig.file}`);
        if (!dbFileResponse.ok) {
          console.error(`Failed to fetch ${dbConfig.file}: ${dbFileResponse.statusText}`);
          continue;
        }

        const arrayBuffer = await dbFileResponse.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // Register the file in DuckDB's virtual file system
        const fileName = dbConfig.file;
        await db.registerFileBuffer(fileName, buffer);

        // Attach the database (derive alias from filename without extension)
        const dbAlias = fileName.replace(/\.db$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
        await connection.query(`ATTACH DATABASE '${fileName}' AS ${dbAlias}`);

        console.info(`Successfully loaded embedded database: ${dbConfig.name} as ${dbAlias}`);
      } catch (error) {
        console.error(`Error loading embedded database ${dbConfig.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error loading embedded databases:', error);
  }
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

  // Load embedded databases from public/databases/
  await loadEmbeddedDatabases(db, connection);

  return { db, connection };
};

/**
 * Tests an external connection by executing a basic query.
 */
const testExternalConnection = async (
  connection: ConnectionProvider
): Promise<void> => {
  if (!connection.host) {
    throw new Error("Host must be defined for external connections.");
  }

  // Construct URL properly
  let url = connection.host;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  if (connection.port && !connection.host.includes(':')) {
    url = `${url}:${connection.port}`;
  }
  if (!url.endsWith('/')) {
    url = `${url}/`;
  }

  // Build headers based on auth mode
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (connection.authMode === "api_key" && connection.apiKey) {
    headers["X-API-Key"] = connection.apiKey;
  } else if (connection.authMode === "password" && connection.user && connection.password) {
    const authHeader = btoa(`${connection.user}:${connection.password}`);
    headers["Authorization"] = `Basic ${authHeader}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: `SELECT 1`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error("Authentication failed - check your credentials");
      } else if (response.status === 404) {
        throw new Error(`Cannot reach server at ${url}`);
      }
      throw new Error(
        `Connection test failed! Status: ${response.status}, Message: ${errorText}`
      );
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Cannot reach ${url}. Check your connection and CORS settings.`);
    }
    throw error;
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

  // Normalize path: remove leading slash and ensure .db extension
  let opfsPath = path.startsWith('/') ? path.slice(1) : path;
  if (!opfsPath.endsWith('.db')) {
    opfsPath = `${opfsPath}.db`;
  }

  // Check if path is already in use
  if (opfsActivePaths.has(opfsPath)) {
    throw new Error(
      `OPFS file "${opfsPath}" is already open. Please close the existing connection first.`
    );
  }

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule);

  // Use retry with exponential backoff for OPFS access handle conflicts
  await retryWithBackoff(async () => {
    try {
      await db.open({
        path: `opfs://${opfsPath}`,
        accessMode: duckdb.DuckDBAccessMode.AUTOMATIC
      });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('createSyncAccessHandle')) {
        throw new Error(
          `OPFS access handle conflict for "${opfsPath}". The file may still be in use. Retrying...`
        );
      }
      throw error;
    }
  }, 4, 1500); // 4 retries with 1.5s base delay (1.5s, 3s, 6s, 12s)

  const connection = await db.connect();
  validateConnection(connection);

  // Verify connection with a basic query
  await connection.query(`SHOW TABLES`);

  // Mark path as active
  opfsActivePaths.add(opfsPath);

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
 * Fetches databases and tables for an external connection.
 */
const fetchExternalDatabases = async (
  connection: CurrentConnection
): Promise<DatabaseInfo[]> => {
  try {
    // Try to get database list
    const dbListResult = await executeExternalQuery("SHOW DATABASES", connection);
    const databases: DatabaseInfo[] = [];

    // If database list is available, fetch tables for each
    if (dbListResult.data && dbListResult.data.length > 0) {
      for (const dbRow of dbListResult.data) {
        const dbName = dbRow[dbListResult.columns[0] as string] as string;
        try {
          const tablesResult = await executeExternalQuery(
            `SELECT table_name FROM information_schema.tables WHERE table_catalog = '${dbName}'`,
            connection
          );

          const tables: TableInfo[] = [];
          for (const tableRow of tablesResult.data) {
            const tableName = tableRow.table_name as string;
            try {
              // Try to get columns info
              const columnsResult = await executeExternalQuery(
                `DESCRIBE ${dbName}.${tableName}`,
                connection
              );

              const columns: ColumnInfo[] = columnsResult.data.map((col: any) => ({
                name: col.column_name as string,
                type: col.column_type as string,
                nullable: col.null === "YES",
              }));

              tables.push({
                name: tableName,
                schema: dbName,
                columns,
                rowCount: 0, // External connections don't provide row count easily
                createdAt: new Date().toISOString(),
              });
            } catch (e) {
              // If describe fails, add table with basic info
              tables.push({
                name: tableName,
                schema: dbName,
                columns: [],
                rowCount: 0,
                createdAt: new Date().toISOString(),
              });
            }
          }

          if (tables.length > 0 || dbListResult.data.length === 1) {
            databases.push({ name: dbName, tables });
          }
        } catch (e) {
          console.warn(`Failed to fetch tables for database ${dbName}:`, e);
          databases.push({ name: dbName, tables: [] });
        }
      }
    }

    return databases;
  } catch (error) {
    // If fetching databases fails, return empty array
    console.warn("Failed to fetch external databases:", error);
    return [];
  }
};

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
        wasmDb: null,
        wasmConnection: null,
        opfsDb: null,
        opfsConnection: null,
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
        schemaFetchError: null,
        isLoadingExternalConnection: false,
        error: null,
        currentConnection: null,
        connectionList: {
          connections: [],
        },

        // Duck Brain AI initial state
        duckBrain: {
          modelStatus: "idle",
          downloadProgress: 0,
          downloadStatus: "",
          isWebGPUSupported: null,
          currentModel: null,
          error: null,
          messages: [],
          isGenerating: false,
          streamingContent: "",
          isPanelOpen: false,
          aiProvider: "webllm",
          providerConfigs: {},
        },

        // File System Access initial state
        mountedFolders: [],
        isFileSystemSupported: typeof window !== "undefined" && "showDirectoryPicker" in window,

        // Cloud Storage initial state
        cloudConnections: [],
        cloudSupportStatus: null,
        isCloudStorageInitialized: false,

        // Initialize DuckDB using WASM or External.
        initialize: async () => {
          const initialConnections: ConnectionProvider[] = [];

          // Extract environment variables if available
          const {
            DUCK_UI_EXTERNAL_CONNECTION_NAME: externalConnectionName = "",
            DUCK_UI_EXTERNAL_HOST: externalHost = "",
            DUCK_UI_EXTERNAL_PORT: externalPort = "",
            DUCK_UI_EXTERNAL_USER: externalUser = "",
            DUCK_UI_EXTERNAL_PASS: externalPass = "",
            DUCK_UI_EXTERNAL_DATABASE_NAME: externalDatabaseName = "",
          } = window.env || {};

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
              wasmDb: db,
              wasmConnection: connection,
              isInitialized: true,
              currentDatabase: "memory",
            });
            await Promise.all([
              connection.query(`SET enable_http_metadata_cache=true`),
              connection.query(`INSTALL arrow`),
              connection.query(`INSTALL parquet`),
            ]);

            // Only switch if first connection is not WASM (we already initialized WASM above)
            if (initialConnections[0].scope !== "WASM") {
              await get().setCurrentConnection(initialConnections[0].id);
            } else {
              // Set WASM as current without reinitializing
              set({
                currentConnection: {
                  environment: initialConnections[0].environment,
                  id: initialConnections[0].id,
                  name: initialConnections[0].name,
                  scope: initialConnections[0].scope,
                },
              });
              // Refresh schema to ensure it matches the fresh WASM database
              await get().fetchDatabasesAndTablesInfo();
            }
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
            // Handle DuckDB database files (.duckdb, .db, .ddb)
            if (fileType === "duckdb" || fileType === "db" || fileType === "ddb") {
              await connection.query(
                `ATTACH DATABASE '${fileName}' AS ${tableName}`
              );
              await get().fetchDatabasesAndTablesInfo();
              return;
            }

            // Determine import mode: "table" (copy data) or "view" (reference file)
            const importMode = options.importMode || "table";
            const createType = importMode === "view" ? "VIEW" : "TABLE";

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
                CREATE OR REPLACE ${createType} "${tableName}" AS
                SELECT * FROM read_csv('${fileName}', ${optionsString})
              `);
            } else if (fileType.toLowerCase() === "json") {
              await connection.query(`
                CREATE OR REPLACE ${createType} "${tableName}" AS
                SELECT * FROM read_json('${fileName}', auto_detect=true, ignore_errors=true)
              `);
            } else {
              await connection.query(`
                CREATE OR REPLACE ${createType} "${tableName}" AS
                SELECT * FROM read_${fileType.toLowerCase()}('${fileName}')
              `);
            }
            // Verification - check for both tables and views
            const verification = await connection.query(`
              SELECT COUNT(*) AS count
              FROM information_schema.tables
              WHERE table_name = '${tableName}'
                AND table_schema = '${database}'
            `);
            if (verification.toArray()[0][0] === 0) {
              throw new Error(`${createType} creation verification failed`);
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
            set({ isLoadingDbTablesFetch: true, schemaFetchError: null });
            let databases: DatabaseInfo[] = [];

            if (currentConnection?.scope === "External") {
              // Fetch databases from external connection
              databases = await fetchExternalDatabases(currentConnection);
            } else if (currentConnection?.scope === "OPFS" || currentConnection?.scope === "WASM") {
              // Fetch from WASM/OPFS connection
              if (!connection) {
                set({ databases: [], error: null });
                return;
              }
              const wasmConnection = validateConnection(connection);
              databases = await fetchWasmDatabases(wasmConnection);
            }

            set({ databases, schemaFetchError: null });
          } catch (error) {
            const errorMessage = `Failed to load schema: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;
            set({
              schemaFetchError: errorMessage,
            });
          } finally {
            set({ isLoadingDbTablesFetch: false });
          }
        },

        // Fetch table column statistics using SUMMARIZE
        fetchTableColumnStats: async (databaseName, tableName) => {
          const { currentConnection, connection } = get();
          // For main database or memory, don't use database qualification
          const query = (databaseName === 'main' || databaseName === 'memory' || databaseName === ':memory:')
            ? `SUMMARIZE ${tableName}`
            : `SUMMARIZE "${databaseName}"."${tableName}"`;

          try {
            let result: QueryResult;

            if (currentConnection?.scope === "External" && currentConnection) {
              result = await executeExternalQuery(query, currentConnection);
            } else {
              const wasmConnection = validateConnection(connection);
              const wasmResult = await wasmConnection.query(query);
              result = resultToJSON(wasmResult);
            }

            // Transform the result data into ColumnStats array
            const columnStats: ColumnStats[] = result.data.map((row: any) => ({
              column_name: row.column_name,
              column_type: row.column_type,
              min: row.min,
              max: row.max,
              approx_unique: row.approx_unique,
              avg: row.avg,
              std: row.std,
              q25: row.q25,
              q50: row.q50,
              q75: row.q75,
              count: row.count,
              null_percentage: row.null_percentage,
            }));

            return columnStats;
          } catch (error) {
            console.error("Failed to fetch column stats:", error);
            toast.error("Failed to load column statistics");
            return [];
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

        updateTabChartConfig: (tabId, chartConfig) => {
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, chartConfig } : tab
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
            // Convert to plain ArrayBuffer to satisfy TypeScript
            const arrayBuffer = parquet_buffer.buffer.slice(0) as ArrayBuffer;
            return new Blob([arrayBuffer], { type: "application/parquet" });
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
            set({ isLoadingExternalConnection: true, error: null });

            // Check for duplicate connection names
            if (
              get().connectionList.connections.find(
                (c) => c.name === connection.name
              )
            ) {
              throw new Error(
                `A connection with the name "${connection.name}" already exists.`
              );
            }

            // Test connection based on scope
            if (connection.scope === "External") {
              await testExternalConnection(connection);
            } else if (connection.scope === "OPFS") {
              // Cleanup any existing OPFS connection before testing new one
              const { opfsDb, opfsConnection, currentConnection } = get();
              if (opfsDb && opfsConnection) {
                await cleanupOPFSConnection(
                  opfsDb,
                  opfsConnection,
                  currentConnection?.path
                );
              }
              await testOPFSConnection(connection);
            }

            // Add connection to list
            set((state) => ({
              connectionList: {
                connections: [...state.connectionList.connections, connection],
              },
            }));

            toast.success(
              `Connection "${connection.name}" added successfully!`
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            set({ error: `Failed to add connection: ${errorMessage}` });
            toast.error(`Failed to add connection: ${errorMessage}`);
            throw error; // Re-throw for caller to handle
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

            const { wasmDb, wasmConnection, opfsDb, opfsConnection } = get();

            // Handle different connection scopes
            if (connectionProvider.scope === "WASM") {
              // Switch to WASM connection
              if (!wasmDb || !wasmConnection) {
                throw new Error("WASM connection not initialized");
              }
              set({
                db: wasmDb,
                connection: wasmConnection,
                currentConnection: {
                  environment: connectionProvider.environment,
                  id: connectionProvider.id,
                  name: connectionProvider.name,
                  scope: connectionProvider.scope,
                },
                currentDatabase: "memory",
              });
            } else if (connectionProvider.scope === "OPFS") {
              // Check if we need to create a new OPFS connection
              const needsNewConnection =
                !opfsDb ||
                !opfsConnection ||
                connectionProvider.path !== get().currentConnection?.path;

              if (needsNewConnection) {
                toast.info("Initializing OPFS connection...");

                // Cleanup old connection before creating new one
                if (opfsDb && opfsConnection) {
                  await cleanupOPFSConnection(
                    opfsDb,
                    opfsConnection,
                    get().currentConnection?.path
                  );
                }

                // Create new OPFS connection
                const opfsInstance = await testOPFSConnection(connectionProvider);

                set({
                  db: opfsInstance.db,
                  connection: opfsInstance.connection,
                  opfsDb: opfsInstance.db,
                  opfsConnection: opfsInstance.connection,
                  currentConnection: {
                    environment: connectionProvider.environment,
                    id: connectionProvider.id,
                    name: connectionProvider.name,
                    scope: connectionProvider.scope,
                    path: connectionProvider.path,
                  },
                  currentDatabase: connectionProvider.path?.replace(/\.db$/, "") || "opfs",
                });
              } else {
                // Reuse existing OPFS connection (same path)
                set({
                  db: opfsDb,
                  connection: opfsConnection,
                  currentConnection: {
                    environment: connectionProvider.environment,
                    id: connectionProvider.id,
                    name: connectionProvider.name,
                    scope: connectionProvider.scope,
                    path: connectionProvider.path,
                  },
                  currentDatabase: connectionProvider.path?.replace(/\.db$/, "") || "opfs",
                });
              }
            } else if (connectionProvider.scope === "External") {
              // For external connections, we don't use a WASM connection
              // Keep WASM instances alive but set current to null
              set({
                db: null,
                connection: null,
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
                  apiKey: connectionProvider.apiKey,
                },
                currentDatabase: connectionProvider.database || "external",
              });
            }

            set({ isLoading: false });
            await get().fetchDatabasesAndTablesInfo();
            toast.success(`Connected to ${connectionProvider.name}`);
          } catch (error) {
            set({
              error: `Failed to set current connection: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              isLoading: false,
            });
            toast.error(
              `Failed to connect: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          } finally {
            set({ isLoading: false });
          }
        },

        getConnection: (connectionId) => {
          return get().connectionList.connections.find(
            (c) => c.id === connectionId
          );
        },

        // Duck Brain AI Actions
        initializeDuckBrain: async (modelId) => {
          const { duckBrainService } = await import("@/lib/duckBrain");

          // Subscribe to service state updates
          duckBrainService.subscribe((serviceState) => {
            set((state) => ({
              duckBrain: {
                ...state.duckBrain,
                modelStatus: serviceState.status,
                downloadProgress: serviceState.downloadProgress,
                downloadStatus: serviceState.downloadStatus,
                isWebGPUSupported: serviceState.isWebGPUSupported,
                currentModel: serviceState.currentModel,
                error: serviceState.error,
              },
            }));
          });

          try {
            await duckBrainService.initialize(modelId);
          } catch (error) {
            toast.error(
              `Failed to initialize Duck Brain: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        },

        generateSQL: async (naturalLanguage) => {
          const {
            duckBrainService,
            buildTextToSQLMessages,
            formatSchemaForContext,
            extractSQLFromResponse
          } = await import("@/lib/duckBrain");

          const { databases, duckBrain } = get();
          const { aiProvider, providerConfigs } = duckBrain;
          const isExternalProvider = aiProvider !== "webllm";

          // For WebLLM, check model status
          if (!isExternalProvider && duckBrain.modelStatus !== "ready") {
            toast.error("Duck Brain is not ready. Please wait for the model to load.");
            return null;
          }

          // For external providers, check configuration
          if (isExternalProvider) {
            if (aiProvider === "openai-compatible") {
              const config = providerConfigs["openai-compatible"];
              if (!config?.baseUrl || !config?.modelId) {
                toast.error("Please configure the Base URL and Model ID in Brain settings.");
                return null;
              }
            } else {
              const config = providerConfigs[aiProvider as "openai" | "anthropic"];
              if (!config?.apiKey) {
                toast.error(`Please configure your ${aiProvider} API key in Brain settings.`);
                return null;
              }
            }
          }

          // Add user message
          const userMessage: DuckBrainMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: naturalLanguage,
            timestamp: new Date(),
          };

          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              messages: [...state.duckBrain.messages, userMessage],
              isGenerating: true,
              streamingContent: "",
            },
          }));

          try {
            // Build schema context and include previous query results for iteration
            const schemaContext = formatSchemaForContext(databases);
            const messages = buildTextToSQLMessages(
              naturalLanguage,
              schemaContext.formatted,
              duckBrain.messages, // Pass previous messages for results context
              true
            );

            let fullResponse = "";

            // Use external provider or WebLLM based on selection
            if (isExternalProvider) {
              const { createProvider } = await import("@/lib/duckBrain/providers");
              const config = providerConfigs[aiProvider as "openai" | "anthropic" | "openai-compatible"]!;
              const provider = createProvider(aiProvider as "openai" | "anthropic" | "openai-compatible");

              await provider.initialize({
                apiKey: "apiKey" in config ? config.apiKey : undefined,
                modelId: config.modelId,
                baseUrl: "baseUrl" in config ? config.baseUrl : undefined,
              });

              await provider.generateStreaming(
                messages,
                {
                  onToken: (token) => {
                    fullResponse += token;
                    set((state) => ({
                      duckBrain: {
                        ...state.duckBrain,
                        streamingContent: fullResponse,
                      },
                    }));
                  },
                  onComplete: (finalText) => {
                    const parsed = extractSQLFromResponse(finalText);

                    const assistantMessage: DuckBrainMessage = {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: finalText,
                      timestamp: new Date(),
                      sql: parsed.sql || undefined,
                    };

                    set((state) => ({
                      duckBrain: {
                        ...state.duckBrain,
                        messages: [...state.duckBrain.messages, assistantMessage],
                        isGenerating: false,
                        streamingContent: "",
                      },
                    }));
                  },
                  onError: (error) => {
                    set((state) => ({
                      duckBrain: {
                        ...state.duckBrain,
                        isGenerating: false,
                        streamingContent: "",
                        error: error.message,
                      },
                    }));
                    toast.error(`Generation failed: ${error.message}`);
                  },
                },
                { maxTokens: 512, temperature: 0.2 }
              );

              await provider.cleanup();
            } else {
              // WebLLM path
              await duckBrainService.generateStreaming(
                messages,
                {
                  onToken: (_token, fullText) => {
                    fullResponse = fullText;
                    set((state) => ({
                      duckBrain: {
                        ...state.duckBrain,
                        streamingContent: fullText,
                      },
                    }));
                  },
                  onComplete: (finalText) => {
                    const parsed = extractSQLFromResponse(finalText);

                    const assistantMessage: DuckBrainMessage = {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: finalText,
                      timestamp: new Date(),
                      sql: parsed.sql || undefined,
                    };

                    set((state) => ({
                      duckBrain: {
                        ...state.duckBrain,
                        messages: [...state.duckBrain.messages, assistantMessage],
                        isGenerating: false,
                        streamingContent: "",
                      },
                    }));
                  },
                  onError: (error) => {
                    set((state) => ({
                      duckBrain: {
                        ...state.duckBrain,
                        isGenerating: false,
                        streamingContent: "",
                        error: error.message,
                      },
                    }));
                    toast.error(`Generation failed: ${error.message}`);
                  },
                },
                { maxTokens: 512, temperature: 0.2 }
              );
            }

            // Return the parsed SQL
            const parsed = extractSQLFromResponse(fullResponse);
            return parsed.sql;
          } catch (error) {
            set((state) => ({
              duckBrain: {
                ...state.duckBrain,
                isGenerating: false,
                streamingContent: "",
              },
            }));
            toast.error(
              `Failed to generate SQL: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
            return null;
          }
        },

        toggleBrainPanel: () => {
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              isPanelOpen: !state.duckBrain.isPanelOpen,
            },
          }));
        },

        abortGeneration: async () => {
          const { duckBrainService } = await import("@/lib/duckBrain");
          duckBrainService.abort();
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              isGenerating: false,
              streamingContent: "",
            },
          }));
        },

        clearBrainMessages: () => {
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              messages: [],
            },
          }));
        },

        addBrainMessage: (message) => {
          const newMessage: DuckBrainMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
          };
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              messages: [...state.duckBrain.messages, newMessage],
            },
          }));
        },

        setStreamingContent: (content) => {
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              streamingContent: content,
            },
          }));
        },

        setIsGenerating: (isGenerating) => {
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              isGenerating,
            },
          }));
        },

        updateMessageQueryResult: (messageId, queryResult) => {
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              messages: state.duckBrain.messages.map((m) =>
                m.id === messageId ? { ...m, queryResult } : m
              ),
            },
          }));
        },

        executeQueryInChat: async (messageId, sql) => {
          const { currentConnection, connection, updateMessageQueryResult } = get();

          // Set status to running
          updateMessageQueryResult(messageId, { status: "running" });

          try {
            let queryResult: QueryResult;

            if (currentConnection?.scope === "External") {
              queryResult = await executeExternalQuery(sql, currentConnection);
            } else {
              if (!connection) {
                throw new Error("WASM connection not initialized");
              }
              const wasmConnection = validateConnection(connection);
              const result = await wasmConnection.query(sql);
              queryResult = resultToJSON(result);
            }

            // Check for query error
            if (queryResult.error) {
              updateMessageQueryResult(messageId, {
                status: "error",
                error: queryResult.error,
              });
              return null;
            }

            // Convert BigInt values to Number for serialization
            const serializeValue = (value: unknown): unknown => {
              if (typeof value === "bigint") {
                return Number(value);
              }
              if (Array.isArray(value)) {
                return value.map(serializeValue);
              }
              if (value && typeof value === "object") {
                const result: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(value)) {
                  result[k] = serializeValue(v);
                }
                return result;
              }
              return value;
            };

            const serializedResult = serializeValue(queryResult) as QueryResult;

            // Update message with successful result
            updateMessageQueryResult(messageId, {
              status: "success",
              data: serializedResult,
              executedAt: new Date(),
            });

            return serializedResult;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Query execution failed";

            updateMessageQueryResult(messageId, {
              status: "error",
              error: errorMessage,
            });

            return null;
          }
        },

        setAIProvider: (provider) => {
          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              aiProvider: provider,
              // Reset model status when switching providers
              modelStatus: provider === "webllm" ? "idle" : "ready",
              error: null,
            },
          }));
        },

        updateProviderConfig: (provider, config) => {
          // Build the appropriate config object based on provider
          const providerConfig = provider === "openai-compatible"
            ? { baseUrl: config.baseUrl || "", modelId: config.modelId, apiKey: config.apiKey }
            : { apiKey: config.apiKey || "", modelId: config.modelId };

          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              providerConfigs: {
                ...state.duckBrain.providerConfigs,
                [provider]: providerConfig,
              },
            },
          }));
        },

        initializeExternalProvider: async () => {
          const { duckBrain } = get();
          const { aiProvider, providerConfigs } = duckBrain;

          if (aiProvider === "webllm") {
            return; // Use existing WebLLM initialization
          }

          const config = providerConfigs[aiProvider as "openai" | "anthropic" | "openai-compatible"];

          // Validate config based on provider type
          if (aiProvider === "openai-compatible") {
            if (!config || !("baseUrl" in config) || !config.baseUrl || !config.modelId) {
              toast.error("Please configure the Base URL and Model ID first");
              return;
            }
          } else {
            if (!config || !("apiKey" in config) || !config.apiKey) {
              toast.error(`Please configure your ${aiProvider} API key first`);
              return;
            }
          }

          set((state) => ({
            duckBrain: {
              ...state.duckBrain,
              modelStatus: "loading",
              error: null,
            },
          }));

          try {
            const { createProvider } = await import("@/lib/duckBrain/providers");
            const provider = createProvider(aiProvider);
            await provider.initialize({
              apiKey: "apiKey" in config ? config.apiKey : undefined,
              modelId: config.modelId,
              baseUrl: "baseUrl" in config ? config.baseUrl : undefined,
            });

            set((state) => ({
              duckBrain: {
                ...state.duckBrain,
                modelStatus: "ready",
                currentModel: config.modelId,
              },
            }));

            const providerName = aiProvider === "openai-compatible" ? "OpenAI-Compatible API" : aiProvider;
            toast.success(`${providerName} provider connected`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to connect";
            set((state) => ({
              duckBrain: {
                ...state.duckBrain,
                modelStatus: "error",
                error: errorMessage,
              },
            }));
            toast.error(`Failed to connect: ${errorMessage}`);
          }
        },

        // File System Access Actions
        initFileSystem: async () => {
          const { fileSystemService, isFileSystemAccessSupported } = await import("@/lib/fileSystem");

          if (!isFileSystemAccessSupported()) {
            set({ isFileSystemSupported: false });
            return;
          }

          try {
            await fileSystemService.init();

            // Sync mounted folders from IndexedDB to store
            const folders = fileSystemService.getMountedFolders();
            const folderInfos: MountedFolderInfo[] = folders.map((f) => ({
              id: f.id,
              name: f.name,
              addedAt: f.addedAt,
              hasPermission: f.hasPermission,
            }));

            set({ mountedFolders: folderInfos, isFileSystemSupported: true });
          } catch (error) {
            console.error("Failed to initialize file system:", error);
            toast.error("Failed to initialize file system access");
          }
        },

        mountFolder: async () => {
          const { fileSystemService, isFileSystemAccessSupported } = await import("@/lib/fileSystem");

          if (!isFileSystemAccessSupported()) {
            toast.error("File System Access API is not supported in this browser");
            return null;
          }

          try {
            await fileSystemService.init();
            const folder = await fileSystemService.mountFolder();

            const folderInfo: MountedFolderInfo = {
              id: folder.id,
              name: folder.name,
              addedAt: folder.addedAt,
              hasPermission: folder.hasPermission,
            };

            set((state) => ({
              mountedFolders: [...state.mountedFolders, folderInfo],
            }));

            toast.success(`Folder "${folder.name}" mounted successfully`);
            return folderInfo;
          } catch (error) {
            // User cancelled the picker - not an error
            if (error instanceof Error && error.name === "AbortError") {
              return null;
            }
            console.error("Failed to mount folder:", error);
            toast.error("Failed to mount folder");
            return null;
          }
        },

        unmountFolder: async (id) => {
          const { fileSystemService } = await import("@/lib/fileSystem");

          try {
            await fileSystemService.unmountFolder(id);

            set((state) => ({
              mountedFolders: state.mountedFolders.filter((f) => f.id !== id),
            }));

            toast.success("Folder unmounted");
          } catch (error) {
            console.error("Failed to unmount folder:", error);
            toast.error("Failed to unmount folder");
          }
        },

        refreshFolderPermissions: async () => {
          const { fileSystemService } = await import("@/lib/fileSystem");

          try {
            await fileSystemService.init();
            const permissions = await fileSystemService.checkAllPermissions();

            set((state) => ({
              mountedFolders: state.mountedFolders.map((f) => ({
                ...f,
                hasPermission: permissions.get(f.id) ?? false,
              })),
            }));
          } catch (error) {
            console.error("Failed to refresh permissions:", error);
          }
        },

        // Cloud Storage Actions
        initCloudStorage: async () => {
          try {
            await cloudStorageService.init();
            const connections = cloudStorageService.getConnections();
            const supportStatus = cloudStorageService.getSupportStatus();

            set({
              cloudConnections: connections,
              cloudSupportStatus: supportStatus,
              isCloudStorageInitialized: true,
            });

            if (supportStatus && !supportStatus.httpfsAvailable) {
              console.warn("Cloud storage: httpfs not available in this browser");
            }
          } catch (error) {
            console.error("Failed to initialize cloud storage:", error);
          }
        },

        addCloudConnection: async (config) => {
          try {
            const conn = await cloudStorageService.addConnection(config);

            set((state) => ({
              cloudConnections: [...state.cloudConnections, conn],
            }));

            toast.success(`Cloud connection "${conn.name}" added`);
            return conn;
          } catch (error) {
            console.error("Failed to add cloud connection:", error);
            toast.error("Failed to add cloud connection");
            return null;
          }
        },

        removeCloudConnection: async (id) => {
          try {
            const conn = cloudStorageService.getConnection(id);
            await cloudStorageService.removeConnection(id);

            set((state) => ({
              cloudConnections: state.cloudConnections.filter((c) => c.id !== id),
            }));

            toast.success(`Cloud connection "${conn?.name || id}" removed`);
          } catch (error) {
            console.error("Failed to remove cloud connection:", error);
            toast.error("Failed to remove cloud connection");
          }
        },

        connectCloudStorage: async (id) => {
          try {
            const success = await cloudStorageService.connect(id);

            if (success) {
              set((state) => ({
                cloudConnections: state.cloudConnections.map((c) =>
                  c.id === id ? { ...c, isConnected: true, lastError: undefined } : c
                ),
              }));
              toast.success("Connected to cloud storage");
            }

            return success;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            set((state) => ({
              cloudConnections: state.cloudConnections.map((c) =>
                c.id === id ? { ...c, isConnected: false, lastError: errorMsg } : c
              ),
            }));

            toast.error(`Failed to connect: ${errorMsg}`);
            return false;
          }
        },

        disconnectCloudStorage: async (id) => {
          try {
            await cloudStorageService.disconnect(id);

            set((state) => ({
              cloudConnections: state.cloudConnections.map((c) =>
                c.id === id ? { ...c, isConnected: false } : c
              ),
            }));

            toast.success("Disconnected from cloud storage");
          } catch (error) {
            console.error("Failed to disconnect cloud storage:", error);
          }
        },

        testCloudConnection: async (id) => {
          return cloudStorageService.testConnection(id);
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
          // Persist Duck Brain chat history (but not model state)
          duckBrain: {
            messages: state.duckBrain.messages,
            isPanelOpen: state.duckBrain.isPanelOpen,
            aiProvider: state.duckBrain.aiProvider,
            providerConfigs: state.duckBrain.providerConfigs,
          },
          // Persist mounted folders metadata (handles stored in IndexedDB)
          mountedFolders: state.mountedFolders,
          // Persist cloud connections metadata (credentials NOT persisted for security)
          cloudConnections: state.cloudConnections.map((c) => ({
            ...c,
            // Remove sensitive credentials from persistence
            accessKeyId: undefined,
            secretAccessKey: undefined,
            hmacKeyId: undefined,
            hmacSecret: undefined,
            accountKey: undefined,
            isConnected: false, // Reset connection state
          })),
        }),
        // Reset transient states on hydration (e.g., if page reloaded during generation)
        // The WebLLM engine doesn't persist across reloads, so we must reset all model state
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Reset generation state
            state.duckBrain.isGenerating = false;
            state.duckBrain.streamingContent = "";
            // Reset model state (engine needs to be re-initialized after reload)
            state.duckBrain.modelStatus = "idle";
            state.duckBrain.currentModel = null;
            state.duckBrain.downloadProgress = 0;
            state.duckBrain.downloadStatus = "";
            state.duckBrain.error = null;
            // Ensure provider settings are initialized (for older persisted state)
            if (!state.duckBrain.aiProvider) {
              state.duckBrain.aiProvider = "webllm";
            }
            if (!state.duckBrain.providerConfigs) {
              state.duckBrain.providerConfigs = {};
            }
          }
        },
      }
    )
  )
);
