import type { DatabaseInfo } from "@/store";

export interface SchemaContext {
  formatted: string;
  tableCount: number;
  columnCount: number;
  truncated: boolean;
}

/**
 * Formats database schema into a context string for the LLM
 */
export function formatSchemaForContext(
  databases: DatabaseInfo[],
  options?: {
    maxTables?: number;
    maxColumnsPerTable?: number;
    maxContextLength?: number;
  }
): SchemaContext {
  const maxTables = options?.maxTables ?? 20;
  const maxColumnsPerTable = options?.maxColumnsPerTable ?? 15;
  const maxContextLength = options?.maxContextLength ?? 3000;

  let tableCount = 0;
  let columnCount = 0;
  let truncated = false;
  const parts: string[] = [];

  parts.push("DATABASE SCHEMA:");
  parts.push("The following tables are available in your DuckDB database:\n");

  for (const db of databases) {
    if (tableCount >= maxTables) {
      truncated = true;
      break;
    }

    for (const table of db.tables) {
      if (tableCount >= maxTables) {
        truncated = true;
        break;
      }

      const tableName = db.name === "memory" ? table.name : `${db.name}.${table.name}`;
      const columns = table.columns.slice(0, maxColumnsPerTable);
      const columnDefs = columns
        .map((col) => `  ${col.name} ${col.type}${col.nullable ? "" : " NOT NULL"}`)
        .join(",\n");

      parts.push(`CREATE TABLE ${tableName} (`);
      parts.push(columnDefs);
      parts.push(");");

      if (table.columns.length > maxColumnsPerTable) {
        parts.push(`-- ... and ${table.columns.length - maxColumnsPerTable} more columns`);
      }

      if (table.rowCount > 0) {
        parts.push(`-- Approximately ${table.rowCount.toLocaleString()} rows`);
      }

      parts.push("");
      tableCount++;
      columnCount += columns.length;
    }
  }

  if (truncated) {
    parts.push("-- [Schema truncated, more tables available]");
  }

  let formatted = parts.join("\n");

  if (formatted.length > maxContextLength) {
    formatted = formatted.slice(0, maxContextLength) + "\n-- [Schema truncated for context limit]";
    truncated = true;
  }

  return { formatted, tableCount, columnCount, truncated };
}

/**
 * Gets a summary of the schema for display purposes
 */
export function getSchemaSummary(databases: DatabaseInfo[]): string {
  let totalTables = 0;
  let totalColumns = 0;

  for (const db of databases) {
    totalTables += db.tables.length;
    for (const table of db.tables) {
      totalColumns += table.columns.length;
    }
  }

  return `${totalTables} table${totalTables !== 1 ? "s" : ""}, ${totalColumns} column${totalColumns !== 1 ? "s" : ""}`;
}
