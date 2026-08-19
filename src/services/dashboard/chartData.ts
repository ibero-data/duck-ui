import type { QueryResult } from "@/store/types";

/**
 * Long-to-wide pivot for `series=` charts.
 *
 * Evidence charts accept long data — one row per (x, series, y) — and split it
 * into one line/bar per distinct series value. Our chart engine wants wide
 * data (one column per series), so the pivot happens here, once, before the
 * config is built.
 *
 *   x      series   y            x      north   south
 *   jan    north    10    →      jan    10      20
 *   jan    south    20           feb    15      25
 */
export const pivotForSeries = (
  result: QueryResult,
  x: string,
  y: string,
  series: string
): { result: QueryResult; seriesColumns: string[] } => {
  const seriesValues: string[] = [];
  const seen = new Set<string>();
  for (const row of result.data) {
    const key = String(row[series] ?? "");
    if (!seen.has(key)) {
      seen.add(key);
      seriesValues.push(key);
    }
  }

  const byX = new Map<string, Record<string, unknown>>();
  const xOrder: string[] = [];
  for (const row of result.data) {
    const xKey = String(row[x] ?? "");
    let bucket = byX.get(xKey);
    if (!bucket) {
      bucket = { [x]: row[x] };
      byX.set(xKey, bucket);
      xOrder.push(xKey);
    }
    bucket[String(row[series] ?? "")] = row[y];
  }

  return {
    result: {
      columns: [x, ...seriesValues],
      columnTypes: ["VARCHAR", ...seriesValues.map(() => "DOUBLE")],
      data: xOrder.map((key) => byX.get(key)!),
      rowCount: xOrder.length,
    },
    seriesColumns: seriesValues,
  };
};
