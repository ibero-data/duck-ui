/**
 * Decoders for DuckDB values that cross the Arrow boundary as raw bytes.
 *
 * Arrow has no native type for GEOMETRY, VARINT, BIT or BLOB, so duckdb-wasm
 * ships them as Binary buffers. Without decoding they reach the grid as
 * `{"0":1,"1":1,...}` byte maps, which is what every DuckDB WASM UI shows
 * today. INTERVAL is worse: Arrow JS reads only the first two words of a
 * MONTH_DAY_NANO value, so the whole time component is silently dropped.
 *
 * Every function here mirrors DuckDB's own VARCHAR rendering, and the
 * engine-integration tests assert that by diffing against `value::VARCHAR`.
 */

/** Above this, decoding a single cell costs more than it's worth to display. */
const MAX_DECODE_BYTES = 1_000_000;

const formatByteSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;

/* -------------------------------------------------------------------------- */
/* GEOMETRY (ISO WKB → WKT)                                                    */
/* -------------------------------------------------------------------------- */

const GEOMETRY_NAMES: Record<number, string> = {
  1: "POINT",
  2: "LINESTRING",
  3: "POLYGON",
  4: "MULTIPOINT",
  5: "MULTILINESTRING",
  6: "MULTIPOLYGON",
  7: "GEOMETRYCOLLECTION",
};

/** Matches DuckDB's double rendering: 3 stays "3", not "3.0". */
const formatCoord = (value: number): string => (Object.is(value, -0) ? "0" : String(value));

interface WkbCursor {
  view: DataView;
  offset: number;
}

const readCoords = (cursor: WkbCursor, littleEndian: boolean, dims: number): string => {
  const parts: string[] = [];
  for (let i = 0; i < dims; i++) {
    parts.push(formatCoord(cursor.view.getFloat64(cursor.offset, littleEndian)));
    cursor.offset += 8;
  }
  return parts.join(" ");
};

const readPointList = (cursor: WkbCursor, littleEndian: boolean, dims: number): string => {
  const count = cursor.view.getUint32(cursor.offset, littleEndian);
  cursor.offset += 4;
  if (count === 0) return "EMPTY";
  const points: string[] = [];
  for (let i = 0; i < count; i++) points.push(readCoords(cursor, littleEndian, dims));
  return `(${points.join(", ")})`;
};

/**
 * Reads one complete geometry at the cursor, advancing it past the value.
 * Recurses for MULTI* and GEOMETRYCOLLECTION, whose children are themselves
 * fully tagged geometries.
 */
const readGeometry = (cursor: WkbCursor): string => {
  const littleEndian = cursor.view.getUint8(cursor.offset) === 1;
  cursor.offset += 1;
  const code = cursor.view.getUint32(cursor.offset, littleEndian);
  cursor.offset += 4;

  // ISO WKB encodes dimensionality in the thousands digit: 1000=Z, 2000=M, 3000=ZM.
  const base = code % 1000;
  const dimFlag = Math.floor(code / 1000);
  const dims = dimFlag === 0 ? 2 : dimFlag === 3 ? 4 : 3;
  const suffix = dimFlag === 1 ? " Z" : dimFlag === 2 ? " M" : dimFlag === 3 ? " ZM" : "";

  const name = GEOMETRY_NAMES[base];
  if (!name) throw new Error(`Unknown WKB geometry type ${code}`);

  switch (base) {
    case 1: {
      // A POINT EMPTY is stored as all-NaN coordinates.
      const start = cursor.offset;
      const coords = readCoords(cursor, littleEndian, dims);
      const allNaN = (() => {
        for (let i = 0; i < dims; i++) {
          if (!Number.isNaN(cursor.view.getFloat64(start + i * 8, littleEndian))) return false;
        }
        return true;
      })();
      return allNaN ? `${name}${suffix} EMPTY` : `${name}${suffix} (${coords})`;
    }
    case 2: {
      const body = readPointList(cursor, littleEndian, dims);
      return `${name}${suffix} ${body}`;
    }
    case 3: {
      const ringCount = cursor.view.getUint32(cursor.offset, littleEndian);
      cursor.offset += 4;
      if (ringCount === 0) return `${name}${suffix} EMPTY`;
      const rings: string[] = [];
      for (let i = 0; i < ringCount; i++) rings.push(readPointList(cursor, littleEndian, dims));
      return `${name}${suffix} (${rings.join(", ")})`;
    }
    default: {
      // MULTI* and GEOMETRYCOLLECTION hold complete child geometries.
      const childCount = cursor.view.getUint32(cursor.offset, littleEndian);
      cursor.offset += 4;
      if (childCount === 0) return `${name}${suffix} EMPTY`;
      const children: string[] = [];
      for (let i = 0; i < childCount; i++) children.push(readGeometry(cursor));
      if (base === 7) return `${name}${suffix} (${children.join(", ")})`;
      // MULTI* drop the child's type tag; MULTIPOINT drops its parens as well.
      const stripped = children.map((child) => {
        const open = child.indexOf("(");
        if (open === -1) return "EMPTY"; // a child rendered as "POINT EMPTY"
        const body = child.slice(open).trim();
        return base === 4 ? body.slice(1, -1) : body;
      });
      return `${name}${suffix} (${stripped.join(", ")})`;
    }
  }
};

