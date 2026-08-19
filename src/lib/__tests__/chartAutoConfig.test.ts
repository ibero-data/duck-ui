import { describe, it, expect } from "vitest";
import { isNumericColumn } from "@/lib/chartDataTransform";
import type { QueryResult } from "@/store/types";

/**
 * Chart auto-configuration.
 *
 * Mirrors the `autoDetect` rule in `ChartVisualizationPro`. Pinned separately
 * because the bug it encodes was silent: the chart rendered, it just plotted
 * a column against itself.
 */
const pickAxes = (result: QueryResult): { xAxis: string; yAxis: string } => {
  const numericColumns = result.columns.filter((col) => isNumericColumn(result.data, col));
  const xAxis =
    result.columns.find((col) => !isNumericColumn(result.data, col)) || result.columns[0] || "";
  const yAxis =
    numericColumns.find((col) => col !== xAxis) ||
    result.columns.find((col) => col !== xAxis) ||
    "";
  return { xAxis, yAxis };
};

const makeResult = (columns: string[], data: Record<string, unknown>[]): QueryResult => ({
  columns,
  columnTypes: columns.map(() => "INTEGER"),
  data,
  rowCount: data.length,
});

describe("chart axis auto-detection", () => {
  it("never plots the x-axis column against itself", () => {
    // The regression: `SELECT 1, 2, 3` is all-numeric, so the old rule chose
    // column "1" for BOTH the axis and the first series.
    const result = makeResult(["1", "2", "3"], [{ "1": 1, "2": 2, "3": 3 }]);
    const { xAxis, yAxis } = pickAxes(result);

    expect(xAxis).toBe("1");
    expect(yAxis).not.toBe(xAxis);
    expect(yAxis).toBe("2");
  });

  it("prefers a categorical column for the x-axis", () => {
    const result = makeResult(
      ["region", "amount"],
      [
        { region: "north", amount: 100 },
        { region: "south", amount: 250 },
      ]
    );
    expect(pickAxes(result)).toEqual({ xAxis: "region", yAxis: "amount" });
  });

  it("picks the first numeric column that is not the axis", () => {
    const result = makeResult(["label", "id", "total"], [{ label: "a", id: 1, total: 10 }]);
    const { xAxis, yAxis } = pickAxes(result);
    expect(xAxis).toBe("label");
    expect(yAxis).toBe("id");
  });

  it("falls back to a non-numeric series when nothing else is numeric", () => {
    const result = makeResult(
      ["a", "b"],
      [
        { a: "x", b: "y" },
        { a: "p", b: "q" },
      ]
    );
    const { xAxis, yAxis } = pickAxes(result);
    expect(xAxis).toBe("a");
    expect(yAxis).toBe("b");
  });

  it("leaves the series empty for a single-column result", () => {
    // There is nothing to plot against, and inventing an axis would draw a
    // chart that means nothing.
    const result = makeResult(["only"], [{ only: 1 }]);
    expect(pickAxes(result)).toEqual({ xAxis: "only", yAxis: "" });
  });

  it("handles an empty result without throwing", () => {
    expect(pickAxes(makeResult([], []))).toEqual({ xAxis: "", yAxis: "" });
  });
});

describe("single-point x range", () => {
  /** Mirrors the padding applied when a result has exactly one row. */
  const range = (rows: number, min: number, max: number): [number, number] =>
    rows === 1 ? [min - 1, max + 1] : [min, max];

  it("pads a one-row result so the bar is not pinned to the left edge", () => {
    expect(range(1, 1, 1)).toEqual([0, 2]);
  });

  it("leaves a normal result's range alone", () => {
    expect(range(5, 1, 5)).toEqual([1, 5]);
  });
});
