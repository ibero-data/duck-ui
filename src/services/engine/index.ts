/**
 * Data engine — the transport-independent execution layer.
 *
 * Import from here rather than reaching into the submodules. See
 * `docs/architecture/execution.md` for the design and its constraints.
 */

export type {
  CatalogColumn,
  CatalogDatabase,
  CatalogSnapshot,
  CatalogTable,
  ConnectionConfig,
  ConnectionConfigOf,
  ConnectionDefinition,
  ConnectionKind,
  ConnectionOrigin,
  CredentialMaterial,
  DataDriver,
  DataSession,
  DuckHttpConnectionConfig,
  FlightWebConnectionConfig,
  HttpAuthMode,
  OpfsConnectionConfig,
  PeerConnectionConfig,
  QuackConnectionConfig,
  QueryBatchEvent,
  QueryChunk,
  QueryCompletedEvent,
  QueryErrorInfo,
  QueryExecution,
  QueryFailedEvent,
  QueryField,
  QueryRequest,
  QueryResultSchema,
  QuerySchemaEvent,
  QueryStartedEvent,
  QueryStreamEvent,
  SessionCapabilities,
  WasmConnectionConfig,
} from "./types";

export { NO_CAPABILITIES } from "./types";

export {
  createExecution,
  collectExecution,
  materializeCollected,
  materializeExecution,
  runQuery,
  toQueryErrorInfo,
  QueryCancelledError,
  type ChunkProducer,
  type CollectedExecution,
  type ProducedItem,
  type ProducerContext,
} from "./queryStream";

export {
  asLocalDuckSession,
  requireLocalDuckSession,
  arrowSchemaToQuerySchema,
  catalogSnapshot,
  DUCK_HTTP_CAPABILITIES,
  LOCAL_MEMORY_CAPABILITIES,
  LOCAL_OPFS_CAPABILITIES,
  type LocalDuckSession,
} from "./session";

export {
  closeAllSessions,
  closeSession,
  getDriver,
  getSession,
  hasDriver,
  isKindAvailable,
  listSessions,
  openSession,
  registerDriver,
  testConnection,
} from "./registry";

export { builtInWasmConnection, WASM_CONNECTION_ID, wasmDriver } from "./drivers/wasmDriver";
export { opfsDriver } from "./drivers/opfsDriver";
export { httpDuckDriver } from "./drivers/httpDuckDriver";
export {
  peerDriver,
  PeerSession,
  PEER_CAPABILITIES,
  registerPeerSession,
  unregisterPeerSession,
} from "./drivers/peerDriver";

export {
  catalogToDatabaseInfo,
  kindToScope,
  scopeToKind,
  toConnectionDefinition,
  toCredentialMaterial,
  type LegacyScope,
} from "./legacy";
