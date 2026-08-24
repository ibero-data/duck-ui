/**
 * One-time removal of storage left behind by features that no longer exist.
 *
 * The cloud-storage panel (S3/GCS/Azure connections) was removed: it confused
 * the sidebar with an empty section most people never filled in, and DuckDB
 * reaches those buckets from SQL anyway via `CREATE SECRET` and
 * `read_parquet('s3://…')`.
 *
 * Deleting the code is not enough. That feature kept access keys and secrets
 * in its own IndexedDB database, in plaintext, outside the profile encryption
 * everything else uses. Leaving it on disk would strand real credentials in a
 * store nothing can reach or clear.
 */

/** Databases from removed features, deleted once on boot. */
const ORPHANED_DATABASES = ["duck-ui-cloud"] as const;

const CLEANUP_FLAG = "duck-ui-orphan-cleanup-v1";

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    // Resolve on every outcome: a blocked delete (another tab holds it open)
    // must not stall boot, and the flag stays unset so the next load retries.
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

/**
 * Removes storage belonging to removed features. Safe to call repeatedly;
 * after the first successful pass it does nothing.
 */
export async function cleanupOrphanedStorage(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  if (localStorage.getItem(CLEANUP_FLAG) === "done") return;

  try {
    await Promise.all(ORPHANED_DATABASES.map(deleteDatabase));
    localStorage.setItem(CLEANUP_FLAG, "done");
    console.info("[Cleanup] Removed storage from retired features");
  } catch (error) {
    // Retried on the next load rather than blocking this one.
    console.warn("[Cleanup] Failed to remove orphaned storage:", error);
  }
}
