/**
 * Cloud Storage Service
 * Manages connections to S3, Google Cloud Storage, and Azure Blob Storage
 */

import { useDuckStore } from "@/store";
import { generateUUID } from "@/lib/utils";
import { sqlEscapeString } from "@/lib/sqlSanitize";

// Cloud provider types
export type CloudProviderType = "s3" | "gcs" | "azure";

// Cloud connection configuration
export interface CloudConnection {
  id: string;
  name: string;
  type: CloudProviderType;

  // S3 / S3-compatible (MinIO, R2, DigitalOcean Spaces)
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For S3-compatible services

  // Google Cloud Storage (uses HMAC keys for S3-compatible access)
  projectId?: string;
  hmacKeyId?: string;
  hmacSecret?: string;

  // Azure Blob Storage
  accountName?: string;
  accountKey?: string;
  containerName?: string;

  // Metadata
  addedAt: Date;
  isConnected: boolean;
  lastError?: string;
}

// Cloud file entry
export interface CloudFile {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  lastModified?: Date;
  extension?: string;
}

// HTTP/S3 support status
export interface CloudSupportStatus {
  httpfsAvailable: boolean;
  secretsSupported: boolean;
  httpsSupported: boolean;
  s3Supported: boolean;
  error?: string;
}

// IndexedDB for storing cloud connections (credentials encrypted or in memory only)
const DB_NAME = "duck-ui-cloud";
const STORE_NAME = "cloud-connections";
const DB_VERSION = 1;

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Cloud Storage Service - Singleton
 */
class CloudStorageService {
  private db: IDBDatabase | null = null;
  private connections: Map<string, CloudConnection> = new Map();
  private initialized = false;
  private supportStatus: CloudSupportStatus | null = null;

  /**
   * Initialize the service
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = await openDatabase();
      await this.loadPersistedConnections();

      // Check what cloud features are supported
      this.supportStatus = await this.checkCloudSupport();

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize CloudStorageService:", error);
      throw error;
    }
  }

  /**
   * Check what cloud storage features are supported in this DuckDB-WASM instance
   */
  async checkCloudSupport(): Promise<CloudSupportStatus> {
    const status: CloudSupportStatus = {
      httpfsAvailable: false,
      secretsSupported: false,
      httpsSupported: false,
      s3Supported: false,
    };

    const { connection } = useDuckStore.getState();
    if (!connection) {
      status.error = "No DuckDB connection available";
      return status;
    }

    // Test 1: Try to install/load httpfs
    try {
      await connection.query(`INSTALL httpfs`);
      await connection.query(`LOAD httpfs`);
      status.httpfsAvailable = true;
    } catch (e) {
      console.log("httpfs not available:", e);
    }

    // Test 2: Try to create a secret
    if (status.httpfsAvailable) {
      try {
        await connection.query(`
          CREATE OR REPLACE SECRET __cloud_test_secret (
            TYPE s3,
            KEY_ID 'test',
            SECRET 'test',
            REGION 'us-east-1'
          )
        `);
        await connection.query(`DROP SECRET IF EXISTS __cloud_test_secret`);
        status.secretsSupported = true;
      } catch (e) {
        console.log("Secrets not supported:", e);
      }
    }

    // Test 3: Check if HTTPS URLs work (may work even without httpfs)
    try {
      // Just check if the function exists, don't actually fetch
      await connection.query(`SELECT typeof(read_parquet) AS t`);
      status.httpsSupported = true;
    } catch {
      // Try alternate check
      try {
        const result = await connection.query(`
          SELECT function_name FROM duckdb_functions()
          WHERE function_name = 'read_parquet'
          LIMIT 1
        `);
        status.httpsSupported = result.toArray().length > 0;
      } catch {
        status.httpsSupported = false;
      }
    }

    // Test 4: S3 is supported if httpfs + secrets work
    status.s3Supported = status.httpfsAvailable && status.secretsSupported;

    return status;
  }

  /**
   * Get current support status
   */
  getSupportStatus(): CloudSupportStatus | null {
    return this.supportStatus;
  }

