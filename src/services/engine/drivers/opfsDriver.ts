/**
 * In-tab DuckDB-WASM backed by an OPFS file.
 *
 * Same engine as the `wasm` driver, but the database lives in the origin
 * private file system, so it survives a reload. It needs cross-origin
 * isolation (SharedArrayBuffer) and it holds an exclusive lock on the file,
 * which is why teardown waits for the browser to release the handle before
 * the path is considered free again.
 */

import { cleanupOPFSConnection, testOPFSConnection } from "@/services/duckdb/opfsConnection";
import { LOCAL_OPFS_CAPABILITIES } from "../session";
import { LocalDuckSessionImpl } from "./localDuckSession";
import type { ConnectionDefinition, DataDriver, DataSession } from "../types";

export const opfsDriver: DataDriver<"opfs"> = {
  kind: "opfs",

  async isAvailable(): Promise<boolean> {
    if (!self.crossOriginIsolated) return false;
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  },

  async connect(definition: ConnectionDefinition<"opfs">): Promise<DataSession> {
    const { path } = definition.config;
    const { db, connection } = await testOPFSConnection(path);

    return new LocalDuckSessionImpl({
      connectionId: definition.id,
      kind: "opfs",
      db,
      connection,
      capabilities: LOCAL_OPFS_CAPABILITIES,
      // Not `terminateLocalEngine`: the OPFS path lock must be released too,
      // and the browser needs a moment to hand the file handle back.
      teardown: (engineDb, engineConnection) =>
        cleanupOPFSConnection(engineDb, engineConnection, path),
    });
  },

  async test(definition: ConnectionDefinition<"opfs">): Promise<void> {
    const { db, connection } = await testOPFSConnection(definition.config.path);
    await cleanupOPFSConnection(db, connection, definition.config.path);
  },
};
