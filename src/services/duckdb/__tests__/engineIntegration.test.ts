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
