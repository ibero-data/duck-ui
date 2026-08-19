/**
 * Share Runtime — the isolated engine guest SQL runs in.
 *
 * Guest statements must NEVER touch the host's own DuckDB session. That
 * session holds imported private tables, attached OPFS databases, and secrets
 * created for external sources. Running a stranger's SQL there and hoping a
 * keyword filter holds is not a security model.
 *
 * So a share runtime is a SEPARATE `AsyncDuckDB` instance, in its own worker,
 * populated only with data the host explicitly put into it. The boundary is
 * the process, not a regex:
 *
 *   HOST PRIVATE RUNTIME              SHARE RUNTIME
 *   personal tables                   only explicitly shared data
 *   OPFS databases                    no OPFS
 *   credentials / secrets             no secrets
 *   loaded extensions                 no extension loading
 *   external access                   external access OFF, locked
 *          │                                  ▲
 *          └──── explicit copy, host-driven ──┘
 *
 * Even a guest that defeats every statement check in `capabilities/policy.ts`
 * reaches only what is inside this instance. It has no handle to the other
 * one.
 *
 * ## Engine-enforced restrictions
 *
 * Applied at open, then locked:
 *
 * - `enable_external_access=false` — no httpfs, no local file reads, no ATTACH
 *   to a remote source, no COPY to a path. DuckDB enforces this itself.
 * - `autoinstall_known_extensions=false`, `autoload_known_extensions=false`
 * - `allowUnsignedExtensions=false` at instantiation
 * - `memory_limit` — a guest cannot exhaust the host's memory
 * - `lock_configuration=true` — LAST, so none of the above can be turned back
 *   on from guest SQL
 *
 * ## Documented limitations
 *
 * Being honest about what this does not do (§19):
 *
 * - DuckDB-WASM has no per-connection permission system. Everything above is
 *   instance-wide configuration, not a privilege boundary inside the engine.
 * - A guest can still write to the share runtime — `CREATE TEMP TABLE` and
 *   friends are refused by the statement screen, not by the engine. Anything
 *   that got past the screen would affect only this throwaway instance, never
 *   host data.
 * - A guest can still make the runtime do expensive work. Row caps, byte caps,
 *   a memory limit and a query timeout bound it; they do not eliminate it.
 * - The instance costs a worker and its own WASM heap. It is created when a
 *   session first shares data and torn down when the session ends.
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { Table, type RecordBatch } from "apache-arrow";
import { generateUUID } from "@/lib/utils";
import { createDuckdbWorker, resolveDuckdbBundles } from "@/services/duckdb/wasmConnection";

/** Memory ceiling for the share runtime. Deliberately well below the host's. */
export const SHARE_RUNTIME_MEMORY_MB = 512;

export interface ShareRuntimeOptions {
  memoryLimitMb?: number;
}

/** One table copied into the runtime for guests to query. */
export interface SharedTable {
  /** Name the guest sees and queries. */
  name: string;
  /** Arrow batches holding the data. */
  batches: RecordBatch[];
}

export class ShareRuntime {
  readonly id = generateUUID();

  private db: duckdb.AsyncDuckDB | null = null;
  private connection: duckdb.AsyncDuckDBConnection | null = null;
  private readonly tables = new Set<string>();

  /**
   * Where loaded tables actually live, read from the engine rather than
   * assumed.
   *
   * This matters: the catalog snapshot a guest receives is what their data
   * explorer builds fully-qualified names from. Inventing a catalog name here
   * produces `Catalog "shared" does not exist` the first time they click a
   * table, because the name never existed anywhere but in the snapshot.
   */
  private catalog = "memory";
  private schema = "main";

  private constructor(private readonly memoryLimitMb: number) {}

  /**
   * Boots a hardened runtime.
   *
   * The order of the `SET` statements matters: `lock_configuration` must come
   * last, because once it is on nothing else can be changed — including by us.
   */
  static async create(options: ShareRuntimeOptions = {}): Promise<ShareRuntime> {
    const runtime = new ShareRuntime(options.memoryLimitMb ?? SHARE_RUNTIME_MEMORY_MB);
    await runtime.boot();
    return runtime;
  }

  /**
   * Wraps handles that are already open.
   *
   * A seam for tests: booting a real runtime needs a browser worker, but the
   * table-loading and sealing contracts are worth pinning without one.
   */
  static wrapping(
    db: duckdb.AsyncDuckDB,
    connection: duckdb.AsyncDuckDBConnection,
    memoryLimitMb = SHARE_RUNTIME_MEMORY_MB
  ): ShareRuntime {
    const runtime = new ShareRuntime(memoryLimitMb);
    runtime.db = db;
    runtime.connection = connection;
    return runtime;
  }