  /**
   * Load connections from IndexedDB
   */
  private async loadPersistedConnections(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const connections = request.result as CloudConnection[];
        for (const conn of connections) {
          conn.addedAt = new Date(conn.addedAt);
          conn.isConnected = false; // Reset on load
          this.connections.set(conn.id, conn);
        }
        resolve();
      };
    });
  }

  /**
   * Save connection to IndexedDB
   */
  private async persistConnection(conn: CloudConnection): Promise<void> {
    if (!this.db) return;

    // Don't persist sensitive credentials - store metadata only
    const safeConn = {
      ...conn,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      hmacKeyId: undefined,
      hmacSecret: undefined,
      accountKey: undefined,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(safeConn);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Remove connection from IndexedDB
   */
  private async removePersistedConnection(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Add a new cloud connection
   */
  async addConnection(
    config: Omit<CloudConnection, "id" | "addedAt" | "isConnected">
  ): Promise<CloudConnection> {
    const id = generateUUID();

    const conn: CloudConnection = {
      ...config,
      id,
      addedAt: new Date(),
      isConnected: false,
    };

    this.connections.set(id, conn);
    await this.persistConnection(conn);

    return conn;
  }

  /**
   * Update an existing connection
   */
  async updateConnection(
    id: string,
    updates: Partial<CloudConnection>
  ): Promise<CloudConnection | null> {
    const existing = this.connections.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.connections.set(id, updated);
    await this.persistConnection(updated);

    return updated;
  }

  /**
   * Remove a cloud connection
   */
  async removeConnection(id: string): Promise<void> {
    // Disconnect first if connected
    const conn = this.connections.get(id);
    if (conn?.isConnected) {
      await this.disconnect(id);
    }

    this.connections.delete(id);
    await this.removePersistedConnection(id);
  }

  /**
   * Get all connections
   */
  getConnections(): CloudConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get a specific connection
   */
  getConnection(id: string): CloudConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Setup DuckDB secret for a connection
   */
  async connect(id: string): Promise<boolean> {
    const conn = this.connections.get(id);
    if (!conn) {
      throw new Error(`Connection not found: ${id}`);
    }

    if (!this.supportStatus?.secretsSupported) {
      throw new Error(
        "Cloud storage secrets are not supported in this browser. " +
          "DuckDB-WASM has limited cloud storage support due to CORS restrictions."
      );
    }

    const { connection: duckConn } = useDuckStore.getState();
    if (!duckConn) {
      throw new Error("No DuckDB connection available");
    }

    try {
      const secretName = `cloud_${conn.id.replace(/-/g, "_")}`;

      switch (conn.type) {
        case "s3":
          await duckConn.query(`
            CREATE OR REPLACE SECRET ${secretName} (
              TYPE s3,
              KEY_ID '${sqlEscapeString(conn.accessKeyId || "")}',
              SECRET '${sqlEscapeString(conn.secretAccessKey || "")}',
              REGION '${sqlEscapeString(conn.region || "us-east-1")}'
              ${conn.endpoint ? `, ENDPOINT '${sqlEscapeString(conn.endpoint)}'` : ""}
            )
          `);
          break;

        case "gcs":
          // GCS uses S3-compatible HMAC keys
          await duckConn.query(`
            CREATE OR REPLACE SECRET ${secretName} (
              TYPE gcs,
              KEY_ID '${sqlEscapeString(conn.hmacKeyId || "")}',
              SECRET '${sqlEscapeString(conn.hmacSecret || "")}'
            )
          `);
          break;

        case "azure":
          await duckConn.query(`
            CREATE OR REPLACE SECRET ${secretName} (
              TYPE azure,
              ACCOUNT_NAME '${sqlEscapeString(conn.accountName || "")}',
              ACCOUNT_KEY '${sqlEscapeString(conn.accountKey || "")}'
            )
          `);
          break;
      }

      conn.isConnected = true;
      conn.lastError = undefined;
      return true;
    } catch (error) {
      conn.isConnected = false;
      conn.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Remove DuckDB secret for a connection
   */
  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id);
    if (!conn) return;

    const { connection: duckConn } = useDuckStore.getState();
    if (!duckConn) return;

    try {
      const secretName = `cloud_${conn.id.replace(/-/g, "_")}`;
      await duckConn.query(`DROP SECRET IF EXISTS ${secretName}`);
    } catch (error) {
      console.error("Failed to drop secret:", error);
    }

    conn.isConnected = false;
  }

  /**
   * Test a connection by trying to list bucket contents
   */
  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const conn = this.connections.get(id);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    try {
      // First ensure connected
      if (!conn.isConnected) {
        await this.connect(id);
      }

      const { connection: duckConn } = useDuckStore.getState();
      if (!duckConn) {
        return { success: false, error: "No DuckDB connection" };
      }

      // Try to list files in the bucket/container
      let testQuery: string;
      switch (conn.type) {
        case "s3":
          testQuery = `SELECT * FROM glob('s3://${conn.bucket}/*') LIMIT 1`;
          break;
        case "gcs":
          testQuery = `SELECT * FROM glob('gcs://${conn.bucket}/*') LIMIT 1`;
          break;
        case "azure":
          testQuery = `SELECT * FROM glob('azure://${conn.containerName}/*') LIMIT 1`;
          break;
      }

      await duckConn.query(testQuery);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get the URI prefix for a connection
   */
  getUriPrefix(id: string): string | null {
    const conn = this.connections.get(id);
    if (!conn) return null;

    switch (conn.type) {
      case "s3":
        return `s3://${conn.bucket}`;
      case "gcs":
        return `gcs://${conn.bucket}`;
      case "azure":
        return `azure://${conn.containerName}`;
      default:
        return null;
    }
  }
}

// Export singleton instance
export const cloudStorageService = new CloudStorageService();
