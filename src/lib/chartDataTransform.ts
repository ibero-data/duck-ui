// file: src/lib/chartDataTransform.ts
// description: Chart data transformation utilities
// reference: https://github.com/ibero-data/duck-ui

/**
 * Advanced data transformation utilities for charting
 * Handles aggregations, grouping, sorting, and filtering
 */

import type { QueryResult } from "@/store";
import type { DataTransform, AggregationType, SeriesConfig } from "@/store";

export type TransformedData = Record<string, any>[];

/**
 * Check if a column contains numeric values
 */
export const isNumericColumn = (
  data: Record<string, any>[],
  column: string
): boolean => {
  if (data.length === 0) return false;

  // Sample first few non-null values
  const sampleSize = Math.min(10, data.length);
  for (let i = 0; i < sampleSize; i++) {
    const value = data[i][column];
    if (value !== null && value !== undefined) {
      return typeof value === "number" || !isNaN(Number(value));
    }
  }

  return false;
};

/**
 * Check if a column contains date/time values
 */
export const isDateColumn = (
  data: Record<string, any>[],
  column: string
): boolean => {
  if (data.length === 0) return false;

  const value = data[0][column];
  if (value instanceof Date) return true;
  if (typeof value === "string") {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  return false;
};

/**
 * Aggregate values based on aggregation type
 */
export const aggregate = (
  values: any[],
  aggregationType: AggregationType
): number => {
  const numericValues = values
    .map((v) => Number(v))
    .filter((v) => !isNaN(v));

  if (numericValues.length === 0) return 0;

  switch (aggregationType) {
    case "sum":
      return numericValues.reduce((a, b) => a + b, 0);
    case "avg":
      return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    case "count":
      return values.length;
    case "min":
      return Math.min(...numericValues);
    case "max":
      return Math.max(...numericValues);
    case "none":
    default:
      return numericValues[0] || 0;
  }
};

/**
 * Group data by a column and aggregate values
 */
export const groupByColumn = (
  data: Record<string, any>[],
  groupByColumn: string,
  valueColumn: string,
  aggregationType: AggregationType
): TransformedData => {
  const grouped = new Map<string | number, any[]>();

  // Group values
  data.forEach((row) => {
    const key = row[groupByColumn];
    if (key === null || key === undefined) return;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row[valueColumn]);
  });

  // Aggregate grouped values
  const result: TransformedData = [];
  grouped.forEach((values, key) => {
    result.push({
      [groupByColumn]: key,
      [valueColumn]: aggregate(values, aggregationType),
    });
  });

  return result;
};

/**
 * Sort data by column
 */
export const sortData = (
  data: TransformedData,
  sortBy: string,
  sortOrder: "asc" | "desc"
): TransformedData => {
  return [...data].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === "asc" ? comparison : -comparison;
  });
};

/**
 * Limit data to top/bottom N rows
 */
export const limitData = (
  data: TransformedData,
  limit: number
): TransformedData => {
  return data.slice(0, Math.max(1, limit));
};

/**
 * Transform query result data based on configuration
 */
export const transformData = (
  result: QueryResult,
  transform?: DataTransform,
  xAxis?: string,
  yAxis?: string | SeriesConfig[]
): TransformedData => {
  let data = [...result.data];

  // Apply grouping and aggregation
  if (transform?.groupBy && transform.groupBy !== xAxis) {
    const valueColumn = typeof yAxis === "string" ? yAxis : yAxis?.[0]?.column;
    if (valueColumn) {
      const aggregation = transform.aggregation || "sum";
      data = groupByColumn(data, transform.groupBy, valueColumn, aggregation);
    }
  }

  // Apply sorting
  if (transform?.sortBy && transform.sortOrder && transform.sortOrder !== "none") {
    data = sortData(data, transform.sortBy, transform.sortOrder);
  }

  // Apply limit
  if (transform?.limit && transform.limit > 0) {
    data = limitData(data, transform.limit);
  }

  return data;
};

/**
 * Detect recommended chart types based on data characteristics
 */
