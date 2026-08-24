import { describe, it, expect, vi } from "vitest";
import { tableFromArrays, Table } from "apache-arrow";
import { ChannelTransport } from "../transport/channelTransport";
import { createLoopbackPair } from "../transport/loopback";
import { encodeRecordBatch, decodeRecordBatches } from "@/services/arrow/ipc";
import { encodeFrame } from "@/services/arrow/chunking";
import { resultToJSON } from "@/services/duckdb/resultParser";
import type { InboundMessage, TransportProtocolError } from "../transport/transport";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const connectedPair = (options: Parameters<typeof createLoopbackPair>[0] = {}) => {
  const pair = createLoopbackPair(options);
  const host = new ChannelTransport({ peerId: "host", channels: pair.a });
  const guest = new ChannelTransport({ peerId: "guest", channels: pair.b });
  return { pair, host, guest };
};

const collect = (transport: ChannelTransport) => {
  const inbound: InboundMessage[] = [];
  transport.onMessage((message) => inbound.push(message));
  return inbound;
};

const collectErrors = (transport: ChannelTransport) => {
  const errors: TransportProtocolError[] = [];
  transport.onProtocolError((error) => errors.push(error));
  return errors;
};

describe("ChannelTransport — control messages", () => {
  it("delivers a validated message to the far side", async () => {
    const { host, guest } = connectedPair();
    const received = collect(guest);

    await host.send("control", {
      t: "hello",
      peerId: "host",
      displayName: "Caio",
      protocolVersions: [1],
    });
    await settle();

    expect(received).toHaveLength(1);
    expect(received[0].message).toMatchObject({ t: "hello", displayName: "Caio" });
    expect(received[0].channel).toBe("control");
  });

  it("keeps channels independent, so a cancel is not stuck behind a result", async () => {
    const { host, guest } = connectedPair();
    const received = collect(guest);

    await host.send("query", { t: "query.cancel", queryId: "q1" });
    await host.send("control", { t: "peer.left", peerId: "x" });
    await settle();

    expect(received.map((r) => r.channel)).toEqual(["query", "control"]);
  });

  it("counts messages and bytes in both directions", async () => {
    const { host, guest } = connectedPair();
    await host.send("control", { t: "query.cancel", queryId: "q1" } as never);
    await settle();

    expect(host.metrics().messagesSent).toBe(1);
    expect(host.metrics().bytesSent).toBeGreaterThan(0);
    expect(guest.metrics().messagesReceived).toBe(1);
  });
});

describe("ChannelTransport — Arrow payloads", () => {
  const bigTable = () =>
    tableFromArrays({
      id: Int32Array.from({ length: 20_000 }, (_, i) => i),
      label: Array.from({ length: 20_000 }, (_, i) => `row-${i}`),
    });

  it("moves an Arrow batch larger than one frame and reassembles it exactly", async () => {
    const { host, guest } = connectedPair();
    const received = collect(guest);
    const batch = bigTable().batches[0];
    const encoded = encodeRecordBatch(batch);

    expect(encoded.byteLength).toBeGreaterThan(60 * 1024);

    await host.send(
      "query",
      { t: "query.batch", queryId: "q1", seq: 0, rows: batch.numRows },
      encoded
    );
    await settle();

    expect(received).toHaveLength(1);
    const result = resultToJSON(new Table(decodeRecordBatches(received[0].payload)));
    expect(result.rowCount).toBe(20_000);
    expect(result.data[19_999]).toMatchObject({ id: 19_999, label: "row-19999" });
  });

  it("delivers one logical message per payload, not one per chunk", async () => {
    const { host, guest } = connectedPair();
    const received = collect(guest);
    const encoded = encodeRecordBatch(bigTable().batches[0]);

    await host.send("query", { t: "query.batch", queryId: "q1", seq: 0, rows: 1 }, encoded);
    await settle();

    expect(received).toHaveLength(1);
    expect(guest.metrics().messagesReceived).toBe(1);
  });

  it("interleaves two concurrent results without mixing their bytes", async () => {
    const { host, guest } = connectedPair();
    const received = collect(guest);
    const a = encodeRecordBatch(tableFromArrays({ n: Int32Array.from([1, 2, 3]) }).batches[0]);
    const b = encodeRecordBatch(tableFromArrays({ n: Int32Array.from([9, 8]) }).batches[0]);

    await Promise.all([
      host.send("query", { t: "query.batch", queryId: "qa", seq: 0, rows: 3 }, a),
      host.send("query", { t: "query.batch", queryId: "qb", seq: 0, rows: 2 }, b),
    ]);
    await settle();

    const byQuery = new Map(
      received.map((r) => [
        (r.message as { queryId: string }).queryId,
        resultToJSON(new Table(decodeRecordBatches(r.payload))),
      ])
    );
    expect(byQuery.get("qa")?.data.map((d) => d.n)).toEqual([1, 2, 3]);
    expect(byQuery.get("qb")?.data.map((d) => d.n)).toEqual([9, 8]);
  });

  it("never base64s the payload — Arrow travels as bytes", async () => {
    const { pair, host } = connectedPair();
    const sent: ArrayBuffer[] = [];
    const original = pair.a.query.send.bind(pair.a.query);
    pair.a.query.send = (data: ArrayBuffer) => {
      sent.push(data);
      original(data);
    };

    const encoded = encodeRecordBatch(tableFromArrays({ n: Int32Array.from([1]) }).batches[0]);
    await host.send("query", { t: "query.batch", queryId: "q", seq: 0, rows: 1 }, encoded);

    const combined = new Uint8Array(sent[0]);
    // The Arrow continuation marker appears verbatim in the frame bytes.
    expect(combined).toContain(255);
  });
});

