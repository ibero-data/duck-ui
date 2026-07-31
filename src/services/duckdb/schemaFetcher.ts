import * as duckdb from "@duckdb/duckdb-wasm";
import { sqlEscapeString, qualifyTable } from "@/lib/sqlSanitize";
import type { ColumnInfo, TableInfo, DatabaseInfo } from "@/store/types";

/**
 * Fetches databases, schemas, and tables using the WASM connection.
 *
 * Tables are enumerated per (schema, table) pair — attached .duckdb files can
 * carry any number of schemas (#3), so filtering by catalog alone and assuming
 * "main" hides or breaks everything outside the default schema. A failure on
 * one table (weird types, permissions, a view over a dropped table) degrades
 * that table instead of sinking the whole explorer.
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
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_catalog = '${sqlEscapeString(dbName)}'
         ORDER BY table_schema, table_name`
      );
      const tables: TableInfo[] = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tablesResult.toArray().map(async (tbl: any) => {
          const schemaName = tbl.table_schema.toString();
          const tableName = tbl.table_name.toString();
          const qualified = qualifyTable(dbName, schemaName, tableName);
          try {
            const columnsResult = await connection.query(`DESCRIBE ${qualified}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const columns: ColumnInfo[] = columnsResult.toArray().map((col: any) => ({
              name: col.column_name.toString(),
              type: col.column_type.toString(),
              nullable: col.null === "YES",
            }));
            const countResult = await connection.query(
              `SELECT COUNT(*) as count FROM ${qualified}`
            );
            // Named access — Arrow StructRows have no numeric index, and the
            // count arrives as a BigInt.
            const countValue = Number(countResult.toArray()[0]?.count ?? 0);
            return {
              name: tableName,
              schema: schemaName,
              columns,
              rowCount: countValue,
              createdAt: new Date().toISOString(),
            };
          } catch (error) {
            console.error(`Failed to introspect ${qualified}:`, error);
            return {
              name: tableName,
              schema: schemaName,
              columns: [],
              rowCount: 0,
              createdAt: new Date().toISOString(),
            };
          }
        })
      );
      return { name: dbName, tables };
    })
  );
};
