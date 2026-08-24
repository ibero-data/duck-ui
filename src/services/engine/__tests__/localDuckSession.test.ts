import { describe, it, expect, vi } from "vitest";
import { tableFromArrays, type RecordBatch } from "apache-arrow";
import type * as duckdb from "@duckdb/duckdb-wasm";
import { LocalDuckSessionImpl } from "../drivers/localDuckSession";
import { collectExecution, materializeExecution } from "../queryStream";
import { LOCAL_MEMORY_CAPABILITIES } from "../session";

/**
 * A stand-in for `AsyncDuckDBConnection` that records the order statements
 * ran in. The real engine can't be driven from Node in its async/worker form,
 * and what these tests are actually about is the session's discipline —
 * dedicated connection, one statement at a time, interrupt wiring — not
 * DuckDB's own behaviour, which `engineIntegration.test.ts` covers.
 */
const makeFakeEngine = (options: { batchDelayMs?: number } = {}) => {
  const events: string[] = [];
  let connectionCount = 0;

  const makeConnection = (label: string) => {
    const cancelSent = vi.fn(async () => {
      events.push(`${label}:cancel`);
      return true;
    });

    return {
      label,
      cancelSent,
      close: vi.fn(async () => {
        events.push(`${label}:close`);
      }),
      query: vi.fn(async (sql: string) => {
        events.push(`${label}:query:${sql}`);
        return tableFromArrays({ n: [1] });
      }),
      send: vi.fn(async (sql: string) => {
        events.push(`${label}:start:${sql}`);
        const table = tableFromArrays({ n: [1, 2], s: ["a", "b"] });
        return {
          schema: table.schema,
          async *[Symbol.asyncIterator](): AsyncGenerator<RecordBatch> {
            for (const batch of table.batches) {
              if (options.batchDelayMs) {
                await new Promise((resolve) => setTimeout(resolve, options.batchDelayMs));
              }
              yield batch;
            }
            events.push(`${label}:end:${sql}`);
          },
        };
      }),
    };
  };

  const shared = makeConnection("shared");
  const created: ReturnType<typeof makeConnection>[] = [];

  const db = {
    connect: vi.fn(async () => {
      const connection = makeConnection(`exec${++connectionCount}`);
      created.push(connection);
      return connection;
    }),
    terminate: vi.fn(async () => {
      events.push("db:terminate");
    }),
  };

  return { db, shared, created, events };
};

const makeSession = (engine: ReturnType<typeof makeFakeEngine>, teardown = vi.fn(async () => {})) =>
  new LocalDuckSessionImpl({
    connectionId: "test",
    kind: "wasm",
    db: engine.db as unknown as duckdb.AsyncDuckDB,
    connection: engine.shared as unknown as duckdb.AsyncDuckDBConnection,
    capabilities: LOCAL_MEMORY_CAPABILITIES,
    teardown,
  });

describe("LocalDuckSessionImpl — connection discipline", () => {
  it("runs statements on a dedicated connection, never the shared one", async () => {
    const engine = makeFakeEngine();
    const session = makeSession(engine);

    await materializeExecution(session.execute({ sql: "SELECT 1" }));

    expect(engine.shared.send).not.toHaveBeenCalled();
    expect(engine.created).toHaveLength(1);
    expect(engine.created[0].send).toHaveBeenCalledWith("SELECT 1");
  });

  it("reuses that connection across statements, so SET and temp tables survive", async () => {
    const engine = makeFakeEngine();
    const session = makeSession(engine);

    await materializeExecution(session.execute({ sql: "SET x=1" }));
    await materializeExecution(session.execute({ sql: "SELECT 1" }));

    expect(engine.db.connect).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent statements — one cursor at a time", async () => {
    const engine = makeFakeEngine({ batchDelayMs: 1 });
    const session = makeSession(engine);

    await Promise.all([
      materializeExecution(session.execute({ sql: "A" })),
      materializeExecution(session.execute({ sql: "B" })),
      materializeExecution(session.execute({ sql: "C" })),
    ]);

    const flow = engine.events.filter((e) => /:(start|end):/.test(e));
    expect(flow).toEqual([
      "exec1:start:A",
      "exec1:end:A",
      "exec1:start:B",
      "exec1:end:B",
      "exec1:start:C",
      "exec1:end:C",
    ]);
  });

  it("a failing statement does not wedge the queue behind it", async () => {
    const engine = makeFakeEngine();
    const session = makeSession(engine);
    engine.db.connect.mockImplementationOnce(async () => {
      throw new Error("connect failed");
    });

    const first = await materializeExecution(session.execute({ sql: "A" }));
    expect(first.error).toBe("connect failed");

    const second = await materializeExecution(session.execute({ sql: "B" }));
    expect(second.error).toBeUndefined();
    expect(second.rowCount).toBe(2);
  });
});

