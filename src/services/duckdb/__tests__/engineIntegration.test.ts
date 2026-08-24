import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { resultToJSON } from "../resultParser";

/**
 * End-to-end regression tests running the exact repro queries from #13 and
 * #15 through a REAL DuckDB engine — the node-blocking build of the same
 * duckdb-wasm package the app ships — and then through resultToJSON.
 * If duckdb-wasm's Arrow output shifts shape on an upgrade, these fail.
 */

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let conn: any;

beforeAll(async () => {
  const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
  const mainModule = require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm");
  const db = await duckdb.createDuckDB(
    {
      mvp: {
        mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
        mainWorker: null,
      },
      eh: { mainModule, mainWorker: null },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME
  );
  await db.instantiate(() => {});
  conn = db.connect();
}, 60000);

const run = (sql: string) => resultToJSON(conn.query(sql));

describe("real-engine coercion regressions", () => {
  it("SELECT 2.1 returns 2.1 — not NULL, not 21 (#13)", () => {
    const result = run("SELECT 2.1 AS v, 'Hello World' AS s");
    expect(result.error).toBeUndefined();
    expect(result.data[0].v).toBe(2.1);
    expect(result.data[0].s).toBe("Hello World");
  });

  it("SELECT 1.23 returns 1.23 (#13)", () => {
    expect(run("SELECT 1.23 AS v").data[0].v).toBe(1.23);
  });

  it("negative and high-scale decimals survive", () => {
    const result = run("SELECT (-2.1)::DECIMAL(10,1) AS a, 0.005::DECIMAL(18,3) AS b");
    expect(result.data[0].a).toBe(-2.1);
    expect(result.data[0].b).toBe(0.005);
  });

  it("DATE '2025-01-01' renders as 2025-01-01, never the day before (#15)", () => {
    const result = run("SELECT DATE '2025-01-01' AS d");
    expect(result.data[0].d).toBe("2025-01-01");
  });

  it("NOW() renders as a Date, not raw epoch millis (#15)", () => {
    const result = run("SELECT NOW() AS ts");
    expect(result.data[0].ts).toBeInstanceOf(Date);
    const year = (result.data[0].ts as Date).getUTCFullYear();
    expect(year).toBeGreaterThanOrEqual(2026);
  });

  it("naive TIMESTAMP keeps its wall time in UTC rendering", () => {
    const result = run("SELECT TIMESTAMP '2025-06-15 12:34:56' AS ts");
    const ts = result.data[0].ts as Date;
    expect(ts).toBeInstanceOf(Date);
    expect(ts.toISOString()).toBe("2025-06-15T12:34:56.000Z");
  });

  it("TIME renders as HH:MM:SS", () => {
    const result = run("SELECT TIME '12:34:56' AS t");
    expect(result.data[0].t).toBe("12:34:56");
  });

  it("BIGINT stays lossless as BigInt", () => {
    const result = run("SELECT 9007199254740993::BIGINT AS big");
    expect(String(result.data[0].big)).toBe("9007199254740993");
  });

  it("NULLs stay null across coerced types", () => {
    const result = run(
      "SELECT NULL::DECIMAL(4,1) AS d, NULL::DATE AS dt, NULL::TIMESTAMP AS ts, NULL::TIME AS t"
    );
    expect(result.data[0].d).toBeNull();
    expect(result.data[0].dt).toBeNull();
    expect(result.data[0].ts).toBeNull();
    expect(result.data[0].t).toBeNull();
  });

  it("multi-schema tables are enumerable and queryable via db.schema.table (#3)", () => {
    conn.query("CREATE SCHEMA staging");
    conn.query("CREATE TABLE staging.events AS SELECT 1 AS id");
    const tables = run(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'staging'"
    );
    expect(tables.data.length).toBe(1);
    const result = run('SELECT * FROM "memory"."staging"."events"');
    expect(Number(result.data[0].id)).toBe(1);
  });

  it("the explorer histogram query shape works on the real engine", () => {
    conn.query("CREATE TABLE histo_t AS SELECT (random()*100)::DOUBLE AS x FROM range(1000)");
    const result = run(`WITH src AS (SELECT "x" AS v FROM histo_t WHERE "x" IS NOT NULL),
        bounds AS (SELECT MIN(v) AS lo, MAX(v) AS hi FROM src)
      SELECT LEAST(19, GREATEST(0, CAST(FLOOR((v - lo) * 20.0 / NULLIF(hi - lo, 0)) AS INT))) AS bucket,
             COUNT(*) AS n
      FROM src, bounds GROUP BY 1 ORDER BY 1`);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.length).toBeLessThanOrEqual(20);
    const total = result.data.reduce((acc, row) => acc + Number(row.n), 0);
    expect(total).toBe(1000);
  });
});

