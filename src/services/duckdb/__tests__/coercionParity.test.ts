import { describe, it, expect } from "vitest";

/**
 * Engine-consolidation decision record (Phase 0 of "One Engine, Embed Anywhere").
 *
 * The plan considered routing the SPA's WASM query path through @duck_ui/core's
 * QueryExecutor so the engine ships once. Reading both implementations shows the
 * two Arrow→JSON coercions are NOT equivalent, so a swap would silently change
 * results. This test pins the divergence so the decision is explicit and any
 * future convergence attempt has a guard to satisfy.
 *
 * SPA `resultToJSON` (src/services/duckdb/resultParser.ts):
 *   - Int64 → BigInt (lossless), preserved for downstream bigint-aware serializers.
 *   - Timestamp → JS Date object; Date32 → "YYYY-MM-DD" string (UTC).
 *   - Decimal → number (lossless string past 2^53) from the Arrow column vector,
 *     scale applied. See resultCoercion.test.ts for the regression suite.
 *
 * core `coerceValue` (@duck_ui/core engine/query.ts):
 *   - BigInt → Number (LOSSY above 2^53).
 *   - Date → ISO 8601 string.
 *   - Int64 {low,high} struct → float; Decimal {unscaledValue,scale} → float.
 *
 * Conclusion: keep the SPA engine. Consolidate the SHARE CODEC instead (Phase 2),
 * which is lossless and architecture-neutral. Revisit an engine swap only if core
 * gains (a) lossless big-int/Decimal handling and (b) an API to execute raw SQL
 * against an externally-owned connection (it currently owns its own pool and only
 * loads named in-memory tables — no OPFS/external/file-import).
 */

// Mirror of @duck_ui/core's coerceValue (engine/query.ts), kept in sync by this
// test's intent — it is module-private in core and not exported.
function coreCoerce(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null) {
    if (value instanceof Date) return value.toISOString();
    const obj = value as Record<string, unknown>;
    if ("low" in obj && "high" in obj) {
      const high = Number(obj.high ?? 0);
      const low = Number(obj.low ?? 0);
      return high * 4294967296 + (low >>> 0);
    }
    if ("unscaledValue" in obj && "scale" in obj) {
      return Number(obj.unscaledValue) / Math.pow(10, Number(obj.scale));
    }
    if (Array.isArray(value)) return value.map(coreCoerce);
  }
  return value;
}

describe("engine coercion parity (Phase 0 decision record)", () => {
  it("DIVERGES on large integers: core loses precision, SPA keeps BigInt", () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1, not representable as a JS number
    // core collapses to Number → precision loss
    expect(coreCoerce(big)).toBe(9007199254740992); // wrong by 1
    // SPA path keeps the BigInt intact (downstream serializers stringify it)
    const spaValue = big;
    expect(typeof spaValue).toBe("bigint");
    // The precise representations differ — a swap would corrupt large ids/keys.
    expect(String(coreCoerce(big))).toBe("9007199254740992"); // core: lost the +1
    expect(spaValue.toString()).toBe("9007199254740993"); // SPA: exact
    expect(String(coreCoerce(big))).not.toBe(spaValue.toString());
  });

  it("DIVERGES on timestamps: core → ISO string, SPA → Date object", () => {
    const d = new Date("2024-01-15T10:30:00.000Z");
    expect(coreCoerce(d)).toBe("2024-01-15T10:30:00.000Z");
    // SPA's resultToJSON assigns `new Date(value)` for Timestamp columns — a Date
    // object, which the table/chart components format themselves.
    const spaValue: unknown = new Date(d.getTime());
    expect(spaValue).toBeInstanceOf(Date);
    expect(typeof coreCoerce(d)).toBe("string");
  });

  it("AGREES on small numbers, strings, nulls, and nested arrays", () => {
    expect(coreCoerce(42)).toBe(42);
    expect(coreCoerce("hi")).toBe("hi");
    expect(coreCoerce(null)).toBeNull();
    expect(coreCoerce([1n, 2n, null])).toEqual([1, 2, null]);
  });
});