describe("LocalDuckSessionImpl — results", () => {
  it("emits the Arrow schema before any batch and yields Arrow chunks", async () => {
    const engine = makeFakeEngine();
    const collected = await collectExecution(makeSession(engine).execute({ sql: "SELECT 1" }));

    expect(collected.schema?.fields.map((f) => f.name)).toEqual(["n", "s"]);
    expect(collected.schema?.arrow).toBeDefined();
    expect(collected.batches.length).toBeGreaterThan(0);
    expect(collected.rows).toEqual([]);
  });

  it("materializes to the legacy QueryResult shape", async () => {
    const result = await materializeExecution(
      makeSession(makeFakeEngine()).execute({ sql: "SELECT 1" })
    );
    expect(result).toMatchObject({ columns: ["n", "s"], rowCount: 2 });
    expect(result.data[0]).toMatchObject({ n: 1, s: "a" });
  });
});

describe("LocalDuckSessionImpl — cancellation", () => {
  it("interrupts the engine cursor once a statement is running", async () => {
    const engine = makeFakeEngine({ batchDelayMs: 20 });
    const session = makeSession(engine);
    const execution = session.execute({ sql: "SELECT 1" });

    const collecting = collectExecution(execution);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await execution.cancel();

    const collected = await collecting;
    expect(collected.error?.cancelled).toBe(true);
    expect(engine.created[0].cancelSent).toHaveBeenCalled();
  });

  it("never sends a statement cancelled while it waited in the queue", async () => {
    const engine = makeFakeEngine({ batchDelayMs: 20 });
    const session = makeSession(engine);

    const first = session.execute({ sql: "FIRST" });
    const second = session.execute({ sql: "SECOND" });

    const running = Promise.all([collectExecution(first), collectExecution(second)]);
    await second.cancel();
    const [, secondResult] = await running;

    expect(secondResult.error?.cancelled).toBe(true);
    expect(engine.events).not.toContain("exec1:start:SECOND");
  });
});

describe("LocalDuckSessionImpl — lifecycle", () => {
  it("introspects on the shared connection, so it cannot truncate a live stream", async () => {
    const engine = makeFakeEngine();
    const session = makeSession(engine);
    await session.introspect().catch(() => undefined);
    expect(engine.shared.query).toHaveBeenCalled();
  });

  it("closes the dedicated connection and runs driver teardown exactly once", async () => {
    const engine = makeFakeEngine();
    const teardown = vi.fn(async () => {});
    const session = makeSession(engine, teardown);

    await materializeExecution(session.execute({ sql: "SELECT 1" }));
    await session.close();
    await session.close();

    expect(engine.created[0].close).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(session.isOpen).toBe(false);
  });

  it("refuses statements after close instead of resurrecting the engine", async () => {
    const session = makeSession(makeFakeEngine());
    await session.close();
    const result = await materializeExecution(session.execute({ sql: "SELECT 1" }));
    expect(result.error).toMatch(/closed/i);
  });
});