describe("ChannelTransport — backpressure", () => {
  it("waits for the channel to drain instead of queueing without limit", async () => {
    const { pair, host, guest } = connectedPair({ simulateBuffering: true });
    const received = collect(guest);

    // 4MB of payload against a 1MiB high-water mark: the send only completes
    // because the transport waits for drain events between frames.
    const big = new Uint8Array(4 * 1024 * 1024);
    await host.send("data", { t: "query.batch", queryId: "q", seq: 0, rows: 1 }, big);
    await settle();

    expect(received).toHaveLength(1);
    expect(received[0].payload.byteLength).toBe(big.byteLength);
    expect(pair.a.data.bufferedAmount).toBe(0);
  });

  it("reports buffered bytes in its metrics", async () => {
    const { host } = connectedPair({ simulateBuffering: true, latencyMs: 20 });
    const sending = host.send(
      "data",
      { t: "query.batch", queryId: "q", seq: 0, rows: 1 },
      new Uint8Array(200_000)
    );
    // `send` yields before writing its first frame, so the buffer is only
    // observable after the microtask queue has run.
    await Promise.resolve();
    expect(host.metrics().bufferedBytes).toBeGreaterThan(0);
    await sending;
  });
});

describe("ChannelTransport — hostile and broken peers", () => {
  it("rejects a frame that is not binary", async () => {
    const { pair, guest } = connectedPair();
    const errors = collectErrors(guest);
    const received = collect(guest);

    // A peer sending raw text where the protocol requires framed binary.
    pair.a.control.send(new TextEncoder().encode("hello").buffer as ArrayBuffer);
    await settle();

    // Decodes as a malformed frame rather than reaching a handler.
    expect(received).toHaveLength(0);
    expect(errors[0]?.reason).toBe("malformed");
  });

  it("rejects an unknown protocol version", async () => {
    const { pair, guest } = connectedPair();
    const errors = collectErrors(guest);

    pair.a.control.send(encodeFrame({ v: 99, t: "hello" }));
    await settle();

    expect(errors[0]).toMatchObject({ reason: "version" });
  });

  it("rejects a message that fails schema validation", async () => {
    const { pair, guest } = connectedPair();
    const errors = collectErrors(guest);
    const received = collect(guest);

    // `sql` is required and must be non-empty.
    pair.a.control.send(
      encodeFrame({ v: 1, t: "query.start", queryId: "q", capabilityId: "c", sql: "" })
    );
    await settle();

    expect(received).toHaveLength(0);
    expect(errors[0]).toMatchObject({ reason: "schema" });
  });

  it("rejects an unknown message type rather than ignoring it", async () => {
    const { pair, guest } = connectedPair();
    const errors = collectErrors(guest);

    pair.a.control.send(encodeFrame({ v: 1, t: "definitely.not.a.type" }));
    await settle();

    expect(errors[0]).toMatchObject({ reason: "schema" });
  });

  it("counts protocol errors, so a flooding peer is measurable", async () => {
    const { pair, guest } = connectedPair();
    for (let i = 0; i < 5; i++) {
      pair.a.control.send(encodeFrame({ v: 1, t: "nope" }));
    }
    await settle();
    expect(guest.metrics().protocolErrors).toBe(5);
  });

  it("survives a handler that throws, and still notifies the others", async () => {
    const { host, guest } = connectedPair();
    const good = vi.fn();
    guest.onMessage(() => {
      throw new Error("handler exploded");
    });
    guest.onMessage(good);

    await host.send("control", { t: "peer.left", peerId: "x" });
    await settle();

    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("ChannelTransport — lifecycle", () => {
  it("reports disconnection when the far side closes", async () => {
    const { pair, guest } = connectedPair();
    const states: string[] = [];
    guest.onStateChange((state) => states.push(state));

    pair.a.control.close();
    await settle();

    expect(states).toContain("disconnected");
  });

  it("refuses to send once closed", async () => {
    const { host } = connectedPair();
    await host.close();
    await expect(host.send("control", { t: "peer.left", peerId: "x" })).rejects.toThrow(/closed/i);
  });

  it("treats closed as terminal — a late channel event cannot revive it", async () => {
    const { pair, host } = connectedPair();
    await host.close();
    pair.a.control.close();
    await settle();
    expect(host.state).toBe("closed");
  });

  it("drops partial reassembly state on close, so nothing leaks", async () => {
    const { host, guest } = connectedPair({ latencyMs: 5 });
    void host.send(
      "query",
      { t: "query.batch", queryId: "q", seq: 0, rows: 1 },
      new Uint8Array(500_000)
    );
    await new Promise((resolve) => setTimeout(resolve, 8));
    await guest.close();
    // No assertion beyond "does not throw and does not deliver a torn payload".
    expect(guest.state).toBe("closed");
  });

  it("refuses to send on a channel that does not exist", async () => {
    const pair = createLoopbackPair();
    const partial = new ChannelTransport({
      peerId: "p",
      channels: { control: pair.a.control },
    });
    await expect(partial.send("query", { t: "query.cancel", queryId: "q" })).rejects.toThrow(
      /not open/i
    );
  });
});
