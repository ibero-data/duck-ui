import * as duckdb from "@duckdb/duckdb-wasm";
import { generateUUID } from "@/lib/utils";
import type { QueryHistoryItem } from "@/store/types";

/**
 * Exponential backoff retry helper.
 */
export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Operation failed after retries");
};

/**
 * Validate a DuckDB connection.
 */
export const validateConnection = (
  connection: duckdb.AsyncDuckDBConnection | null
): duckdb.AsyncDuckDBConnection => {
  if (!connection || typeof connection.query !== "function") {
    throw new Error("Database connection is not valid");
  }
  return connection;
};

/** Past this, hold the file in httpfs rather than in a JS string. */
const MAX_STAGE_BYTES = 100 * 1024 * 1024;

/** Derives the virtual filename a staged URL is registered under. */
export const stagedFileName = (url: string): string => {
  // Strip the scheme first, so a degenerate URL can never leave "https:" behind.
  const path = url
    .split("?")[0]
    .split("#")[0]
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const base = path.split("/").filter(Boolean).pop() ?? "";
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || "staged_data";
};

/**
 * Downloads a remote text file and registers it in DuckDB's virtual filesystem,
 * returning the name the SQL should read from instead of the URL.
 *
 * This exists because duckdb-wasm reads remote files through partial range
 * requests, and the CSV dialect sniffer cannot make sense of them: as of
 * DuckDB 1.5.5 `read_csv('https://...')` either fails outright or silently
 * collapses every row into one column, even with an explicit `delim`. Handing
 * the parser the complete bytes sidesteps it.
 *
 * The registration name must NOT be the URL. Anything matching a protocol is
 * routed to httpfs before the virtual filesystem is consulted, so registering
 * under the URL leaves the original broken read in place.
 *
 * Returns null when the file is too big to hold in memory, in which case the
 * caller should fall back to reading it over httpfs.
 */
export const stageRemoteTextFile = async (
  db: duckdb.AsyncDuckDB,
  url: string
): Promise<string | null> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

  const declaredSize = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredSize) && declaredSize > MAX_STAGE_BYTES) {
    response.body?.cancel().catch(() => {});
    return null;
  }

  const text = await response.text();
  const name = stagedFileName(url);
  try {
    await db.dropFile(name);
  } catch {
    // Not registered yet, which is the normal case.
  }
  await db.registerFileText(name, text);
  return name;
};

/**
 * Turns an engine error into something a user can act on.
 *
 * duckdb-wasm raises some errors as a JSON envelope, which reaches the UI as a
 * wall of escaped quotes. Unwrap those, and add a hint for the failures whose
 * cause isn't guessable from the message alone.
 */
export const explainEngineError = (message: string): string => {
  let text = message;

  const start = text.indexOf("{");
  if (start !== -1) {
    try {
      const payload = JSON.parse(text.slice(start));
      if (typeof payload?.exception_message === "string") {
        const type = typeof payload.exception_type === "string" ? payload.exception_type : "";
        const prefix = text.slice(0, start).trim();
        const body =
          type && !payload.exception_message.startsWith(type)
            ? `${type}: ${payload.exception_message}`
            : payload.exception_message;
        text = prefix ? `${prefix} ${body}` : body;
      }
    } catch {
      // Not a JSON envelope — leave the message as it came.
    }
  }

  // VARIANT (new in DuckDB 1.5) has no Arrow representation yet, so any query
  // that returns one fails before a single row reaches the browser.
  if (/Unsupported Arrow type VARIANT/i.test(text)) {
    return (
      "VARIANT columns can't be returned to the browser yet, because DuckDB has no " +
      "Arrow representation for them. Cast the column to read it, e.g. " +
      "SELECT my_variant::VARCHAR (or ::JSON) instead of SELECT *."
    );
  }

  return text;
};

/**
 * Helper to update query history.
 */
export const updateHistory = (
  currentHistory: QueryHistoryItem[],
  query: string,
  errorMsg?: string
): QueryHistoryItem[] => {
  const newItem: QueryHistoryItem = {
    id: generateUUID(),
    query,
    timestamp: new Date(),
    ...(errorMsg ? { error: errorMsg } : {}),
  };
  const existingIndex = currentHistory.findIndex((item) => item.query === query);
  const newHistory =
    existingIndex !== -1
      ? [newItem, ...currentHistory.filter((_, idx) => idx !== existingIndex)]
      : [newItem, ...currentHistory];
  return newHistory.slice(0, 15);
};