  private async boot(): Promise<void> {
    const bundles = await resolveDuckdbBundles();
    const bundle = await duckdb.selectBundle(bundles);
    if (!bundle.mainWorker) {
      throw new Error("DuckDB WASM bundle is missing the main worker URL");
    }

    const { worker, revoke } = createDuckdbWorker(bundle.mainWorker);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);

    try {
      await db.instantiate(bundle.mainModule);
    } finally {
      revoke();
    }

    try {
      // In-memory only. No OPFS path, so nothing here can outlive the session
      // or touch a file the host cares about.
      await db.open({ allowUnsignedExtensions: false });
      const connection = await db.connect();

      const hardening = [
        `SET memory_limit='${this.memoryLimitMb}MB'`,
        `SET autoinstall_known_extensions=false`,
        `SET autoload_known_extensions=false`,
        // The important one: turns off httpfs, local file reads, remote
        // ATTACH and COPY-to-path, enforced by DuckDB rather than by us.
        `SET enable_external_access=false`,
      ];

      for (const statement of hardening) {
        try {
          await connection.query(statement);
        } catch (error) {
          // A hardening step that does not apply is not survivable — a runtime
          // that silently kept external access would be worse than none.
          await connection.close().catch(() => {});
          await db.terminate().catch(() => {});
          throw new Error(
            `Share runtime could not be secured (${statement}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Ask the engine where things land, before anything is loaded.
      try {
        const located = await connection.query(
          `SELECT current_database() AS catalog, current_schema() AS schema`
        );
        const row = located.toArray()[0]?.toJSON() as
          { catalog?: unknown; schema?: unknown } | undefined;
        if (row?.catalog) this.catalog = String(row.catalog);
        if (row?.schema) this.schema = String(row.schema);
      } catch {
        // Defaults are correct for an in-memory DuckDB; a failure here is not
        // worth refusing to start over.
        console.warn("[shareRuntime] could not resolve catalog name, using defaults");
      }

      this.db = db;
      this.connection = connection;
    } catch (error) {
      await db.terminate().catch(() => {});
      throw error;
    }
  }

  /**
   * Seals the configuration. Call once every table is loaded — after this
   * nothing, including this class, can change engine settings.
   */
  async seal(): Promise<void> {
    const connection = this.requireConnection();
    try {
      await connection.query(`SET lock_configuration=true`);
    } catch (error) {
      throw new Error(
        `Share runtime could not be sealed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Copies a table into the runtime.
   *
   * The host decides what goes in; the guest cannot ask for more. Data arrives
   * as Arrow, which means it comes from a query the host already ran and
   * approved rather than from a reference to a live private table.
   */
  async addTable(shared: SharedTable): Promise<void> {
    const connection = this.requireConnection();
    if (shared.batches.length === 0) {
      throw new Error(`Shared table "${shared.name}" has no data`);
    }

    // `insertArrowFromIPCStream` hands the bytes straight to the engine.
    //
    // Registering a file buffer and selecting from its name does NOT work: a
    // registered buffer lives in the virtual filesystem, and DuckDB resolves a
    // bare identifier against the CATALOG, so the name never matches anything
    // ("Table with name …arrow does not exist"). Reading it as a file would
    // also mean a path read, which this runtime deliberately forbids.
    const { tableToIPC } = await import("apache-arrow");
    const ipc = tableToIPC(new Table(shared.batches), "stream");

    await connection.insertArrowFromIPCStream(ipc, {
      name: shared.name,
      create: true,
    });
    this.tables.add(shared.name);
  }

  /** Table names a guest may query. */
  get tableNames(): string[] {
    return [...this.tables];
  }

  /** Catalog loaded tables live in. Describes the engine, not a wish. */
  get catalogName(): string {
    return this.catalog;
  }

  /** Schema loaded tables live in. */
  get schemaName(): string {
    return this.schema;
  }

  /**
   * A connection for running guest SQL.
   *
   * Callers must screen the statement first (`capabilities/policy.ts`). This
   * returns the handle; it does not decide what may run on it.
   */
  requireConnection(): duckdb.AsyncDuckDBConnection {
    if (!this.connection) throw new Error("Share runtime is not running");
    return this.connection;
  }

  get isRunning(): boolean {
    return this.connection !== null;
  }

  /** Tears the runtime down. Everything in it is gone. */
  async close(): Promise<void> {
    const connection = this.connection;
    const db = this.db;
    this.connection = null;
    this.db = null;
    this.tables.clear();

    if (connection) await connection.close().catch(() => {});
    if (db) await db.terminate().catch(() => {});
  }
}
