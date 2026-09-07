import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test for the ENV-configured external connection never being
 * auto-connected on startup: `initialize()` used to check
 * `initialConnections[0]` to decide whether to call `setCurrentConnection`,
 * but the WASM provider is always pushed first, so that check could never be
 * true and the branch was dead code.
 */

vi.mock("@/lib/appConfig", () => ({
  loadAppConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/persistence/repositories/settingsRepository", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { mockConnection, mockLocalSession } = vi.hoisted(() => {
  const connection = { query: vi.fn().mockResolvedValue(undefined) };
  return {
    mockConnection: connection,
    mockLocalSession: { kind: "local", local: { db: {}, connection } },
  };
});

vi.mock("@/services/engine", () => ({
  builtInWasmConnection: vi.fn().mockReturnValue({ id: "WASM", config: { kind: "wasm" } }),
  closeAllSessions: vi.fn().mockResolvedValue(undefined),
  openSession: vi.fn().mockResolvedValue(mockLocalSession),
  requireLocalDuckSession: vi.fn().mockReturnValue(mockLocalSession),
  WASM_CONNECTION_ID: "WASM",
}));

vi.mock("../connectionSlice", () => ({
  localHandles: vi.fn().mockReturnValue({ db: {}, connection: mockConnection }),
  toCurrentConnection: vi.fn((provider) => provider),
}));

import { createDuckdbSlice } from "../duckdbSlice";

// duckdbSlice reads `window.env` and `self.crossOriginIsolated` — this test
// runs in vitest's node environment, which has neither, so stub the minimal
// shape it needs. (Bun's own runtime aliases `self` to `globalThis`, which
// masked the missing stub locally; plain Node does not.)
(globalThis as { window?: { env?: Window["env"] } }).window ??= {};
(globalThis as { self?: typeof globalThis }).self ??= globalThis;

describe("duckdbSlice.initialize — ENV connection auto-connect", () => {
  beforeEach(() => {
    window.env = {
      DUCK_UI_EXTERNAL_CONNECTION_NAME: "prod",
      DUCK_UI_EXTERNAL_HOST: "https://duck.example.com",
      DUCK_UI_EXTERNAL_PORT: "9999",
      DUCK_UI_EXTERNAL_USER: "",
      DUCK_UI_EXTERNAL_PASS: "",
      DUCK_UI_EXTERNAL_API_KEY: "key-abc",
      DUCK_UI_EXTERNAL_DATABASE_NAME: "analytics",
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: false,
    };
  });

  it("auto-connects to the ENV connection instead of staying on WASM", async () => {
    const setCurrentConnection = vi.fn().mockResolvedValue(undefined);
    const fetchDatabasesAndTablesInfo = vi.fn().mockResolvedValue(undefined);

    let state: Record<string, unknown> = { currentProfileId: null };
    const set = (partial: unknown) => {
      const next = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...next };
    };
    const get = () => ({ ...state, setCurrentConnection, fetchDatabasesAndTablesInfo });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slice = createDuckdbSlice(set as any, get as any, undefined as any);
    await slice.initialize();

    expect(setCurrentConnection).toHaveBeenCalledTimes(1);
    expect(setCurrentConnection).toHaveBeenCalledWith("prod");
    expect(fetchDatabasesAndTablesInfo).not.toHaveBeenCalled();
  });

  it("falls back to fetchDatabasesAndTablesInfo when no ENV connection is configured", async () => {
    window.env = {
      DUCK_UI_EXTERNAL_CONNECTION_NAME: "",
      DUCK_UI_EXTERNAL_HOST: "",
      DUCK_UI_EXTERNAL_PORT: "",
      DUCK_UI_EXTERNAL_USER: "",
      DUCK_UI_EXTERNAL_PASS: "",
      DUCK_UI_EXTERNAL_API_KEY: "",
      DUCK_UI_EXTERNAL_DATABASE_NAME: "",
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: false,
    };

    const setCurrentConnection = vi.fn().mockResolvedValue(undefined);
    const fetchDatabasesAndTablesInfo = vi.fn().mockResolvedValue(undefined);

    let state: Record<string, unknown> = { currentProfileId: null };
    const set = (partial: unknown) => {
      const next = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...next };
    };
    const get = () => ({ ...state, setCurrentConnection, fetchDatabasesAndTablesInfo });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slice = createDuckdbSlice(set as any, get as any, undefined as any);
    await slice.initialize();

    expect(setCurrentConnection).not.toHaveBeenCalled();
    expect(fetchDatabasesAndTablesInfo).toHaveBeenCalledTimes(1);
  });
});
