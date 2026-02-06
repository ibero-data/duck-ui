import type { StateCreator } from "zustand";
import { initializeWasmConnection } from "@/services/duckdb";
import type { DuckStoreState, DuckdbSlice, ConnectionProvider } from "../types";

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
    const initialConnections: ConnectionProvider[] = [];

    const {
      DUCK_UI_EXTERNAL_CONNECTION_NAME: externalConnectionName = "",
      DUCK_UI_EXTERNAL_HOST: externalHost = "",
      DUCK_UI_EXTERNAL_PORT: externalPort = "",
      DUCK_UI_EXTERNAL_USER: externalUser = "",
      DUCK_UI_EXTERNAL_PASS: externalPass = "",
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
        database: externalDatabaseName,
        authMode: "password",
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
      await Promise.all([
        connection.query(`SET enable_http_metadata_cache=true`),
        connection.query(`INSTALL arrow`),
        connection.query(`INSTALL parquet`),
      ]);

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
