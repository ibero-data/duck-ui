import type { QueryResult } from "@/store/types";
import type { MetricConfig } from "./types";

/** Reduces a result to a single number, per a metric configuration. */
export const computeMetric = (result: QueryResult, config: MetricConfig): number | null => {
  const values = result.data
    .map((row) => row[config.column])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => (typeof value === "bigint" ? Number(value) : Number(value)))
    .filter((value) => Number.isFinite(value));

  if (config.aggregation === "count") return result.rowCount;
  if (values.length === 0) return null;

  switch (config.aggregation) {
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "first":
      return values[0];
  }
};

/** Formats a metric for display. */
export const formatMetric = (value: number | null, config: MetricConfig): string => {
  if (value === null) return "—";

  const formatted = (() => {
    switch (config.format) {
      case "currency":
        return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
      case "percent":
        return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
      case "compact":
        return Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
      default:
        return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  })();

  return `${config.prefix ?? ""}${formatted}${config.suffix ?? ""}`;
};
