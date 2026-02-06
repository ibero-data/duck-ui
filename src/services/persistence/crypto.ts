/**
 * Web Crypto API helpers for encrypting sensitive data at rest.
 * Uses AES-256-GCM for encryption and PBKDF2 for password-based key derivation.
 *
 * Key storage is handled via IndexedDB ("duck-ui-keys"), keeping encryption keys
 * separate from the encrypted data in the OPFS system database.
 */

const KEY_DB_NAME = "duck-ui-keys";
const KEY_STORE_NAME = "encryption-keys";
const KEY_DB_VERSION = 1;

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;

// ─── IndexedDB key storage ───────────────────────────────────────────────────

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB_NAME, KEY_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: "profileId" });
      }
    };
  });
}

export async function storeKeyForProfile(
  profileId: string,
  key: CryptoKey,
  salt?: Uint8Array
): Promise<void> {
  const exported = await exportKey(key);
  const db = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, "readwrite");
    const store = tx.objectStore(KEY_STORE_NAME);
    const record: Record<string, unknown> = { profileId, key: exported };
    if (salt) {
      record.salt = Array.from(salt);
    }
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

export async function loadKeyForProfile(
  profileId: string
): Promise<{ key: CryptoKey; salt?: Uint8Array } | null> {
  const db = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, "readonly");
    const store = tx.objectStore(KEY_STORE_NAME);
    const request = store.get(profileId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) {
        resolve(null);
        return;
      }
      importKey(record.key).then((key) => {
        const salt = record.salt ? new Uint8Array(record.salt) : undefined;
        resolve({ key, salt });
      });
    };
    tx.oncomplete = () => db.close();
  });
}

export async function deleteKeyForProfile(profileId: string): Promise<void> {
  const db = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, "readwrite");
    const store = tx.objectStore(KEY_STORE_NAME);
    const request = store.delete(profileId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

// ─── Key generation & derivation ─────────────────────────────────────────────

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );
  // Concatenate IV + ciphertext and base64 encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── Key export / import (for IndexedDB storage) ────────────────────────────

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importKey(exported: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(exported), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: ALGORITHM, length: KEY_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}
