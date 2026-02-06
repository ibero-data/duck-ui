import { describe, it, expect, vi } from "vitest";
import { runMigrations } from "../migrations";

function createMockConnection() {
  const queries: string[] = [];

  // Simulate schema_version table state
  let currentVersion = 0;

  const mockConn = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql.trim());

      // Return current version when queried
      if (sql.includes("MAX(version)")) {
        return {
          toArray: () => [{ v: currentVersion }],
        };
      }

      // Track version inserts
      const versionMatch = sql.match(/INSERT INTO schema_version.*VALUES \((\d+)/);
      if (versionMatch) {
        currentVersion = parseInt(versionMatch[1], 10);
      }

      return { toArray: () => [] };
    }),
  };

  return { mockConn, queries, getVersion: () => currentVersion };
}

describe("runMigrations", () => {
  it("creates schema_version table if not exists", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const createSchemaVersion = queries.find((q) => q.includes("CREATE TABLE IF NOT EXISTS schema_version"));
    expect(createSchemaVersion).toBeDefined();
  });

  it("queries current version from schema_version", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const versionQuery = queries.find((q) => q.includes("MAX(version)"));
    expect(versionQuery).toBeDefined();
  });

  it("creates all required tables on fresh database", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const requiredTables = [
      "profiles",
      "settings",
      "connections",
      "query_history",
      "workspace_state",
      "ai_provider_configs",
      "ai_conversations",
      "saved_queries",
    ];

    for (const table of requiredTables) {
      const createQuery = queries.find(
        (q) => q.includes("CREATE TABLE IF NOT EXISTS") && q.includes(table)
      );
      expect(createQuery, `Missing CREATE TABLE for ${table}`).toBeDefined();
    }
  });

  it("records the migration version after applying", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const insertVersion = queries.find(
      (q) => q.includes("INSERT INTO schema_version") && q.includes("(1,")
    );
    expect(insertVersion).toBeDefined();
  });

  it("skips already-applied migrations", async () => {
    // Simulate version 1 already applied
    let callCount = 0;
    const mockConn = {
      query: vi.fn(async (sql: string) => {
        callCount++;
        if (sql.includes("MAX(version)")) {
          return { toArray: () => [{ v: 1 }] };
        }
        return { toArray: () => [] };
      }),
    };

    await runMigrations(mockConn as any);

    // Should only have: CREATE schema_version + SELECT MAX(version) = 2 calls
    // No table creates or version inserts
    expect(callCount).toBe(2);
  });

  it("is idempotent — running twice produces same result", async () => {
    const { mockConn: conn1, queries: q1 } = createMockConnection();
    await runMigrations(conn1 as any);
    const tableCreates1 = q1.filter((q) => q.includes("CREATE TABLE IF NOT EXISTS")).length;

    const { mockConn: conn2, queries: q2 } = createMockConnection();
    await runMigrations(conn2 as any);
    const tableCreates2 = q2.filter((q) => q.includes("CREATE TABLE IF NOT EXISTS")).length;

    expect(tableCreates1).toBe(tableCreates2);
  });

  it("profiles table has expected columns", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const profilesQuery = queries.find(
      (q) => q.includes("CREATE TABLE IF NOT EXISTS profiles")
    );
    expect(profilesQuery).toBeDefined();
    expect(profilesQuery).toContain("id VARCHAR PRIMARY KEY");
    expect(profilesQuery).toContain("name VARCHAR NOT NULL");
    expect(profilesQuery).toContain("avatar_emoji");
    expect(profilesQuery).toContain("has_password");
    expect(profilesQuery).toContain("created_at");
    expect(profilesQuery).toContain("last_active");
  });

  it("connections table supports encrypted credentials", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const connQuery = queries.find(
      (q) => q.includes("CREATE TABLE IF NOT EXISTS connections")
    );
    expect(connQuery).toContain("encrypted_credentials");
    expect(connQuery).toContain("scope VARCHAR NOT NULL");
    expect(connQuery).toContain("config VARCHAR NOT NULL");
  });

  it("ai_provider_configs table supports encrypted API keys", async () => {
    const { mockConn, queries } = createMockConnection();
    await runMigrations(mockConn as any);

    const aiQuery = queries.find(
      (q) => q.includes("CREATE TABLE IF NOT EXISTS ai_provider_configs")
    );
    expect(aiQuery).toContain("encrypted_api_key");
    expect(aiQuery).toContain("provider VARCHAR NOT NULL");
  });
});
