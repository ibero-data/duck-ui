import type { StateCreator } from "zustand";
import {
  builtInWasmConnection,
  closeAllSessions,
  openSession,
  requireLocalDuckSession,
  WASM_CONNECTION_ID,
} from "@/services/engine";
import type { DuckStoreState, DuckdbSlice, ConnectionProvider } from "../types";
import { localHandles, toCurrentConnection } from "./connectionSlice";
import { getSetting } from "@/services/persistence/repositories/settingsRepository";
import { clampMaxResultRows, DEFAULT_MAX_RESULT_ROWS } from "./querySlice";
import { loadAppConfig } from "@/lib/appConfig";
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
  isInitialized: false,
  isLoading: false,
  error: null,
  currentDatabase: "memory",

  initialize: async () => {
    console.info(`[DuckDB] crossOriginIsolated: ${self.crossOriginIsolated}`);
    // Load the build-time manifest first so kiosk UI flags are resolved before
    // the app renders (no flash of management panels on a locked-down deploy).
    await loadAppConfig();
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

    const wasmProvider: ConnectionProvider = {
      environment: "APP",
      id: WASM_CONNECTION_ID,
      name: "WASM",
      scope: "WASM",
    };

    initialConnections.push(wasmProvider);

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

    if (initialConnections.length === 0) {
      set({ isLoading: false, isInitialized: true });
      return;
    }

    // The in-browser engine always boots, even when an external connection is
    // the one that ends up active: file import, deep links and parquet export
    // all need it, and it is what the app falls back to.
    const session = await openSession(builtInWasmConnection());
    const { connection } = requireLocalDuckSession(session).local;

    set({
      ...localHandles(session),
      currentSession: session,
      currentConnection: toCurrentConnection(wasmProvider),
      isInitialized: true,
      currentDatabase: "memory",
    });

    // Engine tuning and extensions run on the shared connection. Each step is
    // best-effort: an offline browser still gets working basic SQL.
    const failedExtensions: string[] = [];

    try {
      await connection.query(`SET enable_http_metadata_cache=true`);
    } catch {
      console.warn("[DuckDB] Failed to set enable_http_metadata_cache");
    }

    const profileId = get().currentProfileId;

    try {
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

    // Result-row ceiling is enforced in JS by the engine layer, not by DuckDB,
    // so it only has to reach the store.
    try {
      let maxResultRows = DEFAULT_MAX_RESULT_ROWS;
      if (profileId) {
        const raw = await getSetting(profileId, "duckdb", "max_result_rows");
        if (raw) {
          const parsed = Number(JSON.parse(raw));
          if (Number.isFinite(parsed)) maxResultRows = clampMaxResultRows(parsed);
        }
      }
      set({ maxResultRows });
    } catch {
      console.warn("[DuckDB] Failed to read max_result_rows");
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

    // An ENV-configured external server takes over as the active connection.
    if (initialConnections[0].id !== WASM_CONNECTION_ID) {
      await get().setCurrentConnection(initialConnections[0].id);
    } else {
      await get().fetchDatabasesAndTablesInfo();
    }
  },

  cleanup: async () => {
    try {
      await closeAllSessions();
    } finally {
      set({
        db: null,
        connection: null,
        currentSession: null,
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
