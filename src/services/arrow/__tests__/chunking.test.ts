import { describe, it, expect } from "vitest";
import {
  ChunkAssembler,
  decodeFrame,
  encodeFrame,
  splitPayload,
  MAX_CHUNK_BYTES,
  MAX_HEADER_BYTES,
} from "../chunking";

const bytes = (length: number, seed = 0): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => (i + seed) % 256);

describe("frame encoding", () => {
  it("round-trips a header and payload", () => {
    const payload = bytes(1024);
    const frame = decodeFrame(encodeFrame({ t: "query.batch", seq: 3 }, payload));

    expect(frame.header).toEqual({ t: "query.batch", seq: 3 });
    expect(Array.from(frame.payload)).toEqual(Array.from(payload));
  });

  it("round-trips a header with no payload", () => {
    const frame = decodeFrame(encodeFrame({ t: "query.cancel" }));
    expect(frame.header).toEqual({ t: "query.cancel" });
    expect(frame.payload.byteLength).toBe(0);
  });

  it("preserves arbitrary bytes, including nulls and high bytes", () => {
    const payload = new Uint8Array([0, 255, 0, 128, 1, 254]);
    const frame = decodeFrame(encodeFrame({ t: "x" }, payload));
    expect(Array.from(frame.payload)).toEqual([0, 255, 0, 128, 1, 254]);
  });

  it("refuses a header past the size limit", () => {
    const huge = { t: "x", pad: "a".repeat(MAX_HEADER_BYTES + 1) };
    expect(() => encodeFrame(huge)).toThrow(/exceeds/i);
  });
});

describe("frame decoding — hostile input", () => {
  it("rejects a frame too short to hold a length", () => {
    expect(() => decodeFrame(new ArrayBuffer(2))).toThrow(/too short/i);
  });

  it("rejects a header length that runs past the frame", () => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setUint32(0, 9999, true);
    expect(() => decodeFrame(buffer)).toThrow(/past the end/i);
  });

  it("rejects an absurd declared header length without allocating", () => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setUint32(0, 0xffffffff, true);
    expect(() => decodeFrame(buffer)).toThrow(/over the limit/i);
  });

  it("rejects a header that is not valid JSON", () => {
    const bad = new TextEncoder().encode("{not json");
    const buffer = new ArrayBuffer(4 + bad.byteLength);
    new DataView(buffer).setUint32(0, bad.byteLength, true);
    new Uint8Array(buffer).set(bad, 4);
    expect(() => decodeFrame(buffer)).toThrow(/not valid JSON/i);
  });
});

describe("splitPayload", () => {
  it("leaves a payload under the limit in one piece", () => {
    expect(splitPayload(bytes(100), 1000)).toHaveLength(1);
  });

  it("splits on an exact multiple without emitting an empty tail", () => {
    const chunks = splitPayload(bytes(300), 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.byteLength === 100)).toBe(true);
  });

  it("yields one chunk for an empty payload, so it can still complete", () => {
    const chunks = splitPayload(new Uint8Array(0));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].byteLength).toBe(0);
  });

  it("defaults to a size every WebRTC implementation must accept", () => {
    expect(MAX_CHUNK_BYTES).toBeLessThanOrEqual(64 * 1024);
    expect(splitPayload(bytes(200_000)).every((c) => c.byteLength <= MAX_CHUNK_BYTES)).toBe(true);
  });

  it("rejects a non-positive chunk size instead of looping forever", () => {
    expect(() => splitPayload(bytes(10), 0)).toThrow(/positive/i);
  });
});

