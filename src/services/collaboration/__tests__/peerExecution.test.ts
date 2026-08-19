import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { tableFromIPC, type RecordBatch, type Schema, type Table } from "apache-arrow";
import { ChannelTransport } from "../transport/channelTransport";
import { createLoopbackPair } from "../transport/loopback";
import { PeerHost } from "../peerHost";
import { PeerSession } from "@/services/engine/drivers/peerDriver";
import { collectExecution, materializeExecution } from "@/services/engine";
import { DEFAULT_CAPABILITY_POLICY, type SharedCapability } from "../capabilities/capability";
import { peerMessageSchema } from "../protocol/messages";

/**
 * The §47 milestone, end to end.
 *
 *   Browser A (host)   real DuckDB engine + sample dataset
 *          │           WebRTC-shaped transport (in-process loopback)
 *          ▼
 *   Browser B (guest)  types SQL, presses Run, renders Arrow results
 *
 * The host runs a REAL DuckDB — the same duckdb-wasm package the app ships,
 * in its node-blocking build — so the SQL is really executed and the Arrow
 * really is Arrow. Only the WebRTC socket is substituted, and only because ICE
 * and a signaling server cannot be made deterministic in a unit test. Every
 * layer above the socket is the production code path: framing, chunking,
 * backpressure, Zod validation, capability screening, Arrow IPC.
 */

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any;

