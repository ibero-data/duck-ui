/**
 * The shared `DataSession` implementation for a DuckDB-WASM engine running in
 * this tab. Both the in-memory (`wasm`) and OPFS-backed (`opfs`) drivers are
 * thin wrappers around it — they differ in how the engine is opened and torn
 * down, not in how it is driven.
 *
 * Two behaviours here are load-bearing and predate the engine layer:
 *
 * 1. Statements run on a DEDICATED connection, not the one used for catalog
 *    introspection. A streamed `send()` result is silently truncated when any
 *    other statement runs on the same connection before the stream is drained,
 *    and boot-time introspection was doing exactly that — auto-run share links
 *    shipped returning zero rows because of it.
 * 2. That connection carries ONE statement at a time. Executions queue behind
 *    each other, so session state (`SET`, temp tables) survives across runs
 *    without ever interleaving two cursors.
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { generateUUID } from "@/lib/utils";
import { fetchWasmDatabases } from "@/services/duckdb/schemaFetcher";
import {
  createExecution,
  QueryCancelledError,
  type ProducedItem,
  type ProducerContext,
} from "../queryStream";
import { arrowSchemaToQuerySchema, catalogSnapshot, type LocalDuckSession } from "../session";
import type {
  CatalogSnapshot,
  ConnectionKind,
  QueryExecution,
  QueryRequest,
  SessionCapabilities,
} from "../types";

export interface LocalDuckSessionOptions {
  connectionId: string;
  kind: Extract<ConnectionKind, "wasm" | "opfs">;
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
  capabilities: SessionCapabilities;
  /** Driver-specific teardown — terminating the engine, releasing an OPFS lock. */
  teardown: (db: duckdb.AsyncDuckDB, connection: duckdb.AsyncDuckDBConnection) => Promise<void>;
}

export class LocalDuckSessionImpl implements LocalDuckSession {
  readonly id = generateUUID();
  readonly connectionId: string;
  readonly kind: Extract<ConnectionKind, "wasm" | "opfs">;
  readonly capabilities: SessionCapabilities;
  readonly local: { db: duckdb.AsyncDuckDB; connection: duckdb.AsyncDuckDBConnection };

  private open = true;
  private execConnection: duckdb.AsyncDuckDBConnection | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly teardown: LocalDuckSessionOptions["teardown"];

  constructor(options: LocalDuckSessionOptions) {
    this.connectionId = options.connectionId;
    this.kind = options.kind;
    this.capabilities = options.capabilities;
    this.local = { db: options.db, connection: options.connection };
    this.teardown = options.teardown;
  }

  get isOpen(): boolean {
    return this.open;
  }

  execute(request: QueryRequest): QueryExecution {
    /** Set once the engine has a cursor that can actually be interrupted. */
    const interrupt: { hook: (() => Promise<unknown>) | null } = { hook: null };

    return createExecution({
      id: request.id,
      sql: request.sql,
      signal: request.signal,
      maxRows: request.maxRows,
      onCancel: async () => {
        await interrupt.hook?.();
      },
      produce: (context) => this.produce(request.sql, context, interrupt),
    });
  }

  private async *produce(
    sql: string,
    context: ProducerContext,
    interrupt: { hook: (() => Promise<unknown>) | null }
  ): AsyncGenerator<ProducedItem> {
    const release = await this.acquire();
    try {
      if (!this.open) throw new Error("Connection is closed");
      // Stop pressed while this statement sat in the queue: never start it.
      if (context.signal.aborted) throw new QueryCancelledError();

      const connection = await this.getExecConnection();
      const reader = await connection.send(sql);

      // Stop pressed in the window before send() resolved.
      if (context.signal.aborted) {
        await connection.cancelSent().catch(() => {});
        throw new QueryCancelledError();
      }
      interrupt.hook = () => connection.cancelSent();

      if (reader.schema) {
        yield { kind: "schema", schema: arrowSchemaToQuerySchema(reader.schema) };
      }

      for await (const batch of reader) {
        yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
      }
    } finally {
      interrupt.hook = null;
      release();
    }
  }

  async introspect(): Promise<CatalogSnapshot> {
    if (!this.open) throw new Error("Connection is closed");
    // Deliberately the SHARED connection: introspection must never interleave
    // with a streamed editor result (see the file header).
    const databases = await fetchWasmDatabases(this.local.connection);
    return catalogSnapshot(
      databases.map((database) => ({
        name: database.name,
        tables: database.tables.map((table) => ({
          name: table.name,
          schema: table.schema,
          columns: table.columns,
          rowCount: table.rowCount,
        })),
      }))
    );
  }

  async close(): Promise<void> {
    if (!this.open) return;
    this.open = false;

    if (this.execConnection) {
      await this.execConnection.close().catch(() => {});
      this.execConnection = null;
    }
    await this.teardown(this.local.db, this.local.connection);
  }

  /** Lazily opens the dedicated statement connection. */
  private async getExecConnection(): Promise<duckdb.AsyncDuckDBConnection> {
    if (!this.execConnection) {
      this.execConnection = await this.local.db.connect();
    }
    return this.execConnection;
  }

  /**
   * Serializes statements on the dedicated connection. Returns the release
   * hook; callers must invoke it from a `finally`.
   */
  private async acquire(): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prior = this.queue;
    this.queue = prior.then(() => held);
    await prior;
    return release;
  }
}

/** Terminates an engine this tab owns outright. */
export const terminateLocalEngine = async (
  db: duckdb.AsyncDuckDB,
  connection: duckdb.AsyncDuckDBConnection
): Promise<void> => {
  await connection.close().catch(() => {});
  await db.terminate().catch(() => {});
};

/** Re-exported so drivers do not each import duckdb just for the access mode. */
export { duckdb };
