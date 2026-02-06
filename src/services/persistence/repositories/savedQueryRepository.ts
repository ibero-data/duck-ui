import { generateUUID } from "@/lib/utils";
import { isUsingOpfs, getSystemConnection } from "../systemDb";
import { fallbackPut, fallbackGetAll, fallbackGet, fallbackDelete } from "../fallback";

export interface SavedQuery {
  id: string;
  profile_id: string;
  name: string;
  sql_text: string;
  description: string | null;
  tags: string | null; // JSON array
  folder: string;
  created_at: string;
  updated_at: string;
}

export async function saveQuery(
  profileId: string,
  input: { name: string; sqlText: string; description?: string; tags?: string[]; folder?: string }
): Promise<SavedQuery> {
  const id = generateUUID();
  const now = new Date().toISOString();
  const tagsJson = input.tags ? JSON.stringify(input.tags) : null;

  const record: SavedQuery = {
    id,
    profile_id: profileId,
    name: input.name,
    sql_text: input.sqlText,
    description: input.description ?? null,
    tags: tagsJson,
    folder: input.folder ?? "default",
    created_at: now,
    updated_at: now,
  };

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      INSERT INTO saved_queries (id, profile_id, name, sql_text, description, tags, folder, created_at, updated_at)
      VALUES ('${id}', '${profileId}', '${input.name.replace(/'/g, "''")}', '${input.sqlText.replace(/'/g, "''")}', ${input.description ? `'${input.description.replace(/'/g, "''")}'` : "NULL"}, ${tagsJson ? `'${tagsJson.replace(/'/g, "''")}'` : "NULL"}, '${record.folder}', '${now}', '${now}')
    `);
  } else {
    await fallbackPut("saved_queries", { ...record });
  }

  return record;
}

export async function getSavedQueries(profileId: string, folder?: string): Promise<SavedQuery[]> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    let sql = `SELECT * FROM saved_queries WHERE profile_id = '${profileId}'`;
    if (folder) sql += ` AND folder = '${folder}'`;
    sql += ` ORDER BY updated_at DESC`;
    const result = await conn.query(sql);
    return result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        id: String(r.id),
        profile_id: String(r.profile_id),
        name: String(r.name),
        sql_text: String(r.sql_text),
        description: r.description ? String(r.description) : null,
        tags: r.tags ? String(r.tags) : null,
        folder: String(r.folder),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
      };
    });
  } else {
    const all = (await fallbackGetAll("saved_queries")) as SavedQuery[];
    return all
      .filter((r) => r.profile_id === profileId && (!folder || r.folder === folder))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }
}

export async function updateSavedQuery(
  id: string,
  updates: Partial<Pick<SavedQuery, "name" | "sql_text" | "description" | "tags" | "folder">>
): Promise<void> {
  const now = new Date().toISOString();

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const setClauses: string[] = [`updated_at = '${now}'`];
    if (updates.name !== undefined) setClauses.push(`name = '${updates.name.replace(/'/g, "''")}'`);
    if (updates.sql_text !== undefined)
      setClauses.push(`sql_text = '${updates.sql_text.replace(/'/g, "''")}'`);
    if (updates.description !== undefined)
      setClauses.push(
        updates.description
          ? `description = '${updates.description.replace(/'/g, "''")}'`
          : `description = NULL`
      );
    if (updates.tags !== undefined)
      setClauses.push(
        updates.tags ? `tags = '${updates.tags.replace(/'/g, "''")}'` : `tags = NULL`
      );
    if (updates.folder !== undefined) setClauses.push(`folder = '${updates.folder}'`);
    await conn.query(`UPDATE saved_queries SET ${setClauses.join(", ")} WHERE id = '${id}'`);
  } else {
    const existing = (await fallbackGet("saved_queries", id)) as SavedQuery | null;
    if (existing) {
      await fallbackPut("saved_queries", { ...existing, ...updates, updated_at: now });
    }
  }
}

export async function deleteSavedQuery(id: string): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`DELETE FROM saved_queries WHERE id = '${id}'`);
  } else {
    await fallbackDelete("saved_queries", id);
  }
}
