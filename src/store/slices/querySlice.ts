import type { StateCreator } from "zustand";
import { Table, Schema, type RecordBatch } from "apache-arrow";
import type * as duckdb from "@duckdb/duckdb-wasm";
import {
  executeExternalQuery,
  resultToJSON,
  validateConnection,
  updateHistory,
} from "@/services/duckdb";
import type { DuckStoreState, QuerySlice, QueryResult } from "../types";
import {
  addHistoryEntry,
  clearHistory as clearHistoryRepo,
} from "@/services/persistence/repositories/queryHistoryRepository";

/**
 * Per-tab cancel hooks for in-flight queries. Kept outside the store — these
 * are closures over live connections/AbortControllers, not serializable state.
 */
const activeCancellers = new Map<string, () => void | Promise<unknown>>();
const cancelledTabs = new Set<string>();

/**
 * Editor queries run on their OWN connection, one at a time.
 *
 * A streamed (send) result is silently truncated when any other statement runs
 * on the same connection before the stream is drained — and the app's shared
 * connection is busy with introspection at boot, which shipped as auto-run
 * share links returning 0 rows. A dedicated connection removes the interleave;
 * the queue serializes concurrent tab runs on it; session state (SET, temp
 * tables) survives across runs because the connection is long-lived.
 */
let editorConn: duckdb.AsyncDuckDBConnection | null = null;
let editorConnDb: duckdb.AsyncDuckDB | null = null;
let executionQueue: Promise<unknown> = Promise.resolve();

const getEditorConnection = async (
  db: duckdb.AsyncDuckDB
): Promise<duckdb.AsyncDuckDBConnection> => {
  if (!editorConn || editorConnDb !== db) {
    if (editorConn) {
      try {
        await editorConn.close();
      } catch {
        // stale connection from a previous engine — nothing to do
      }
    }
    editorConn = await db.connect();
    editorConnDb = db;
  }
  return editorConn;
};

export const createQuerySlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  QuerySlice
> = (set, get) => ({
  queryHistory: [],
  executingTabs: {},

  executeQuery: async (query, tabId?) => {
    const { currentConnection, connection, db } = get();
    const cancelKey = tabId ?? "__adhoc__";
    cancelledTabs.delete(cancelKey);
    try {
      set((state) => ({
        executingTabs: tabId ? { ...state.executingTabs, [tabId]: true } : state.executingTabs,
      }));
      let queryResult: QueryResult;
      if (currentConnection?.scope === "External") {
        const controller = new AbortController();
        activeCancellers.set(cancelKey, () => {
          cancelledTabs.add(cancelKey);
          controller.abort();
        });
        queryResult = await executeExternalQuery(query, currentConnection, controller.signal);
      } else {
        if (!connection || !db) throw new Error("WASM connection not initialized");
        validateConnection(connection);
        // Runs on the dedicated editor connection (see getEditorConnection).
        // send() streams the result so cancelSent() can interrupt it; the
        // queue guarantees only one statement is active on that connection.
        const run = async (): Promise<QueryResult> => {
          // Stop pressed while this query sat in the queue — never start it.
          if (cancelledTabs.has(cancelKey)) throw new Error("Query cancelled");
          const editorConnection = await getEditorConnection(db);
          const reader = await editorConnection.send(query);
          // Stop pressed in the window before send() resolved.
          if (cancelledTabs.has(cancelKey)) {
            await editorConnection.cancelSent().catch(() => {});
            throw new Error("Query cancelled");
          }
          activeCancellers.set(cancelKey, () => {
            cancelledTabs.add(cancelKey);
            return editorConnection.cancelSent();
          });
          const batches: RecordBatch[] = [];
          for await (const batch of reader) {
            batches.push(batch);
          }
          const table =
            batches.length > 0 ? new Table(batches) : new Table(reader.schema ?? new Schema([]));
          return resultToJSON(table);
        };
        const resultPromise = executionQueue.then(run, run);
        executionQueue = resultPromise.catch(() => undefined);
        queryResult = await resultPromise;
      }
      activeCancellers.delete(cancelKey);
      console.debug("[query] completed", { tabId, rows: queryResult.rowCount });
      // Update query history and update tab result if applicable.
      set((state) => {
        const newExecutingTabs = { ...state.executingTabs };
        if (tabId) delete newExecutingTabs[tabId];
        return {
          queryHistory: updateHistory(state.queryHistory, query),
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, result: queryResult } : tab)),
          executingTabs: newExecutingTabs,
        };
      });
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
      activeCancellers.delete(cancelKey);
      const wasCancelled = cancelledTabs.delete(cancelKey);
      const errorMessage = wasCancelled
        ? "Query cancelled"
        : error instanceof Error
          ? error.message
          : "Unknown error";
      const errorResult: QueryResult = {
        columns: [],
        columnTypes: [],
        data: [],
        rowCount: 0,
        error: errorMessage,
      };
      set((state) => {
        const newExecutingTabs = { ...state.executingTabs };
        if (tabId) delete newExecutingTabs[tabId];
        return {
          // Query failures live on the tab result; the global `error` is
          // reserved for DuckDB initialization problems.
          queryHistory: updateHistory(state.queryHistory, query, errorMessage),
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, result: errorResult } : tab)),
          executingTabs: newExecutingTabs,
        };
      });
      // Persist to DB (fire-and-forget)
      const { currentProfileId } = get();
      if (currentProfileId) {
        addHistoryEntry(currentProfileId, query, { error: errorMessage }).catch(() => {});
      }
    }
  },

  cancelQuery: async (tabId) => {
    const cancel = activeCancellers.get(tabId);
    if (!cancel) {
      // The query hasn't started yet (queued behind another tab, or send()
      // still in flight) — flag it so run() bails before executing.
      cancelledTabs.add(tabId);
      return;
    }
    try {
      await cancel();
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
      const { connection, db, currentConnection } = get();
      if (currentConnection?.scope === "External") {
        throw new Error("Exporting to parquet is not supported for external connections.");
      }
      if (!connection || !db) {
        throw new Error("Database not initialized");
      }
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
