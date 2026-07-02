import type { StateCreator } from "zustand";
import { initializeWasmConnection } from "@/services/duckdb";
import type { DuckStoreState, DuckdbSlice, ConnectionProvider } from "../types";
import { getSetting } from "@/services/persistence/repositories/settingsRepository";
import { toast } from "sonner";

export const DEFAULT_DUCKDB_MEMORY_LIMIT_MB = 4096;

export const createDuckdbSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  DuckdbSlice
> = (set, get) => ({
  db: null,
  connection: null,
  wasmDb: null,
  wasmConnection: null,
  opfsDb: null,
  opfsConnection: null,
  isInitialized: false,
  isLoading: false,
  error: null,
  currentDatabase: "memory",

  initialize: async () => {
    console.info(`[DuckDB] crossOriginIsolated: ${self.crossOriginIsolated}`);
    const initialConnections: ConnectionProvider[] = [];

    const {
      DUCK_UI_EXTERNAL_CONNECTION_NAME: externalConnectionName = "",
      DUCK_UI_EXTERNAL_HOST: externalHost = "",
      DUCK_UI_EXTERNAL_PORT: externalPort = "",
      DUCK_UI_EXTERNAL_USER: externalUser = "",
      DUCK_UI_EXTERNAL_PASS: externalPass = "",
      DUCK_UI_EXTERNAL_API_KEY: externalApiKey = "",
      DUCK_UI_EXTERNAL_DATABASE_NAME: externalDatabaseName = "",
    } = window.env || {};

    const wasmConnection: ConnectionProvider = {
      environment: "APP",
      id: "WASM",
      name: "WASM",
      scope: "WASM",
    };

    initialConnections.push(wasmConnection);

    if (externalConnectionName && externalHost && externalPort) {
      initialConnections.push({
        environment: "ENV",
        id: externalConnectionName,
        name: externalConnectionName,
        scope: "External",
        host: externalHost,
        port: Number(externalPort),
        user: externalUser,
        password: externalPass,
        apiKey: externalApiKey,
        database: externalDatabaseName,
        authMode: externalApiKey ? "api_key" : externalUser ? "password" : "none",
      });
    }

    set({
      connectionList: { connections: initialConnections },
    });

    if (initialConnections.length > 0) {
      const { db, connection } = await initializeWasmConnection();
      set({
        db,
        connection,
        wasmDb: db,
        wasmConnection: connection,
        isInitialized: true,
        currentDatabase: "memory",
      });
      // Install extensions individually (non-blocking for offline support)
      const failedExtensions: string[] = [];

      try {
        await connection.query(`SET enable_http_metadata_cache=true`);
      } catch {
        console.warn("[DuckDB] Failed to set enable_http_metadata_cache");
      }

      try {
        const profileId = get().currentProfileId;
        let memoryLimitMb = DEFAULT_DUCKDB_MEMORY_LIMIT_MB;
        if (profileId) {
          const raw = await getSetting(profileId, "duckdb", "memory_limit_mb");
          if (raw) {
            const parsed = Number(JSON.parse(raw));
            if (Number.isFinite(parsed) && parsed >= 256 && parsed <= 16384) {
              memoryLimitMb = Math.floor(parsed);
            }
          }
        }
        await connection.query(`SET memory_limit='${memoryLimitMb}MB'`);
      } catch {
        console.warn("[DuckDB] Failed to set memory_limit");
      }

      for (const ext of ["arrow", "parquet", "ducklake"]) {
        try {
          await connection.query(`INSTALL ${ext}`);
          if (ext === "ducklake") {
            await connection.query(`LOAD ${ext}`);
          }
        } catch {
          console.warn(`[DuckDB] Failed to install ${ext} extension`);
          failedExtensions.push(ext);
        }
      }

      if (failedExtensions.length > 0) {
        toast.warning(
          `Some extensions failed to load (${failedExtensions.join(", ")}). You may be offline — basic SQL features still work.`
        );
      }

      if (initialConnections[0].scope !== "WASM") {
        await get().setCurrentConnection(initialConnections[0].id);
      } else {
        set({
          currentConnection: {
            environment: initialConnections[0].environment,
            id: initialConnections[0].id,
            name: initialConnections[0].name,
            scope: initialConnections[0].scope,
          },
        });
        await get().fetchDatabasesAndTablesInfo();
      }
    } else {
      set({ isLoading: false, isInitialized: true });
    }
  },

  cleanup: async () => {
    const { connection, db } = get();
    try {
      if (connection) await connection.close();
      if (db) await db.terminate();
    } finally {
      set({
        db: null,
        connection: null,
        isInitialized: false,
        databases: [],
        currentDatabase: "memory",
        error: null,
        queryHistory: [],
        tabs: [
          {
            id: "home",
            title: "Home",
            type: "home",
            content: "",
          },
        ],
        activeTabId: "home",
        currentConnection: null,
      });
    }
  },
});