export const suggestChartTypes = (
  result: QueryResult,
  xAxis?: string,
  yAxis?: string | SeriesConfig[]
): string[] => {
  if (!xAxis || !yAxis) return ["bar"];

  const suggestions: string[] = [];
  const yColumn = typeof yAxis === "string" ? yAxis : yAxis[0]?.column;

  if (!yColumn) return ["bar"];

  const hasMultipleSeries = Array.isArray(yAxis) && yAxis.length > 1;
  const xIsNumeric = isNumericColumn(result.data, xAxis);
  const xIsDate = isDateColumn(result.data, xAxis);
  const yIsNumeric = isNumericColumn(result.data, yColumn);
  const dataSize = result.data.length;

  // Time series data
  if (xIsDate && yIsNumeric) {
    suggestions.push("line", "area", "stacked_area");
  }

  // Categorical x-axis with numeric y
  if (!xIsNumeric && yIsNumeric) {
    suggestions.push("bar", "stacked_bar", "grouped_bar");
    if (dataSize <= 10) {
      suggestions.push("pie", "donut");
    }
    if (dataSize >= 20) {
      suggestions.push("treemap");
    }
  }

  // Numeric both axes
  if (xIsNumeric && yIsNumeric) {
    suggestions.push("scatter", "bubble", "line");
  }

  // Multi-series
  if (hasMultipleSeries) {
    suggestions.push("combo", "grouped_bar", "stacked_bar");
  }

  // Large datasets
  if (dataSize > 50) {
    suggestions.push("heatmap");
  }

  // Small datasets
  if (dataSize <= 20 && !xIsNumeric) {
    suggestions.push("funnel", "gauge");
  }

  return suggestions.length > 0 ? suggestions : ["bar"];
};

/**
 * Detect recommended aggregations for a column
 */
export const suggestAggregations = (
  result: QueryResult,
  column: string
): AggregationType[] => {
  if (isNumericColumn(result.data, column)) {
    return ["sum", "avg", "count", "min", "max"];
  }
  return ["count"];
};

/**
 * Generate a color palette based on number of series
 */
export const generateColorPalette = (count: number): string[] => {
  const baseColors = [
    "#D99B43", // Gold
    "#8B5CF6", // Purple
    "#3B82F6", // Blue
    "#10B981", // Green
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#EC4899", // Pink
    "#6366F1", // Indigo
    "#14B8A6", // Teal
    "#F97316", // Orange
    "#A855F7", // Violet
    "#06B6D4", // Cyan
  ];

  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }

  // Generate more colors by interpolating
  const colors = [...baseColors];
  while (colors.length < count) {
    const baseColor = baseColors[colors.length % baseColors.length];
    colors.push(adjustColorBrightness(baseColor, (colors.length % 3) * 20 - 20));
  }

  return colors;
};

/**
 * Adjust color brightness
 */
function adjustColorBrightness(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace("#", "");

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Adjust brightness
  const adjust = (value: number) => {
    const adjusted = value + (value * percent) / 100;
    return Math.max(0, Math.min(255, Math.round(adjusted)));
  };

  // Convert back to hex
  const toHex = (value: number) => value.toString(16).padStart(2, "0");

  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

/**
 * Format value for display in charts
 */
export const formatChartValue = (
  value: any,
  format?: string
): string => {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    if (format === "percent") {
      return `${(value * 100).toFixed(2)}%`;
    }
    if (format === "currency") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value);
    }
    if (format === "compact") {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        compactDisplay: "short",
      }).format(value);
    }
    // Default number formatting
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  return String(value);
};

/**
 * Calculate statistical metrics for box plots
 */
export const calculateBoxPlotStats = (
  data: number[]
): {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
} => {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;

  const q1 = sorted[Math.floor(n * 0.25)];
  const median = sorted[Math.floor(n * 0.5)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
  const filteredData = sorted.filter((v) => v >= lowerFence && v <= upperFence);

  return {
    min: filteredData[0] || sorted[0],
    q1,
    median,
    q3,
    max: filteredData[filteredData.length - 1] || sorted[n - 1],
    outliers,
  };
};
