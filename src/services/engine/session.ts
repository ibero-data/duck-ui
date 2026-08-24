/**
 * Session-side helpers shared by the drivers.
 *
 * Includes the one deliberate escape hatch in the layer: `LocalDuckSession`.
 * Some features are genuinely specific to having a DuckDB-WASM instance in
 * this tab — registering a file buffer for import, copying a Parquet buffer
 * back out, attaching a `.duckdb` file. Rather than pretend those work
 * everywhere, they are exposed on an extension interface that is reachable
 * only through a capability check.
 */

import type * as duckdb from "@duckdb/duckdb-wasm";
import type { Schema as ArrowSchema } from "apache-arrow";
import { columnTypeLabel } from "@/services/duckdb/resultParser";
import type {
  CatalogDatabase,
  CatalogSnapshot,
  DataSession,
  QueryField,
  QueryResultSchema,
  SessionCapabilities,
} from "./types";
import { NO_CAPABILITIES } from "./types";

/**
 * A session backed by a DuckDB-WASM instance running in this tab.
 *
 * Reach for this through `asLocalDuckSession` only, and only for operations
 * that have no transport-independent expression. Anything that can be said in
 * SQL should go through `session.execute()` instead.
 */
export interface LocalDuckSession extends DataSession {
  readonly local: {
    readonly db: duckdb.AsyncDuckDB;
    /** Shared connection. Long-running statements should use `execute()`. */
    readonly connection: duckdb.AsyncDuckDBConnection;
  };
}

/** Narrows a session to its in-tab DuckDB form, or null when it is not one. */
export const asLocalDuckSession = (session: DataSession | null): LocalDuckSession | null => {
  if (!session) return null;
  const candidate = session as Partial<LocalDuckSession>;
  return candidate.local?.db && candidate.local?.connection ? (session as LocalDuckSession) : null;
};

/**
 * Same, but throws with an actionable message. Use where the caller has
 * already gated on `capabilities.supportsFileImport` and a missing handle
 * would be a programming error.
 */
export const requireLocalDuckSession = (session: DataSession | null): LocalDuckSession => {
  const local = asLocalDuckSession(session);
  if (!local) {
    throw new Error(
      "This action needs a DuckDB engine running in your browser. " +
        "Switch to a local (in-memory or OPFS) connection and try again."
    );
  }
  return local;
};

//
// Capability presets
//

/** In-tab DuckDB-WASM, in-memory. Full local power, nothing survives a reload. */
export const LOCAL_MEMORY_CAPABILITIES: SessionCapabilities = {
  ...NO_CAPABILITIES,
  streaming: true,
  cancellation: true,
  writable: true,
  transactions: true,
  shareable: true,
  supportsCatalog: true,
  supportsFileImport: true,
  arrowNative: true,
};

/** In-tab DuckDB-WASM backed by an OPFS file. Same power, plus durability. */
export const LOCAL_OPFS_CAPABILITIES: SessionCapabilities = {
  ...LOCAL_MEMORY_CAPABILITIES,
  persistence: true,
};

/**
 * DuckDB HTTP server. Remote and durable, but the endpoint speaks JSONCompact
 * over a single POST: no incremental delivery, no interrupt, no Arrow, and no
 * way to hand it a local file.
 */
export const DUCK_HTTP_CAPABILITIES: SessionCapabilities = {
  ...NO_CAPABILITIES,
  cancellation: true, // the fetch can be aborted, even if the server keeps going
  writable: true,
  persistence: true,
  remote: true,
  supportsCatalog: true,
};

//
// Schema / catalog adapters
//

/** Describes an Arrow schema in the transport-neutral form. */
export const arrowSchemaToQuerySchema = (schema: ArrowSchema): QueryResultSchema => ({
  fields: schema.fields.map((field): QueryField => ({
    name: field.name,
    type: columnTypeLabel(field),
    nullable: field.nullable,
  })),
  arrow: schema,
});

/** Builds a snapshot, stamping the capture time in one place. */
export const catalogSnapshot = (databases: CatalogDatabase[]): CatalogSnapshot => ({
  databases,
  capturedAt: new Date().toISOString(),
});

export const EMPTY_CATALOG: () => CatalogSnapshot = () => catalogSnapshot([]);