/**
 * The decoders in cellDecoders.ts exist to reproduce DuckDB's own rendering of
 * types Arrow ships as raw bytes. Rather than hand-writing expected strings,
 * these tests ask the engine to render each value with ::VARCHAR and assert our
 * decoded cell matches it exactly. If DuckDB changes a format, these fail.
 */
describe("byte-backed types match DuckDB's own rendering", () => {
  const expectMatchesEngine = (expression: string) => {
    const decoded = run(`SELECT ${expression} AS v`).data[0].v;
    const rendered = run(`SELECT (${expression})::VARCHAR AS v`).data[0].v;
    expect(decoded).toBe(rendered);
  };

  const GEOMETRIES = [
    "'POINT(3 4)'::GEOMETRY",
    "'POINT(-1.5 2.25)'::GEOMETRY",
    "'POINT Z(1 2 3)'::GEOMETRY",
    "'POINT EMPTY'::GEOMETRY",
    "'LINESTRING(0 0, 1 1, 2 4)'::GEOMETRY",
    "'POLYGON((0 0,4 0,4 4,0 4,0 0))'::GEOMETRY",
    "'POLYGON((0 0,4 0,4 4,0 4,0 0),(1 1,2 1,2 2,1 2,1 1))'::GEOMETRY",
    "'MULTIPOINT(0 0, 1 1)'::GEOMETRY",
    "'MULTILINESTRING((0 0,1 1),(2 2,3 3))'::GEOMETRY",
    "'MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((2 2,3 2,3 3,2 2)))'::GEOMETRY",
    "'GEOMETRYCOLLECTION(POINT(1 2),LINESTRING(0 0,1 1))'::GEOMETRY",
  ];

  it.each(GEOMETRIES)("GEOMETRY renders as WKT: %s", (expression) => {
    expectMatchesEngine(expression);
  });

  it("GEOMETRY columns are labelled GEOMETRY, not Binary", () => {
    const result = run("SELECT 'POINT(1 2)'::GEOMETRY AS g");
    expect(result.columnTypes[0]).toBe("GEOMETRY");
  });

  const INTERVALS = [
    "INTERVAL 1 YEAR + INTERVAL 2 MONTH + INTERVAL '3 days 04:05:06'",
    "INTERVAL '90' MINUTE",
    "INTERVAL '-1 month -2 days -00:00:01'",
    "INTERVAL '0' SECOND",
    "INTERVAL '1.5' SECOND",
    "INTERVAL '13' MONTH",
    "INTERVAL '1' MONTH",
    "INTERVAL '1' DAY",
    "INTERVAL '-25' HOUR",
    "INTERVAL '999999' SECOND",
  ];

  it.each(INTERVALS)("INTERVAL keeps its time component: %s", (expression) => {
    expectMatchesEngine(expression);
  });

  it("INTERVAL '90' MINUTE is not silently zeroed", () => {
    expect(run("SELECT INTERVAL '90' MINUTE AS v").data[0].v).toBe("01:30:00");
  });

  const VARINTS = [
    "123456789012345678901234567890::VARINT",
    "(-123456789012345678901234567890)::VARINT",
    "0::VARINT",
    "1::VARINT",
    "(-1)::VARINT",
    "255::VARINT",
    "(-256)::VARINT",
  ];

  it.each(VARINTS)("VARINT renders as a decimal string: %s", (expression) => {
    expectMatchesEngine(expression);
  });

  it("VARINT columns are labelled VARINT", () => {
    expect(run("SELECT 1::VARINT AS v").columnTypes[0]).toBe("VARINT");
  });

  const BLOBS = ["'\\xAA\\xBB'::BLOB", "'hello'::BLOB", "''::BLOB", "'a\\x00b'::BLOB"];

  it.each(BLOBS)("BLOB renders like DuckDB: %s", (expression) => {
    expectMatchesEngine(expression);
  });

  it("byte-backed columns stay null when null", () => {
    const result = run(
      "SELECT NULL::GEOMETRY AS g, NULL::INTERVAL AS i, NULL::VARINT AS v, NULL::BLOB AS b"
    );
    expect(result.data[0].g).toBeNull();
    expect(result.data[0].i).toBeNull();
    expect(result.data[0].v).toBeNull();
    expect(result.data[0].b).toBeNull();
  });

  it("interval nulls interleave correctly with values across rows", () => {
    const result = run(`SELECT * FROM (VALUES
      (INTERVAL '1' DAY), (NULL), (INTERVAL '90' MINUTE), (NULL), (INTERVAL '2' MONTH)
    ) AS t(v)`);
    expect(result.data.map((row) => row.v)).toEqual(["1 day", null, "01:30:00", null, "2 months"]);
  });
});
