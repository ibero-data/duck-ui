import * as duckdb from "@duckdb/duckdb-wasm";
import { retryWithBackoff, validateConnection } from "./utils";
import { createDuckdbWorker, resolveDuckdbBundles } from "./wasmConnection";
import type { ConnectionProvider } from "@/store/types";

// OPFS connection tracking to prevent concurrent access
export const opfsActivePaths = new Set<string>();

/**
 * Centralized OPFS connection cleanup with proper handle release.
 */
export const cleanupOPFSConnection = async (
  db: duckdb.AsyncDuckDB | null,
  connection: duckdb.AsyncDuckDBConnection | null,
  path?: string
): Promise<void> => {
  if (db && connection) {
    try {
      await connection.close();
      await db.terminate();
      // Critical: Wait for file handles to be fully released by browser
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (path) {
        opfsActivePaths.delete(path);
      }
    } catch (error) {
      console.error("OPFS cleanup error:", error);
      // Still wait even if cleanup failed - handles may still release
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (path) {
        opfsActivePaths.delete(path);
      }
    }
  }
};

/**
 * Tests an OPFS connection by executing a basic query.
 */
export const testOPFSConnection = async (
  conn: ConnectionProvider
): Promise<{
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}> => {
  const { path } = conn;
  if (!path) {
    throw new Error("Path must be defined for OPFS connections.");
  }

  // Normalize path: remove leading slash and ensure .db extension
  let opfsPath = path.startsWith("/") ? path.slice(1) : path;
  if (!opfsPath.endsWith(".db")) {
    opfsPath = `${opfsPath}.db`;
  }

  // Check if path is already in use
  if (opfsActivePaths.has(opfsPath)) {
    throw new Error(
      `OPFS file "${opfsPath}" is already open. Please close the existing connection first.`
    );
  }

  const bundles = await resolveDuckdbBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const { worker, revoke } = createDuckdbWorker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  try {
    await db.instantiate(bundle.mainModule);
  } finally {
    revoke();
  }

  // Use retry with exponential backoff for OPFS access handle conflicts
  await retryWithBackoff(
    async () => {
      try {
        await db.open({
          path: `opfs://${opfsPath}`,
          accessMode: duckdb.DuckDBAccessMode.AUTOMATIC,
        });
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("createSyncAccessHandle")) {
          throw new Error(
            `OPFS access handle conflict for "${opfsPath}". The file may still be in use. Retrying...`
          );
        }
        throw error;
      }
    },
    4,
    1500
  ); // 4 retries with 1.5s base delay (1.5s, 3s, 6s, 12s)

  const connection = await db.connect();
  validateConnection(connection);

  // Verify connection with a basic query
  await connection.query(`SHOW TABLES`);

  // Mark path as active
  opfsActivePaths.add(opfsPath);

  return { db, connection };
};
