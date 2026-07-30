/** Escape a string value for safe use in SQL single-quoted literals */
export function sqlEscapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Escape and double-quote an identifier (table name, column name, database name, etc.) */
export function sqlEscapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Builds a fully escaped, qualified table reference. Attached .duckdb files can
 * carry tables in schemas other than "main" (dlt pipelines do this — see #3),
 * so every generated query must qualify with the schema, not just the catalog.
 *
 * - database + schema → `"db"."schema"."table"`
 * - database only → `"db"."main"."table"`
 * - no database (or the in-memory pseudo-name ":memory:") → `"schema"."table"`
 *   when the schema is non-default, else just `"table"`
 */
export function qualifyTable(
  database: string | undefined,
  schema: string | undefined,
  table: string
): string {
  const db = database && database !== ":memory:" ? database : undefined;
  if (db) {
    return `${sqlEscapeIdentifier(db)}.${sqlEscapeIdentifier(schema || "main")}.${sqlEscapeIdentifier(table)}`;
  }
  if (schema && schema !== "main") {
    return `${sqlEscapeIdentifier(schema)}.${sqlEscapeIdentifier(table)}`;
  }
  return sqlEscapeIdentifier(table);
}
