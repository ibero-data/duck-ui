import { describe, it, expect } from "vitest";
import { applyParameters, datasetCacheKey, DatasetRunner, toSqlLiteral } from "../queryRunner";
import { nextFreeSlot, type DashboardDataset, type DashboardWidget } from "../types";
import { createExecution, type DataSession } from "@/services/engine";

const dataset = (overrides: Partial<DashboardDataset> = {}): DashboardDataset => ({
  id: "d1",
  name: "Sales",
  sql: "SELECT 1 AS n",
  execution: { mode: "local", connectionId: "WASM" },
  ...overrides,
});

/** A session that records how many times it was actually asked to run SQL. */
const countingSession = (rows: Record<string, unknown>[] = [{ n: 1 }]) => {
  const calls: string[] = [];
  const session = {
    execute: ({ sql }: { sql: string }) => {
      calls.push(sql);
      return createExecution({
        sql,
        async *produce() {
          yield {
            kind: "schema",
            schema: { fields: [{ name: "n", type: "INTEGER", nullable: true }] },
          };
          yield { kind: "chunk", rows: rows.length, chunk: { encoding: "rows", rows } };
        },
      });
    },
  } as unknown as DataSession;
  return { session, calls };
};

describe("parameter substitution", () => {
  it("substitutes named parameters", () => {
    expect(applyParameters("SELECT * FROM t WHERE id = :id", { id: 7 })).toBe(
      "SELECT * FROM t WHERE id = 7"
    );
  });

  it("leaves unknown placeholders alone rather than emptying them", () => {
    // Blanking an unbound parameter would silently change what the query means.
    expect(applyParameters("SELECT :a, :b", { a: 1 })).toBe("SELECT 1, :b");
  });

  it("escapes string values instead of splicing them in", () => {
    // A dashboard filter is user input, and dashboards get shared.
    const sql = applyParameters("SELECT * FROM t WHERE name = :name", {
      name: "O'Brien'; DROP TABLE t; --",
    });
    expect(sql).toBe("SELECT * FROM t WHERE name = 'O''Brien''; DROP TABLE t; --'");
  });

  it("renders each supported type as a literal", () => {
    expect(toSqlLiteral(null)).toBe("NULL");
    expect(toSqlLiteral(undefined)).toBe("NULL");
    expect(toSqlLiteral(42)).toBe("42");
    expect(toSqlLiteral(Number.NaN)).toBe("NULL");
    expect(toSqlLiteral(true)).toBe("TRUE");
    expect(toSqlLiteral(["a", "b"])).toBe("('a', 'b')");
  });

  it("leaves SQL untouched when there are no parameters", () => {
    expect(applyParameters("SELECT 1")).toBe("SELECT 1");
  });
});

describe("dataset cache key", () => {
  it("treats identical SQL on different connections as different results", () => {
    // Collapsing these would show a guest the host's numbers, or the reverse.
    const local = dataset({ execution: { mode: "local", connectionId: "WASM" } });
    const peer = dataset({ execution: { mode: "peer", capabilityId: "cap-1" } });
    expect(datasetCacheKey(local)).not.toBe(datasetCacheKey(peer));
  });

  it("is stable regardless of parameter order", () => {
    const a = dataset({ parameters: { x: 1, y: 2 } });
    const b = dataset({ parameters: { y: 2, x: 1 } });
    expect(datasetCacheKey(a)).toBe(datasetCacheKey(b));
  });

  it("changes when a parameter value changes", () => {
    expect(datasetCacheKey(dataset({ parameters: { x: 1 } }))).not.toBe(
      datasetCacheKey(dataset({ parameters: { x: 2 } }))
    );
  });

  it("changes when the SQL changes", () => {
    expect(datasetCacheKey(dataset({ sql: "SELECT 1" }))).not.toBe(
      datasetCacheKey(dataset({ sql: "SELECT 2" }))
    );
  });
});

