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
