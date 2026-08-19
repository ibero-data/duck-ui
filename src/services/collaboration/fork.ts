/**
 * Fork Session (§21 Mode C, §22).
 *
 * The guest copies selected shared tables into their OWN engine:
 *
 *   Host ShareRuntime ──query──▶ Arrow batches ──WebRTC──▶ guest engine
 *
 * After a fork the copy is independent: the host can revoke, disconnect, or
 * close the laptop, and the guest keeps querying. That is the entire point —
 * "leave with your own analytical environment", not "borrow mine".
 *
 * No new protocol. A fork is a peer query (`SELECT * FROM table`) whose result
 * lands in a local table instead of a grid, so it inherits everything the
 * query plane already enforces: the host's row/byte caps, the statement
 * screen, backpressure, cancellation. A grant's limits bound what can be
 * forked, and the UI says so rather than pretending otherwise.
 */

import { Table, tableToIPC } from "apache-arrow";
import { collectExecution, requireLocalDuckSession, type DataSession } from "@/services/engine";

export interface ForkTableProgress {
  table: string;
  status: "pending" | "transferring" | "importing" | "done" | "error";
  rows: number;
  /** Present when the host's grant limits cut the copy short. */
  truncated?: boolean;
  error?: string;
}

export interface ForkOptions {
  /** The peer session the data comes THROUGH (the capability's session). */
  source: DataSession;
  /** The local session the copy lands IN. Must be an in-tab engine. */
  target: DataSession;
  tables: string[];
  onProgress?: (progress: ForkTableProgress) => void;
  signal?: AbortSignal;
}

/** Table name the copy lands under, avoiding collisions with local tables. */
export const forkTargetName = (table: string, taken: Set<string>): string => {
  if (!taken.has(table)) return table;
  let suffix = 2;
  while (taken.has(`${table}_fork${suffix > 2 ? suffix : ""}`)) suffix++;
  return `${table}_fork${suffix > 2 ? suffix : ""}`;
};

/**
 * Copies tables from a peer capability into the local engine.
 *
 * Sequential on purpose: the host serializes guest queries anyway, and one
 * table at a time gives an honest progress readout instead of N spinners.
 */
export const forkTables = async (options: ForkOptions): Promise<ForkTableProgress[]> => {
  const { source, target, tables, onProgress, signal } = options;
  const local = requireLocalDuckSession(target).local;

  // Existing local tables, so a fork never silently clobbers one.
  const taken = new Set<string>();
  try {
    const existing = await local.connection.query(`SHOW TABLES`);
    for (const row of existing.toArray()) {
      const name = (row as { name?: unknown }).name;
      if (name) taken.add(String(name));
    }
  } catch {
    // An unreadable catalog only costs collision avoidance.
  }

  const results: ForkTableProgress[] = [];

  for (const table of tables) {
    const progress: ForkTableProgress = { table, status: "transferring", rows: 0 };
    results.push(progress);
    onProgress?.({ ...progress });

    try {
      if (signal?.aborted) throw new Error("Fork cancelled");

      // The host screens this like any guest query; the grant's caps apply.
      const collected = await collectExecution(
        source.execute({ sql: `SELECT * FROM "${table.replace(/"/g, '""')}"`, signal }),
        {
          onProgress: ({ rows }) => {
            progress.rows = rows;
            onProgress?.({ ...progress });
          },
        }
      );

      if (collected.error) throw new Error(collected.error.message);
      if (collected.batches.length === 0) {
        throw new Error("The host returned no data for this table");
      }

      progress.status = "importing";
      progress.rows = collected.rowCount;
      progress.truncated = collected.truncated || undefined;
      onProgress?.({ ...progress });

      const name = forkTargetName(table, taken);
      taken.add(name);
      await local.connection.insertArrowFromIPCStream(
        tableToIPC(new Table(collected.batches), "stream"),
        { name, create: true }
      );

      progress.status = "done";
      onProgress?.({ ...progress });
    } catch (error) {
      progress.status = "error";
      progress.error = error instanceof Error ? error.message : "Fork failed";
      onProgress?.({ ...progress });
    }
  }

  return results;
};
