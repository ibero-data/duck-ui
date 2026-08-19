import { describe, it, expect } from "vitest";
import { pivotForSeries } from "../chartData";
import type { QueryResult } from "@/store/types";

const long: QueryResult = {
  columns: ["month", "region", "sales"],
  columnTypes: ["VARCHAR", "VARCHAR", "INTEGER"],
  data: [
    { month: "jan", region: "north", sales: 10 },
    { month: "jan", region: "south", sales: 20 },
    { month: "feb", region: "north", sales: 15 },
    { month: "feb", region: "south", sales: 25 },
  ],
  rowCount: 4,
};

describe("pivotForSeries", () => {
  it("turns long data into one column per series value", () => {
    const { result, seriesColumns } = pivotForSeries(long, "month", "sales", "region");
    expect(seriesColumns).toEqual(["north", "south"]);
    expect(result.columns).toEqual(["month", "north", "south"]);
    expect(result.data).toEqual([
      { month: "jan", north: 10, south: 20 },
      { month: "feb", north: 15, south: 25 },
    ]);
  });

  it("preserves first-seen order for both axes", () => {
    const { result } = pivotForSeries(long, "month", "sales", "region");
    expect(result.data.map((row) => row.month)).toEqual(["jan", "feb"]);
  });

  it("leaves holes as undefined when a series is missing an x", () => {
    const sparse: QueryResult = {
      ...long,
      data: long.data.slice(0, 3),
      rowCount: 3,
    };
    const { result } = pivotForSeries(sparse, "month", "sales", "region");
    expect(result.data[1]).toEqual({ month: "feb", north: 15 });
  });

  it("handles an empty result", () => {
    const empty: QueryResult = { columns: [], columnTypes: [], data: [], rowCount: 0 };
    const { result, seriesColumns } = pivotForSeries(empty, "x", "y", "s");
    expect(result.rowCount).toBe(0);
    expect(seriesColumns).toEqual([]);
  });
});
