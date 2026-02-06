import type { StateCreator } from "zustand";
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

export const createQuerySlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  QuerySlice
> = (set, get) => ({
  queryHistory: [],
  isExecuting: false,

  executeQuery: async (query, tabId?) => {
    const { currentConnection, connection } = get();
    try {
      set({ isExecuting: true, error: null });
      let queryResult: QueryResult;
      if (currentConnection?.scope === "External") {
        queryResult = await executeExternalQuery(query, currentConnection);
      } else {
        if (!connection) throw new Error("WASM connection not initialized");
        const wasmConnection = validateConnection(connection);
        const result = await wasmConnection.query(query);
        queryResult = resultToJSON(result);
      }
      // Update query history and update tab result if applicable.
      set((state) => ({
        queryHistory: updateHistory(state.queryHistory, query),
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, result: queryResult } : tab)),
        isExecuting: false,
      }));
      // Persist to DB (fire-and-forget)
      const { currentProfileId } = get();
      if (currentProfileId) {
        addHistoryEntry(currentProfileId, query).catch(() => {});
      }
      // If the query is DDL, refresh schema.
      if (/^(CREATE|ALTER|DROP|ATTACH)/i.test(query.trim())) {
        await get().fetchDatabasesAndTablesInfo();
      }
      return tabId ? undefined : queryResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorResult: QueryResult = {
        columns: [],
        columnTypes: [],
        data: [],
        rowCount: 0,
        error: errorMessage,
      };
      set((state) => ({
        queryHistory: updateHistory(state.queryHistory, query, errorMessage),
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, result: errorResult } : tab)),
        isExecuting: false,
        error: errorMessage,
      }));
      // Persist to DB (fire-and-forget)
      const { currentProfileId } = get();
      if (currentProfileId) {
        addHistoryEntry(currentProfileId, query, { error: errorMessage }).catch(() => {});
      }
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
