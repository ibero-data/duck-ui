import type { StateCreator } from "zustand";
import { toast } from "sonner";
import {
  testExternalConnection,
  testOPFSConnection,
  cleanupOPFSConnection,
} from "@/services/duckdb";
import type { DuckStoreState, ConnectionSlice } from "../types";
import {
  saveConnection,
  deleteConnection as deleteConnectionRepo,
} from "@/services/persistence/repositories/connectionRepository";

export const createConnectionSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  ConnectionSlice
> = (set, get) => ({
  currentConnection: null,
  connectionList: {
    connections: [],
  },
  isLoadingExternalConnection: false,

  addConnection: async (connection) => {
    try {
      set({ isLoadingExternalConnection: true, error: null });

      if (get().connectionList.connections.find((c) => c.name === connection.name)) {
        throw new Error(`A connection with the name "${connection.name}" already exists.`);
      }

      if (connection.scope === "External") {
        await testExternalConnection(connection);
      } else if (connection.scope === "OPFS") {
        const { opfsDb, opfsConnection, currentConnection } = get();
        if (opfsDb && opfsConnection) {
          await cleanupOPFSConnection(opfsDb, opfsConnection, currentConnection?.path);
        }
        await testOPFSConnection(connection);
      }

      set((state) => ({
        connectionList: {
          connections: [...state.connectionList.connections, connection],
        },
      }));

      // Persist to DB (fire-and-forget)
      const { currentProfileId, encryptionKey } = get();
      if (currentProfileId) {
        const config: Record<string, unknown> = {
          host: connection.host,
          port: connection.port,
          database: connection.database,
          path: connection.path,
          authMode: connection.authMode,
        };
        const credentials: Record<string, unknown> = {};
        if (connection.password) credentials.password = connection.password;
        if (connection.apiKey) credentials.apiKey = connection.apiKey;

        saveConnection(
          currentProfileId,
          {
            name: connection.name,
            scope: connection.scope ?? "External",
            config,
            credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
            environment: connection.environment ?? "APP",
          },
          encryptionKey
        ).catch((err) => console.warn("[Connection] Failed to persist:", err));
      }

      toast.success(`Connection "${connection.name}" added successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      set({ error: `Failed to add connection: ${errorMessage}` });
      toast.error(`Failed to add connection: ${errorMessage}`);
      throw error;
    } finally {
      set({ isLoadingExternalConnection: false });
    }
  },

  updateConnection: (connection) => {
    set((state) => ({
      connectionList: {
        connections: state.connectionList.connections.map((c) =>
          c.id === connection.id ? connection : c
        ),
      },
    }));
  },

  deleteConnection: (id) => {
    set((state) => ({
      connectionList: {
        connections: state.connectionList.connections.filter((c) => c.id !== id),
      },
    }));
    deleteConnectionRepo(id).catch((err) =>
      console.warn("[Connection] Failed to delete from DB:", err)
    );
  },

  setCurrentConnection: async (connectionId) => {
    try {
      set({ isLoading: true });
      const connectionProvider = get().connectionList.connections.find(
        (c) => c.id === connectionId
      );
      if (!connectionProvider) {
        throw new Error(`Connection with ID ${connectionId} not found.`);
      }

      const { wasmDb, wasmConnection, opfsDb, opfsConnection } = get();

      if (connectionProvider.scope === "WASM") {
        if (!wasmDb || !wasmConnection) {
          throw new Error("WASM connection not initialized");
        }
        set({
          db: wasmDb,
          connection: wasmConnection,
          currentConnection: {
            environment: connectionProvider.environment,
            id: connectionProvider.id,
            name: connectionProvider.name,
            scope: connectionProvider.scope,
          },
          currentDatabase: "memory",
        });
      } else if (connectionProvider.scope === "OPFS") {
        const needsNewConnection =
          !opfsDb || !opfsConnection || connectionProvider.path !== get().currentConnection?.path;

        if (needsNewConnection) {
          toast.info("Initializing OPFS connection...");

          if (opfsDb && opfsConnection) {
            await cleanupOPFSConnection(opfsDb, opfsConnection, get().currentConnection?.path);
          }

          const opfsInstance = await testOPFSConnection(connectionProvider);

          set({
            db: opfsInstance.db,
            connection: opfsInstance.connection,
            opfsDb: opfsInstance.db,
            opfsConnection: opfsInstance.connection,
            currentConnection: {
              environment: connectionProvider.environment,
              id: connectionProvider.id,
              name: connectionProvider.name,
              scope: connectionProvider.scope,
              path: connectionProvider.path,
            },
            currentDatabase: connectionProvider.path?.replace(/\.db$/, "") || "opfs",
          });
        } else {
          set({
            db: opfsDb,
            connection: opfsConnection,
            currentConnection: {
              environment: connectionProvider.environment,
              id: connectionProvider.id,
              name: connectionProvider.name,
              scope: connectionProvider.scope,
              path: connectionProvider.path,
            },
            currentDatabase: connectionProvider.path?.replace(/\.db$/, "") || "opfs",
          });
        }
      } else if (connectionProvider.scope === "External") {
        set({
          db: null,
          connection: null,
          currentConnection: {
            environment: connectionProvider.environment,
            id: connectionProvider.id,
            name: connectionProvider.name,
            scope: connectionProvider.scope,
            host: connectionProvider.host,
            port: connectionProvider.port,
            user: connectionProvider.user,
            password: connectionProvider.password,
            database: connectionProvider.database,
            authMode: connectionProvider.authMode,
            apiKey: connectionProvider.apiKey,
          },
          currentDatabase: connectionProvider.database || "external",
        });
      }

      set({ isLoading: false });
      await get().fetchDatabasesAndTablesInfo();
      toast.success(`Connected to ${connectionProvider.name}`);
    } catch (error) {
      set({
        error: `Failed to set current connection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        isLoading: false,
      });
      toast.error(`Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      set({ isLoading: false });
    }
  },

  getConnection: (connectionId) => {
    return get().connectionList.connections.find((c) => c.id === connectionId);
  },
});
