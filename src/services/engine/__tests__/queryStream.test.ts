import { describe, it, expect, vi } from "vitest";
import { tableFromArrays, type RecordBatch } from "apache-arrow";
import {
  createExecution,
  collectExecution,
  materializeExecution,
  QueryCancelledError,
  toQueryErrorInfo,
  type ProducedItem,
} from "../queryStream";
import { arrowSchemaToQuerySchema } from "../session";
import type { QueryStreamEvent } from "../types";

/** Builds real Arrow batches so the coercion path is exercised, not mocked. */
const arrowBatches = (values: { n: number[]; s: string[] }): RecordBatch[] =>
  tableFromArrays(values).batches;

const drain = async (
  execution: ReturnType<typeof createExecution>
): Promise<QueryStreamEvent[]> => {
  const events: QueryStreamEvent[] = [];
  for await (const event of execution.stream) events.push(event);
  return events;
};

/** The terminal event — always `completed` or `failed`. */
const last = (events: QueryStreamEvent[]): QueryStreamEvent | undefined =>
  events[events.length - 1];

const rowProducer = (chunks: Record<string, unknown>[][]) =>
  async function* (): AsyncGenerator<ProducedItem> {
    yield {
      kind: "schema",
      schema: { fields: [{ name: "v", type: "INTEGER", nullable: true }] },
    };
    for (const rows of chunks) {
      yield { kind: "chunk", rows: rows.length, chunk: { encoding: "rows", rows } };
    }
  };

describe("createExecution — stream envelope", () => {
  it("brackets batches with started and completed", async () => {
    const execution = createExecution({
      sql: "SELECT 1",
      produce: rowProducer([[{ v: 1 }, { v: 2 }], [{ v: 3 }]]),
    });

    const events = await drain(execution);
    expect(events.map((e) => e.type)).toEqual(["started", "schema", "batch", "batch", "completed"]);

    const completed = last(events);
    expect(completed).toMatchObject({ type: "completed", rowCount: 3, batchCount: 2 });
  });

  it("numbers batches from zero and reports per-batch row counts", async () => {
    const events = await drain(
      createExecution({ sql: "SELECT 1", produce: rowProducer([[{ v: 1 }], [{ v: 2 }, { v: 3 }]]) })
    );
    const batches = events.filter((e) => e.type === "batch");
    expect(batches.map((b) => b.index)).toEqual([0, 1]);
    expect(batches.map((b) => b.rows)).toEqual([1, 2]);
  });

  it("drops empty batches — a trailing zero-row chunk is not a result", async () => {
    const events = await drain(
      createExecution({ sql: "SELECT 1", produce: rowProducer([[{ v: 1 }], []]) })
    );
    expect(events.filter((e) => e.type === "batch")).toHaveLength(1);
  });

  it("runs nothing until the stream is iterated", async () => {
    const produce = vi.fn(rowProducer([[{ v: 1 }]]));
    createExecution({ sql: "SELECT 1", produce });
    await Promise.resolve();
    expect(produce).not.toHaveBeenCalled();
  });

  it("refuses a second consumer — the engine cursor is already spent", async () => {
    const execution = createExecution({ sql: "SELECT 1", produce: rowProducer([[{ v: 1 }]]) });
    await drain(execution);
    await expect(drain(execution)).rejects.toThrow(/already been consumed/i);
  });
});

describe("createExecution — failure", () => {
  it("reports a producer throw as a failed event, not a rejection", async () => {
    const events = await drain(
      createExecution({
        sql: "SELECT bad",
        // eslint-disable-next-line require-yield
        async *produce() {
          throw new Error("Catalog Error: table does not exist");
        },
      })
    );
    expect(last(events)).toMatchObject({
      type: "failed",
      error: { cancelled: false, message: expect.stringContaining("Catalog Error") },
    });
  });

  it("unwraps duckdb-wasm's JSON error envelope through the explainer", async () => {
    const events = await drain(
      createExecution({
        sql: "SELECT 1",
        // eslint-disable-next-line require-yield
        async *produce() {
          throw new Error(
            'Query failed {"exception_type":"Binder","exception_message":"No such column"}'
          );
        },
      })
    );
    const failed = last(events);
    expect(failed?.type).toBe("failed");
    expect(failed && "error" in failed && failed.error.message).toContain("Binder: No such column");
  });
});

