import { generateUUID } from "@/lib/utils";
import { isUsingOpfs, getSystemConnection, sqlQuote } from "../systemDb";
import { fallbackPut, fallbackGet, fallbackGetAll, fallbackDelete } from "../fallback";

export interface Profile {
  id: string;
  name: string;
  avatar_emoji: string;
  has_password: boolean;
  password_verify_token: string | null;
  created_at: string;
  last_active: string;
}

export async function createProfile(
  name: string,
  avatarEmoji = "logo",
  hasPassword = false,
  passwordVerifyToken: string | null = null
): Promise<Profile> {
  const id = generateUUID();
  const now = new Date().toISOString();

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      INSERT INTO profiles (id, name, avatar_emoji, has_password, password_verify_token, created_at, last_active)
      VALUES (${sqlQuote(id)}, ${sqlQuote(name)}, ${sqlQuote(avatarEmoji)}, ${hasPassword}, ${passwordVerifyToken ? sqlQuote(passwordVerifyToken) : "NULL"}, ${sqlQuote(now)}, ${sqlQuote(now)})
    `);
  } else {
    await fallbackPut("profiles", {
      id,
      name,
      avatar_emoji: avatarEmoji,
      has_password: hasPassword,
      password_verify_token: passwordVerifyToken,
      created_at: now,
      last_active: now,
    });
  }

  return {
    id,
    name,
    avatar_emoji: avatarEmoji,
    has_password: hasPassword,
    password_verify_token: passwordVerifyToken,
    created_at: now,
    last_active: now,
  };
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(`SELECT * FROM profiles WHERE id = ${sqlQuote(id)}`);
    const rows = result.toArray();
    if (rows.length === 0) return null;
    const row = rows[0].toJSON();
    return {
      id: row.id,
      name: row.name,
      avatar_emoji: row.avatar_emoji,
      has_password: Boolean(row.has_password),
      password_verify_token: row.password_verify_token ?? null,
      created_at: String(row.created_at),
      last_active: String(row.last_active),
    };
  } else {
    const record = (await fallbackGet("profiles", id)) as Profile | null;
    return record;
  }
}

export async function listProfiles(): Promise<Profile[]> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(`SELECT * FROM profiles ORDER BY last_active DESC`);
    return result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        id: r.id,
        name: r.name,
        avatar_emoji: r.avatar_emoji,
        has_password: Boolean(r.has_password),
        password_verify_token: r.password_verify_token ?? null,
        created_at: String(r.created_at),
        last_active: String(r.last_active),
      };
    });
  } else {
    const records = (await fallbackGetAll("profiles")) as Profile[];
    return records.sort(
      (a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
    );
  }
}

export async function updateProfile(
  id: string,
  updates: Partial<
    Pick<Profile, "name" | "avatar_emoji" | "has_password" | "password_verify_token">
  >
): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const setClauses: string[] = [];
    if (updates.name !== undefined) setClauses.push(`name = ${sqlQuote(updates.name)}`);
    if (updates.avatar_emoji !== undefined)
      setClauses.push(`avatar_emoji = ${sqlQuote(updates.avatar_emoji)}`);
    if (updates.has_password !== undefined)
      setClauses.push(`has_password = ${updates.has_password}`);
    if (updates.password_verify_token !== undefined)
      setClauses.push(
        `password_verify_token = ${updates.password_verify_token ? sqlQuote(updates.password_verify_token) : "NULL"}`
      );
    if (setClauses.length > 0) {
      await conn.query(`UPDATE profiles SET ${setClauses.join(", ")} WHERE id = ${sqlQuote(id)}`);
    }
  } else {
    const existing = (await fallbackGet("profiles", id)) as Profile | null;
    if (existing) {
      await fallbackPut("profiles", { ...existing, ...updates });
    }
  }
}

export async function deleteProfile(id: string): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const qid = sqlQuote(id);
    // Cascade delete all profile data in a transaction
    await conn.query(`BEGIN TRANSACTION`);
    try {
      await conn.query(`DELETE FROM settings WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM connections WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM query_history WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM workspace_state WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM ai_provider_configs WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM ai_conversations WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM saved_queries WHERE profile_id = ${qid}`);
      await conn.query(`DELETE FROM profiles WHERE id = ${qid}`);
      await conn.query(`COMMIT`);
    } catch (error) {
      await conn.query(`ROLLBACK`);
      throw error;
    }
  } else {
    await fallbackDelete("profiles", id);
    // Fallback doesn't have indexes on profile_id, so cascade is skipped
    // (would need a scan-and-delete approach for IndexedDB)
  }
}

export async function updateLastActive(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(
      `UPDATE profiles SET last_active = ${sqlQuote(now)} WHERE id = ${sqlQuote(id)}`
    );
  } else {
    const existing = (await fallbackGet("profiles", id)) as Profile | null;
    if (existing) {
      await fallbackPut("profiles", { ...existing, last_active: now });
    }
  }
}
