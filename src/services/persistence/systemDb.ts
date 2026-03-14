/**
 * System Database Service
 *
 * Manages persistence for profiles, settings, connections, query history,
 * and other app state using IndexedDB.
 *
 * Previously attempted OPFS with a dedicated DuckDB WASM instance, but
 * IndexedDB is more appropriate for lightweight metadata and avoids
 * creating a heavyweight second DuckDB instance (worker + 34MB WASM).
 */

import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

/** Escape a string value for safe use in SQL single-quoted literals */
export function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

/** Escape and quote a string value for use in SQL WHERE clauses etc. Returns 'escaped_value' */
export function sqlQuote(value: string): string {
  return `'${sqlEscape(value)}'`;
}

/** Escape and double-quote an identifier (table name, column name, etc.) */
export function sqlIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// Singleton state
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Check whether OPFS is available in this browser.
 * Used by connection code to determine if OPFS connections are possible.
 */
export async function isOpfsAvailable(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const testName = ".duck-ui-opfs-test";
    await root.getFileHandle(testName, { create: true });
    await root.removeEntry(testName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the system database. Sets up IndexedDB persistence.
 * Must be called before any repository functions.
 * Uses a Promise-based lock to prevent double-init races.
 */
export function initializeSystemDb(): Promise<void> {
  if (!initPromise) {
    initPromise = doInitialize();
  }
  return initPromise;
}

async function doInitialize(): Promise<void> {
  if (initialized) return;
  console.info("[SystemDB] Using IndexedDB persistence");
  initialized = true;
}

/**
 * Get the system database connection. Throws since system DB now uses IndexedDB.
 */
export function getSystemConnection(): AsyncDuckDBConnection {
  throw new Error("System database uses IndexedDB — no DuckDB connection available");
}

/**
 * Check if the system DB is using OPFS (vs IndexedDB fallback).
 * Always returns false since system DB now exclusively uses IndexedDB.
 */
export function isUsingOpfs(): boolean {
  return false;
}

/**
 * Check if system DB has been initialized.
 */
export function isSystemDbInitialized(): boolean {
  return initialized;
}

/**
 * Close the system database connection. No-op since system DB uses IndexedDB.
 */
export async function closeSystemDb(): Promise<void> {
  initialized = false;
  initPromise = null;
}
