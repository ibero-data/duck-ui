/**
 * Query stream plumbing shared by every driver.
 *
 * A driver only has to say "here is the schema, here are the chunks". This
 * module wraps that into the `QueryExecution` contract: the started/completed/
 * failed envelope, batch indexing, row accounting, `maxRows` truncation,
 * cancellation, and the guard that a stream is consumed exactly once. Getting
 * those semantics identical across drivers is the whole point of the layer —
 * a peer-executed query must behave like a local one.
 */

import { Table, Schema as ArrowSchema, type RecordBatch } from "apache-arrow";
import { generateUUID } from "@/lib/utils";
import { explainEngineError } from "@/services/duckdb/utils";
import { resultToJSON } from "@/services/duckdb/resultParser";
import type { QueryResult } from "@/store/types";
import type {
  QueryChunk,
  QueryErrorInfo,
  QueryExecution,
  QueryRequest,
  QueryResultSchema,
  QueryStreamEvent,
} from "./types";

/** What a driver yields while producing a result. */
export type ProducedItem =
  | { kind: "schema"; schema: QueryResultSchema }
  | { kind: "chunk"; chunk: QueryChunk; rows: number };

export interface ProducerContext {
  readonly queryId: string;
  /** Aborted on cancel, on `QueryRequest.signal`, and when `maxRows` is hit. */
  readonly signal: AbortSignal;
}

export type ChunkProducer = (context: ProducerContext) => AsyncIterable<ProducedItem>;

export interface CreateExecutionOptions {
  id?: string;
  sql: string;
  produce: ChunkProducer;
  /** Caller-supplied abort, linked into the execution's own signal. */
  signal?: AbortSignal;
  /** Stop after this many rows and report the result as truncated. */
  maxRows?: number;
  /**
   * Engine-level interrupt (`cancelSent()`, `AbortController.abort()` on a
   * fetch, a peer `query.cancel` message). Called at most once.
   */
  onCancel?: () => void | Promise<void>;
}

/** Cancels raised inside a producer surface as this, not as a fault. */
export class QueryCancelledError extends Error {
  constructor(message = "Query cancelled") {
    super(message);
    this.name = "QueryCancelledError";
  }
}

const isAbortLike = (error: unknown): boolean =>
  error instanceof QueryCancelledError ||
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && /query cancelled/i.test(error.message));

/** Normalizes anything a driver can throw into a presentable error. */
export const toQueryErrorInfo = (error: unknown, cancelled: boolean): QueryErrorInfo => {
  if (cancelled || isAbortLike(error)) {
    return { message: "Query cancelled", cancelled: true };
  }
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return { message: explainEngineError(raw), cancelled: false };
};

/**
 * Wraps a driver's chunk producer into a `QueryExecution`.
 *
 * The returned stream is lazy — nothing runs until iteration begins — and can
 * only be iterated once, because the underlying engine cursor is consumed.
 */
export const createExecution = (options: CreateExecutionOptions): QueryExecution => {
  const queryId = options.id ?? generateUUID();
  const controller = new AbortController();

  let cancelRequested = false;
  let cancelPromise: Promise<void> | null = null;
  let consumed = false;

  const requestCancel = (): Promise<void> => {
    if (!cancelPromise) {
      cancelRequested = true;
      controller.abort();
      // `.then(...)` rather than `Promise.resolve(hook())`: a hook that throws
      // synchronously would otherwise escape before the promise wraps it. A
      // failed interrupt must not reject the caller's cancel() — the stream
      // still ends, just with whatever the engine does on its own.
      cancelPromise = Promise.resolve()
        .then(() => options.onCancel?.())
        .then(
          () => undefined,
          (error) => {
            console.warn("[engine] cancel hook failed:", error);
          }
        );
    }
    return cancelPromise;
  };

  if (options.signal) {
    if (options.signal.aborted) {
      cancelRequested = true;
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => void requestCancel(), { once: true });
    }
  }

  async function* stream(): AsyncGenerator<QueryStreamEvent> {
    if (consumed) {
      throw new Error("QueryExecution stream has already been consumed");
    }
    consumed = true;

    const startedAt = Date.now();
    const startedTick = performance.now();
    yield { type: "started", queryId, startedAt };

    let rowCount = 0;
    let batchCount = 0;
    let truncated = false;

    try {
      if (cancelRequested) throw new QueryCancelledError();

      for await (const item of options.produce({ queryId, signal: controller.signal })) {
        if (cancelRequested) throw new QueryCancelledError();

        if (item.kind === "schema") {
          yield { type: "schema", queryId, schema: item.schema };
          continue;
        }

        // A zero-row batch carries no information for consumers and shows up
        // routinely at the tail of a DuckDB stream.
        if (item.rows === 0) continue;

        let chunk = item.chunk;
        let rows = item.rows;

        if (options.maxRows !== undefined && rowCount + rows > options.maxRows) {
          const remaining = Math.max(0, options.maxRows - rowCount);
          chunk = sliceChunk(chunk, remaining);
          rows = remaining;
          truncated = true;
        }

        if (rows > 0) {
          rowCount += rows;
          yield { type: "batch", queryId, index: batchCount, rows, chunk };
          batchCount += 1;
        }

        if (truncated) {
          // Stop the engine rather than draining a result we are discarding.
          void requestCancel();
          break;
        }
      }

      yield {
        type: "completed",
        queryId,
        rowCount,
        batchCount,
        durationMs: Math.round(performance.now() - startedTick),
        truncated,
      };
    } catch (error) {
      // A truncation cancel is a success, not a failure — the rows the caller
      // asked for were all delivered before the interrupt landed.
      if (truncated && isAbortLike(error)) {
        yield {
          type: "completed",
          queryId,
          rowCount,
          batchCount,
          durationMs: Math.round(performance.now() - startedTick),
          truncated: true,
        };
        return;
      }
      yield { type: "failed", queryId, error: toQueryErrorInfo(error, cancelRequested) };
    }
  }

  return {
    id: queryId,
    sql: options.sql,
    stream: { [Symbol.asyncIterator]: stream },
    cancel: requestCancel,
  };
};

