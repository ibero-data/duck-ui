/**
 * Data engine — transport-independent execution types.
 *
 * Duck-UI executes SQL against several very different things: a DuckDB-WASM
 * instance in this tab, an OPFS-backed database in this tab, a DuckDB HTTP
 * server across the network, and (later) another browser over WebRTC or a
 * DuckDB 2.x server over Quack. None of that should be visible to the UI.
 *
 * The layering is:
 *
 *   ConnectionDefinition   what to connect to (serializable, no secrets)
 *   CredentialMaterial     the secrets, supplied separately, never persisted here
 *   DataDriver             knows how to open one kind of connection
 *   DataSession            a live, capability-describing handle
 *   QueryExecution         one in-flight statement, streamed and cancellable
 *
 * UI behaviour derives from `SessionCapabilities`, never from the connection
 * kind. `if (kind === "duck-http")` in a component is a bug.
 */

import type { RecordBatch, Schema as ArrowSchema } from "apache-arrow";

//
// Connection model
//

/**
 * Every execution target Duck-UI knows about, including reservations.
 *
 * `peer`, `quack` and `flight-web` are declared here on purpose: the union is
 * the single place that has to change when a transport lands, and declaring
 * them now keeps `switch` statements honest via exhaustiveness checking.
 */
export type ConnectionKind = "wasm" | "opfs" | "duck-http" | "peer" | "quack" | "flight-web";

/**
 * Where a connection definition came from. Mirrors the legacy `environment`
 * field. `SESSION` marks one granted by a live peer — never persisted, and
 * gone the moment the grant is withdrawn.
 */
export type ConnectionOrigin = "APP" | "ENV" | "BUILT_IN" | "SESSION";

/** How a `duck-http` endpoint authenticates. */
export type HttpAuthMode = "none" | "password" | "api_key";

/** In-tab DuckDB-WASM, in-memory. One per app instance. */
export interface WasmConnectionConfig {
  kind: "wasm";
}

/** In-tab DuckDB-WASM backed by a persistent OPFS file. */
export interface OpfsConnectionConfig {
  kind: "opfs";
  /** OPFS path, e.g. `analytics.db`. Normalized by the driver. */
  path: string;
}

/** A DuckDB `httpserver` endpoint reached over HTTP(S). */
export interface DuckHttpConnectionConfig {
  kind: "duck-http";
  host: string;
  port?: number;
  database?: string;
  authMode: HttpAuthMode;
  /** Username for `authMode: "password"`. The password itself is credential material. */
  user?: string;
}

/**
 * Execution routed through another participant's browser over WebRTC.
 * Reserved for Phase 3 — no driver implements this yet.
 */
export interface PeerConnectionConfig {
  kind: "peer";
  /** Peer that owns the capability and will run the SQL. */
  peerId: string;
  /** Capability granted by that peer. Never contains credentials. */
  capabilityId: string;
}

/** Reserved: DuckDB 2.x over the Quack wire protocol. Not implemented. */
export interface QuackConnectionConfig {
  kind: "quack";
  url: string;
  database?: string;
}

/**
 * Reserved: a browser-compatible Flight SQL gateway (gRPC-Web or equivalent).
 * Ordinary Arrow Flight SQL is NOT reachable from a browser — see
 * docs/architecture/execution.md. Not implemented.
 */
export interface FlightWebConnectionConfig {
  kind: "flight-web";
  url: string;
}

export type ConnectionConfig =
  | WasmConnectionConfig
  | OpfsConnectionConfig
  | DuckHttpConnectionConfig
  | PeerConnectionConfig
  | QuackConnectionConfig
  | FlightWebConnectionConfig;

/** Narrows a config union member by its `kind`. */
export type ConnectionConfigOf<K extends ConnectionKind> = Extract<ConnectionConfig, { kind: K }>;

/**
 * A connection the user can pick, fully serializable and free of secrets.
 *
 * This is safe to persist, to put in workspace state, and (for the subset that
 * is explicitly shared) to describe to a peer. Secrets travel separately as
 * `CredentialMaterial`.
 */
export interface ConnectionDefinition<K extends ConnectionKind = ConnectionKind> {
  id: string;
  name: string;
  origin: ConnectionOrigin;
  config: ConnectionConfigOf<K>;
}

/**
 * Secrets for a connection. Held in memory, persisted only through Duck-UI's
 * existing encrypted local credential store, and never placed in collaborative
 * state or sent to a peer.
 */
export interface CredentialMaterial {
  password?: string;
  apiKey?: string;
}

//
// Capabilities
//

/**
 * What a live session can actually do. The UI reads this instead of guessing
 * from the connection kind, so a future peer or Quack session automatically
 * gets correct affordances without touching component code.
 */
export interface SessionCapabilities {
  /** Results arrive incrementally rather than in one shot. */
  streaming: boolean;
  /** An in-flight query can be interrupted. */
  cancellation: boolean;

  /** Session refuses statements that mutate data. */
  readonly: boolean;
  /** Session accepts writes (DDL/DML). Mutually exclusive with `readonly`. */
  writable: boolean;

  transactions: boolean;
  /** Data survives a page reload (OPFS file, remote server). */
  persistence: boolean;

  /** Execution happens outside this tab. */
  remote: boolean;
  /** May be offered to other participants as a shared capability. */
  shareable: boolean;

  supportsCatalog: boolean;
  /** Local files can be registered into the engine and read as tables. */
  supportsFileImport: boolean;

