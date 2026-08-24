import type { StateCreator } from "zustand";
import {
  collectExecution,
  materializeCollected,
  requireLocalDuckSession,
  type QueryExecution,
} from "@/services/engine";
import { updateHistory } from "@/services/duckdb";
import type { DuckStoreState, QuerySlice, QueryResult } from "../types";
import {
  addHistoryEntry,
  clearHistory as clearHistoryRepo,
} from "@/services/persistence/repositories/queryHistoryRepository";

/**
 * In-flight executions by tab. Kept outside the store — these are live engine
 * handles, not serializable state.
 *
 * Ordering guarantees (queueing behind another statement, cancelling before
 * the cursor exists) now live in the session itself, so this map only has to
 * know which execution a Stop button should reach.
 */
const activeExecutions = new Map<string, QueryExecution>();

/**
 * Default ceiling on rows an editor query returns.
 *
 * One million rows of JS objects is already several hundred MB; past that the
 * tab stops responding long before anyone could read the result. The engine
 * enforces the cap and reports `truncated`, so the UI can say plainly that it
 * showed a prefix rather than pretending it showed everything.
 */
export const DEFAULT_MAX_RESULT_ROWS = 1_000_000;

/** Bounds accepted from settings. Zero would make the editor useless. */
export const MIN_MAX_RESULT_ROWS = 1_000;
export const MAX_MAX_RESULT_ROWS = 50_000_000;

export const clampMaxResultRows = (rows: number): number =>
  Math.max(MIN_MAX_RESULT_ROWS, Math.min(MAX_MAX_RESULT_ROWS, Math.floor(rows)));

export const createQuerySlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  QuerySlice
> = (set, get) => ({
  queryHistory: [],
  executingTabs: {},
  queryProgress: {},
  maxResultRows: DEFAULT_MAX_RESULT_ROWS,

  setMaxResultRows: (rows) => set({ maxResultRows: clampMaxResultRows(rows) }),

  executeQuery: async (query, tabId?) => {
    const cancelKey = tabId ?? "__adhoc__";

    /** Drops this tab's transient run state in one place. */
    const clearRunState = (state: DuckStoreState) => {
      const executingTabs = { ...state.executingTabs };
      const queryProgress = { ...state.queryProgress };
      if (tabId) {
        delete executingTabs[tabId];
        delete queryProgress[tabId];
      }
      delete queryProgress[cancelKey];
      return { executingTabs, queryProgress };
    };

    try {
      set((state) => ({
        executingTabs: tabId ? { ...state.executingTabs, [tabId]: true } : state.executingTabs,
        queryProgress: {
          ...state.queryProgress,
          [cancelKey]: { rows: 0, batches: 0, elapsedMs: 0, columns: [] },
        },
      }));

      const session = get().currentSession;
      if (!session) throw new Error("No active connection");

      // Registered synchronously: Stop is reachable from the instant the
      // statement exists, including while it waits behind another one.
      const execution = session.execute({
        sql: query,
        label: `tab:${cancelKey}`,
        maxRows: get().maxResultRows,
      });
      activeExecutions.set(cancelKey, execution);

      const collected = await collectExecution(execution, {
        // Column headers land before the first row, so a slow query can show
        // what it is going to return while it is still returning it.
        onSchema: (schema) =>
          set((state) => {
            const current = state.queryProgress[cancelKey];
            if (!current) return {};
            return {
              queryProgress: {
                ...state.queryProgress,
                [cancelKey]: { ...current, columns: schema.fields.map((f) => f.name) },
              },
            };
          }),
        onProgress: (progress) =>
          set((state) => {
            const current = state.queryProgress[cancelKey];
            // Gone means the run already settled — a late tick must not
            // resurrect a progress row nothing will ever clear.
            if (!current) return {};
            return {
              queryProgress: { ...state.queryProgress, [cancelKey]: { ...current, ...progress } },
            };
          }),
      });
      activeExecutions.delete(cancelKey);

      if (collected.error) {
        throw new Error(collected.error.message);
      }

      const queryResult = materializeCollected(collected);
      console.debug("[query] completed", {
        tabId,
        rows: queryResult.rowCount,
        ms: collected.durationMs,
        truncated: collected.truncated,
      });

      // Update query history and update tab result if applicable.
      set((state) => ({
        ...clearRunState(state),
        queryHistory: updateHistory(state.queryHistory, query),
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, result: queryResult } : tab)),
      }));

      // Persist to DB (fire-and-forget)
      const { currentProfileId } = get();
      if (currentProfileId) {
        addHistoryEntry(currentProfileId, query).catch(() => {});
      }

      // If the query is DDL, refresh schema.
      // Strip leading comments and whitespace before matching
      const stripped = query.trim().replace(/^(--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*/g, "");
      if (/^(CREATE|ALTER|DROP|ATTACH|DETACH|INSTALL|LOAD)\b/i.test(stripped)) {
        await get().fetchDatabasesAndTablesInfo();
      }
      return tabId ? undefined : queryResult;
    } catch (error) {
      activeExecutions.delete(cancelKey);
      // The engine already ran the message through the error explainer and
      // labelled cancellations, so it is presentable as-is.
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorResult: QueryResult = {
        columns: [],
        columnTypes: [],
        data: [],
        rowCount: 0,
        error: errorMessage,
      };
      set((state) => ({
        ...clearRunState(state),
        // Query failures live on the tab result; the global `error` is
        // reserved for DuckDB initialization problems.
        queryHistory: updateHistory(state.queryHistory, query, errorMessage),
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, result: errorResult } : tab)),
      }));
      // Persist to DB (fire-and-forget)
      const { currentProfileId } = get();
      if (currentProfileId) {
        addHistoryEntry(currentProfileId, query, { error: errorMessage }).catch(() => {});
      }
    }
  },

  cancelQuery: async (tabId) => {
    const execution = activeExecutions.get(tabId);
    if (!execution) return;
    try {
      await execution.cancel();
    } catch (error) {
      console.error("Failed to cancel query:", error);
    }
  },

  clearHistory: () => {
    const { currentProfileId } = get();
    set({ queryHistory: [] });
    if (currentProfileId) {
      clearHistoryRepo(currentProfileId).catch(() => {});
    }
  },

  exportParquet: async (query: string) => {
    try {
      // Parquet export writes through DuckDB's virtual filesystem, which only
      // exists for an engine running in this tab. It also bypasses the row cap
      // entirely — COPY streams straight to a file without materializing rows
      // in JS, so an export is always the complete result.
      const { db, connection } = requireLocalDuckSession(get().currentSession).local;
      const now = new Date().toISOString().split(".")[0].replace(/[:]/g, "-");
      const fileName = `result-${now}.parquet`;
      await connection.query(`COPY (${query}) TO '${fileName}' (FORMAT 'parquet')`);
      const parquet_buffer = await db.copyFileToBuffer(fileName);
      await db.dropFile(fileName);
      const arrayBuffer = parquet_buffer.buffer.slice(0) as ArrayBuffer;
      return new Blob([arrayBuffer], { type: "application/parquet" });
    } catch (error) {
      console.error("Failed to export to parquet:", error);
      throw new Error(
        `Parquet export failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});
