/**
 * IndexedDB fallback for browsers without OPFS support (e.g., Firefox).
 * Implements the same data access patterns as the DuckDB-based repositories
 * but stores data as JSON documents in IndexedDB object stores.
 */

const FALLBACK_DB_NAME = "duck-ui-persistence";
/**
 * Bumped to 2 for the `dashboards` store. `onupgradeneeded` creates any store
 * that is missing, so an existing profile gains it without losing anything.
 */
const FALLBACK_DB_VERSION = 2;

const STORES = [
  "profiles",
  "settings",
  "connections",
  "query_history",
  "workspace_state",
  "ai_provider_configs",
  "ai_conversations",
  "saved_queries",
  "dashboards",
] as const;

let fallbackDb: IDBDatabase | null = null;

/**
 * A blocked upgrade must fail loudly, not hang forever.
 *
 * When the schema version is bumped, `indexedDB.open` waits for every OTHER
 * tab holding the old version to release it. Without a `versionchange` handler
 * those tabs never do, so in the new tab every write silently never resolves —
 * which shipped as "I made a dashboard, reloaded, and it was gone": it was
 * never written. The handler below closes our connection when someone else
 * upgrades; this timeout covers tabs from builds that predate the handler.
 */
const OPEN_TIMEOUT_MS = 10_000;

function openFallbackDb(): Promise<IDBDatabase> {
  if (fallbackDb) return Promise.resolve(fallbackDb);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FALLBACK_DB_NAME, FALLBACK_DB_VERSION);

    const timer = setTimeout(() => {
      reject(
        new Error(
          "Storage is locked by another Duck-UI tab. Close or reload your other Duck-UI tabs and try again."
        )
      );
    }, OPEN_TIMEOUT_MS);

    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      console.warn("[persistence] upgrade blocked by another tab holding the old schema");
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      fallbackDb = request.result;
      // Release our handle the moment any other tab needs to upgrade, so a
      // deploy that bumps the schema never deadlocks across open tabs. The
      // next operation in this tab reopens at the new version.
      fallbackDb.onversionchange = () => {
        fallbackDb?.close();
        fallbackDb = null;
      };
      resolve(request.result);
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
