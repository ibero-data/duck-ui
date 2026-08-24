import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  closeAllSessions,
  closeSession,
  getDriver,
  getSession,
  hasDriver,
  isKindAvailable,
  listSessions,
  openSession,
  registerDriver,
  testConnection,
} from "../registry";
import { NO_CAPABILITIES } from "../types";
import type {
  CatalogSnapshot,
  ConnectionDefinition,
  DataDriver,
  DataSession,
  QueryExecution,
} from "../types";

/** Minimal session that records nothing but its own lifecycle. */
const makeStubSession = (connectionId: string): DataSession & { closed: number } => {
  const session = {
    id: `session-${connectionId}`,
    connectionId,
    kind: "wasm" as const,
    capabilities: NO_CAPABILITIES,
    isOpen: true,
    closed: 0,
    execute: (): QueryExecution => {
      throw new Error("not used");
    },
    introspect: async (): Promise<CatalogSnapshot> => ({ databases: [], capturedAt: "" }),
    close: async () => {
      session.closed += 1;
      session.isOpen = false;
    },
  };
  return session;
};

const definition = (id: string): ConnectionDefinition<"wasm"> => ({
  id,
  name: id,
  origin: "APP",
  config: { kind: "wasm" },
});

let connect: ReturnType<typeof vi.fn>;
let test: ReturnType<typeof vi.fn>;
let originalWasmDriver: DataDriver;

beforeEach(() => {
  originalWasmDriver = getDriver("wasm") as DataDriver;
  connect = vi.fn(async (def: ConnectionDefinition) => makeStubSession(def.id));
  test = vi.fn(async () => {});
  registerDriver({
    kind: "wasm",
    isAvailable: async () => true,
    connect,
    test,
  } as unknown as DataDriver);
});

afterEach(async () => {
  await closeAllSessions();
  registerDriver(originalWasmDriver);
});

describe("driver lookup", () => {
  it("resolves every implemented driver", () => {
    expect(hasDriver("wasm")).toBe(true);
    expect(hasDriver("opfs")).toBe(true);
    expect(hasDriver("duck-http")).toBe(true);
    expect(hasDriver("peer")).toBe(true);
  });

  it("explains reserved kinds instead of failing cryptically", () => {
    expect(() => getDriver("quack")).toThrow(/Quack.*not available/i);
    expect(() => getDriver("flight-web")).toThrow(/Flight SQL.*not available/i);
  });

  it("reports reserved kinds as unavailable rather than throwing", async () => {
    await expect(isKindAvailable("quack")).resolves.toBe(false);
    await expect(isKindAvailable("wasm")).resolves.toBe(true);
  });

  it("reports peer as unavailable where WebRTC does not exist", async () => {
    // Node has no RTCPeerConnection, which is exactly the degrade-gracefully
    // path a browser without WebRTC would take.
    await expect(isKindAvailable("peer")).resolves.toBe(false);
  });

  it("treats a driver whose availability probe throws as unavailable", async () => {
    registerDriver({
      kind: "wasm",
      isAvailable: async () => {
        throw new Error("no WebAssembly");
      },
      connect,
      test,
    } as unknown as DataDriver);
    await expect(isKindAvailable("wasm")).resolves.toBe(false);
  });
});

describe("session lifecycle", () => {
  it("opens one session per connection and reuses it", async () => {
    const first = await openSession(definition("a"));
    const second = await openSession(definition("a"));

    expect(first).toBe(second);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent opens of the same connection", async () => {
    connect.mockImplementation(async (def: ConnectionDefinition) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return makeStubSession(def.id);
    });

    const [a, b, c] = await Promise.all([
      openSession(definition("racy")),
      openSession(definition("racy")),
      openSession(definition("racy")),
    ]);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("keeps separate connections on separate sessions", async () => {
    await openSession(definition("a"));
    await openSession(definition("b"));
    expect(listSessions()).toHaveLength(2);
  });

  it("does not register a session when the driver fails to connect", async () => {
    connect.mockRejectedValueOnce(new Error("engine unavailable"));
    await expect(openSession(definition("broken"))).rejects.toThrow(/engine unavailable/);
    expect(getSession("broken")).toBeNull();

    // The failed open must not poison later attempts.
    await expect(openSession(definition("broken"))).resolves.toBeDefined();
  });

  it("closes a session and forgets it", async () => {
    const session = (await openSession(definition("a"))) as ReturnType<typeof makeStubSession>;
    await closeSession("a");

    expect(session.closed).toBe(1);
    expect(getSession("a")).toBeNull();
  });

  it("closing an unknown connection is a no-op", async () => {
    await expect(closeSession("never-opened")).resolves.toBeUndefined();
  });

  it("waits for an in-flight open before closing, so no engine is orphaned", async () => {
    let resolveConnect!: (session: DataSession) => void;
    connect.mockImplementationOnce(
      () => new Promise<DataSession>((resolve) => (resolveConnect = resolve))
    );

    const opening = openSession(definition("slow"));
    const closing = closeSession("slow");
    const session = makeStubSession("slow");
    resolveConnect(session);

    await opening;
    await closing;

    expect(session.closed).toBe(1);
    expect(getSession("slow")).toBeNull();
  });

  it("forgets a session that closed itself", async () => {
    const session = (await openSession(definition("a"))) as ReturnType<typeof makeStubSession>;
    await session.close();
    expect(getSession("a")).toBeNull();
  });

  it("a close failure is logged, not thrown at the caller", async () => {
    connect.mockImplementationOnce(async () => ({
      ...makeStubSession("bad"),
      close: async () => {
        throw new Error("teardown exploded");
      },
    }));
    await openSession(definition("bad"));
    await expect(closeSession("bad")).resolves.toBeUndefined();
  });
});

describe("testConnection", () => {
  it("probes through the driver without opening a session", async () => {
    await testConnection(definition("probe"));
    expect(test).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    expect(getSession("probe")).toBeNull();
  });
});
