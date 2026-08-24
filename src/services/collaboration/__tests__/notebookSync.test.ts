import { describe, expect, it } from "vitest";
import { diffStrings } from "@/lib/textDiff";
import { mergeSharedIntoLocal, projectionKey, toSyncableCells } from "../notebookSync";

describe("diffStrings", () => {
  it("returns null for equal strings", () => {
    expect(diffStrings("abc", "abc")).toBeNull();
  });

  it("finds a middle insertion", () => {
    expect(diffStrings("select 1", "select 21")).toEqual({
      start: 7,
      deleteLength: 0,
      insert: "2",
    });
  });

  it("finds a middle deletion", () => {
    expect(diffStrings("select 21", "select 1")).toEqual({
      start: 7,
      deleteLength: 1,
      insert: "",
    });
  });

  it("finds a replacement", () => {
    const d = diffStrings("select a from t", "select b from t");
    expect(d).toEqual({ start: 7, deleteLength: 1, insert: "b" });
  });

  it("handles growth from empty and shrink to empty", () => {
    expect(diffStrings("", "hi")).toEqual({ start: 0, deleteLength: 0, insert: "hi" });
    expect(diffStrings("hi", "")).toEqual({ start: 0, deleteLength: 2, insert: "" });
  });
});

describe("toSyncableCells — the §9 projection", () => {
  it("strips results: a cell with a huge result projects to just its shape", () => {
    const json = JSON.stringify([
      {
        id: "c1",
        type: "sql",
        content: "select * from t",
        result: { columns: ["a"], data: [{ a: 1 }], rowCount: 1 },
      },
    ]);
    const cells = toSyncableCells(json);
    expect(cells).toHaveLength(1);
    expect(cells?.[0]).not.toHaveProperty("result");
    expect(JSON.stringify(cells)).not.toContain("rowCount");
  });

  it("a result-only change produces an identical projection", () => {
    const base = [{ id: "c1", type: "sql", content: "select 1" }];
    const withResult = [{ ...base[0], result: { columns: [], data: [], rowCount: 0 } }];
    expect(projectionKey(toSyncableCells(JSON.stringify(base)) ?? [])).toBe(
      projectionKey(toSyncableCells(JSON.stringify(withResult)) ?? [])
    );
  });

  it("returns null for JSON that is not a cell list", () => {
    expect(toSyncableCells("not json")).toBeNull();
    expect(toSyncableCells('{"a":1}')).toBeNull();
  });

  it("drops malformed cells rather than syncing them wrong", () => {
    const cells = toSyncableCells('[{"id":"ok","type":"sql","content":"x"},{"noId":true},42]');
    expect(cells?.map((c) => c.id)).toEqual(["ok"]);
  });

  it("serializes chart config as opaque JSON", () => {
    const cells = toSyncableCells(
      JSON.stringify([{ id: "c", type: "sql", content: "", chartConfig: { type: "bar" } }])
    );
    expect(cells?.[0]?.chartConfig).toBe('{"type":"bar"}');
  });
});

describe("mergeSharedIntoLocal", () => {
  it("keeps local results when a peer edits the cell's text", () => {
    const local = JSON.stringify([
      { id: "c1", type: "sql", content: "select 1", result: { rowCount: 7 } },
    ]);
    const merged = JSON.parse(
      mergeSharedIntoLocal([{ id: "c1", type: "sql", content: "select 1 -- edited" }], local)
    );
    expect(merged[0].content).toBe("select 1 -- edited");
    expect(merged[0].result).toEqual({ rowCount: 7 });
  });

  it("shared structure wins: removed cells go, new cells appear in order", () => {
    const local = JSON.stringify([
      { id: "a", type: "sql", content: "1", result: { rowCount: 1 } },
      { id: "b", type: "sql", content: "2" },
    ]);
    const merged = JSON.parse(
      mergeSharedIntoLocal(
        [
          { id: "c", type: "markdown", content: "intro" },
          { id: "a", type: "sql", content: "1" },
        ],
        local
      )
    );
    expect(merged.map((cell: { id: string }) => cell.id)).toEqual(["c", "a"]);
    expect(merged[1].result).toEqual({ rowCount: 1 });
  });

  it("survives unreadable local state", () => {
    const merged = JSON.parse(
      mergeSharedIntoLocal([{ id: "x", type: "sql", content: "select 1" }], "garbage")
    );
    expect(merged[0].id).toBe("x");
  });

  it("round-trips chart config through its JSON encoding", () => {
    const merged = JSON.parse(
      mergeSharedIntoLocal(
        [{ id: "c", type: "sql", content: "", chartConfig: '{"type":"line"}' }],
        "[]"
      )
    );
    expect(merged[0].chartConfig).toEqual({ type: "line" });
  });
});
