import { describe, it, expect } from "vitest";
import {
  generateEncryptionKey,
  generateSalt,
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  exportKey,
  importKey,
} from "../crypto";

describe("crypto", () => {
  describe("generateEncryptionKey", () => {
    it("generates a CryptoKey with AES-GCM algorithm", async () => {
      const key = await generateEncryptionKey();
      expect(key).toBeDefined();
      expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain("encrypt");
      expect(key.usages).toContain("decrypt");
    });

    it("generates unique keys each time", async () => {
      const key1 = await generateEncryptionKey();
      const key2 = await generateEncryptionKey();
      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);
      expect(exported1).not.toBe(exported2);
    });
  });

  describe("generateSalt", () => {
    it("generates a 16-byte Uint8Array", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it("generates unique salts each time", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(Array.from(salt1)).not.toEqual(Array.from(salt2));
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips a simple string", async () => {
      const key = await generateEncryptionKey();
      const plaintext = "hello world";
      const ciphertext = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, key);
      expect(decrypted).toBe(plaintext);
    });

    it("round-trips an empty string", async () => {
      const key = await generateEncryptionKey();
      const ciphertext = await encrypt("", key);
      const decrypted = await decrypt(ciphertext, key);
      expect(decrypted).toBe("");
    });

    it("round-trips unicode content", async () => {
      const key = await generateEncryptionKey();
      const plaintext = "🦆 duck-ui — ñ, é, 中文";
      const ciphertext = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, key);
      expect(decrypted).toBe(plaintext);
    });

    it("round-trips a JSON API key", async () => {
      const key = await generateEncryptionKey();
      const apiKey = "sk-proj-abc123XYZ_long-api-key-value";
      const ciphertext = await encrypt(apiKey, key);
      const decrypted = await decrypt(ciphertext, key);
      expect(decrypted).toBe(apiKey);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", async () => {
      const key = await generateEncryptionKey();
      const plaintext = "same input";
      const c1 = await encrypt(plaintext, key);
      const c2 = await encrypt(plaintext, key);
      expect(c1).not.toBe(c2);
    });

    it("ciphertext is a base64 string", async () => {
      const key = await generateEncryptionKey();
      const ciphertext = await encrypt("test", key);
      expect(typeof ciphertext).toBe("string");
      // base64 regex
      expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("fails to decrypt with a different key", async () => {
      const key1 = await generateEncryptionKey();
      const key2 = await generateEncryptionKey();
      const ciphertext = await encrypt("secret", key1);
      await expect(decrypt(ciphertext, key2)).rejects.toThrow();
    });
  });

  describe("exportKey / importKey", () => {
    it("round-trips a key", async () => {
      const original = await generateEncryptionKey();
      const exported = await exportKey(original);
      const imported = await importKey(exported);

      // Verify the imported key works
      const ciphertext = await encrypt("test", original);
      const decrypted = await decrypt(ciphertext, imported);
      expect(decrypted).toBe("test");
    });

    it("exported key is a base64 string", async () => {
      const key = await generateEncryptionKey();
      const exported = await exportKey(key);
      expect(typeof exported).toBe("string");
      expect(exported).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("imported key has correct properties", async () => {
      const original = await generateEncryptionKey();
      const exported = await exportKey(original);
      const imported = await importKey(exported);

      expect(imported.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      expect(imported.extractable).toBe(true);
      expect(imported.usages).toContain("encrypt");
      expect(imported.usages).toContain("decrypt");
    });
  });

  describe("deriveKeyFromPassword", () => {
    it("derives a usable key from password + salt", async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassword("my-secure-password", salt);

      expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      const ciphertext = await encrypt("secret data", key);
      const decrypted = await decrypt(ciphertext, key);
      expect(decrypted).toBe("secret data");
    });

    it("same password + same salt produces same key", async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassword("password123", salt);
      const key2 = await deriveKeyFromPassword("password123", salt);
      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);
      expect(exported1).toBe(exported2);
    });

    it("same password + different salt produces different key", async () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = await deriveKeyFromPassword("password123", salt1);
      const key2 = await deriveKeyFromPassword("password123", salt2);
      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);
      expect(exported1).not.toBe(exported2);
    });

    it("different password + same salt produces different key", async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassword("password-A", salt);
      const key2 = await deriveKeyFromPassword("password-B", salt);
      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);
      expect(exported1).not.toBe(exported2);
    });

    it("data encrypted with derived key cannot be decrypted with wrong password", async () => {
      const salt = generateSalt();
      const rightKey = await deriveKeyFromPassword("correct-password", salt);
      const wrongKey = await deriveKeyFromPassword("wrong-password", salt);
      const ciphertext = await encrypt("sensitive data", rightKey);
      await expect(decrypt(ciphertext, wrongKey)).rejects.toThrow();
    });
  });
});
