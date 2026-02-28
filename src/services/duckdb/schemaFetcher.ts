import * as duckdb from "@duckdb/duckdb-wasm";
import { sqlEscapeIdentifier, sqlEscapeString } from "@/lib/sqlSanitize";
import type { ColumnInfo, TableInfo, DatabaseInfo } from "@/store/types";

/**
 * Fetches databases and tables using the WASM connection.
 */
export const fetchWasmDatabases = async (
  connection: duckdb.AsyncDuckDBConnection
): Promise<DatabaseInfo[]> => {
  const dbListResult = await connection.query(`PRAGMA database_list`);
  return Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbListResult.toArray().map(async (db: any) => {
      const dbName = db.name.toString();
      const tablesResult = await connection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_catalog = '${sqlEscapeString(dbName)}'`
      );
      const tables: TableInfo[] = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tablesResult.toArray().map(async (tbl: any) => {
          const tableName = tbl.table_name.toString();
          const columnsResult = await connection.query(
            `DESCRIBE ${sqlEscapeIdentifier(dbName)}.${sqlEscapeIdentifier(tableName)}`
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const columns: ColumnInfo[] = columnsResult.toArray().map((col: any) => ({
            name: col.column_name.toString(),
            type: col.column_type.toString(),
            nullable: col.null === "YES",
          }));
          const countResult = await connection.query(
            `SELECT COUNT(*) as count FROM ${sqlEscapeIdentifier(dbName)}.${sqlEscapeIdentifier(tableName)}`
          );
          // Assumes countResult.toArray() returns a 2D array where the first element is the count.
          const countValue = Number(countResult.toArray()[0][0]);
          return {
            name: tableName,
            schema: dbName,
            columns,
            rowCount: countValue,
            createdAt: new Date().toISOString(),
          };
        })
      );
      return { name: dbName, tables };
    })
  );
};
