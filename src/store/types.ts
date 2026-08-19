import * as duckdb from "@duckdb/duckdb-wasm";
import type { DataSession, SessionCapabilities } from "@/services/engine/types";
import type {
  Participant,
  SessionStatus,
  ShareSelection,
} from "@/services/collaboration/liveSession";
import type { SharedCapability } from "@/services/collaboration/capabilities/capability";
import type { ForkTableProgress } from "@/services/collaboration/fork";
import type { Dashboard } from "@/services/dashboard/types";

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
      DUCK_UI_EXTERNAL_API_KEY: string;
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

/** Where a connection came from. "SESSION" ones are granted by a live peer. */
export type ConnectionEnvironment = "APP" | "ENV" | "BUILT_IN" | "SESSION";

/**
 * Legacy connection kind. "Peer" only ever appears on a session-granted
 * connection, which is never persisted — it exists for as long as the grant.
 */
export type ConnectionScope = "WASM" | "External" | "OPFS" | "Peer";

export interface CurrentConnection {
  environment: ConnectionEnvironment;
  id: string;
  name: string;
  scope: ConnectionScope;
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
  environment: ConnectionEnvironment;
  id: string;
  name: string;
  scope: ConnectionScope;
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

/**
 * Capabilities of the active session, or every flag off when nothing is
 * connected. UI code should branch on these rather than on a connection kind.
 */
export type ActiveCapabilities = SessionCapabilities;

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

/**
 * Lazily-fetched value distribution for one column: an equi-width histogram
 * for numeric columns, the top values by count for everything else.
 */
export type ColumnDistribution =
  | { kind: "histogram"; bins: number[] }
  | { kind: "topk"; values: { value: string; count: number }[] };

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
  /**
   * The engine stopped early at a row cap — `data` is a prefix of the real
   * result, not the whole thing. Consumers that export or aggregate MUST say
   * so rather than presenting a partial answer as complete.
   */
  truncated?: boolean;
  /** Engine execution time. Absent for results restored from persistence. */
  durationMs?: number;
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

export type EditorTabType = "sql" | "notebook" | "dashboard" | "home" | "connections" | "settings";

export interface NotebookCell {
  id: string;
  type: "sql" | "markdown";
  content: string;
  result?: QueryResult | null;
  chartConfig?: ChartConfig;
  collapsed?: boolean;
}

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
  /**
   * DuckDB-WASM handles for the active session, when it runs in this tab.
   * Compatibility projection only — SQL execution and introspection go through
   * `currentSession`. Null on connections that execute elsewhere.
   *
   * Per-connection engine lifecycle is owned by `services/engine/registry`,
   * which is why there are no longer separate wasm/opfs handle pairs here.
   */
  db: duckdb.AsyncDuckDB | null;
  connection: duckdb.AsyncDuckDBConnection | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  currentDatabase: string;

  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export interface ConnectionSlice {
  currentConnection: CurrentConnection | null;
  /**
   * Live engine session for `currentConnection`. Everything that executes SQL
   * or reads the catalog goes through this — never through `db`/`connection`,
   * which remain only as a compatibility projection for the DuckDB-WASM
   * specific code paths (file import, parquet export).
   */
  currentSession: DataSession | null;
  connectionList: ConnectionList;
  isLoadingExternalConnection: boolean;

  addConnection: (connection: ConnectionProvider) => Promise<void>;
  updateConnection: (connection: ConnectionProvider) => void;
  deleteConnection: (id: string) => void;
  setCurrentConnection: (connectionId: string) => Promise<void>;
  getConnection: (connectionId: string) => ConnectionProvider | undefined;
}

/** Live view of a query that is still running. */
export interface QueryProgress {
  rows: number;
  batches: number;
  elapsedMs: number;
  /** Column headers, known from the engine before the first row arrives. */
  columns: string[];
}

export interface QuerySlice {
  queryHistory: QueryHistoryItem[];
  executingTabs: Record<string, boolean>;
  /** Per-tab progress for in-flight queries. Cleared when one settles. */
  queryProgress: Record<string, QueryProgress>;
  /**
   * Rows an editor query may return before the engine stops and marks the
   * result truncated. Guards the tab against a `SELECT *` on a huge table
   * materializing into JS objects and freezing it.
   */
  maxResultRows: number;
  setMaxResultRows: (rows: number) => void;

  executeQuery: (query: string, tabId?: string) => Promise<QueryResult | void>;
  /** Cancels the in-flight query started for this tab, if any. */
  cancelQuery: (tabId: string) => Promise<void>;
  clearHistory: () => void;
  exportParquet: (query: string) => Promise<Blob>;
}

export interface SchemaSlice {
  databases: DatabaseInfo[];
  isLoadingDbTablesFetch: boolean;
  schemaFetchError: string | null;

  fetchDatabasesAndTablesInfo: () => Promise<void>;
  fetchTableColumnStats: (
    databaseName: string,
    tableName: string,
    schema?: string
  ) => Promise<ColumnStats[]>;
  fetchColumnDistribution: (
    databaseName: string,
    tableName: string,
    columnName: string,
    columnType: string,
    schema?: string
  ) => Promise<ColumnDistribution | null>;
  deleteTable: (tableName: string, database?: string, schema?: string) => Promise<void>;
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

