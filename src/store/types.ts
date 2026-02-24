import * as duckdb from "@duckdb/duckdb-wasm";
import type { CloudConnection, CloudSupportStatus } from "@/lib/cloudStorage";

//
// Global Window type augmentation
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
      DUCK_UI_DUCKDB_WASM_USE_CDN?: boolean;
      DUCK_UI_DUCKDB_WASM_BASE_URL?: string;
    };
  }
}

//
// Connection Types
//

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

//
// Database & Table Types
//

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
  columnStats?: ColumnStats[];
}

export interface DatabaseInfo {
  name: string;
  tables: TableInfo[];
}

//
// Query Types
//

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

export interface ExternalQueryResponse {
  meta: Array<{ name: string; type: string }>;
  data: unknown[][];
  rows?: number;
}

//
// AI Provider Types
//

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
  sql?: string;
  queryResult?: QueryResultArtifact;
}

//
// File System Types
//

export interface MountedFolderInfo {
  id: string;
  name: string;
  addedAt: Date;
  hasPermission: boolean;
}

//
// Editor & Chart Types
//

export type EditorTabType = "sql" | "home" | "brain" | "connections" | "settings";

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
  type?: "bar" | "line" | "area";
  yAxisId?: "left" | "right";
  aggregation?: AggregationType;
}

export interface AxisConfig {
  label?: string;
  scale?: AxisScale;
  min?: number;
  max?: number;
  format?: string;
  showGrid?: boolean;
  rotate?: number;
}

export interface LegendConfig {
  show?: boolean;
  position?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export interface AnnotationConfig {
  id: string;
  type: "line" | "text" | "box";
  value?: number;
  text?: string;
  x?: number;
  y?: number;
  color?: string;
}

export interface DataTransform {
  groupBy?: string;
  aggregation?: AggregationType;
  sortBy?: string;
  sortOrder?: SortOrder;
  limit?: number;
  filter?: string;
}

export interface ChartConfig {
  type: ChartType;
  xAxis: string;
  xAxisConfig?: AxisConfig;
  yAxis?: string;
  yAxisConfig?: AxisConfig;
  series?: SeriesConfig[];
  colorBy?: string;
  sizeBy?: string;
  transform?: DataTransform;
  colors?: string[];
  legend?: LegendConfig;
  showValues?: boolean;
  showGrid?: boolean;
  enableAnimations?: boolean;
  annotations?: AnnotationConfig[];
  stacked?: boolean;
  smooth?: boolean;
  innerRadius?: number;
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

//
// Slice Interfaces
//

export interface DuckdbSlice {
  db: duckdb.AsyncDuckDB | null;
  connection: duckdb.AsyncDuckDBConnection | null;
  wasmDb: duckdb.AsyncDuckDB | null;
  wasmConnection: duckdb.AsyncDuckDBConnection | null;
  opfsDb: duckdb.AsyncDuckDB | null;
  opfsConnection: duckdb.AsyncDuckDBConnection | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  currentDatabase: string;

  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export interface ConnectionSlice {
  currentConnection: CurrentConnection | null;
  connectionList: ConnectionList;
  isLoadingExternalConnection: boolean;

  addConnection: (connection: ConnectionProvider) => Promise<void>;
  updateConnection: (connection: ConnectionProvider) => void;
  deleteConnection: (id: string) => void;
  setCurrentConnection: (connectionId: string) => Promise<void>;
  getConnection: (connectionId: string) => ConnectionProvider | undefined;
}

export interface QuerySlice {
  queryHistory: QueryHistoryItem[];
  isExecuting: boolean;

  executeQuery: (query: string, tabId?: string) => Promise<QueryResult | void>;
  clearHistory: () => void;
  exportParquet: (query: string) => Promise<Blob>;
}

export interface SchemaSlice {
  databases: DatabaseInfo[];
  isLoadingDbTablesFetch: boolean;
  schemaFetchError: string | null;

  fetchDatabasesAndTablesInfo: () => Promise<void>;
  fetchTableColumnStats: (databaseName: string, tableName: string) => Promise<ColumnStats[]>;
  deleteTable: (tableName: string, database?: string) => Promise<void>;
  importFile: (
    fileName: string,
    fileContent: ArrayBuffer,
    tableName: string,
    fileType: string,
    database?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: Record<string, any>
  ) => Promise<void>;
}

export interface TabSlice {
  tabs: EditorTab[];
  activeTabId: string | null;

  createTab: (type?: EditorTabType, title?: string, content?: EditorTab["content"]) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabQuery: (tabId: string, query: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabChartConfig: (tabId: string, chartConfig: ChartConfig | undefined) => void;
  moveTab: (oldIndex: number, newIndex: number) => void;
  closeAllTabs: () => void;
}

export interface DuckBrainSlice {
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
    aiProvider: AIProviderType;
    providerConfigs: ProviderConfigs;
  };

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
  setAIProvider: (provider: AIProviderType) => void;
  updateProviderConfig: (
    provider: "openai" | "anthropic" | "openai-compatible",
    config: { apiKey?: string; modelId: string; baseUrl?: string }
  ) => void;
  initializeExternalProvider: () => Promise<void>;
}

export interface FileSystemSlice {
  mountedFolders: MountedFolderInfo[];
  isFileSystemSupported: boolean;
  cloudConnections: CloudConnection[];
  cloudSupportStatus: CloudSupportStatus | null;
  isCloudStorageInitialized: boolean;

  initFileSystem: () => Promise<void>;
  mountFolder: () => Promise<MountedFolderInfo | null>;
  unmountFolder: (id: string) => Promise<void>;
  refreshFolderPermissions: () => Promise<void>;
  initCloudStorage: () => Promise<void>;
  addCloudConnection: (
    config: Omit<CloudConnection, "id" | "addedAt" | "isConnected">
  ) => Promise<CloudConnection | null>;
  removeCloudConnection: (id: string) => Promise<void>;
  connectCloudStorage: (id: string) => Promise<boolean>;
  disconnectCloudStorage: (id: string) => Promise<void>;
  testCloudConnection: (id: string) => Promise<{ success: boolean; error?: string }>;
}

//
// Profile Types
//

export interface Profile {
  id: string;
  name: string;
  avatarEmoji: string;
  hasPassword: boolean;
  createdAt: string;
  lastActive: string;
}

export interface ProfileSlice {
  currentProfileId: string | null;
  currentProfile: Profile | null;
  profiles: Profile[];
  isProfileLoaded: boolean;
  encryptionKey: CryptoKey | null;

  loadProfile: (profileId: string, password?: string) => Promise<void>;
  createProfile: (name: string, password?: string, avatarEmoji?: string) => Promise<string>;
  deleteProfile: (profileId: string) => Promise<void>;
  switchProfile: (profileId: string, password?: string) => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, "name" | "avatarEmoji">>) => Promise<void>;

  savedQueriesVersion: number;
  bumpSavedQueriesVersion: () => void;
}

//
// Composed Store Type
//

export type DuckStoreState = DuckdbSlice &
  ConnectionSlice &
  QuerySlice &
  SchemaSlice &
  TabSlice &
  DuckBrainSlice &
  FileSystemSlice &
  ProfileSlice;
