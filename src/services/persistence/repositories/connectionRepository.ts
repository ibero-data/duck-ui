import { generateUUID } from "@/lib/utils";
import { isUsingOpfs, getSystemConnection } from "../systemDb";
import { encrypt, decrypt } from "../crypto";
import { fallbackPut, fallbackGetAll, fallbackDelete } from "../fallback";

export interface SavedConnection {
  id: string;
  profile_id: string;
  name: string;
  scope: string;
  config: string; // JSON
  encrypted_credentials: string | null;
  environment: string;
  created_at: string;
}

export interface ConnectionInput {
  name: string;
  scope: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  environment?: string;
}

export async function saveConnection(
  profileId: string,
  input: ConnectionInput,
  cryptoKey: CryptoKey | null
): Promise<SavedConnection> {
  const id = generateUUID();
  const now = new Date().toISOString();
  const configJson = JSON.stringify(input.config);
  let encryptedCreds: string | null = null;

  if (input.credentials && cryptoKey) {
    encryptedCreds = await encrypt(JSON.stringify(input.credentials), cryptoKey);
  }

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      INSERT INTO connections (id, profile_id, name, scope, config, encrypted_credentials, environment, created_at)
      VALUES ('${id}', '${profileId}', '${input.name.replace(/'/g, "''")}', '${input.scope}', '${configJson.replace(/'/g, "''")}', ${encryptedCreds ? `'${encryptedCreds.replace(/'/g, "''")}'` : "NULL"}, '${input.environment ?? "APP"}', '${now}')
    `);
  } else {
    await fallbackPut("connections", {
      id,
      profile_id: profileId,
      name: input.name,
      scope: input.scope,
      config: configJson,
      encrypted_credentials: encryptedCreds,
      environment: input.environment ?? "APP",
      created_at: now,
    });
  }

  return {
    id,
    profile_id: profileId,
    name: input.name,
    scope: input.scope,
    config: configJson,
    encrypted_credentials: encryptedCreds,
    environment: input.environment ?? "APP",
    created_at: now,
  };
}

export async function getConnections(
  profileId: string,
  cryptoKey: CryptoKey | null
): Promise<Array<{ id: string; name: string; scope: string; config: Record<string, unknown>; credentials: Record<string, unknown> | null; environment: string; created_at: string }>> {
  let records: SavedConnection[] = [];

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT * FROM connections WHERE profile_id = '${profileId}' ORDER BY created_at`
    );
    records = result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        id: String(r.id),
        profile_id: String(r.profile_id),
        name: String(r.name),
        scope: String(r.scope),
        config: String(r.config),
        encrypted_credentials: r.encrypted_credentials ? String(r.encrypted_credentials) : null,
        environment: String(r.environment),
        created_at: String(r.created_at),
      };
    });
  } else {
    const all = (await fallbackGetAll("connections")) as SavedConnection[];
    records = all.filter((r) => r.profile_id === profileId);
  }

  return Promise.all(
    records.map(async (r) => {
      let credentials: Record<string, unknown> | null = null;
      if (r.encrypted_credentials && cryptoKey) {
        try {
          credentials = JSON.parse(await decrypt(r.encrypted_credentials, cryptoKey));
        } catch {
          console.warn(`Failed to decrypt credentials for connection ${r.id}`);
        }
      }
      return {
        id: r.id,
        name: r.name,
        scope: r.scope,
        config: JSON.parse(r.config),
        credentials,
        environment: r.environment,
        created_at: r.created_at,
      };
    })
  );
}

export async function deleteConnection(id: string): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`DELETE FROM connections WHERE id = '${id}'`);
  } else {
    await fallbackDelete("connections", id);
  }
}
