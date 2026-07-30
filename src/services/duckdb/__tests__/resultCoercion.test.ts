import { describe, it, expect } from "vitest";
import {
  makeData,
  Decimal,
  Vector,
  Table,
  DateDay,
  TimestampMicrosecond,
  TimeUnit,
  vectorFromArray,
} from "apache-arrow";
import {
  resultToJSON,
  decimalWordsToBigInt,
  formatDecimal,
  dateCellToIso,
  timeCellToString,
} from "../resultParser";
import { formatTimestampUTC, formatDateUTC } from "@/lib/datetime";

/**
 * Regression tests for issues #13 (DECIMAL rendered wrong/NULL) and #15
 * (DATE off-by-one, NOW()/TIMESTAMPTZ rendered as raw epoch millis).
 * The integration tests build real Arrow tables with the same apache-arrow
 * version duckdb-wasm bundles, so resultToJSON sees production shapes.
 */

/** Encode a signed BigInt as Arrow Decimal128 little-endian words. */
const toWords128 = (value: bigint): Uint32Array => {
  let x = value < 0n ? (1n << 128n) + value : value;
  const words = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    words[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return words;
};

const decimalVector = (values: (bigint | null)[], scale: number, precision: number): Vector => {
  const data = new Uint32Array(values.length * 4);
  const nullBitmap = new Uint8Array(Math.ceil(values.length / 8) || 1);
  values.forEach((value, i) => {
    if (value !== null) {
      data.set(toWords128(value), i * 4);
      nullBitmap[i >> 3] |= 1 << (i & 7);
    }
  });
  return new Vector([
    makeData({
      type: new Decimal(scale, precision, 128),
      length: values.length,
      nullCount: values.filter((v) => v === null).length,
      nullBitmap,
      data,
    }),
  ]);
};

describe("decimal coercion (#13)", () => {
  it("decimalWordsToBigInt round-trips positive, negative, and zero", () => {
    expect(decimalWordsToBigInt(toWords128(21n))).toBe(21n);
    expect(decimalWordsToBigInt(toWords128(-21n))).toBe(-21n);
    expect(decimalWordsToBigInt(toWords128(0n))).toBe(0n);
    expect(decimalWordsToBigInt(toWords128(123456789012345678901234567890n))).toBe(
      123456789012345678901234567890n
    );
    expect(decimalWordsToBigInt(toWords128(-123456789012345678901234567890n))).toBe(
      -123456789012345678901234567890n
    );
  });

  it("formatDecimal applies scale and stays numeric in the safe range", () => {
    expect(formatDecimal(21n, 1)).toBe(2.1);
    expect(formatDecimal(-21n, 1)).toBe(-2.1);
    expect(formatDecimal(123n, 2)).toBe(1.23);
    expect(formatDecimal(42n, 0)).toBe(42);
    expect(formatDecimal(5n, 3)).toBe(0.005);
  });

  it("formatDecimal falls back to a lossless string past 2^53", () => {
    expect(formatDecimal(10n ** 20n, 0)).toBe("100000000000000000000");
    expect(formatDecimal(-(10n ** 20n) - 7n, 2)).toBe("-1000000000000000000.07");
  });

  it("SELECT 2.1 comes back as 2.1, not NULL or 21 (issue #13)", () => {
    const table = new Table({ price: decimalVector([21n, -21n, null], 1, 3) });
    const result = resultToJSON(table);
    expect(result.error).toBeUndefined();
    expect(result.data[0].price).toBe(2.1);
    expect(result.data[1].price).toBe(-2.1);
    expect(result.data[2].price).toBeNull();
    expect(result.columnTypes[0]).toContain("Decimal");
  });

  it("SELECT 1.23 comes back as 1.23 (the issue's exact repro)", () => {
    const table = new Table({ v: decimalVector([123n], 2, 3) });
    expect(resultToJSON(table).data[0].v).toBe(1.23);
  });
});

describe("date coercion (#15)", () => {
  it("DATE '2025-01-01' renders 2025-01-01 in every timezone (no off-by-one)", () => {
    const vector = vectorFromArray([new Date(Date.UTC(2025, 0, 1))], new DateDay());
    const result = resultToJSON(new Table({ d: vector }));
    expect(result.data[0].d).toBe("2025-01-01");
  });

  it("dateCellToIso handles ms numbers, Date objects, and null", () => {
    expect(dateCellToIso(Date.UTC(2025, 0, 1))).toBe("2025-01-01");
    expect(dateCellToIso(new Date(Date.UTC(1999, 11, 31)))).toBe("1999-12-31");
    expect(dateCellToIso(null)).toBeNull();
  });
});

describe("timestamp coercion (#15)", () => {
  const instant = new Date("2026-07-30T12:34:56.000Z");

  it("TIMESTAMPTZ (Timestamp<MICROSECOND, UTC>) becomes a Date, not raw epoch millis", () => {
    const vector = vectorFromArray([instant], new TimestampMicrosecond("UTC"));
    const result = resultToJSON(new Table({ now: vector }));
    expect(result.columnTypes[0]).toBe("Timestamp<MICROSECOND, UTC>");
    expect(result.data[0].now).toBeInstanceOf(Date);
    expect((result.data[0].now as Date).getTime()).toBe(instant.getTime());
  });

  it("naive TIMESTAMP also becomes a Date", () => {
    const vector = vectorFromArray([instant], new TimestampMicrosecond());
    const result = resultToJSON(new Table({ ts: vector }));
    expect(result.data[0].ts).toBeInstanceOf(Date);
  });
});

describe("time coercion", () => {
  it("formats microsecond times", () => {
    // 12:34:56.123456 = (12*3600 + 34*60 + 56) * 1e6 + 123456 µs
    expect(timeCellToString(45296123456n, TimeUnit.MICROSECOND)).toBe("12:34:56.123456");
    expect(timeCellToString(45296000000n, TimeUnit.MICROSECOND)).toBe("12:34:56");
    expect(timeCellToString(1n, TimeUnit.SECOND)).toBe("00:00:01");
    expect(timeCellToString(null, TimeUnit.MICROSECOND)).toBeNull();
  });
});

describe("UTC display formatting", () => {
  it("formatTimestampUTC prints what DuckDB stored, trimming .000", () => {
    expect(formatTimestampUTC(new Date("2025-01-01T12:34:56.000Z"))).toBe("2025-01-01 12:34:56");
    expect(formatTimestampUTC(new Date("2025-01-01T12:34:56.789Z"))).toBe(
      "2025-01-01 12:34:56.789"
    );
  });

  it("formatDateUTC prints the UTC day", () => {
    expect(formatDateUTC(new Date("2025-01-01T00:00:00.000Z"))).toBe("2025-01-01");
  });
});
