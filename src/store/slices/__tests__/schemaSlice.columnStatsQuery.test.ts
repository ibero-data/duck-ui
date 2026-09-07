import { describe, it, expect, vi } from "vitest";

/**
 * Regression test for column stats being rejected by external endpoints that
 * enforce a read-only statement allow-list keyed on the leading SQL keyword
 * (SELECT, WITH, FROM, SHOW, DESCRIBE, EXPLAIN, PRAGMA). A bare `SUMMARIZE`
 * isn't on that list, even though it's read-only, so `fetchTableColumnStats`
 * must send it wrapped in a SELECT — which DuckDB plans as a genuine SELECT
 * (aggregate + projection), not a special SUMMARIZE utility statement.
 */

const { runQuery } = vi.hoisted(() => ({
  runQuery: vi.fn().mockResolvedValue({
    columns: [],
    columnTypes: [],
    data: [],
    rowCount: 0,
  }),
}));

vi.mock("@/services/engine", () => ({
  runQuery,
  requireLocalDuckSession: vi.fn(),
  catalogToDatabaseInfo: vi.fn(),
}));

import { createSchemaSlice } from "../schemaSlice";

describe("fetchTableColumnStats query shape", () => {
  it("wraps SUMMARIZE in a SELECT so a read-only allow-list accepts it", async () => {
    const get = () => ({ currentSession: { id: "s" } }) as never;
    const set = () => {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slice = createSchemaSlice(set as any, get as any, undefined as any);
    await slice.fetchTableColumnStats("analytics", "authors", "main");

    expect(runQuery).toHaveBeenCalledTimes(1);
    const [, sql] = runQuery.mock.calls[0];
    expect(sql).toMatch(/^SELECT \* FROM \(SUMMARIZE /i);
  });
});
