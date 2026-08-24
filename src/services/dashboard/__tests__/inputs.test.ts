import { describe, it, expect, vi } from "vitest";
import {
  applyInputs,
  defaultInputValue,
  InputsStore,
  referencedInputs,
  type InputValue,
} from "../inputs";

const values = (entries: Record<string, InputValue>): Map<string, InputValue> =>
  new Map(Object.entries(entries));

describe("referencedInputs", () => {
  it("finds every input a query references, once each", () => {
    const sql = `select * from t
      where region = '${"${inputs.region.value}"}'
      and d between '${"${inputs.period.start}"}' and '${"${inputs.period.end}"}'
      and r like '${"${inputs.region}"}'`;
    expect(referencedInputs(sql).sort()).toEqual(["period", "region"]);
  });

  it("returns nothing for a query with no inputs", () => {
    expect(referencedInputs("select 1")).toEqual([]);
  });
});

describe("applyInputs", () => {
  it("substitutes .value inside the document's own quotes, Evidence-style", () => {
    const sql = "select * from t where region = '${inputs.region.value}'";
    expect(applyInputs(sql, values({ region: { kind: "scalar", value: "north" } }))).toBe(
      "select * from t where region = 'north'"
    );
  });

  it("substitutes range start and end", () => {
    const sql = "where d between '${inputs.p.start}' and '${inputs.p.end}'";
    expect(
      applyInputs(sql, values({ p: { kind: "range", start: "2026-01-01", end: "2026-01-31" } }))
    ).toBe("where d between '2026-01-01' and '2026-01-31'");
  });

  it("escapes quotes — a shared document's input is untrusted input", () => {
    const sql = "where name = '${inputs.who.value}'";
    const hostile = { kind: "scalar" as const, value: "x'; DROP TABLE t; --" };
    expect(applyInputs(sql, values({ who: hostile }))).toBe("where name = 'x''; DROP TABLE t; --'");
  });

  it("renders numbers and booleans as bare literals", () => {
    expect(
      applyInputs(
        "where n > ${inputs.min.value} and f = ${inputs.on.value}",
        values({
          min: { kind: "scalar", value: 10 },
          on: { kind: "scalar", value: true },
        })
      )
    ).toBe("where n > 10 and f = TRUE");
  });

  it("substitutes an unknown input as empty rather than leaving a syntax error", () => {
    expect(applyInputs("where x = '${inputs.missing.value}'", values({}))).toBe("where x = ''");
  });
});

describe("defaultInputValue", () => {
  it("gives every component a value, so documents run before interaction", () => {
    expect(defaultInputValue("TextInput", {})).toEqual({ kind: "scalar", value: "" });
    expect(defaultInputValue("Checkbox", {})).toEqual({ kind: "scalar", value: false });
    expect(defaultInputValue("Slider", { min: 5 })).toEqual({ kind: "scalar", value: 5 });
  });

  it("treats DatePicker as an alias for DateInput and defaults to today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(defaultInputValue("DatePicker", {})).toEqual({ kind: "scalar", value: today });
    expect(defaultInputValue("DateInput", {})).toEqual({ kind: "scalar", value: today });
  });

  it("defaults DateRange to the last 30 days, as a range", () => {
    const range = defaultInputValue("DateRange", {});
    if (range.kind !== "range") throw new Error("expected a range");
    expect(range.end >= range.start).toBe(true);
  });

  it("honours an explicit defaultValue", () => {
    expect(defaultInputValue("Dropdown", { defaultValue: "north" })).toEqual({
      kind: "scalar",
      value: "north",
    });
  });
});

describe("InputsStore", () => {
  it("registers defaults without clobbering user choices", () => {
    const store = new InputsStore();
    store.set("region", { kind: "scalar", value: "south" });
    store.ensure("region", { kind: "scalar", value: "north" });
    expect(store.get("region")).toEqual({ kind: "scalar", value: "south" });
  });

  it("notifies on change and bumps the revision", () => {
    const store = new InputsStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const before = store.revision;
    store.set("x", { kind: "scalar", value: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.revision).toBeGreaterThan(before);
  });

  it("keeps the snapshot reference stable between changes", () => {
    const store = new InputsStore();
    store.set("x", { kind: "scalar", value: 1 });
    expect(store.snapshot()).toBe(store.snapshot());
    const first = store.snapshot();
    store.set("y", { kind: "scalar", value: 2 });
    expect(store.snapshot()).not.toBe(first);
  });
});