/** Keeps the first `limit` rows of a chunk. */
const sliceChunk = (chunk: QueryChunk, limit: number): QueryChunk => {
  if (limit <= 0) {
    return chunk.encoding === "arrow"
      ? { encoding: "arrow", batch: chunk.batch.slice(0, 0) }
      : { encoding: "rows", rows: [] };
  }
  return chunk.encoding === "arrow"
    ? { encoding: "arrow", batch: chunk.batch.slice(0, limit) }
    : { encoding: "rows", rows: chunk.rows.slice(0, limit) };
};

//
// Consumers
//

/** Everything a materialized execution produced. */
export interface CollectedExecution {
  schema: QueryResultSchema | null;
  batches: RecordBatch[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  error: QueryErrorInfo | null;
}

/** What a caller learns about a query while it is still running. */
export interface ExecutionProgress {
  rows: number;
  batches: number;
  elapsedMs: number;
}

export interface CollectOptions {
  /**
   * Called as batches arrive. Throttled — a query producing thousands of small
   * batches must not schedule thousands of React renders.
   */
  onProgress?: (progress: ExecutionProgress) => void;
  /** Minimum gap between progress callbacks. Default 120ms. */
  progressIntervalMs?: number;
  /** Called once, as soon as the result shape is known. */
  onSchema?: (schema: QueryResultSchema) => void;
}

/**
 * Drains an execution. This is the eager path — it holds the whole result in
 * memory and exists for consumers that genuinely need all of it (the grid,
 * exports, the AI assistant).
 *
 * `onProgress`/`onSchema` make the wait observable without making it eager:
 * a caller can show a live row count and real column headers while the query
 * is still running. Consumers that want to render partial DATA should iterate
 * `execution.stream` directly instead.
 */
export const collectExecution = async (
  execution: QueryExecution,
  options: CollectOptions = {}
): Promise<CollectedExecution> => {
  const collected: CollectedExecution = {
    schema: null,
    batches: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    durationMs: 0,
    error: null,
  };

  const { onProgress, onSchema, progressIntervalMs = 120 } = options;
  const startedTick = performance.now();
  let lastProgressAt = 0;
  let progressPending = false;

  const emitProgress = (force: boolean): void => {
    if (!onProgress) return;
    const now = performance.now();
    if (!force && now - lastProgressAt < progressIntervalMs) {
      progressPending = true;
      return;
    }
    lastProgressAt = now;
    progressPending = false;
    onProgress({
      rows: collected.rowCount,
      batches: collected.batches.length + (collected.rows.length > 0 ? 1 : 0),
      elapsedMs: Math.round(now - startedTick),
    });
  };

  for await (const event of execution.stream) {
    switch (event.type) {
      case "started":
        break;
      case "schema":
        collected.schema = event.schema;
        onSchema?.(event.schema);
        break;
      case "batch":
        if (event.chunk.encoding === "arrow") {
          collected.batches.push(event.chunk.batch);
        } else {
          collected.rows.push(...event.chunk.rows);
        }
        collected.rowCount += event.rows;
        emitProgress(false);
        break;
      case "completed":
        collected.truncated = event.truncated;
        collected.durationMs = event.durationMs;
        collected.rowCount = event.rowCount;
        break;
      case "failed":
        collected.error = event.error;
        break;
    }
  }

  // A throttled tick that never fired would leave the UI showing a stale count
  // for a query that has already finished.
  if (progressPending) emitProgress(true);

  return collected;
};

/**
 * Compatibility bridge: an execution rendered as the legacy `QueryResult` the
 * existing UI consumes.
 *
 * Arrow results go through `resultToJSON`, which carries the DuckDB-WASM
 * coercions (decimals, UTC dates, month-day-nano intervals, geometry/varint/
 * blob decoding). Row results are already plain JS and pass through with the
 * types the server reported.
 */
export const materializeExecution = async (execution: QueryExecution): Promise<QueryResult> =>
  materializeCollected(await collectExecution(execution));

/** The materialization step on its own, for callers that already collected. */
export const materializeCollected = (collected: CollectedExecution): QueryResult => {
  if (collected.error) {
    return { columns: [], columnTypes: [], data: [], rowCount: 0, error: collected.error.message };
  }

  if (collected.batches.length > 0) {
    return {
      ...resultToJSON(new Table(collected.batches)),
      truncated: collected.truncated || undefined,
      durationMs: collected.durationMs,
    };
  }

  const fields = collected.schema?.fields ?? [];

  // Arrow-native session that returned no rows: preserve the column headers.
  if (collected.rows.length === 0 && collected.schema?.arrow) {
    return {
      ...resultToJSON(new Table(collected.schema.arrow ?? new ArrowSchema([]))),
      durationMs: collected.durationMs,
    };
  }

  return {
    columns: fields.map((field) => field.name),
    columnTypes: fields.map((field) => field.type),
    data: collected.rows,
    rowCount: collected.rowCount,
    truncated: collected.truncated || undefined,
    durationMs: collected.durationMs,
  };
};

/** Runs a statement to completion and returns the legacy result shape. */
export const runQuery = async (
  session: { execute: (request: QueryRequest) => QueryExecution },
  sql: string,
  label?: string,
  options: { maxRows?: number; signal?: AbortSignal } = {}
): Promise<QueryResult> =>
  materializeExecution(
    session.execute({ sql, label, maxRows: options.maxRows, signal: options.signal })
  );
