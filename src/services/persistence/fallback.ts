/**
 * IndexedDB fallback for browsers without OPFS support (e.g., Firefox).
 * Implements the same data access patterns as the DuckDB-based repositories
 * but stores data as JSON documents in IndexedDB object stores.
 */

const FALLBACK_DB_NAME = "duck-ui-persistence";
const FALLBACK_DB_VERSION = 1;

const STORES = [
  "profiles",
  "settings",
  "connections",
  "query_history",
  "workspace_state",
  "ai_provider_configs",
  "ai_conversations",
  "saved_queries",
] as const;

let fallbackDb: IDBDatabase | null = null;

function openFallbackDb(): Promise<IDBDatabase> {
  if (fallbackDb) return Promise.resolve(fallbackDb);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FALLBACK_DB_NAME, FALLBACK_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      fallbackDb = request.result;
      resolve(fallbackDb);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          if (storeName === "settings") {
            db.createObjectStore(storeName, { keyPath: ["profile_id", "category", "key"] });
          } else if (storeName === "ai_provider_configs") {
            db.createObjectStore(storeName, { keyPath: ["profile_id", "provider"] });
          } else if (storeName === "workspace_state") {
            db.createObjectStore(storeName, { keyPath: "profile_id" });
          } else {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        }
      }
    };
  });
}

type StoreName = (typeof STORES)[number];

export async function fallbackPut(
  store: StoreName,
  record: Record<string, unknown>
): Promise<void> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const request = os.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function fallbackGet(store: StoreName, key: IDBValidKey): Promise<unknown | null> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const request = os.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

export async function fallbackGetAll(store: StoreName): Promise<unknown[]> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const request = os.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function fallbackDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const request = os.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function fallbackClear(store: StoreName): Promise<void> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const request = os.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
