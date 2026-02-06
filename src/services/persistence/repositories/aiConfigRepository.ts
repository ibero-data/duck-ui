import { generateUUID } from "@/lib/utils";
import { isUsingOpfs, getSystemConnection } from "../systemDb";
import { encrypt, decrypt } from "../crypto";
import { fallbackPut, fallbackGetAll, fallbackGet } from "../fallback";

export interface AIProviderConfig {
  profile_id: string;
  provider: string;
  config: string; // JSON: modelId, baseUrl (non-sensitive)
  encrypted_api_key: string | null;
}

export interface AIConversation {
  id: string;
  profile_id: string;
  title: string | null;
  messages: string; // JSON array
  provider: string | null;
  created_at: string;
  updated_at: string;
}

export async function saveProviderConfig(
  profileId: string,
  provider: string,
  config: Record<string, unknown>,
  apiKey: string | null,
  cryptoKey: CryptoKey | null
): Promise<void> {
  const configJson = JSON.stringify(config);
  let encryptedKey: string | null = null;

  if (apiKey && cryptoKey) {
    encryptedKey = await encrypt(apiKey, cryptoKey);
  }

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      INSERT OR REPLACE INTO ai_provider_configs (profile_id, provider, config, encrypted_api_key)
      VALUES ('${profileId}', '${provider}', '${configJson.replace(/'/g, "''")}', ${encryptedKey ? `'${encryptedKey.replace(/'/g, "''")}'` : "NULL"})
    `);
  } else {
    await fallbackPut("ai_provider_configs", {
      profile_id: profileId,
      provider,
      config: configJson,
      encrypted_api_key: encryptedKey,
    });
  }
}

export async function getProviderConfigs(
  profileId: string,
  cryptoKey: CryptoKey | null
): Promise<Array<{ provider: string; config: Record<string, unknown>; apiKey: string | null }>> {
  let records: AIProviderConfig[] = [];

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT * FROM ai_provider_configs WHERE profile_id = '${profileId}'`
    );
    records = result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        profile_id: String(r.profile_id),
        provider: String(r.provider),
        config: String(r.config),
        encrypted_api_key: r.encrypted_api_key ? String(r.encrypted_api_key) : null,
      };
    });
  } else {
    const all = (await fallbackGetAll("ai_provider_configs")) as AIProviderConfig[];
    records = all.filter((r) => r.profile_id === profileId);
  }

  return Promise.all(
    records.map(async (r) => {
      let apiKey: string | null = null;
      if (r.encrypted_api_key && cryptoKey) {
        try {
          apiKey = await decrypt(r.encrypted_api_key, cryptoKey);
        } catch {
          console.warn(`Failed to decrypt API key for provider ${r.provider}`);
        }
      }
      return {
        provider: r.provider,
        config: JSON.parse(r.config),
        apiKey,
      };
    })
  );
}

export async function saveConversation(
  profileId: string,
  messages: unknown[],
  options?: { id?: string; title?: string; provider?: string }
): Promise<string> {
  const id = options?.id ?? generateUUID();
  const now = new Date().toISOString();
  const messagesJson = JSON.stringify(messages);

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    // Check if exists
    const existing = await conn.query(`SELECT id FROM ai_conversations WHERE id = '${id}'`);
    if (existing.toArray().length > 0) {
      await conn.query(`
        UPDATE ai_conversations SET messages = '${messagesJson.replace(/'/g, "''")}', title = ${options?.title ? `'${options.title.replace(/'/g, "''")}'` : "NULL"}, updated_at = '${now}'
        WHERE id = '${id}'
      `);
    } else {
      await conn.query(`
        INSERT INTO ai_conversations (id, profile_id, title, messages, provider, created_at, updated_at)
        VALUES ('${id}', '${profileId}', ${options?.title ? `'${options.title.replace(/'/g, "''")}'` : "NULL"}, '${messagesJson.replace(/'/g, "''")}', ${options?.provider ? `'${options.provider}'` : "NULL"}, '${now}', '${now}')
      `);
    }
  } else {
    const existing = (await fallbackGet("ai_conversations", id)) as AIConversation | null;
    await fallbackPut("ai_conversations", {
      id,
      profile_id: profileId,
      title: options?.title ?? existing?.title ?? null,
      messages: messagesJson,
      provider: options?.provider ?? existing?.provider ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
  }

  return id;
}

export async function getConversations(profileId: string): Promise<AIConversation[]> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT * FROM ai_conversations WHERE profile_id = '${profileId}' ORDER BY updated_at DESC`
    );
    return result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        id: String(r.id),
        profile_id: String(r.profile_id),
        title: r.title ? String(r.title) : null,
        messages: String(r.messages),
        provider: r.provider ? String(r.provider) : null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
      };
    });
  } else {
    const all = (await fallbackGetAll("ai_conversations")) as AIConversation[];
    return all
      .filter((r) => r.profile_id === profileId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }
}
