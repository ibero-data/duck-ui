import type { StateCreator } from "zustand";
import { toast } from "sonner";
import {
  catalogToDatabaseInfo,
  requireLocalDuckSession,
  runQuery,
  type DataSession,
} from "@/services/engine";
import { sqlEscapeIdentifier, sqlEscapeString, qualifyTable } from "@/lib/sqlSanitize";
import type { DuckStoreState, SchemaSlice, ColumnStats, QueryResult } from "../types";

/** The active session, or a clear error when nothing is connected. */
const requireSession = (session: DataSession | null): DataSession => {
  if (!session) throw new Error("No active connection");
  return session;
};

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
    const session = get().currentSession;
    try {
      set({ isLoadingDbTablesFetch: true, schemaFetchError: null });

      if (!session?.capabilities.supportsCatalog) {
        set({ databases: [], schemaFetchError: null });
        return;
      }

      const snapshot = await session.introspect();
      set({ databases: catalogToDatabaseInfo(snapshot), schemaFetchError: null });
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

  fetchTableColumnStats: async (databaseName, tableName, schema) => {
    const useBareName =
      databaseName === "main" || databaseName === "memory" || databaseName === ":memory:";
    const query = `SUMMARIZE ${qualifyTable(useBareName ? undefined : databaseName, schema, tableName)}`;

    try {
      const result = await runQuery(requireSession(get().currentSession), query, "column-stats");
      if (result.error) throw new Error(result.error);

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

  fetchColumnDistribution: async (databaseName, tableName, columnName, columnType, schema) => {
    const useBareName =
      databaseName === "main" || databaseName === "memory" || databaseName === ":memory:";
    const qualified = qualifyTable(useBareName ? undefined : databaseName, schema, tableName);
    const col = sqlEscapeIdentifier(columnName);

    const upperType = columnType.toUpperCase();
    // INTERVAL contains "INT" but can't do the histogram arithmetic — send it
    // down the top-k branch instead.
    const isNumeric =
      !upperType.includes("INTERVAL") &&
      ["INT", "DOUBLE", "FLOAT", "DECIMAL", "REAL", "NUMERIC"].some((t) => upperType.includes(t));

    // Numeric columns: 20-bin equi-width histogram. Everything else: top 5
    // values by count. Both are one aggregate query, run only on expand.
    const query = isNumeric
      ? `WITH src AS (SELECT ${col} AS v FROM ${qualified} WHERE ${col} IS NOT NULL),
              bounds AS (SELECT MIN(v) AS lo, MAX(v) AS hi FROM src)
         SELECT LEAST(19, GREATEST(0, CAST(FLOOR((v - lo) * 20.0 / NULLIF(hi - lo, 0)) AS INT))) AS bucket,
                COUNT(*) AS n
         FROM src, bounds GROUP BY 1 ORDER BY 1`
      : `SELECT CAST(${col} AS VARCHAR) AS v, COUNT(*) AS n
         FROM ${qualified} WHERE ${col} IS NOT NULL
         GROUP BY 1 ORDER BY n DESC, v LIMIT 5`;

    try {
      const result: QueryResult = await runQuery(
        requireSession(get().currentSession),
        query,
        "column-distribution"
      );
      if (result.error) throw new Error(result.error);

      if (isNumeric) {
        const bins = new Array<number>(20).fill(0);
        for (const row of result.data) {
          const count = Number(row.n ?? 0);
          // A constant column yields a NULL bucket — pile it into one bar.
          const bucket = row.bucket === null || row.bucket === undefined ? 0 : Number(row.bucket);
          if (bucket >= 0 && bucket < 20) bins[bucket] += count;
        }
        return { kind: "histogram", bins };
      }
      return {
        kind: "topk",
        values: result.data.map((row) => ({
          value: String(row.v),
          count: Number(row.n ?? 0),
        })),
      };
    } catch (error) {
      console.error("Failed to fetch column distribution:", error);
      return null;
    }
  },

  deleteTable: async (tableName, database = "memory", schema) => {
    try {
      const session = requireSession(get().currentSession);
      if (!session.capabilities.writable) {
        throw new Error("This connection is read-only.");
      }
      set({ isLoading: true });
      const result = await runQuery(
        session,
        `DROP TABLE IF EXISTS ${qualifyTable(database, schema, tableName)}`,
        "delete-table"
      );
      if (result.error) throw new Error(result.error);
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
      const session = requireSession(get().currentSession);
      if (!session.capabilities.supportsFileImport) {
        throw new Error(
          "This connection can't import local files. Switch to an in-browser (memory or OPFS) connection."
        );
      }
      // Registering a file buffer has no SQL expression — it needs the engine
      // handle directly.
      const { db, connection } = requireLocalDuckSession(session).local;

      const buffer = new Uint8Array(fileContent);
      try {
        await db.dropFile(fileName);
      } catch {
        /* file may not exist */
      }
      await db.registerFileBuffer(fileName, buffer);
      // Handle DuckDB database files (.duckdb, .db, .ddb)
      if (fileType === "duckdb" || fileType === "db" || fileType === "ddb") {
        await connection.query(
          `ATTACH DATABASE '${sqlEscapeString(fileName)}' AS ${sqlEscapeIdentifier(tableName)}`
        );
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
          delim='${sqlEscapeString(delimiterOption)}'
        `;

        await connection.query(`
          CREATE OR REPLACE ${createType} ${sqlEscapeIdentifier(tableName)} AS
          SELECT * FROM read_csv('${sqlEscapeString(fileName)}', ${optionsString})
        `);
      } else if (fileType.toLowerCase() === "json") {
        await connection.query(`
          CREATE OR REPLACE ${createType} ${sqlEscapeIdentifier(tableName)} AS
          SELECT * FROM read_json('${sqlEscapeString(fileName)}', auto_detect=true, ignore_errors=true)
        `);
      } else {
        await connection.query(`
          CREATE OR REPLACE ${createType} ${sqlEscapeIdentifier(tableName)} AS
          SELECT * FROM read_${fileType.toLowerCase()}('${sqlEscapeString(fileName)}')
        `);
      }
      // `database` ("memory") is the CATALOG, not the schema — the old query
      // filtered table_schema by it and always counted 0, which the previous
      // undefined === 0 row access silently masked.
      const verification = await connection.query(`
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_name = '${sqlEscapeString(tableName)}'
          AND table_catalog = '${sqlEscapeString(database)}'
      `);
      if (Number(verification.toArray()[0]?.count ?? 0) === 0) {
        throw new Error(`${createType} creation verification failed`);
      }
      await get().fetchDatabasesAndTablesInfo();
    } catch (error) {
      await get().fetchDatabasesAndTablesInfo();
      throw new Error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});