describe("createExecution — cancellation", () => {
  it("marks a cancel as cancelled rather than as a fault", async () => {
    const execution = createExecution({
      sql: "SELECT 1",
      async *produce() {
        yield { kind: "chunk", rows: 1, chunk: { encoding: "rows", rows: [{ v: 1 }] } };
        await execution.cancel();
        yield { kind: "chunk", rows: 1, chunk: { encoding: "rows", rows: [{ v: 2 }] } };
      },
    });

    const events = await drain(execution);
    expect(last(events)).toMatchObject({ type: "failed", error: { cancelled: true } });
    expect(events.filter((e) => e.type === "batch")).toHaveLength(1);
  });

  it("invokes the engine interrupt exactly once, however many cancels arrive", async () => {
    const onCancel = vi.fn();
    const execution = createExecution({
      sql: "SELECT 1",
      onCancel,
      produce: rowProducer([[{ v: 1 }]]),
    });

    await Promise.all([execution.cancel(), execution.cancel(), execution.cancel()]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("never starts a statement cancelled before iteration", async () => {
    const produce = vi.fn(rowProducer([[{ v: 1 }]]));
    const execution = createExecution({ sql: "SELECT 1", produce });
    await execution.cancel();

    const events = await drain(execution);
    expect(produce).not.toHaveBeenCalled();
    expect(last(events)).toMatchObject({ type: "failed", error: { cancelled: true } });
  });

  it("honours a caller-supplied AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await drain(
      createExecution({
        sql: "SELECT 1",
        signal: controller.signal,
        produce: rowProducer([[{ v: 1 }]]),
      })
    );
    expect(last(events)).toMatchObject({ type: "failed", error: { cancelled: true } });
  });

  it("a cancel hook that throws still ends the stream cleanly", async () => {
    const execution = createExecution({
      sql: "SELECT 1",
      onCancel: () => {
        throw new Error("interrupt failed");
      },
      produce: rowProducer([[{ v: 1 }]]),
    });
    await expect(execution.cancel()).resolves.toBeUndefined();
  });
});

describe("createExecution — maxRows", () => {
  it("stops at the cap and reports the result as truncated", async () => {
    const events = await drain(
      createExecution({
        sql: "SELECT 1",
        maxRows: 3,
        produce: rowProducer([[{ v: 1 }, { v: 2 }], [{ v: 3 }, { v: 4 }, { v: 5 }], [{ v: 6 }]]),
      })
    );

    expect(last(events)).toMatchObject({ type: "completed", rowCount: 3, truncated: true });
    const rows = events
      .filter((e) => e.type === "batch")
      .flatMap((e) => (e.chunk.encoding === "rows" ? e.chunk.rows : []));
    expect(rows).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
  });

  it("truncation completes rather than failing, even though it interrupts the engine", async () => {
    const onCancel = vi.fn();
    const events = await drain(
      createExecution({
        sql: "SELECT 1",
        maxRows: 1,
        onCancel,
        produce: rowProducer([[{ v: 1 }, { v: 2 }]]),
      })
    );
    expect(last(events)?.type).toBe("completed");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("slices Arrow batches too, not just row chunks", async () => {
    const batches = arrowBatches({ n: [1, 2, 3, 4], s: ["a", "b", "c", "d"] });
    const events = await drain(
      createExecution({
        sql: "SELECT 1",
        maxRows: 2,
        async *produce() {
          for (const batch of batches) {
            yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
          }
        },
      })
    );
    const batch = events.find((e) => e.type === "batch");
    expect(batch?.rows).toBe(2);
    expect(batch && batch.chunk.encoding === "arrow" && batch.chunk.batch.numRows).toBe(2);
  });

  it("leaves a result under the cap untruncated", async () => {
    const events = await drain(
      createExecution({ sql: "SELECT 1", maxRows: 10, produce: rowProducer([[{ v: 1 }]]) })
    );
    expect(last(events)).toMatchObject({ truncated: false, rowCount: 1 });
  });
});

describe("collectExecution / materializeExecution", () => {
  it("materializes Arrow batches through the DuckDB coercion path", async () => {
    const batches = arrowBatches({ n: [1, 2], s: ["a", "b"] });
    const result = await materializeExecution(
      createExecution({
        sql: "SELECT 1",
        async *produce() {
          yield {
            kind: "schema",
            schema: arrowSchemaToQuerySchema(batches[0].schema),
          };
          for (const batch of batches) {
            yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
          }
        },
      })
    );

    expect(result.columns).toEqual(["n", "s"]);
    expect(result.rowCount).toBe(2);
    expect(result.data[0]).toMatchObject({ n: 1, s: "a" });
  });

  it("materializes row chunks with the schema's column types", async () => {
    const result = await materializeExecution(
      createExecution({ sql: "SELECT 1", produce: rowProducer([[{ v: 1 }], [{ v: 2 }]]) })
    );
    expect(result).toMatchObject({
      columns: ["v"],
      columnTypes: ["INTEGER"],
      rowCount: 2,
      data: [{ v: 1 }, { v: 2 }],
    });
  });

  it("keeps column headers when an Arrow query returns no rows", async () => {
    const schema = arrowBatches({ n: [1], s: ["a"] })[0].schema;
    const result = await materializeExecution(
      createExecution({
        sql: "SELECT 1 WHERE false",
        async *produce() {
          yield { kind: "schema", schema: arrowSchemaToQuerySchema(schema) };
        },
      })
    );
    expect(result.columns).toEqual(["n", "s"]);
    expect(result.rowCount).toBe(0);
  });

  it("surfaces a failure as QueryResult.error rather than throwing", async () => {
    const result = await materializeExecution(
      createExecution({
        sql: "SELECT bad",
        // eslint-disable-next-line require-yield
        async *produce() {
          throw new Error("boom");
        },
      })
    );
    expect(result.error).toBe("boom");
    expect(result.data).toEqual([]);
  });

  it("reports truncation and duration on the collected result", async () => {
    const collected = await collectExecution(
      createExecution({ sql: "SELECT 1", maxRows: 1, produce: rowProducer([[{ v: 1 }, { v: 2 }]]) })
    );
    expect(collected.truncated).toBe(true);
    expect(collected.rowCount).toBe(1);
    expect(collected.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("toQueryErrorInfo", () => {
  it("treats an explicit cancel flag as cancellation", () => {
    expect(toQueryErrorInfo(new Error("anything"), true)).toEqual({
      message: "Query cancelled",
      cancelled: true,
    });
  });

  it("recognises QueryCancelledError and DOM AbortError without the flag", () => {
    expect(toQueryErrorInfo(new QueryCancelledError(), false).cancelled).toBe(true);
    expect(toQueryErrorInfo(new DOMException("aborted", "AbortError"), false).cancelled).toBe(true);
  });

  it("passes an ordinary failure through the explainer", () => {
    const info = toQueryErrorInfo(new Error("Unsupported Arrow type VARIANT"), false);
    expect(info.cancelled).toBe(false);
    expect(info.message).toMatch(/VARIANT columns can't be returned/i);
  });

  it("handles a non-Error throw", () => {
    expect(toQueryErrorInfo("plain string", false).message).toBe("plain string");
  });
});

describe("collectExecution — progress reporting", () => {
  it("reports the schema before any row arrives", async () => {
    const seen: string[][] = [];
    await collectExecution(
      createExecution({ sql: "SELECT 1", produce: rowProducer([[{ v: 1 }]]) }),
      { onSchema: (schema) => seen.push(schema.fields.map((f) => f.name)) }
    );
    expect(seen).toEqual([["v"]]);
  });

  it("reports a growing row count as batches land", async () => {
    const counts: number[] = [];
    await collectExecution(
      createExecution({
        sql: "SELECT 1",
        produce: rowProducer([[{ v: 1 }], [{ v: 2 }], [{ v: 3 }]]),
      }),
      { progressIntervalMs: 0, onProgress: (p) => counts.push(p.rows) }
    );
    expect(counts).toEqual([1, 2, 3]);
  });

  it("throttles callbacks so a chatty query cannot storm the UI", async () => {
    const counts: number[] = [];
    const chunks = Array.from({ length: 200 }, (_, i) => [{ v: i }]);
    await collectExecution(createExecution({ sql: "SELECT 1", produce: rowProducer(chunks) }), {
      progressIntervalMs: 10_000,
      onProgress: (p) => counts.push(p.rows),
    });
    // One immediate tick, then one flush at the end — never 200.
    expect(counts.length).toBeLessThanOrEqual(2);
  });

  it("always flushes a final count, so the UI never ends on a stale number", async () => {
    const counts: number[] = [];
    await collectExecution(
      createExecution({
        sql: "SELECT 1",
        produce: rowProducer([[{ v: 1 }], [{ v: 2 }], [{ v: 3 }]]),
      }),
      { progressIntervalMs: 10_000, onProgress: (p) => counts.push(p.rows) }
    );
    expect(counts[counts.length - 1]).toBe(3);
  });

  it("does not report progress for a query that fails immediately", async () => {
    const onProgress = vi.fn();
    await collectExecution(
      createExecution({
        sql: "SELECT bad",
        // eslint-disable-next-line require-yield
        async *produce() {
          throw new Error("boom");
        },
      }),
      { onProgress }
    );
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("materialization — truncation and timing", () => {
  it("flags a truncated row result so consumers cannot present it as complete", async () => {
    const result = await materializeExecution(
      createExecution({
        sql: "SELECT 1",
        maxRows: 2,
        produce: rowProducer([[{ v: 1 }, { v: 2 }, { v: 3 }]]),
      })
    );
    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(2);
  });

  it("flags a truncated Arrow result too", async () => {
    const batches = arrowBatches({ n: [1, 2, 3, 4], s: ["a", "b", "c", "d"] });
    const result = await materializeExecution(
      createExecution({
        sql: "SELECT 1",
        maxRows: 2,
        async *produce() {
          for (const batch of batches) {
            yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
          }
        },
      })
    );
    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(2);
  });

  it("leaves `truncated` absent — not false — on a complete result", async () => {
    const result = await materializeExecution(
      createExecution({ sql: "SELECT 1", produce: rowProducer([[{ v: 1 }]]) })
    );
    expect(result.truncated).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
