import { describe, it, expect } from "vitest";
import { tableFromArrays, Table } from "apache-arrow";
import {
  decodeRecordBatches,
  decodeSchema,
  decodeTable,
  encodeRecordBatch,
  encodeSchema,
} from "../ipc";
import { splitPayload, ChunkAssembler } from "../chunking";
import { resultToJSON } from "@/services/duckdb/resultParser";

const sampleTable = () =>
  tableFromArrays({
    id: Int32Array.from([1, 2, 3, 4]),
    label: ["alpha", "beta", "gamma", "delta"],
    score: Float64Array.from([1.5, 2.25, -3.75, 0]),
  });

describe("Arrow IPC round-trip", () => {
  it("preserves values and types through encode/decode", () => {
    const batch = sampleTable().batches[0];
    const decoded = decodeRecordBatches(encodeRecordBatch(batch));

    expect(decoded).toHaveLength(1);
    const result = resultToJSON(new Table(decoded));
    expect(result.columns).toEqual(["id", "label", "score"]);
    expect(result.rowCount).toBe(4);
    expect(result.data[0]).toMatchObject({ id: 1, label: "alpha", score: 1.5 });
    expect(result.data[2]).toMatchObject({ id: 3, label: "gamma", score: -3.75 });
  });

  it("preserves the schema on a frame with no rows", () => {
    const schema = sampleTable().schema;
    const decoded = decodeSchema(encodeSchema(schema));
    expect(decoded.fields.map((f) => f.name)).toEqual(["id", "label", "score"]);
    expect(decoded.fields.map((f) => f.type.toString())).toEqual(
      schema.fields.map((f) => f.type.toString())
    );
  });

  it("yields no batches from a schema-only frame", () => {
    expect(decodeRecordBatches(encodeSchema(sampleTable().schema))).toEqual([]);
  });

  it("keeps column headers available for an empty result", () => {
    const table = decodeTable(encodeSchema(sampleTable().schema));
    expect(table.numRows).toBe(0);
    expect(table.schema.fields.map((f) => f.name)).toEqual(["id", "label", "score"]);
  });

  it("makes each frame independently decodable", () => {
    // The point of self-contained frames: batch 2 decodes without batch 1.
    const batches = sampleTable().batches;
    const encoded = batches.map(encodeRecordBatch);
    for (const bytes of encoded) {
      expect(() => decodeRecordBatches(bytes)).not.toThrow();
    }
  });

  it("does not produce JSON — the payload is binary Arrow", () => {
    const bytes = encodeRecordBatch(sampleTable().batches[0]);
    const asText = new TextDecoder().decode(bytes);
    expect(asText).not.toContain('alpha","');
    // Arrow IPC streams begin with the continuation marker 0xFFFFFFFF.
    expect(Array.from(bytes.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });
});

describe("Arrow over the chunked transport", () => {
  it("survives being split and reassembled at the wire chunk size", () => {
    const wide = tableFromArrays({
      id: Int32Array.from({ length: 5000 }, (_, i) => i),
      label: Array.from({ length: 5000 }, (_, i) => `row-${i}`),
    });
    const encoded = encodeRecordBatch(wide.batches[0]);
    expect(encoded.byteLength).toBeGreaterThan(60 * 1024);

    const chunks = splitPayload(encoded);
    const assembler = new ChunkAssembler();
    let reassembled: Uint8Array | null = null;
    chunks.forEach((chunk, index) => {
      reassembled =
        assembler.accept(
          "q1",
          { index, count: chunks.length, totalBytes: encoded.byteLength },
          chunk
        ) ?? reassembled;
    });

    expect(reassembled).not.toBeNull();
    const result = resultToJSON(new Table(decodeRecordBatches(reassembled!)));
    expect(result.rowCount).toBe(5000);
    expect(result.data[4999]).toMatchObject({ id: 4999, label: "row-4999" });
  });

  it("survives out-of-order chunk delivery", () => {
    const encoded = encodeRecordBatch(sampleTable().batches[0]);
    const chunks = splitPayload(encoded, 16);
    const assembler = new ChunkAssembler();
    const order = chunks.map((_, i) => i).reverse();

    let reassembled: Uint8Array | null = null;
    for (const index of order) {
      reassembled =
        assembler.accept(
          "q1",
          { index, count: chunks.length, totalBytes: encoded.byteLength },
          chunks[index]
        ) ?? reassembled;
    }

    const result = resultToJSON(new Table(decodeRecordBatches(reassembled!)));
    expect(result.rowCount).toBe(4);
    expect(result.data[0]).toMatchObject({ label: "alpha" });
  });
});
