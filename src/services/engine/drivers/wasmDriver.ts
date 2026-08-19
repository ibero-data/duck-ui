/**
 * In-tab DuckDB-WASM, in-memory.
 *
 * This is the engine Duck-UI boots with. The heavy lifting (bundle
 * resolution, worker creation, embedded database attachment) still lives in
 * `services/duckdb/wasmConnection.ts` — the driver's job is to wrap the
 * result in a session and describe what it can do.
 */

import { initializeWasmConnection } from "@/services/duckdb/wasmConnection";
import { LOCAL_MEMORY_CAPABILITIES } from "../session";
import { LocalDuckSessionImpl, terminateLocalEngine } from "./localDuckSession";
import type { ConnectionDefinition, DataDriver, DataSession } from "../types";

export const WASM_CONNECTION_ID = "WASM";

export const wasmDriver: DataDriver<"wasm"> = {
  kind: "wasm",

  async isAvailable(): Promise<boolean> {
    return typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
  },

  async connect(definition: ConnectionDefinition<"wasm">): Promise<DataSession> {
    const { db, connection } = await initializeWasmConnection();
    return new LocalDuckSessionImpl({
      connectionId: definition.id,
      kind: "wasm",
      db,
      connection,
      capabilities: LOCAL_MEMORY_CAPABILITIES,
      teardown: terminateLocalEngine,
    });
  },

  async test(): Promise<void> {
    if (!(await wasmDriver.isAvailable())) {
      throw new Error("This browser cannot run DuckDB-WASM (WebAssembly or Workers unavailable).");
    }
  },
};

/** The built-in in-memory connection every profile starts with. */
export const builtInWasmConnection = (): ConnectionDefinition<"wasm"> => ({
  id: WASM_CONNECTION_ID,
  name: "WASM",
  origin: "APP",
  config: { kind: "wasm" },
});
