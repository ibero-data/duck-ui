import { describe, it, expect } from "vitest";
import { rawResultToJSON } from "../resultParser";

describe("rawResultToJSON", () => {
  it("returns empty result for empty string", () => {
    const result = rawResultToJSON("");
    expect(result).toEqual({ columns: [], columnTypes: [], data: [], rowCount: 0 });
  });

  it("returns empty result for whitespace-only string", () => {
    const result = rawResultToJSON("   \n  ");
    expect(result).toEqual({ columns: [], columnTypes: [], data: [], rowCount: 0 });
  });

  describe("JSONCompact format", () => {
    it("parses standard JSONCompact response", () => {
      const input = JSON.stringify({
        meta: [
          { name: "id", type: "INTEGER" },
          { name: "name", type: "VARCHAR" },
        ],
        data: [
          [1, "Alice"],
          [2, "Bob"],
        ],
        rows: 2,
      });

      const result = rawResultToJSON(input);
      expect(result.columns).toEqual(["id", "name"]);
      expect(result.columnTypes).toEqual(["INTEGER", "VARCHAR"]);
      expect(result.data).toEqual([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);
      expect(result.rowCount).toBe(2);
    });

    it("uses data.length when rows field is missing", () => {
      const input = JSON.stringify({
        meta: [{ name: "col", type: "INTEGER" }],
        data: [[1], [2], [3]],
      });

      const result = rawResultToJSON(input);
      expect(result.rowCount).toBe(3);
    });

    it("handles empty data array", () => {
      const input = JSON.stringify({
        meta: [{ name: "col", type: "INTEGER" }],
        data: [],
        rows: 0,
      });

      const result = rawResultToJSON(input);
      expect(result.columns).toEqual(["col"]);
      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
    });
  });

  describe("array-of-objects format", () => {
    it("parses array of objects", () => {
      const input = JSON.stringify([
        { col1: "val1", col2: 42 },
        { col1: "val2", col2: 99 },
      ]);

      const result = rawResultToJSON(input);
      expect(result.columns).toEqual(["col1", "col2"]);
      expect(result.columnTypes).toEqual(["VARCHAR", "VARCHAR"]);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ col1: "val1", col2: 42 });
      expect(result.rowCount).toBe(2);
    });

    it("handles single object array", () => {
      const input = JSON.stringify([{ x: 1 }]);
      const result = rawResultToJSON(input);
      expect(result.columns).toEqual(["x"]);
      expect(result.data).toEqual([{ x: 1 }]);
    });
  });

  describe("NDJSON format", () => {
    it("parses NDJSON with plain objects", () => {
      const input = '{"a": 1, "b": "hello"}\n{"a": 2, "b": "world"}';

      const result = rawResultToJSON(input);
      expect(result.columns).toEqual(["a", "b"]);
      expect(result.data).toEqual([
        { a: 1, b: "hello" },
        { a: 2, b: "world" },
      ]);
      expect(result.rowCount).toBe(2);
    });

    it("parses NDJSON with meta+data result object", () => {
      const input =
        '{"status": "ok"}\n' +
        JSON.stringify({
          meta: [{ name: "id", type: "INT" }],
          data: [[1], [2]],
          rows: 2,
        });

      const result = rawResultToJSON(input);
      expect(result.columns).toEqual(["id"]);
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("handles blank lines in NDJSON", () => {
      const input = '{"a": 1}\n\n{"a": 2}\n';
      const result = rawResultToJSON(input);
      expect(result.data).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    it("throws on invalid JSON", () => {
      expect(() => rawResultToJSON("not json at all")).toThrow("Failed to parse query result");
    });

    it("throws when meta is missing from JSONCompact", () => {
      const input = JSON.stringify({ data: [[1]] });
      expect(() => rawResultToJSON(input)).toThrow("Failed to parse query result");
    });

    it("throws when data is missing from JSONCompact", () => {
      const input = JSON.stringify({
        meta: [{ name: "col", type: "INT" }],
      });
      expect(() => rawResultToJSON(input)).toThrow("Failed to parse query result");
    });
  });
});
