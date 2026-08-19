/**
 * Dashboard model.
 *
 * The design constraint that shapes everything here: a widget references a
 * DATASET, never a copy of the data (§7). A dashboard is a description of
 * questions and how to draw the answers — reopening one re-runs the queries
 * rather than showing a snapshot that has quietly gone stale.
 *
 * That is also what lets a dashboard work over a peer connection without any
 * special handling: a dataset names an execution strategy, and the engine layer
 * already knows how to run against a local DuckDB, an HTTP server, or someone
 * else's browser.
 */

import type { ChartConfig } from "@/store/types";

/** Where a dataset's SQL runs (§26). */
export type ExecutionStrategy =
  /** This browser's active session for that connection. */
  | { mode: "local"; connectionId: string }
  /** Another participant's browser, through a granted capability. */
  | { mode: "peer"; capabilityId: string }
  /**
   * Let the app decide. Reserved: there is no optimizer, and building one
   * before there is a reason would be guessing.
   */
  | { mode: "auto"; capabilityId?: string };

/**
 * A named query a dashboard runs.
 *
 * Several widgets may share one dataset, which is the point: four charts of the
 * same result should mean one query, not four (§40).
 */
export interface DashboardDataset {
  id: string;
  name: string;
  sql: string;
  execution: ExecutionStrategy;
  /** Values substituted into `:name` placeholders before execution. */
  parameters?: Record<string, unknown>;
  /** Row ceiling for this dataset, over and above any session policy. */
  maxRows?: number;
}

export type WidgetKind = "chart" | "table" | "metric" | "text" | "sql";

/** Position in the responsive grid. Units are grid cells, not pixels. */
export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Reduces a dataset to a single number. */
export interface MetricConfig {
  column: string;
  aggregation: "sum" | "avg" | "min" | "max" | "count" | "first";
  format?: "number" | "currency" | "percent" | "compact";
  prefix?: string;
  suffix?: string;
  /** Compared against this column's earlier value to show a delta. */
  compareColumn?: string;
}

/** Narrows a dataset for one widget only. */
export interface WidgetFilter {
  column: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "in";
  value: unknown;
}

export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  title: string;
  layout: WidgetLayout;
  /** Absent for `text` widgets, which render no data. */
  datasetId?: string;
  chart?: ChartConfig;
  metric?: MetricConfig;
  /** Markdown, for `text` widgets. */
  body?: string;
  /** Applied on top of any dashboard-level filters. */
  filters?: WidgetFilter[];
}

/** A control that narrows several widgets at once (§7). */
export interface DashboardFilter {
  id: string;
  label: string;
  column: string;
  control: "select" | "search" | "range" | "date-range";
  /** Widgets this applies to. Empty means every widget with a dataset. */
  appliesTo?: string[];
  value?: unknown;
  /**
   * Whether changing this is visible to everyone in a live session, or only
   * to the person who changed it (§25).
   *
   * Modelled from the start even though the first release only implements
   * `shared` — retrofitting the distinction later would mean migrating every
   * saved dashboard.
   */
  scope: "shared" | "personal";
}

/** A named value substituted into dataset SQL. */
export interface DashboardParameter {
  id: string;
  name: string;
  type: "string" | "number" | "date" | "boolean";
  defaultValue: unknown;
  value?: unknown;
  scope: "shared" | "personal";
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  /**
   * The document. A dashboard IS Evidence-flavoured markdown: named SQL
   * fences plus component tags (see `markdown.ts`). Queries and layout are
   * both derived from this at render time.
   */
  source: string;
  /**
   * Where the document's queries run. One strategy per dashboard: a report
   * reads from one place, and per-query routing would make "which numbers am
   * I looking at" unanswerable at a glance.
   */
  execution: ExecutionStrategy;
  /**
   * How this dashboard arrived. Absent for ones created here. "viewer" opens
   * read-only — the recipient can still duplicate it into an editable copy,
   * because it lives in their browser and pretending otherwise would be
   * security theatre; the role is a workflow signal, not a lock.
   */
  role?: "viewer" | "editor";
  /** Legacy grid widgets. Migrated into `source` on load; kept for one cycle. */
  widgets: DashboardWidget[];
  datasets: DashboardDataset[];
  globalFilters: DashboardFilter[];
  parameters: DashboardParameter[];
  /** Bumped when the layout format changes, so old saves can be migrated. */
  layoutVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** Current layout format. */
export const DASHBOARD_LAYOUT_VERSION = 1;

/** Columns in the responsive grid. Widgets are placed in these units. */
export const DASHBOARD_GRID_COLUMNS = 12;

/** Default size for a newly added widget. */
export const DEFAULT_WIDGET_LAYOUT: Record<WidgetKind, { w: number; h: number }> = {
  chart: { w: 6, h: 4 },
  table: { w: 6, h: 4 },
  metric: { w: 3, h: 2 },
  text: { w: 6, h: 2 },
  sql: { w: 6, h: 4 },
};

export const createDashboard = (name: string, id: string, now: string): Dashboard => ({
  id,
  name,
  source: "",
  execution: { mode: "local", connectionId: "WASM" },
  widgets: [],
  datasets: [],
  globalFilters: [],
  parameters: [],
  layoutVersion: DASHBOARD_LAYOUT_VERSION,
  createdAt: now,
  updatedAt: now,
});

/**
 * Finds the first free row for a widget of a given width.
 *
 * Deliberately simple: place it below everything that would overlap. A packing
 * algorithm can come later, when there is a layout worth packing.
 */
export const nextFreeSlot = (
  widgets: DashboardWidget[],
  width: number
): { x: number; y: number } => {
  if (widgets.length === 0) return { x: 0, y: 0 };

  const bottom = Math.max(...widgets.map((widget) => widget.layout.y + widget.layout.h));

  // Try to fit alongside whatever is on the last row before starting a new one.
  const lastRow = widgets.filter((widget) => widget.layout.y + widget.layout.h === bottom);
  const usedWidth = lastRow.reduce((total, widget) => total + widget.layout.w, 0);
  if (usedWidth + width <= DASHBOARD_GRID_COLUMNS) {
    return { x: usedWidth, y: Math.min(...lastRow.map((widget) => widget.layout.y)) };
  }

  return { x: 0, y: bottom };
};