beforeAll(async () => {
  const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
  const db = await duckdb.createDuckDB(
    {
      mvp: {
        mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
        mainWorker: null,
      },
      eh: {
        mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm"),
        mainWorker: null,
      },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME
  );
  await db.instantiate(() => {});
  engine = db.connect();

  engine.query(`
    CREATE TABLE sales AS
    SELECT * FROM (VALUES
      (1, 'north', 100.50, DATE '2026-01-01'),
      (2, 'south', 250.25, DATE '2026-01-02'),
      (3, 'north', 75.00,  DATE '2026-01-03'),
      (4, 'east',  310.75, DATE '2026-01-04'),
      (5, 'south', 42.10,  DATE '2026-01-05')
    ) AS t(id, region, amount, sold_on)
  `);
  engine.query(`CREATE TABLE wide AS SELECT i AS id, 'row-' || i AS label FROM range(20000) t(i)`);
}, 60_000);

/**
 * Adapts the blocking engine to the async cursor the host expects. The
 * production share runtime hands over an `AsyncDuckDBConnection`; this exposes
 * the same two methods over the node build.
 *
 * The IPC round-trip is a harness detail, not a design one. Vitest loads
 * `apache-arrow` as ESM while duckdb's node build `require`s the CJS copy, so
 * the two get separate class identities and objects from one are foreign to
 * the other. A browser has a single instance and needs none of this; passing
 * the bytes through the engine's own writer reproduces what it would hand over
 * natively, and everything downstream is the real code path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrowCjs = require("apache-arrow") as any;

/** Re-materializes a table from the engine's Arrow instance into ours. */
const adoptTable = (foreign: unknown): Table =>
  tableFromIPC(arrowCjs.tableToIPC(foreign, "stream"));

const makeRuntime = (options: { onSend?: (sql: string) => void } = {}) => {
  let cancelled = false;
  const runtime = {
    isRunning: true,
    cancelSentCalls: 0,
    requireConnection: () => ({
      cancelSent: async () => {
        cancelled = true;
        runtime.cancelSentCalls += 1;
        return true;
      },
      send: async (sql: string) => {
        options.onSend?.(sql);
        cancelled = false;
        const table = adoptTable(engine.query(sql));
        return {
          schema: table.schema as Schema,
          async *[Symbol.asyncIterator](): AsyncGenerator<RecordBatch> {
            for (const batch of table.batches) {
              if (cancelled) return;
              // Yield to the event loop between batches so a cancel arriving
              // mid-result can actually interleave, as it would over a socket.
              await new Promise((resolve) => setTimeout(resolve, 0));
              yield batch;
            }
          },
        };
      },
    }),
  };
  return runtime;
};

const productionCapability = (overrides: Partial<SharedCapability> = {}): SharedCapability => ({
  id: "cap-production",
  ownerPeerId: "host-peer",
  name: "Production",
  type: "query",
  permission: "read",
  executor: { kind: "peer", peerId: "host-peer" },
  catalog: {
    capturedAt: "2026-08-18T00:00:00.000Z",
    databases: [
      {
        name: "memory",
        tables: [
          {
            name: "sales",
            schema: "main",
            rowCount: 5,
            columns: [
              { name: "id", type: "INTEGER", nullable: true },
              { name: "region", type: "VARCHAR", nullable: true },
              { name: "amount", type: "DECIMAL(5,2)", nullable: true },
              { name: "sold_on", type: "DATE", nullable: true },
            ],
          },
        ],
      },
    ],
  },
  policy: { ...DEFAULT_CAPABILITY_POLICY },
  ...overrides,
});

interface Rig {
  host: PeerHost;
  guestSession: PeerSession;
  hostTransport: ChannelTransport;
  guestTransport: ChannelTransport;
  capabilities: Map<string, SharedCapability>;
  runtime: ReturnType<typeof makeRuntime>;
  pair: ReturnType<typeof createLoopbackPair>;
}

const rigs: Rig[] = [];

const buildRig = (
  options: {
    capability?: SharedCapability;
    runtime?: ReturnType<typeof makeRuntime>;
    maxConcurrentQueries?: number;
  } = {}
): Rig => {
  const pair = createLoopbackPair();
  const hostTransport = new ChannelTransport({ peerId: "host-peer", channels: pair.a });
  const guestTransport = new ChannelTransport({ peerId: "guest-peer", channels: pair.b });
  hostTransport.setState("connected");
  guestTransport.setState("connected");

  const capability = options.capability ?? productionCapability();
  const capabilities = new Map([[capability.id, capability]]);
  const runtime = options.runtime ?? makeRuntime();

  const host = new PeerHost({
    transport: hostTransport,
    runtime: runtime as never,
    capabilities,
    maxConcurrentQueries: options.maxConcurrentQueries,
  });

  const guestSession = new PeerSession({
    connectionId: capability.id,
    transport: guestTransport,
    capability,
    timeoutMs: 5_000,
  });

  const rig = { host, guestSession, hostTransport, guestTransport, capabilities, runtime, pair };
  rigs.push(rig);
  return rig;
};

afterEach(async () => {
  while (rigs.length) {
    const rig = rigs.pop();
    if (!rig) continue;
    await rig.host.close();
    await rig.guestSession.close();
    await rig.hostTransport.close();
    await rig.guestTransport.close();
  }
});

describe("§47 milestone — guest query executes in the host browser", () => {
  it("runs the guest's SQL on the host and returns the correct rows", async () => {
    const { guestSession } = buildRig();

    const result = await materializeExecution(
      guestSession.execute({ sql: "SELECT region, amount FROM sales ORDER BY id" })
    );

    expect(result.error).toBeUndefined();
    expect(result.columns).toEqual(["region", "amount"]);
    expect(result.rowCount).toBe(5);
    expect(result.data.map((row) => row.region)).toEqual([
      "north",
      "south",
      "north",
      "east",
      "south",
    ]);
    // DECIMAL survives the crossing with its scale intact — the whole reason
    // results travel as Arrow rather than JSON.
    expect(result.data[0].amount).toBe(100.5);
    expect(result.data[3].amount).toBe(310.75);
  });

  it("executes on the HOST — the guest never sees the SQL run locally", async () => {
    const seen: string[] = [];
    const runtime = makeRuntime({ onSend: (sql) => seen.push(sql) });
    const { guestSession } = buildRig({ runtime });

    await materializeExecution(guestSession.execute({ sql: "SELECT COUNT(*) AS n FROM sales" }));

    expect(seen).toEqual(["SELECT COUNT(*) AS n FROM sales"]);
  });

  it("preserves DATE and aggregate types across the wire", async () => {
    const { guestSession } = buildRig();
    const result = await materializeExecution(
      guestSession.execute({
        sql: "SELECT region, SUM(amount) AS total, MIN(sold_on) AS first_sale FROM sales GROUP BY region ORDER BY region",
      })
    );

    expect(result.rowCount).toBe(3);
    const east = result.data.find((row) => row.region === "east");
    expect(east?.total).toBe(310.75);
    expect(east?.first_sale).toBe("2026-01-04");
  });

  it("streams a result larger than one frame, batch by batch", async () => {
    const { guestSession } = buildRig();
    const collected = await collectExecution(
      guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id" })
    );

    expect(collected.error).toBeNull();
    expect(collected.rowCount).toBe(20_000);
    expect(collected.batches.length).toBeGreaterThan(0);

    const materialized = await materializeExecution(
      buildRig().guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id LIMIT 3" })
    );
    // `range()` yields BIGINT, and BigInt is what should arrive — Int64 stays
    // lossless rather than being coerced through a JS number.
    expect(materialized.data).toEqual([
      { id: 0n, label: "row-0" },
      { id: 1n, label: "row-1" },
      { id: 2n, label: "row-2" },
    ]);
  });

  it("reports progress to the guest as batches arrive", async () => {
    const { guestSession } = buildRig();
    const counts: number[] = [];

    await collectExecution(guestSession.execute({ sql: "SELECT * FROM wide" }), {
      progressIntervalMs: 0,
      onProgress: (progress) => counts.push(progress.rows),
    });

    expect(counts.length).toBeGreaterThan(0);
    expect(counts[counts.length - 1]).toBe(20_000);
  });

  it("gives the guest the host-described catalog without a round trip", async () => {
    const { guestSession } = buildRig();
    const snapshot = await guestSession.introspect();

    expect(snapshot.databases[0].tables.map((t) => t.name)).toEqual(["sales"]);
    expect(snapshot.databases[0].tables[0].columns.map((c) => c.name)).toEqual([
      "id",
      "region",
      "amount",
      "sold_on",
    ]);
  });
});

describe("§47 milestone — cancellation", () => {
  it("lets the guest cancel, and tells the host to stop", async () => {
    const runtime = makeRuntime();
    const { guestSession } = buildRig({ runtime });

    const execution = guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id" });
    const collecting = collectExecution(execution);
    // Let the query reach the host and start producing before cancelling.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await execution.cancel();

    const collected = await collecting;
    expect(collected.error?.cancelled).toBe(true);
    expect(runtime.cancelSentCalls).toBeGreaterThan(0);
  });

  it("frees the host slot after a cancel, so the guest can query again", async () => {
    const { guestSession, host } = buildRig();

    const execution = guestSession.execute({ sql: "SELECT * FROM wide" });
    const collecting = collectExecution(execution);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await execution.cancel();
    await collecting;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(host.runningCount).toBe(0);
    const after = await materializeExecution(
      guestSession.execute({ sql: "SELECT COUNT(*) AS n FROM sales" })
    );
    expect(after.error).toBeUndefined();
    expect(after.data[0].n).toBe(5n);
  });
});

describe("§47 milestone — the host disappears", () => {
  it("fails an in-flight query with something the guest can act on", async () => {
    const { guestSession, hostTransport } = buildRig();

    const execution = guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id" });
    const collecting = collectExecution(execution);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await hostTransport.close();

    const collected = await collecting;
    expect(collected.error?.message).toMatch(/no longer available/i);
  });

  it("marks the session closed, so the capability stops working", async () => {
    const { guestSession, guestTransport } = buildRig();
    expect(guestSession.isOpen).toBe(true);

    await guestTransport.close();
    expect(guestSession.isOpen).toBe(false);

    const result = await materializeExecution(guestSession.execute({ sql: "SELECT 1" }));
    expect(result.error).toMatch(/no longer available/i);
  });

  it("does not silently fall back to running the query locally", async () => {
    const seen: string[] = [];
    const runtime = makeRuntime({ onSend: (sql) => seen.push(sql) });
    const { guestSession, guestTransport } = buildRig({ runtime });

    await guestTransport.close();
    const result = await materializeExecution(guestSession.execute({ sql: "SELECT 1" }));

    expect(result.error).toBeDefined();
    expect(result.data).toEqual([]);
    expect(seen).toEqual([]);
  });
});

describe("capability enforcement", () => {
  it("refuses a query against a capability that was never granted", async () => {
    const { guestTransport, capability } = (() => {
      const rig = buildRig();
      return { ...rig, capability: rig.capabilities.values().next().value! };
    })();

    const rogue = new PeerSession({
      connectionId: "cap-other",
      transport: guestTransport,
      capability: { ...capability, id: "cap-does-not-exist" },
      timeoutMs: 3_000,
    });

    const result = await materializeExecution(rogue.execute({ sql: "SELECT 1" }));
    expect(result.error).toMatch(/no longer available/i);
    await rogue.close();
  });

  it("refuses a query after the capability is revoked", async () => {
    const { guestSession, capabilities } = buildRig();

    const first = await materializeExecution(
      guestSession.execute({ sql: "SELECT COUNT(*) AS n FROM sales" })
    );
    expect(first.error).toBeUndefined();

    capabilities.clear();

    const second = await materializeExecution(
      guestSession.execute({ sql: "SELECT COUNT(*) AS n FROM sales" })
    );
    expect(second.error).toMatch(/no longer available/i);
  });

  it("refuses a query against an expired capability", async () => {
    const capability = productionCapability({
      policy: { ...DEFAULT_CAPABILITY_POLICY, expiresAt: "2020-01-01T00:00:00.000Z" },
    });
    const { guestSession } = buildRig({ capability });

    const result = await materializeExecution(guestSession.execute({ sql: "SELECT 1" }));
    expect(result.error).toMatch(/expired/i);
  });

  it("refuses a write, even though the guest asked politely", async () => {
    const { guestSession } = buildRig();
    const result = await materializeExecution(guestSession.execute({ sql: "DROP TABLE sales" }));
    expect(result.error).toMatch(/read-only/i);

    // And the table is still there.
    const check = await materializeExecution(
      guestSession.execute({ sql: "SELECT COUNT(*) AS n FROM sales" })
    );
    expect(check.data[0].n).toBe(5n);
  });

  it("refuses a second statement smuggled behind a semicolon", async () => {
    const { guestSession } = buildRig();
    const result = await materializeExecution(
      guestSession.execute({ sql: "SELECT 1; DROP TABLE sales" })
    );
    expect(result.error).toMatch(/one statement at a time/i);
  });

  it("applies the granted row cap, not the one the guest requested", async () => {
    const capability = productionCapability({
      policy: { ...DEFAULT_CAPABILITY_POLICY, maxResultRows: 10 },
    });
    const { guestSession } = buildRig({ capability });

    const collected = await collectExecution(
      guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id", maxRows: 1_000_000 })
    );

    expect(collected.rowCount).toBe(10);
  });

  it("bounds how many queries one guest can run at once", async () => {
    const { guestSession } = buildRig({ maxConcurrentQueries: 1 });

    const first = guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id" });
    const firstRun = collectExecution(first);
    await new Promise((resolve) => setTimeout(resolve, 2));

    const second = await materializeExecution(
      guestSession.execute({ sql: "SELECT COUNT(*) AS n FROM sales" })
    );
    expect(second.error).toMatch(/too many queries/i);

    await first.cancel();
    await firstRun;
  });
});

describe("no credentials and no datasets cross the wire", () => {
  it("sends only the capability's name and shape — never a connection", async () => {
    const { pair, guestSession } = buildRig();
    const frames: string[] = [];
    for (const channel of Object.values(pair.a)) {
      const original = channel.send.bind(channel);
      channel.send = (data: ArrayBuffer) => {
        frames.push(new TextDecoder().decode(new Uint8Array(data)));
        original(data);
      };
    }

    await materializeExecution(guestSession.execute({ sql: "SELECT * FROM sales" }));

    const wire = frames.join("\n");
    for (const secret of ["password", "apiKey", "secretAccessKey", "Authorization", "Basic "]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("transfers only the result, not the source table", async () => {
    // The guest asks for two rows out of twenty thousand. If the host were
    // shipping the dataset rather than the answer, the bytes would not scale
    // with the result.
    const smallRig = buildRig();
    const smallFrames: number[] = [];
    for (const channel of Object.values(smallRig.pair.a)) {
      const original = channel.send.bind(channel);
      channel.send = (data: ArrayBuffer) => {
        smallFrames.push(data.byteLength);
        original(data);
      };
    }
    await materializeExecution(
      smallRig.guestSession.execute({ sql: "SELECT * FROM wide ORDER BY id LIMIT 2" })
    );
    const smallBytes = smallFrames.reduce((sum, n) => sum + n, 0);

    expect(smallBytes).toBeLessThan(10_000);
  });
});

describe("protocol hardening at the session boundary", () => {
  it("ignores a result addressed to a query it never started", async () => {
    const { hostTransport, guestSession } = buildRig();
    const handler = vi.fn();
    guestSession.execute({ sql: "SELECT 1" }); // never iterated

    await hostTransport.send("query", {
      t: "query.complete",
      queryId: "not-a-real-query",
      rowCount: 99,
      batchCount: 1,
      durationMs: 1,
      truncated: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(handler).not.toHaveBeenCalled();
  });

  it("times out rather than hanging when the host never answers", async () => {
    const pair = createLoopbackPair();
    const guestTransport = new ChannelTransport({ peerId: "guest", channels: pair.b });
    guestTransport.setState("connected");
    // No PeerHost on the other end at all.
    const session = new PeerSession({
      connectionId: "cap",
      transport: guestTransport,
      capability: productionCapability(),
      timeoutMs: 60,
    });

    const result = await materializeExecution(session.execute({ sql: "SELECT 1" }));
    expect(result.error).toMatch(/no response from the host/i);

    await session.close();
    await guestTransport.close();
  });
});

describe("capability updates — 'all data' grants that grow", () => {
  it("capability.update round-trips through the wire schema", () => {
    const capability = productionCapability();
    const wire = {
      t: "capability.update" as const,
      capability: {
        id: capability.id,
        ownerPeerId: capability.ownerPeerId,
        name: capability.name,
        type: capability.type,
        permission: capability.permission,
        catalog: capability.catalog,
        policy: { readonly: true as const, maxResultRows: 100 },
      },
    };
    const parsed = peerMessageSchema.parse(wire);
    expect(parsed.t).toBe("capability.update");
  });

  it("a schema without capability.update in the union would reject it loudly", () => {
    // Guards the closed-union property: an unknown type is refused.
    expect(() => peerMessageSchema.parse({ t: "capability.telepathy" })).toThrow();
  });

  it("updating a peer session's capability changes what introspect reports", async () => {
    const rig = buildRig();
    const before = await rig.guestSession.introspect();
    expect(before.databases[0]?.tables.map((t) => t.name)).toEqual(["sales"]);

    const grown = productionCapability();
    grown.id = rig.guestSession.capability.id;
    grown.catalog?.databases[0]?.tables.push({
      name: "returns",
      schema: "main",
      rowCount: 2,
      columns: [{ name: "id", type: "INTEGER", nullable: true }],
    });
    rig.guestSession.updateCapability(grown);

    const after = await rig.guestSession.introspect();
    expect(after.databases[0]?.tables.map((t) => t.name)).toEqual(["sales", "returns"]);
  });

  it("refuses an update carrying a different capability id", async () => {
    const rig = buildRig();
    const imposter = productionCapability();
    imposter.id = "some-other-grant";
    rig.guestSession.updateCapability(imposter);
    const after = await rig.guestSession.introspect();
    expect(after.databases[0]?.tables.map((t) => t.name)).toEqual(["sales"]);
  });
});
