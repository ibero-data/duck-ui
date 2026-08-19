/**
 * Dashboard dataset execution, with a cache.
 *
 * A dashboard is usually several views of the same few questions: a KPI, a
 * chart and a table all reading one result. Running the query once per widget
 * would multiply cost by the number of widgets and, on a peer connection, by
 * the number of round trips too.
 *
 *   DashboardDataset
 *         │
 *    QueryExecution          ← one, shared
 *         │
 *   ┌─────┼─────┐
 *  chart metric table
 *
 * Cache identity is (SQL, parameters, executor) — §40. Two datasets with the
 * same SQL against DIFFERENT connections are not the same result, and treating
 * them as one would silently show a guest the host's numbers or vice versa.
 */

import { collectExecution, materializeCollected, type DataSession } from "@/services/engine";
import type { QueryResult } from "@/store/types";
import type { DashboardDataset, ExecutionStrategy } from "./types";

export interface DatasetResult {
  datasetId: string;
  status: "loading" | "ready" | "error";
  result?: QueryResult;
  error?: string;
  /** When this result was produced, for a "last refreshed" label. */
  fetchedAt?: string;
  durationMs?: number;
}

/** Resolves a strategy to a live session. Supplied by the store. */
export type SessionResolver = (strategy: ExecutionStrategy) => DataSession | null;

/**
 * Cache key for a dataset.
 *
 * The executor is part of the identity. Same SQL, different browser, different
 * answer — collapsing those would be a correctness bug, not an optimisation.
 */
export const datasetCacheKey = (dataset: DashboardDataset): string => {
  const executor =
    dataset.execution.mode === "peer"
      ? `peer:${dataset.execution.capabilityId}`
      : dataset.execution.mode === "local"
        ? `local:${dataset.execution.connectionId}`
        : `auto:${dataset.execution.capabilityId ?? ""}`;

  // Parameter order must not change the key, or the same query caches twice.
  const parameters = Object.entries(dataset.parameters ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("&");

  return `${executor}|${dataset.sql}|${parameters}`;
};

/**
 * Substitutes `:name` parameters into SQL.
 *
 * Values are rendered as SQL literals, not concatenated raw. A dashboard
 * parameter is user input, and a dashboard can be shared, so this is a place
 * someone could otherwise smuggle SQL through a filter control.
 */
export const applyParameters = (sql: string, parameters: Record<string, unknown> = {}): string => {
  if (Object.keys(parameters).length === 0) return sql;

  return sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (whole, name: string) => {
    if (!(name in parameters)) return whole;
    return toSqlLiteral(parameters[name]);
  });
};

/** Renders a JS value as a SQL literal. Strings are escaped, never spliced. */
export const toSqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) return `(${value.map(toSqlLiteral).join(", ")})`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

interface CacheEntry {
  key: string;
  promise: Promise<DatasetResult>;
  fetchedAt: number;
  /** Still running. An in-flight request is always joined, never duplicated. */
  pending: boolean;
}

/**
 * Runs dashboard datasets, sharing in-flight and completed results.
 *
 * One per dashboard. Disposed with it, so a closed dashboard holds nothing.
 */
export class DatasetRunner {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly listeners = new Set<(results: ReadonlyMap<string, DatasetResult>) => void>();
  private readonly results = new Map<string, DatasetResult>();

  /**
   * Immutable view of `results`, rebuilt only when something changes.
   *
   * `useSyncExternalStore` compares snapshots by reference, so handing back a
   * fresh Map on every read would loop forever.
   */
  private snapshotCache: ReadonlyMap<string, DatasetResult> = new Map();

  constructor(
    private readonly resolveSession: SessionResolver,
    /** How long a result stays fresh. Zero means always re-run. */
    private readonly ttlMs = 0
  ) {}

  /** Latest known state for every dataset. Stable between changes. */
  snapshot(): ReadonlyMap<string, DatasetResult> {
    return this.snapshotCache;
  }

  onChange(handler: (results: ReadonlyMap<string, DatasetResult>) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private publish(): void {
    this.snapshotCache = new Map(this.results);
    for (const listener of this.listeners) listener(this.snapshotCache);
  }

  /**
   * Runs a dataset, or joins an identical run already in flight.
   *
   * `force` bypasses the cache — that is what a Refresh button does.
   */
  async run(dataset: DashboardDataset, force = false): Promise<DatasetResult> {
    const key = datasetCacheKey(dataset);
    const cached = this.cache.get(key);

    if (cached) {
      // An in-flight request is joined even when forced: a Refresh pressed
      // while a query is already running should wait for it, not start a
      // second one against the same source.
      if (cached.pending) return this.adopt(dataset.id, cached.promise);

      const fresh = this.ttlMs > 0 && Date.now() - cached.fetchedAt < this.ttlMs;
      if (!force && fresh) return this.adopt(dataset.id, cached.promise);
    }

    this.results.set(dataset.id, { datasetId: dataset.id, status: "loading" });
    this.publish();

    const entry: CacheEntry = {
      key,
      promise: this.execute(dataset),
      fetchedAt: Date.now(),
      pending: true,
    };
    this.cache.set(key, entry);

    try {
      const result = await entry.promise;
      this.results.set(dataset.id, result);
      this.publish();
      return result;
    } finally {
      entry.pending = false;
      entry.fetchedAt = Date.now();
    }
  }

  /**
   * Attaches a dataset to a result someone else is already fetching.
   *
   * Two datasets can share a cache key while having different ids — the same
   * question asked by two widgets — so each still gets its own entry in the
   * published snapshot.
   */
  private async adopt(datasetId: string, promise: Promise<DatasetResult>): Promise<DatasetResult> {
    const shared = await promise;
    const result = { ...shared, datasetId };
    this.results.set(datasetId, result);
    this.publish();
    return result;
  }

  private async execute(dataset: DashboardDataset): Promise<DatasetResult> {
    const session = this.resolveSession(dataset.execution);
    if (!session) {
      return {
        datasetId: dataset.id,
        status: "error",
        error:
          dataset.execution.mode === "peer"
            ? "The person hosting this data is no longer available"
            : "That connection is not available",
      };
    }

    try {
      const sql = applyParameters(dataset.sql, dataset.parameters);
      const collected = await collectExecution(
        session.execute({ sql, label: `dashboard:${dataset.id}`, maxRows: dataset.maxRows })
      );

      if (collected.error) {
        return { datasetId: dataset.id, status: "error", error: collected.error.message };
      }

      return {
        datasetId: dataset.id,
        status: "ready",
        result: materializeCollected(collected),
        fetchedAt: new Date().toISOString(),
        durationMs: collected.durationMs,
      };
    } catch (error) {
      return {
        datasetId: dataset.id,
        status: "error",
        error: error instanceof Error ? error.message : "Query failed",
      };
    }
  }

  /** Re-runs everything, ignoring the cache. Backs "Refresh all" (§41). */
  async refreshAll(datasets: DashboardDataset[]): Promise<void> {
    this.cache.clear();
    await Promise.all(datasets.map((dataset) => this.run(dataset, true)));
  }

  /** Drops a dataset's cached result, e.g. after its SQL is edited. */
  invalidate(dataset: DashboardDataset): void {
    this.cache.delete(datasetCacheKey(dataset));
    this.results.delete(dataset.id);
    this.publish();
  }

  dispose(): void {
    this.cache.clear();
    this.results.clear();
    this.snapshotCache = new Map();
    this.listeners.clear();
  }
}
