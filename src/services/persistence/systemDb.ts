/**
 * System Database Service
 *
 * Manages a dedicated DuckDB WASM instance at opfs://duck-ui-system.db for
 * persisting profiles, settings, connections, query history, and other app state.
 * Falls back to IndexedDB for browsers without OPFS support.
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { MANUAL_BUNDLES } from "@/services/duckdb/wasmConnection";
import { runMigrations } from "./migrations";

// Singleton state
let systemDb: duckdb.AsyncDuckDB | null = null;
let systemConnection: duckdb.AsyncDuckDBConnection | null = null;
let opfsAvailable: boolean | null = null;
let initialized = false;

const SYSTEM_DB_PATH = "duck-ui-system.db";

/**
 * Check whether OPFS is available in this browser.
 * DuckDB WASM requires createSyncAccessHandle which is not available in all browsers.
 */
export async function isOpfsAvailable(): Promise<boolean> {
  if (opfsAvailable !== null) return opfsAvailable;

  try {
    const root = await navigator.storage.getDirectory();
    // Probe by trying to create and delete a test file
    const testHandle = await root.getFileHandle(".duck-ui-opfs-test", { create: true });
    // If we get here, OPFS basic access works. Check sync access handle support.
    const syncHandle = await (testHandle as unknown as { createSyncAccessHandle: () => Promise<{ close: () => void }> }).createSyncAccessHandle();
    syncHandle.close();
    await root.removeEntry(".duck-ui-opfs-test");
    opfsAvailable = true;
  } catch {
    // OPFS or sync access handle not supported
    opfsAvailable = false;
  }

  return opfsAvailable;
}

/**
 * Initialize the system database. Opens a DuckDB WASM instance with OPFS persistence.
 * Must be called before any repository functions.
 */
export async function initializeSystemDb(): Promise<void> {
  if (initialized) return;

  const useOpfs = await isOpfsAvailable();

  if (!useOpfs) {
    console.info("[SystemDB] OPFS not available, using IndexedDB fallback");
    initialized = true;
    return;
  }

  try {
    console.info("[SystemDB] Initializing system database (OPFS)...");

    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.VoidLogger();

    systemDb = new duckdb.AsyncDuckDB(logger, worker);
    await systemDb.instantiate(bundle.mainModule);

    await systemDb.open({
      path: `opfs://${SYSTEM_DB_PATH}`,
      accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
    });

    systemConnection = await systemDb.connect();
    await runMigrations(systemConnection);

    initialized = true;
    console.info("[SystemDB] System database ready");
  } catch (error) {
    console.error("[SystemDB] Failed to initialize:", error);
    // Fall back to IndexedDB mode
    await cleanupSystemDb();
    opfsAvailable = false;
    initialized = true;
    console.info("[SystemDB] Falling back to IndexedDB mode");
  }
}

/**
 * Get the system database connection. Throws if not initialized or OPFS unavailable.
 */
export function getSystemConnection(): duckdb.AsyncDuckDBConnection {
  if (!systemConnection) {
    throw new Error("System database not initialized or OPFS not available");
  }
  return systemConnection;
}

/**
 * Check if the system DB is using OPFS (vs IndexedDB fallback).
 */
export function isUsingOpfs(): boolean {
  return initialized && systemConnection !== null;
}

/**
 * Check if system DB has been initialized.
 */
export function isSystemDbInitialized(): boolean {
  return initialized;
}

/**
 * Close the system database connection and terminate the worker.
 */
export async function closeSystemDb(): Promise<void> {
  if (systemConnection) {
    try {
      await systemConnection.close();
    } catch {
      // Ignore close errors
    }
    systemConnection = null;
  }
  if (systemDb) {
    try {
      await systemDb.terminate();
    } catch {
      // Ignore termination errors
    }
    systemDb = null;
  }
  initialized = false;
}

// Internal cleanup helper (used on init failure)
async function cleanupSystemDb(): Promise<void> {
  try {
    if (systemConnection) await systemConnection.close();
  } catch {
    /* ignore */
  }
  try {
    if (systemDb) await systemDb.terminate();
  } catch {
    /* ignore */
  }
  systemDb = null;
  systemConnection = null;
}