/** GEOMETRY (`geoarrow.wkb` extension) → the WKT string DuckDB itself prints. */
export const wkbToWkt = (bytes: Uint8Array): string => {
  if (bytes.length > MAX_DECODE_BYTES) return `GEOMETRY (${formatByteSize(bytes.length)})`;
  try {
    const cursor: WkbCursor = {
      view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      offset: 0,
    };
    return readGeometry(cursor);
  } catch {
    return `GEOMETRY (${formatByteSize(bytes.length)})`;
  }
};

/* -------------------------------------------------------------------------- */
/* BLOB                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * BLOB → DuckDB's rendering: printable ASCII verbatim, everything else `\xHH`.
 *
 * BIT columns also arrive as untagged Arrow Binary and are indistinguishable
 * from BLOB, so they render as their stored bytes. Cast with `::VARCHAR` to
 * read a BIT column as a bit string.
 */
export const blobToString = (bytes: Uint8Array): string => {
  if (bytes.length > MAX_DECODE_BYTES) return `BLOB (${formatByteSize(bytes.length)})`;
  let out = "";
  for (const byte of bytes) {
    // DuckDB escapes everything outside printable ASCII, plus backslash itself.
    if (byte >= 0x20 && byte <= 0x7e && byte !== 0x5c) {
      out += String.fromCharCode(byte);
    } else {
      out += `\\x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* VARINT                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * VARINT → its decimal string. Layout is a 3-byte header (top bit of the first
 * byte is the sign, the remaining 23 bits are the magnitude byte count)
 * followed by big-endian magnitude bytes. Negative values store every byte,
 * header included, one's-complemented.
 */
export const varintToString = (bytes: Uint8Array): string => {
  if (bytes.length < 4) return "";
  if (bytes.length > MAX_DECODE_BYTES) return `VARINT (${formatByteSize(bytes.length)})`;
  const positive = (bytes[0] & 0x80) !== 0;
  const unmask = (byte: number): number => (positive ? byte : ~byte & 0xff);

  const length = ((unmask(bytes[0]) & 0x7f) << 16) | (unmask(bytes[1]) << 8) | unmask(bytes[2]);
  let magnitude = 0n;
  const end = Math.min(3 + length, bytes.length);
  for (let i = 3; i < end; i++) {
    magnitude = (magnitude << 8n) | BigInt(unmask(bytes[i]));
  }
  return positive ? magnitude.toString() : `-${magnitude.toString()}`;
};

/* -------------------------------------------------------------------------- */
/* INTERVAL                                                                    */
/* -------------------------------------------------------------------------- */

const NANOS_PER_SECOND = 1_000_000_000n;

/**
 * INTERVAL → "1 year 2 months 3 days 04:05:06", matching DuckDB. Months, days
 * and the time component each carry their own sign, exactly as DuckDB stores
 * them.
 */
export const intervalToString = (months: number, days: number, nanos: bigint): string => {
  const parts: string[] = [];

  if (months !== 0) {
    const years = Math.trunc(months / 12);
    const remainingMonths = months % 12;
    if (years !== 0) parts.push(`${years} ${Math.abs(years) === 1 ? "year" : "years"}`);
    if (remainingMonths !== 0) {
      parts.push(`${remainingMonths} ${Math.abs(remainingMonths) === 1 ? "month" : "months"}`);
    }
  }
  if (days !== 0) parts.push(`${days} ${Math.abs(days) === 1 ? "day" : "days"}`);

  // DuckDB always prints the time component when nothing else is present.
  if (nanos !== 0n || parts.length === 0) {
    const negative = nanos < 0n;
    const abs = negative ? -nanos : nanos;
    const totalSeconds = abs / NANOS_PER_SECOND;
    const fraction = abs % NANOS_PER_SECOND;
    const hh = String(totalSeconds / 3600n).padStart(2, "0");
    const mm = String((totalSeconds % 3600n) / 60n).padStart(2, "0");
    const ss = String(totalSeconds % 60n).padStart(2, "0");
    let time = `${hh}:${mm}:${ss}`;
    if (fraction !== 0n) {
      // DuckDB renders microsecond precision and trims trailing zeros.
      const micros = String(fraction / 1000n)
        .padStart(6, "0")
        .replace(/0+$/, "");
      if (micros) time += `.${micros}`;
    }
    parts.push(negative ? `-${time}` : time);
  }

  return parts.join(" ");
};
