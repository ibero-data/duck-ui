/**
 * Schema migration runner for the system database.
 * Tracks applied versions in `schema_version` table and runs pending migrations in order.
 */

import type * as duckdb from "@duckdb/duckdb-wasm";

interface Migration {
  version: number;
  description: string;
  sql: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Initial schema — profiles, settings, connections, history, workspace, AI, saved queries",
    sql: [
      `CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        avatar_emoji VARCHAR DEFAULT '🦆',
        has_password BOOLEAN DEFAULT false,
        password_verify_token VARCHAR,
        created_at TIMESTAMP DEFAULT current_timestamp,
        last_active TIMESTAMP DEFAULT current_timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        profile_id VARCHAR NOT NULL,
        category VARCHAR NOT NULL,
        key VARCHAR NOT NULL,
        value VARCHAR NOT NULL,
        PRIMARY KEY (profile_id, category, key)
      )`,
      `CREATE TABLE IF NOT EXISTS connections (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        scope VARCHAR NOT NULL,
        config VARCHAR NOT NULL,
        encrypted_credentials VARCHAR,
        environment VARCHAR DEFAULT 'APP',
        created_at TIMESTAMP DEFAULT current_timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS query_history (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        connection_id VARCHAR,
        sql_text VARCHAR NOT NULL,
        error VARCHAR,
        duration_ms INTEGER,
        row_count INTEGER,
        executed_at TIMESTAMP DEFAULT current_timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS workspace_state (
        profile_id VARCHAR PRIMARY KEY,
        tabs VARCHAR NOT NULL,
        active_tab_id VARCHAR,
        current_connection_id VARCHAR,
        current_database VARCHAR,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS ai_provider_configs (
        profile_id VARCHAR NOT NULL,
        provider VARCHAR NOT NULL,
        config VARCHAR NOT NULL,
        encrypted_api_key VARCHAR,
        PRIMARY KEY (profile_id, provider)
      )`,
      `CREATE TABLE IF NOT EXISTS ai_conversations (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        title VARCHAR,
        messages VARCHAR NOT NULL,
        provider VARCHAR,
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )`,
      `CREATE TABLE IF NOT EXISTS saved_queries (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        sql_text VARCHAR NOT NULL,
        description VARCHAR,
        tags VARCHAR,
        folder VARCHAR DEFAULT 'default',
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )`,
    ],
  },
];

export async function runMigrations(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  // Ensure schema_version table exists
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT current_timestamp,
      description VARCHAR
    )
  `);

  // Get current version
  const result = await conn.query(`SELECT COALESCE(MAX(version), 0) as v FROM schema_version`);
  const currentVersion = Number(result.toArray()[0]?.v ?? 0);

  // Apply pending migrations
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    console.info(`[SystemDB] Applying migration v${migration.version}: ${migration.description}`);

    for (const sql of migration.sql) {
      await conn.query(sql);
    }

    await conn.query(
      `INSERT INTO schema_version (version, description) VALUES (${migration.version}, '${migration.description.replace(/'/g, "''")}')`
    );

    console.info(`[SystemDB] Migration v${migration.version} applied`);
  }
}
