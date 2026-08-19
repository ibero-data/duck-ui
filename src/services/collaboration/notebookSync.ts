/**
 * Translation between the store's notebook JSON and the shared per-cell CRDT.
 *
 * The store keeps a notebook as one JSON string (cells WITH their results and
 * local view state). The shared document keeps per-cell structure with NO
 * results. These helpers project one into the other, and the projection is
 * where the §9 rule is enforced in code: `toSyncableCells` simply has no
 * field to put a result in.
 */

import type { SyncableNotebookCell } from "./document";

const bigintSafe = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;

/**
 * The shareable projection of a notebook's JSON. Null when the JSON is not a
 * cell list — a malformed notebook is not synced rather than synced wrong.
 */
export const toSyncableCells = (json: string): SyncableNotebookCell[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const cells: SyncableNotebookCell[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;
    const cell = raw as Record<string, unknown>;
    if (typeof cell.id !== "string" || !cell.id) continue;
    cells.push({
      id: cell.id,
      type: typeof cell.type === "string" ? cell.type : "sql",
      content: typeof cell.content === "string" ? cell.content : "",
      collapsed: cell.collapsed === true ? true : undefined,
      chartConfig:
        cell.chartConfig !== undefined ? JSON.stringify(cell.chartConfig, bigintSafe) : undefined,
    });
  }
  return cells;
};

/** Stable key for "has the shareable part changed" comparisons. */
export const projectionKey = (cells: SyncableNotebookCell[]): string => JSON.stringify(cells);

/**
 * Applies shared cells onto the local notebook JSON.
 *
 * Shared state wins on structure and content; everything local-only — a
 * cell's query result, above all — is carried over by cell id. A peer's edit
 * must never wipe the table you just produced under it.
 */
export const mergeSharedIntoLocal = (shared: SyncableNotebookCell[], localJson: string): string => {
  const locals = new Map<string, Record<string, unknown>>();
  try {
    const parsed = JSON.parse(localJson);
    if (Array.isArray(parsed)) {
      for (const raw of parsed) {
        if (typeof raw === "object" && raw !== null && typeof raw.id === "string") {
          locals.set(raw.id, raw as Record<string, unknown>);
        }
      }
    }
  } catch {
    // Unreadable local state: the shared cells stand alone.
  }

  const merged = shared.map((cell) => {
    const local = locals.get(cell.id) ?? {};
    let chartConfig: unknown = local.chartConfig;
    if (cell.chartConfig !== undefined) {
      try {
        chartConfig = JSON.parse(cell.chartConfig);
      } catch {
        // A peer's malformed chart config keeps the local one.
      }
    }
    return {
      ...local,
      id: cell.id,
      type: cell.type,
      content: cell.content,
      collapsed: cell.collapsed,
      chartConfig,
    };
  });

  return JSON.stringify(merged, bigintSafe);
};
