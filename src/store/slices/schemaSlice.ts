import type { StateCreator } from "zustand";
import { toast } from "sonner";
import {
  executeExternalQuery,
  resultToJSON,
  validateConnection,
  fetchExternalDatabases,
  fetchWasmDatabases,
} from "@/services/duckdb";
import type { DuckStoreState, SchemaSlice, DatabaseInfo, ColumnStats, QueryResult } from "../types";

export const createSchemaSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  SchemaSlice
> = (set, get) => ({
  databases: [],
  isLoadingDbTablesFetch: true,
  schemaFetchError: null,

  fetchDatabasesAndTablesInfo: async () => {
    const { currentConnection, connection } = get();
    try {
      set({ isLoadingDbTablesFetch: true, schemaFetchError: null });
      let databases: DatabaseInfo[] = [];

      if (currentConnection?.scope === "External") {
        databases = await fetchExternalDatabases(currentConnection);
      } else if (currentConnection?.scope === "OPFS" || currentConnection?.scope === "WASM") {
        if (!connection) {
          set({ databases: [], error: null });
          return;
        }
        const wasmConnection = validateConnection(connection);
        databases = await fetchWasmDatabases(wasmConnection);
      }

      set({ databases, schemaFetchError: null });
    } catch (error) {
      const errorMessage = `Failed to load schema: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      set({
        schemaFetchError: errorMessage,
      });
    } finally {
      set({ isLoadingDbTablesFetch: false });
    }
  },

  fetchTableColumnStats: async (databaseName, tableName) => {
    const { currentConnection, connection } = get();
    const query =
      databaseName === "main" || databaseName === "memory" || databaseName === ":memory:"
        ? `SUMMARIZE ${tableName}`
        : `SUMMARIZE "${databaseName}"."${tableName}"`;

    try {
      let result: QueryResult;

      if (currentConnection?.scope === "External" && currentConnection) {
        result = await executeExternalQuery(query, currentConnection);
      } else {
        const wasmConnection = validateConnection(connection);
        const wasmResult = await wasmConnection.query(query);
        result = resultToJSON(wasmResult);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const columnStats: ColumnStats[] = result.data.map((row: any) => ({
        column_name: row.column_name,
        column_type: row.column_type,
        min: row.min,
        max: row.max,
        approx_unique: row.approx_unique,
        avg: row.avg,
        std: row.std,
        q25: row.q25,
        q50: row.q50,
        q75: row.q75,
        count: row.count,
        null_percentage: row.null_percentage,
      }));

      return columnStats;
    } catch (error) {
      console.error("Failed to fetch column stats:", error);
      toast.error("Failed to load column statistics");
      return [];
    }
  },

  deleteTable: async (tableName, database = "memory") => {
    try {
      const { connection, currentConnection } = get();
      if (currentConnection?.scope === "External") {
        throw new Error("Table deletion is not supported for external connections.");
      }
      const wasmConnection = validateConnection(connection);
      set({ isLoading: true });
      await wasmConnection.query(`DROP TABLE IF EXISTS "${database}"."${tableName}"`);
      await get().fetchDatabasesAndTablesInfo();
      set({ isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: `Failed to delete table: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
      throw error;
    }
  },

  importFile: async (
    fileName,
    fileContent,
    tableName,
    fileType,
    database = "memory",
    options = {}
  ) => {
    try {
      const { db, connection, currentConnection } = get();

      if (currentConnection?.scope === "External") {
        throw new Error("File import is not supported for external connections.");
      }

      if (!db || !connection) throw new Error("Database not initialized");
      const buffer = new Uint8Array(fileContent);
      try {
        await db.dropFile(fileName);
      } catch { /* file may not exist */ }
      await db.registerFileBuffer(fileName, buffer);
      // Handle DuckDB database files (.duckdb, .db, .ddb)
      if (fileType === "duckdb" || fileType === "db" || fileType === "ddb") {
        await connection.query(`ATTACH DATABASE '${fileName}' AS ${tableName}`);
        await get().fetchDatabasesAndTablesInfo();
        return;
      }

      const importMode = options.importMode || "table";
      const createType = importMode === "view" ? "VIEW" : "TABLE";

      if (fileType.toLowerCase() === "csv") {
        const csvOptions = options.csv || {};
        const headerOption = csvOptions.header !== undefined ? csvOptions.header : true;
        const autoDetectOption = csvOptions.autoDetect !== undefined ? csvOptions.autoDetect : true;
        const ignoreErrorsOption =
          csvOptions.ignoreErrors !== undefined ? csvOptions.ignoreErrors : true;
        const nullPaddingOption =
          csvOptions.nullPadding !== undefined ? csvOptions.nullPadding : true;
        const allVarcharOption =
          csvOptions.allVarchar !== undefined ? csvOptions.allVarchar : false;
        const delimiterOption = csvOptions.delimiter || ",";

        const optionsString = `
          header=${headerOption},
          auto_detect=${autoDetectOption},
          all_varchar=${allVarcharOption},
          ignore_errors=${ignoreErrorsOption},
          null_padding=${nullPaddingOption},
          delim='${delimiterOption}'
        `;

        await connection.query(`
          CREATE OR REPLACE ${createType} "${tableName}" AS
          SELECT * FROM read_csv('${fileName}', ${optionsString})
        `);
      } else if (fileType.toLowerCase() === "json") {
        await connection.query(`
          CREATE OR REPLACE ${createType} "${tableName}" AS
          SELECT * FROM read_json('${fileName}', auto_detect=true, ignore_errors=true)
        `);
      } else {
        await connection.query(`
          CREATE OR REPLACE ${createType} "${tableName}" AS
          SELECT * FROM read_${fileType.toLowerCase()}('${fileName}')
        `);
      }
      const verification = await connection.query(`
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_name = '${tableName}'
          AND table_schema = '${database}'
      `);
      if (verification.toArray()[0][0] === 0) {
        throw new Error(`${createType} creation verification failed`);
      }
      await get().fetchDatabasesAndTablesInfo();
    } catch (error) {
      await get().fetchDatabasesAndTablesInfo();
      throw new Error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});
