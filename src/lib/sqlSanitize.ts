/** Escape a string value for safe use in SQL single-quoted literals */
export function sqlEscapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Escape and double-quote an identifier (table name, column name, database name, etc.) */
export function sqlEscapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