  /**
   * Batches are genuine Arrow `RecordBatch`es. False for engines whose wire
   * format is not Arrow (the DuckDB HTTP server speaks JSONCompact), which
   * emit row chunks instead. Consumers that require Arrow — IPC transport,
   * zero-copy charting — must check this rather than assume.
   */
  arrowNative: boolean;
}

/** Capability set with every flag off. Spread and override. */
export const NO_CAPABILITIES: SessionCapabilities = {
  streaming: false,
  cancellation: false,
  readonly: false,
  writable: false,
  transactions: false,
  persistence: false,
  remote: false,
  shareable: false,
  supportsCatalog: false,
  supportsFileImport: false,
  arrowNative: false,
};

//
// Query request / stream
//

/** One statement submitted to a session. */
export interface QueryRequest {
  sql: string;
  /** Stable execution id. Generated when omitted. */
  id?: string;
  /** Free-text origin label ("tab:abc", "catalog", "widget:xyz") for metrics. */
  label?: string;
  /** Aborts the execution. Equivalent to calling `QueryExecution.cancel()`. */
  signal?: AbortSignal;
  /**
   * Stop after this many rows and report `truncated: true`. Enforced by the
   * session, so a policy cap cannot be bypassed by the consumer.
   */
  maxRows?: number;
}

/** One column of a result, described without reference to Arrow. */
export interface QueryField {
  name: string;
  /**
   * Display type. For DuckDB engines this is the label the grid shows, which
   * is not always the Arrow type name (GEOMETRY, VARINT).
   */
  type: string;
  nullable: boolean;
}

/** Result shape, available before any row arrives. */
export interface QueryResultSchema {
  fields: QueryField[];
  /** Present only when the session is `arrowNative`. */
  arrow?: ArrowSchema;
}

/**
 * A slice of a result.
 *
 * Arrow is the canonical representation and the only one that survives IPC
 * transport unchanged. `rows` exists for engines that never produce Arrow;
 * fabricating Arrow types from JSON would invent type information the server
 * did not send.
 */
export type QueryChunk =
  { encoding: "arrow"; batch: RecordBatch } | { encoding: "rows"; rows: Record<string, unknown>[] };

export interface QueryStartedEvent {
  type: "started";
  queryId: string;
  startedAt: number;
}

export interface QuerySchemaEvent {
  type: "schema";
  queryId: string;
  schema: QueryResultSchema;
}

export interface QueryBatchEvent {
  type: "batch";
  queryId: string;
  /** Zero-based position in the stream. */
  index: number;
  rows: number;
  chunk: QueryChunk;
}

export interface QueryCompletedEvent {
  type: "completed";
  queryId: string;
  rowCount: number;
  batchCount: number;
  durationMs: number;
  /** Stopped early because `maxRows` was reached. */
  truncated: boolean;
}

export interface QueryFailedEvent {
  type: "failed";
  queryId: string;
  error: QueryErrorInfo;
}

export type QueryStreamEvent =
  QueryStartedEvent | QuerySchemaEvent | QueryBatchEvent | QueryCompletedEvent | QueryFailedEvent;

/** Why a query failed, in a form that survives a network hop. */
export interface QueryErrorInfo {
  /** Already run through the engine-error explainer — safe to show a user. */
  message: string;
  /** True when the failure was a deliberate cancel rather than a fault. */
  cancelled: boolean;
  /** Engine-supplied class, when one is available. */
  kind?: string;
}

/** One in-flight statement. Consume `stream` exactly once. */
export interface QueryExecution {
  readonly id: string;
  readonly sql: string;
  readonly stream: AsyncIterable<QueryStreamEvent>;
  /** Idempotent. Resolves once the engine has been told to stop. */
  cancel(): Promise<void>;
}

//
// Catalog
//

export interface CatalogColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface CatalogTable {
  name: string;
  schema: string;
  columns: CatalogColumn[];
  /** -1 when the engine cannot report it cheaply. */
  rowCount: number;
}

export interface CatalogDatabase {
  name: string;
  tables: CatalogTable[];
}

/**
 * A point-in-time view of what a session can see. Safe to describe to a peer
 * (it names catalogs, schemas, tables and types — never data, never secrets).
 */
export interface CatalogSnapshot {
  databases: CatalogDatabase[];
  capturedAt: string;
}

//
// Session / driver
//

export interface DataSession {
  readonly id: string;
  /** Definition this session was opened from. */
  readonly connectionId: string;
  readonly kind: ConnectionKind;
  readonly capabilities: SessionCapabilities;
  /** False once `close()` has run, or the underlying transport dropped. */
  readonly isOpen: boolean;

  execute(request: QueryRequest): QueryExecution;
  introspect(): Promise<CatalogSnapshot>;
  close(): Promise<void>;
}

export interface DataDriver<K extends ConnectionKind = ConnectionKind> {
  readonly kind: K;

  /**
   * Whether this browser/environment can host the driver at all (WebRTC
   * present, OPFS present, cross-origin isolation active). Used to degrade
   * gracefully rather than fail at connect time.
   */
  isAvailable(): Promise<boolean>;

  /** Opens a live session. The caller owns closing it. */
  connect(
    definition: ConnectionDefinition<K>,
    credentials?: CredentialMaterial
  ): Promise<DataSession>;

  /**
   * Connectivity probe that leaves nothing behind. Throws with a
   * user-presentable message on failure.
   */
  test(definition: ConnectionDefinition<K>, credentials?: CredentialMaterial): Promise<void>;
}
