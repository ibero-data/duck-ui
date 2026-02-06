import { generateUUID } from "@/lib/utils";
import { isUsingOpfs, getSystemConnection } from "../systemDb";
import { fallbackPut, fallbackGetAll, fallbackClear } from "../fallback";

export interface HistoryEntry {
  id: string;
  profile_id: string;
  connection_id: string | null;
  sql_text: string;
  error: string | null;
  duration_ms: number | null;
  row_count: number | null;
  executed_at: string;
}

export async function addHistoryEntry(
  profileId: string,
  sqlText: string,
  options?: {
    connectionId?: string;
    error?: string;
    durationMs?: number;
    rowCount?: number;
  }
): Promise<HistoryEntry> {
  const id = generateUUID();
  const now = new Date().toISOString();

  const entry: HistoryEntry = {
    id,
    profile_id: profileId,
    connection_id: options?.connectionId ?? null,
    sql_text: sqlText,
    error: options?.error ?? null,
    duration_ms: options?.durationMs ?? null,
    row_count: options?.rowCount ?? null,
    executed_at: now,
  };

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      INSERT INTO query_history (id, profile_id, connection_id, sql_text, error, duration_ms, row_count, executed_at)
      VALUES ('${id}', '${profileId}', ${entry.connection_id ? `'${entry.connection_id}'` : "NULL"}, '${sqlText.replace(/'/g, "''")}', ${entry.error ? `'${entry.error.replace(/'/g, "''")}'` : "NULL"}, ${entry.duration_ms ?? "NULL"}, ${entry.row_count ?? "NULL"}, '${now}')
    `);
  } else {
    await fallbackPut("query_history", { ...entry });
  }

  return entry;
}

export async function getHistory(
  profileId: string,
  limit = 100,
  offset = 0
): Promise<HistoryEntry[]> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT * FROM query_history WHERE profile_id = '${profileId}' ORDER BY executed_at DESC LIMIT ${limit} OFFSET ${offset}`
    );
    return result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        id: String(r.id),
        profile_id: String(r.profile_id),
        connection_id: r.connection_id ? String(r.connection_id) : null,
        sql_text: String(r.sql_text),
        error: r.error ? String(r.error) : null,
        duration_ms: r.duration_ms != null ? Number(r.duration_ms) : null,
        row_count: r.row_count != null ? Number(r.row_count) : null,
        executed_at: String(r.executed_at),
      };
    });
  } else {
    const all = (await fallbackGetAll("query_history")) as HistoryEntry[];
    return all
      .filter((r) => r.profile_id === profileId)
      .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())
      .slice(offset, offset + limit);
  }
}

export async function clearHistory(profileId: string): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`DELETE FROM query_history WHERE profile_id = '${profileId}'`);
  } else {
    // For fallback, clear all (no efficient profile filtering in IndexedDB without indexes)
    await fallbackClear("query_history");
  }
}

export async function getHistoryCount(profileId: string): Promise<number> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT COUNT(*) as cnt FROM query_history WHERE profile_id = '${profileId}'`
    );
    return Number(result.toArray()[0]?.toJSON().cnt ?? 0);
  } else {
    const all = (await fallbackGetAll("query_history")) as HistoryEntry[];
    return all.filter((r) => r.profile_id === profileId).length;
  }
}