  createTab: (type?: EditorTabType, content?: string, title?: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabQuery: (tabId: string, query: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabChartConfig: (tabId: string, chartConfig: ChartConfig | undefined) => void;
  moveTab: (oldIndex: number, newIndex: number) => void;
  closeAllTabs: () => void;

  // Notebook cell operations
  getNotebookCells: (tabId: string) => NotebookCell[];
  addNotebookCell: (tabId: string, afterCellId?: string, cellType?: "sql" | "markdown") => void;
  removeNotebookCell: (tabId: string, cellId: string) => void;
  updateNotebookCellContent: (tabId: string, cellId: string, content: string) => void;
  updateNotebookCellResult: (tabId: string, cellId: string, result: QueryResult | null) => void;
  updateNotebookCellChartConfig: (
    tabId: string,
    cellId: string,
    chartConfig: ChartConfig | undefined
  ) => void;
  moveNotebookCell: (tabId: string, cellId: string, direction: "up" | "down") => void;
  toggleNotebookCellCollapsed: (tabId: string, cellId: string) => void;
  toggleNotebookCellType: (tabId: string, cellId: string) => void;
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

  initFileSystem: () => Promise<void>;
  mountFolder: () => Promise<MountedFolderInfo | null>;
  unmountFolder: (id: string) => Promise<void>;
  refreshFolderPermissions: () => Promise<void>;
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
// Dashboards
//

export interface DashboardSlice {
  dashboards: Dashboard[];
  isDashboardEditing: boolean;

  loadDashboards: (profileId?: string) => Promise<void>;
  createDashboard: (name: string) => Promise<Dashboard | null>;
  updateDashboard: (dashboard: Dashboard) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
  duplicateDashboard: (id: string) => Promise<Dashboard | null>;
  setDashboardEditing: (editing: boolean) => void;

  /** Appends a named SQL fence plus a component tag to a dashboard document. */
  appendQueryToDashboard: (options: {
    dashboardId: string;
    kind: "chart" | "table" | "metric";
    title: string;
    sql: string;
    chartConfig?: ChartConfig;
    /** Result columns, for picking sensible x/y in the generated tag. */
    columns?: { name: string; numeric: boolean }[];
  }) => Promise<void>;

  /** Focuses a dashboard's tab, opening one if needed. Returns its tab id. */
  openDashboardTab: (dashboardId: string, name: string) => string | undefined;
  /** The dashboards list slide-over. Store-driven so Home and the rail share it. */
  isDashboardsPanelOpen: boolean;
  setDashboardsPanelOpen: (open: boolean) => void;
  runDashboard: (dashboardId: string, force?: boolean) => Promise<void>;
}

//
// Live session
//

export type SessionRole = "host" | "guest";

/** What the UI renders about a live session. Never the session itself. */
export interface SessionProjection {
  role: SessionRole | null;
  status: SessionStatus;
  sessionName: string;
  hostName: string;
  /** Host only: the link to send. */
  inviteUrl: string | null;
  inviteCode: string | null;
  /** Guest only: the code to send back. */
  answerCode: string | null;
  participants: Participant[];
  sharedCapabilities: SharedCapability[];
  isWebRtcSupported: boolean;
  error: string | null;
}

export interface SessionSlice {
  session: SessionProjection;

  listShareableTables: () => Promise<ShareSelection[]>;
  startLiveSession: (options: {
    sessionName: string;
    shared: ShareSelection[];
    /** Share everything on the connection, including tables added later. */
    shareAll?: boolean;
    maxResultRows?: number;
  }) => Promise<void>;
  acceptGuestCode: (code: string) => Promise<void>;
  /** Host: mints a fresh single-use invite for one more person. */
  inviteAnotherGuest: () => Promise<void>;
  /** Host: disconnects one participant. */
  removeParticipant: (peerId: string) => Promise<void>;
  joinLiveSession: (inviteCode: string) => Promise<void>;
  syncSessionConnections: (capabilities: SharedCapability[]) => void;
  /** Adopts co-edited dashboards from the shared document into local state. */
  adoptSharedDashboards: () => void;
  /** Adopts shared notebook state (whole-document, last-writer-wins). */
  adoptSharedNotebooks: () => void;
  /** Reconciles local tabs with the shared workspace document. */
  projectSharedTabs: () => void;
  /** Subscribes the tab list to shared-document changes. */
  watchSharedWorkspace: () => void;
  revokeCapability: (capabilityId: string) => Promise<void>;
  /** Copies shared tables into this browser's own engine. Guest side of Fork. */
  forkCapability: (
    capabilityId: string,
    tables: string[],
    onProgress?: (progress: ForkTableProgress) => void,
    /** Where the copies land. Defaults to the in-memory engine; an OPFS connection makes them survive the browser closing. */
    targetConnectionId?: string
  ) => Promise<ForkTableProgress[]>;
  endLiveSession: () => Promise<void>;
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
  ProfileSlice &
  SessionSlice &
  DashboardSlice;
