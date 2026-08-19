import { generateUUID } from "@/lib/utils";
import { fallbackDelete, fallbackGetAll, fallbackPut } from "../fallback";
import {
  createDashboard,
  DASHBOARD_LAYOUT_VERSION,
  type Dashboard,
  type DashboardWidget,
} from "@/services/dashboard/types";
import { toQueryName } from "@/services/dashboard/markdown";

/**
 * Dashboard persistence.
 *
 * Local only (§29). A dashboard is a description of questions — SQL, layout,
 * chart configuration — and never the answers, so nothing here holds query
 * results or anything derived from data.
 *
 * Stored in IndexedDB rather than through `migrations.ts`: that SQL path is
 * unreachable, because `systemDb.isUsingOpfs()` always returns false and every
 * repository takes the fallback branch.
 */

interface StoredDashboard {
  id: string;
  profile_id: string;
  payload: string;
  updated_at: string;
}

const isStored = (value: unknown): value is StoredDashboard =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StoredDashboard).id === "string" &&
  typeof (value as StoredDashboard).payload === "string";

/**
 * Parses a stored dashboard.
 *
 * Returns null rather than throwing: one corrupt row must not take the whole
 * list down, and a dashboard from a newer layout version is skipped rather
 * than rendered wrongly.
 */
const parse = (row: StoredDashboard): Dashboard | null => {
  try {
    const parsed = JSON.parse(row.payload) as Dashboard;
    if (!parsed?.id) return null;
    if (parsed.layoutVersion > DASHBOARD_LAYOUT_VERSION) return null;
    return migrate(parsed);
  } catch {
    return null;
  }
};

/**
 * Converts a first-generation grid dashboard into a document.
 *
 * The grid model shipped for less than a day, but "shipped" still means a
 * saved record could exist — and a saved dashboard silently discarded is the
 * exact bug this feature exists to not have.
 */
const migrate = (dashboard: Dashboard): Dashboard => {
  if (typeof dashboard.source === "string" && dashboard.source.length > 0) return dashboard;

  const widgets: DashboardWidget[] = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
  const datasets = Array.isArray(dashboard.datasets) ? dashboard.datasets : [];

  const taken = new Set<string>();
  const names = new Map<string, string>();
  const fences = datasets
    .map((dataset) => {
      const name = toQueryName(dataset.name || "query", taken);
      taken.add(name);
      names.set(dataset.id, name);
      return "```sql " + name + "\n" + dataset.sql + "\n```";
    })
    .join("\n\n");

  const body = widgets
    .map((widget) => {
      const name = widget.datasetId ? names.get(widget.datasetId) : undefined;
      const heading = `## ${widget.title}`;
      if (widget.kind === "text") return widget.body ?? "";
      if (!name) return heading;
      if (widget.kind === "metric") return `${heading}\n\n<BigValue data={${name}} agg=first/>`;
      if (widget.kind === "chart" && widget.chart) {
        const x = widget.chart.xAxis ? ` x=${widget.chart.xAxis}` : "";
        const y = widget.chart.yAxis ? ` y=${widget.chart.yAxis}` : "";
        return `${heading}\n\n<BarChart data={${name}}${x}${y}/>`;
      }
      return `${heading}\n\n<DataTable data={${name}}/>`;
    })
    .join("\n\n");

  return {
    ...dashboard,
    source: [fences, body].filter(Boolean).join("\n\n"),
    execution: dashboard.execution ??
      datasets[0]?.execution ?? { mode: "local", connectionId: "WASM" },
    widgets: [],
    datasets: [],
  };
};

export async function listDashboards(profileId: string): Promise<Dashboard[]> {
  const rows = await fallbackGetAll("dashboards");
  return rows
    .filter(isStored)
    .filter((row) => row.profile_id === profileId)
    .map(parse)
    .filter((dashboard): dashboard is Dashboard => dashboard !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveDashboard(profileId: string, dashboard: Dashboard): Promise<Dashboard> {
  const updated: Dashboard = { ...dashboard, updatedAt: new Date().toISOString() };
  await fallbackPut("dashboards", {
    id: updated.id,
    profile_id: profileId,
    payload: JSON.stringify(updated),
    updated_at: updated.updatedAt,
  });
  return updated;
}

export async function newDashboard(profileId: string, name: string): Promise<Dashboard> {
  const dashboard = createDashboard(name, generateUUID(), new Date().toISOString());
  return saveDashboard(profileId, dashboard);
}

export async function deleteDashboard(id: string): Promise<void> {
  await fallbackDelete("dashboards", id);
}

/** Copies a dashboard under a new id, so the original is untouched. */
export async function duplicateDashboard(
  profileId: string,
  dashboard: Dashboard
): Promise<Dashboard> {
  const now = new Date().toISOString();
  return saveDashboard(profileId, {
    ...dashboard,
    id: generateUUID(),
    name: `${dashboard.name} (copy)`,
    // A copy is owned outright — the viewer role belongs to the original.
    role: undefined,
    createdAt: now,
    updatedAt: now,
  });
}
