import { isUsingOpfs, getSystemConnection } from "../systemDb";
import { fallbackPut, fallbackGet, fallbackGetAll, fallbackDelete } from "../fallback";

export interface SettingRecord {
  profile_id: string;
  category: string;
  key: string;
  value: string; // JSON-encoded
}

export async function getSetting(
  profileId: string,
  category: string,
  key: string
): Promise<string | null> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT value FROM settings WHERE profile_id = '${profileId}' AND category = '${category}' AND key = '${key}'`
    );
    const rows = result.toArray();
    return rows.length > 0 ? String(rows[0].toJSON().value) : null;
  } else {
    const record = (await fallbackGet("settings", [profileId, category, key])) as SettingRecord | null;
    return record?.value ?? null;
  }
}

export async function setSetting(
  profileId: string,
  category: string,
  key: string,
  value: string
): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const escapedValue = value.replace(/'/g, "''");
    await conn.query(`
      INSERT OR REPLACE INTO settings (profile_id, category, key, value)
      VALUES ('${profileId}', '${category}', '${key}', '${escapedValue}')
    `);
  } else {
    await fallbackPut("settings", { profile_id: profileId, category, key, value });
  }
}

export async function getSettingsByCategory(
  profileId: string,
  category: string
): Promise<Record<string, string>> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT key, value FROM settings WHERE profile_id = '${profileId}' AND category = '${category}'`
    );
    const settings: Record<string, string> = {};
    for (const row of result.toArray()) {
      const r = row.toJSON();
      settings[String(r.key)] = String(r.value);
    }
    return settings;
  } else {
    const all = (await fallbackGetAll("settings")) as SettingRecord[];
    const settings: Record<string, string> = {};
    for (const rec of all) {
      if (rec.profile_id === profileId && rec.category === category) {
        settings[rec.key] = rec.value;
      }
    }
    return settings;
  }
}

export async function deleteSetting(
  profileId: string,
  category: string,
  key: string
): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(
      `DELETE FROM settings WHERE profile_id = '${profileId}' AND category = '${category}' AND key = '${key}'`
    );
  } else {
    await fallbackDelete("settings", [profileId, category, key]);
  }
}