describe("DatasetRunner", () => {
  it("runs a dataset and reports the result", async () => {
    const { session } = countingSession([{ n: 5 }]);
    const runner = new DatasetRunner(() => session);

    const result = await runner.run(dataset());
    expect(result.status).toBe("ready");
    expect(result.result?.data).toEqual([{ n: 5 }]);
    expect(result.fetchedAt).toBeTruthy();
  });

  it("shares one query between widgets mounting at once", async () => {
    // The reason the cache exists: a KPI, a chart and a table over one dataset
    // is one question, not three.
    const { session, calls } = countingSession();
    const runner = new DatasetRunner(() => session);
    const shared = dataset();

    await Promise.all([runner.run(shared), runner.run(shared), runner.run(shared)]);
    expect(calls).toHaveLength(1);
  });

  it("re-runs when forced, which is what Refresh does", async () => {
    const { session, calls } = countingSession();
    const runner = new DatasetRunner(() => session);

    await runner.run(dataset());
    await runner.run(dataset(), true);
    expect(calls).toHaveLength(2);
  });

  it("re-runs everything on refreshAll", async () => {
    const { session, calls } = countingSession();
    const runner = new DatasetRunner(() => session);
    const one = dataset({ id: "a", sql: "SELECT 1" });
    const two = dataset({ id: "b", sql: "SELECT 2" });

    await runner.refreshAll([one, two]);
    await runner.refreshAll([one, two]);
    expect(calls).toHaveLength(4);
  });

  it("reports a missing session as an error rather than hanging", async () => {
    const runner = new DatasetRunner(() => null);
    const result = await runner.run(dataset({ execution: { mode: "peer", capabilityId: "gone" } }));

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/no longer available/i);
  });

  it("reports a failing query as an error, not a crash", async () => {
    const session = {
      execute: ({ sql }: { sql: string }) =>
        createExecution({
          sql,
          // eslint-disable-next-line require-yield
          async *produce() {
            throw new Error("Catalog Error: no such table");
          },
        }),
    } as unknown as DataSession;

    const result = await new DatasetRunner(() => session).run(dataset());
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Catalog Error/);
  });

  it("notifies subscribers as state moves from loading to ready", async () => {
    const { session } = countingSession();
    const runner = new DatasetRunner(() => session);
    const seen: string[] = [];
    runner.onChange((results) => {
      const status = results.get("d1")?.status;
      if (status) seen.push(status);
    });

    await runner.run(dataset());
    expect(seen[0]).toBe("loading");
    expect(seen[seen.length - 1]).toBe("ready");
  });

  it("substitutes parameters into the SQL that actually runs", async () => {
    const { session, calls } = countingSession();
    const runner = new DatasetRunner(() => session);

    await runner.run(
      dataset({ sql: "SELECT * FROM t WHERE r = :region", parameters: { region: "north" } })
    );
    expect(calls[0]).toBe("SELECT * FROM t WHERE r = 'north'");
  });

  it("drops a cached result when the dataset is invalidated", async () => {
    const { session, calls } = countingSession();
    const runner = new DatasetRunner(() => session);
    const target = dataset();

    await runner.run(target);
    runner.invalidate(target);
    await runner.run(target);
    expect(calls).toHaveLength(2);
  });

  it("holds nothing after disposal", async () => {
    const { session } = countingSession();
    const runner = new DatasetRunner(() => session);
    await runner.run(dataset());
    runner.dispose();
    expect(runner.snapshot().size).toBe(0);
  });
});

describe("widget placement", () => {
  const widget = (x: number, y: number, w: number, h: number): DashboardWidget => ({
    id: `${x}-${y}`,
    kind: "chart",
    title: "W",
    layout: { x, y, w, h },
  });

  it("places the first widget at the origin", () => {
    expect(nextFreeSlot([], 6)).toEqual({ x: 0, y: 0 });
  });

  it("fills the current row before starting a new one", () => {
    expect(nextFreeSlot([widget(0, 0, 6, 4)], 6)).toEqual({ x: 6, y: 0 });
  });

  it("wraps to the next row when the width does not fit", () => {
    expect(nextFreeSlot([widget(0, 0, 8, 4)], 6)).toEqual({ x: 0, y: 4 });
  });

  it("places below the tallest widget on the last row", () => {
    expect(nextFreeSlot([widget(0, 0, 12, 3)], 12)).toEqual({ x: 0, y: 3 });
  });
});