describe("ChunkAssembler", () => {
  const reassemble = (payload: Uint8Array, chunkBytes: number, order?: number[]) => {
    const assembler = new ChunkAssembler();
    const chunks = splitPayload(payload, chunkBytes);
    const info = (index: number) => ({
      index,
      count: chunks.length,
      totalBytes: payload.byteLength,
    });
    const sequence = order ?? chunks.map((_, i) => i);

    let result: Uint8Array | null = null;
    for (const index of sequence) {
      result = assembler.accept("m1", info(index), chunks[index]) ?? result;
    }
    return { result, assembler };
  };

  it("reassembles chunks delivered in order", () => {
    const payload = bytes(1000);
    const { result } = reassemble(payload, 100);
    expect(result && Array.from(result)).toEqual(Array.from(payload));
  });

  it("reassembles chunks delivered out of order", () => {
    const payload = bytes(1000, 7);
    const { result } = reassemble(payload, 100, [9, 0, 5, 3, 1, 8, 2, 7, 4, 6]);
    expect(result && Array.from(result)).toEqual(Array.from(payload));
  });

  it("returns null until the final chunk lands", () => {
    const assembler = new ChunkAssembler();
    const chunks = splitPayload(bytes(300), 100);
    expect(assembler.accept("m", { index: 0, count: 3, totalBytes: 300 }, chunks[0])).toBeNull();
    expect(assembler.accept("m", { index: 1, count: 3, totalBytes: 300 }, chunks[1])).toBeNull();
    expect(
      assembler.accept("m", { index: 2, count: 3, totalBytes: 300 }, chunks[2])
    ).not.toBeNull();
  });

  it("keeps concurrent messages separate", () => {
    const assembler = new ChunkAssembler();
    const a = splitPayload(bytes(200, 1), 100);
    const b = splitPayload(bytes(200, 99), 100);

    assembler.accept("a", { index: 0, count: 2, totalBytes: 200 }, a[0]);
    assembler.accept("b", { index: 0, count: 2, totalBytes: 200 }, b[0]);
    assembler.accept("b", { index: 1, count: 2, totalBytes: 200 }, b[1]);
    const finishedA = assembler.accept("a", { index: 1, count: 2, totalBytes: 200 }, a[1]);

    expect(finishedA && Array.from(finishedA)).toEqual(Array.from(bytes(200, 1)));
  });

  it("releases memory once a message completes", () => {
    const { assembler } = reassemble(bytes(300), 100);
    expect(assembler.pendingCount).toBe(0);
  });

  it("ignores a duplicate chunk rather than double-counting it", () => {
    const assembler = new ChunkAssembler();
    const chunks = splitPayload(bytes(200), 100);
    assembler.accept("m", { index: 0, count: 2, totalBytes: 200 }, chunks[0]);
    expect(assembler.accept("m", { index: 0, count: 2, totalBytes: 200 }, chunks[0])).toBeNull();
    const done = assembler.accept("m", { index: 1, count: 2, totalBytes: 200 }, chunks[1]);
    expect(done?.byteLength).toBe(200);
  });

  it("discards a partial message on request", () => {
    const assembler = new ChunkAssembler();
    assembler.accept("m", { index: 0, count: 2, totalBytes: 200 }, bytes(100));
    assembler.discard("m");
    expect(assembler.pendingCount).toBe(0);
  });
});

describe("ChunkAssembler — hostile input", () => {
  const assembler = () => new ChunkAssembler(1000);

  it("refuses a message larger than the cap, before allocating it", () => {
    expect(() =>
      assembler().accept("m", { index: 0, count: 1, totalBytes: 10_000 }, bytes(10))
    ).toThrow(/over the .* limit/i);
  });

  it("refuses an index outside the declared range", () => {
    expect(() =>
      assembler().accept("m", { index: 5, count: 2, totalBytes: 100 }, bytes(10))
    ).toThrow(/outside the declared range/i);
  });

  it("refuses a non-positive chunk count", () => {
    expect(() =>
      assembler().accept("m", { index: 0, count: 0, totalBytes: 100 }, bytes(10))
    ).toThrow(/positive integer/i);
  });

  it("refuses a non-integer index", () => {
    expect(() =>
      assembler().accept("m", { index: 1.5, count: 3, totalBytes: 100 }, bytes(10))
    ).toThrow(/outside the declared range/i);
  });

  it("refuses a chunk that contradicts the earlier declaration", () => {
    const a = assembler();
    a.accept("m", { index: 0, count: 3, totalBytes: 300 }, bytes(100));
    expect(() => a.accept("m", { index: 1, count: 9, totalBytes: 300 }, bytes(100))).toThrow(
      /contradicts/i
    );
  });

  it("drops the partial message when a contradiction is detected", () => {
    const a = assembler();
    a.accept("m", { index: 0, count: 3, totalBytes: 300 }, bytes(100));
    expect(() => a.accept("m", { index: 1, count: 9, totalBytes: 300 }, bytes(100))).toThrow();
    expect(a.pendingCount).toBe(0);
  });

  it("refuses chunks whose bytes exceed the declared total", () => {
    const a = assembler();
    a.accept("m", { index: 0, count: 2, totalBytes: 150 }, bytes(100));
    expect(() => a.accept("m", { index: 1, count: 2, totalBytes: 150 }, bytes(100))).toThrow(
      /exceed the declared/i
    );
  });

  it("refuses a completed message whose bytes fall short of the declaration", () => {
    const a = assembler();
    a.accept("m", { index: 0, count: 2, totalBytes: 200 }, bytes(50));
    expect(() => a.accept("m", { index: 1, count: 2, totalBytes: 200 }, bytes(50))).toThrow(
      /declared 200/i
    );
  });
});
