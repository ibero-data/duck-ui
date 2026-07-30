import { DataType, TimeUnit } from "apache-arrow";
import type { QueryResult, ExternalQueryResponse } from "@/store/types";

/**
 * Converts a raw result (from an external HTTP endpoint) into a QueryResult.
 * Handles JSONCompact format, NDJSON, and plain JSON array-of-objects responses.
 * See: https://github.com/caioricciuti/duck-ui/issues/24
 */
export const rawResultToJSON = (rawResult: string): QueryResult => {
  const trimmed = rawResult.trim();
  if (!trimmed) {
    return { columns: [], columnTypes: [], data: [], rowCount: 0 };
  }

  try {
    // Try parsing as single JSON first (standard format)
    let parsed: Partial<ExternalQueryResponse> | undefined;

    try {
      const json = JSON.parse(trimmed);

      // Handle array-of-objects format (default httpserver response without JSONCompact)
      // e.g. [{"col1": "val1", "col2": "val2"}, ...]
      if (Array.isArray(json) && json.length > 0 && !("meta" in json[0])) {
        const columns = Object.keys(json[0]);
        const data = json.map((row: Record<string, unknown>) => ({ ...row }));
        return {
          columns,
          columnTypes: columns.map(() => "VARCHAR"),
          data,
          rowCount: data.length,
        };
      }

      parsed = json;
    } catch {
      // If single JSON fails, try NDJSON (newline-delimited JSON)
      // DuckDB httpserver may return multiple JSON objects, one per line
      const lines = trimmed.split("\n").filter((line) => line.trim());

      if (lines.length === 0) {
        return { columns: [], columnTypes: [], data: [], rowCount: 0 };
      }

      // Parse each line as JSON
      const objects = lines.map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(
            `Failed to parse NDJSON line ${idx + 1}/${lines.length}: "${line.substring(0, 80)}${line.length > 80 ? "..." : ""}"`
          );
        }
      });

      // If all lines are plain objects (array-of-objects NDJSON), treat as rows
      if (
        objects.length > 0 &&
        objects.every(
          (obj) => obj && typeof obj === "object" && !("meta" in obj) && !("data" in obj)
        )
      ) {
        const columns = Object.keys(objects[0]);
        return {
          columns,
          columnTypes: columns.map(() => "VARCHAR"),
          data: objects,
          rowCount: objects.length,
        };
      }

      // Find the result object (has meta and data)
      const resultObj = objects.find(
        (obj): obj is ExternalQueryResponse =>
          obj && typeof obj === "object" && "meta" in obj && "data" in obj
      );

      if (resultObj) {
        parsed = resultObj;
      } else {
        // If no single result object, try to merge (meta from one, data from others)
        const metaObj = objects.find((obj) => obj?.meta);
        const dataObj = objects.find((obj) => obj?.data);

        if (metaObj && dataObj) {
          parsed = {
            meta: metaObj.meta,
            data: dataObj.data,
            rows: dataObj.rows || dataObj.data?.length || 0,
          };
        } else {
          const preview = trimmed.substring(0, 200);
          throw new Error(
            `Unrecognized response format. Expected JSONCompact (with "meta" and "data" fields) ` +
              `or array of objects. Response preview: ${preview}${trimmed.length > 200 ? "..." : ""}`
          );
        }
      }
    }

    // Validate required fields
    if (!parsed || typeof parsed !== "object") {
      throw new Error(
        `Invalid response: expected a JSON object but got ${typeof parsed}. ` +
          `Response preview: ${trimmed.substring(0, 200)}${trimmed.length > 200 ? "..." : ""}`
      );
    }

    if (
      !parsed.meta ||
      !parsed.data ||
      !Array.isArray(parsed.meta) ||
      !Array.isArray(parsed.data)
    ) {
      const hasKeys = parsed ? Object.keys(parsed).join(", ") : "none";
      throw new Error(
        `Invalid response format: expected "meta" (array) and "data" (array) fields. ` +
          `Found keys: [${hasKeys}]. Ensure the DuckDB httpserver is returning JSONCompact format.`
      );
    }

    // Convert to QueryResult format
    const columns = parsed.meta.map((m) => m.name);
    const columnTypes = parsed.meta.map((m) => m.type);
    const data = parsed.data.map((row: unknown, rowIdx: number) => {
      if (!Array.isArray(row)) {
        // If rows are objects instead of arrays, use them directly
        if (row && typeof row === "object") {
          return row as Record<string, unknown>;
        }
        throw new Error(`Invalid row format at index ${rowIdx}: expected array or object`);
      }
      const rowObject: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        rowObject[col] = row[index];
      });
      return rowObject;
    });

    return {
      columns,
      columnTypes,
      data,
      rowCount: parsed.rows || data.length,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse query result: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const MAX_SAFE = 9007199254740991n; // Number.MAX_SAFE_INTEGER

/**
 * Interprets Arrow decimal storage (little-endian 32-bit words, two's
 * complement) as the unscaled BigInt. Covers Decimal128 (4 words) and
 * Decimal256 (8 words). Exported for tests.
 */
export const decimalWordsToBigInt = (words: Uint32Array | Int32Array): bigint => {
  let unscaled = 0n;
  for (let i = words.length - 1; i >= 0; i--) {
    unscaled = (unscaled << 32n) | BigInt(words[i] >>> 0);
  }
  const signBit = (words[words.length - 1] & 0x80000000) !== 0;
  if (signBit) {
    unscaled -= 1n << BigInt(words.length * 32);
  }
  return unscaled;
};

/**
 * Applies the scale to an unscaled decimal. Returns a number when it is
 * exactly representable, otherwise a lossless decimal string (DuckDB decimals
 * go up to 38 digits — far past 2^53). Exported for tests.
 */
export const formatDecimal = (unscaled: bigint, scale: number): number | string => {
  const negative = unscaled < 0n;
  const abs = negative ? -unscaled : unscaled;
  let text: string;
  if (scale <= 0) {
    text = abs.toString();
  } else {
    const digits = abs.toString().padStart(scale + 1, "0");
    text = `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  }
  const signed = negative ? `-${text}` : text;
  return abs <= MAX_SAFE ? Number(signed) : signed;
};

/** Converts whatever the Arrow decimal vector hands back into a display value. */
const decimalCellToJs = (value: unknown, scale: number): number | string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return formatDecimal(value, scale);
  if (value instanceof Uint32Array || value instanceof Int32Array) {
    return formatDecimal(decimalWordsToBigInt(value), scale);
  }
  // Fallback for BN-style wrappers whose toString() yields the unscaled digits.
  const text = String(value);
  if (/^-?\d+$/.test(text)) return formatDecimal(BigInt(text), scale);
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * DATE columns → "YYYY-MM-DD". Arrow reports the day as UTC-midnight epoch
 * millis; formatting through local time shifts it a day west of UTC (#15), so
 * this goes through the UTC getters. Exported for tests.
 */
export const dateCellToIso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) return String(value);
  return new Date(ms).toISOString().slice(0, 10);
};

/** TIME columns → "HH:MM:SS[.ffffff]". Exported for tests. */
export const timeCellToString = (value: unknown, unit: TimeUnit): string | null => {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value)));
  const perSecond =
    unit === TimeUnit.SECOND
      ? 1n
      : unit === TimeUnit.MILLISECOND
        ? 1000n
        : unit === TimeUnit.MICROSECOND
          ? 1000000n
          : 1000000000n;
  const totalSeconds = raw / perSecond;
  const fraction = raw % perSecond;
  const hh = String(totalSeconds / 3600n).padStart(2, "0");
  const mm = String((totalSeconds % 3600n) / 60n).padStart(2, "0");
  const ss = String(totalSeconds % 60n).padStart(2, "0");
  if (fraction === 0n) return `${hh}:${mm}:${ss}`;
  const fracDigits = String(fraction).padStart(String(perSecond).length - 1, "0");
  return `${hh}:${mm}:${ss}.${fracDigits.replace(/0+$/, "")}`;
};

/**
 * Converts a WASM query result (an Arrow table) into a QueryResult.
 *
 * Type-specific coercions, driven by the Arrow type (not its string name, so
 * TIMESTAMPTZ variants like `Timestamp<MICROSECOND, UTC>` are covered):
 * - Decimal → number (or lossless string past 2^53), scale applied (#13)
 * - Date32/Date64 → "YYYY-MM-DD" via UTC (#15)
 * - Timestamp (all units, with or without timezone) → Date object
 * - Time → "HH:MM:SS[.ffffff]" string
 * Int64/UInt64 stay BigInt (lossless), everything else passes through.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resultToJSON = (result: any): QueryResult => {
  try {
    const schema = result.schema;
    const fields = schema.fields;

    // Decimal values must be read from the column vectors — row.toJSON() drops them.
    const columnVectors = fields.map((_: unknown, colIdx: number) => result.getChildAt(colIdx));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.toArray().map((row: any, rowIndex: number) => {
      const jsonRow = row.toJSON();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fields.forEach((field: any, columnIndex: number) => {
        const col = field.name;
        const type = field.type;

        if (DataType.isDecimal(type)) {
          const value = columnVectors[columnIndex]?.get(rowIndex);
          jsonRow[col] = decimalCellToJs(value, type.scale ?? 0);
        } else if (DataType.isDate(type)) {
          jsonRow[col] = dateCellToIso(jsonRow[col]);
        } else if (DataType.isTimestamp(type)) {
          const value = jsonRow[col];
          jsonRow[col] = value === null || value === undefined ? null : new Date(Number(value));
        } else if (DataType.isTime(type)) {
          jsonRow[col] = timeCellToString(jsonRow[col], type.unit);
        }
      });

      return jsonRow;
    });

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columns: fields.map((field: any) => field.name),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columnTypes: fields.map((field: any) => field.type.toString()),
      data,
      rowCount: result.numRows,
    };
  } catch (error) {
    console.error("Error converting query result to JSON:", error);
    return {
      columns: [],
      columnTypes: [],
      data: [],
      rowCount: 0,
      error: `Failed to process query results: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
};
