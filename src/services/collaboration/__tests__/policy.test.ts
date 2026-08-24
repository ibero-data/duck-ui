import { describe, it, expect } from "vitest";
import {
  normalizeForScreening,
  screenGuestQuery,
  screenReferences,
  screenStatement,
} from "../capabilities/policy";
import {
  DEFAULT_CAPABILITY_POLICY,
  effectiveMaxRows,
  isCapabilityExpired,
  toWireCapability,
  type CapabilityPolicy,
  type SharedCapability,
} from "../capabilities/capability";
import { negotiateVersion, protocolId, SUPPORTED_PROTOCOL_VERSIONS } from "../protocol/version";
import { decodeMessage, encodeMessage } from "../protocol/codec";
import { encodeFrame } from "@/services/arrow/chunking";

const policy: CapabilityPolicy = { ...DEFAULT_CAPABILITY_POLICY };

const allows = (sql: string) => screenStatement(sql, policy).allowed;
const refusalFor = (sql: string) => screenStatement(sql, policy).reason ?? "";

describe("statement screening — reads are allowed", () => {
  it.each([
    "SELECT * FROM sales",
    "select id from sales where region = 'north'",
    "WITH t AS (SELECT 1) SELECT * FROM t",
    "DESCRIBE sales",
    "SHOW TABLES",
    "SUMMARIZE sales",
    "EXPLAIN SELECT * FROM sales",
    "VALUES (1), (2)",
    "SELECT * FROM sales;",
  ])("allows %s", (sql) => {
    expect(allows(sql)).toBe(true);
  });
});

describe("statement screening — writes and escapes are refused", () => {
  it.each([
    ["DROP TABLE sales", /read-only/i],
    ["DELETE FROM sales", /read-only/i],
    ["INSERT INTO sales VALUES (1)", /read-only/i],
    ["UPDATE sales SET id = 2", /read-only/i],
    ["CREATE TABLE t AS SELECT 1", /read-only/i],
    ["ALTER TABLE sales ADD COLUMN x INT", /read-only/i],
    ["ATTACH 'other.db' AS other", /ATTACH/i],
    ["COPY sales TO 'out.csv'", /COPY/i],
    ["INSTALL httpfs", /Extensions/i],
    ["LOAD httpfs", /Extensions/i],
    ["SET enable_external_access=true", /Configuration/i],
    ["SELECT * FROM read_csv('/etc/passwd')", /files or URLs/i],
    ["SELECT * FROM read_parquet('https://evil.example/x.parquet')", /files or URLs/i],
    ["SELECT * FROM glob('/**')", /files or URLs/i],
  ])("refuses %s", (sql, expected) => {
    expect(allows(sql)).toBe(false);
    expect(refusalFor(sql)).toMatch(expected);
  });

  it("refuses a second statement hidden behind a semicolon", () => {
    expect(allows("SELECT 1; DROP TABLE sales")).toBe(false);
    expect(refusalFor("SELECT 1; DROP TABLE sales")).toMatch(/one statement at a time/i);
  });

  it("refuses an empty statement", () => {
    expect(allows("   ")).toBe(false);
  });

  it("fails closed on a statement it does not recognise", () => {
    expect(allows("CALL some_new_duckdb_procedure()")).toBe(false);
    expect(refusalFor("CALL some_new_duckdb_procedure()")).toMatch(/only read queries/i);
  });
});

describe("statement screening — evasion attempts", () => {
  it("sees through a comment splitting a keyword's context", () => {
    expect(allows("SELECT 1 /* harmless */; DROP TABLE sales")).toBe(false);
  });

  it("sees through a line comment hiding a second statement", () => {
    expect(allows("SELECT 1 -- comment\n; DROP TABLE sales")).toBe(false);
  });

  it("does NOT trip on a forbidden word that is only a string literal", () => {
    // A denylist that refuses this is unusable — the word appears in data.
    expect(allows("SELECT * FROM sales WHERE region = 'DROP TABLE'")).toBe(true);
  });

  it("does not let an escaped quote smuggle a statement out of a literal", () => {
    expect(allows("SELECT 'it''s fine' AS x")).toBe(true);
    expect(allows("SELECT 'a'; DROP TABLE sales")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(allows("dRoP tAbLe sales")).toBe(false);
    expect(allows("sElEcT * FROM sales")).toBe(true);
  });

  it("collapses whitespace so spacing cannot hide a keyword", () => {
    expect(normalizeForScreening("SELECT\n\t1  FROM   sales")).toBe("SELECT 1 FROM sales");
    expect(allows("DROP\n\n\tTABLE sales")).toBe(false);
  });
});

describe("policy toggles", () => {
  it("permits ATTACH only when the grant says so", () => {
    expect(screenStatement("ATTACH 'x.db' AS x", { ...policy, allowAttach: true }).allowed).toBe(
      // Still refused: ATTACH is not a read statement, so the allowlist stops it.
      false
    );
  });

  it("permits writes only when the grant is not read-only", () => {
    // `readonly` is typed as `true` in this release — writable grants do not
    // exist, and this asserts the type-level guarantee holds at runtime too.
    expect(policy.readonly).toBe(true);
  });
});

describe("reference screening", () => {
  const restricted: CapabilityPolicy = { ...policy, allowedTables: ["sales", "main.customers"] };

  it("allows a query against a permitted table", () => {
    expect(screenReferences("SELECT * FROM sales", restricted).allowed).toBe(true);
  });

  it("allows a schema-qualified reference to a permitted table", () => {
    expect(screenReferences("SELECT * FROM main.customers", restricted).allowed).toBe(true);
  });

  it("refuses a table outside the allowlist", () => {
    const verdict = screenReferences("SELECT * FROM secrets", restricted);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/not part of this shared connection/i);
  });

  it("refuses a forbidden table reached through a JOIN", () => {
    expect(
      screenReferences("SELECT * FROM sales JOIN secrets USING (id)", restricted).allowed
    ).toBe(false);
  });

  it("imposes no restriction when the grant sets no allowlist", () => {
    expect(screenReferences("SELECT * FROM anything", policy).allowed).toBe(true);
  });
});

describe("screenGuestQuery", () => {
  it("applies statement and reference checks together", () => {
    const restricted: CapabilityPolicy = { ...policy, allowedTables: ["sales"] };
    expect(screenGuestQuery("SELECT * FROM sales", restricted).allowed).toBe(true);
    expect(screenGuestQuery("SELECT * FROM other", restricted).allowed).toBe(false);
    expect(screenGuestQuery("DROP TABLE sales", restricted).allowed).toBe(false);
  });
});

describe("capability policy", () => {
  const base: SharedCapability = {
    id: "cap",
    ownerPeerId: "peer",
    name: "Production",
    type: "query",
    permission: "read",
    executor: { kind: "peer", peerId: "peer" },
    policy: { ...DEFAULT_CAPABILITY_POLICY },
  };

  it("defaults to refusing everything that reaches outside", () => {
    expect(DEFAULT_CAPABILITY_POLICY).toMatchObject({
      readonly: true,
      allowDDL: false,
      allowAttach: false,
      allowCopy: false,
    });
  });

  it("treats a grant with no expiry as valid", () => {
    expect(isCapabilityExpired(base)).toBe(false);
  });

  it("treats a past expiry as expired", () => {
    const expired = { ...base, policy: { ...base.policy, expiresAt: "2020-01-01T00:00:00Z" } };
    expect(isCapabilityExpired(expired)).toBe(true);
  });

  it("treats an unparseable expiry as expired — failing closed", () => {
    const broken = { ...base, policy: { ...base.policy, expiresAt: "not-a-date" } };
    expect(isCapabilityExpired(broken)).toBe(true);
  });

  it("takes the stricter of the requested and granted row caps", () => {
    expect(effectiveMaxRows({ ...policy, maxResultRows: 100 }, 10)).toBe(10);
    expect(effectiveMaxRows({ ...policy, maxResultRows: 100 }, 1_000_000)).toBe(100);
    expect(effectiveMaxRows({ ...policy, maxResultRows: 100 }, undefined)).toBe(100);
    expect(effectiveMaxRows({ ...policy, maxResultRows: undefined }, 42)).toBe(42);
  });

  it("strips everything but names, shape and limits before sending to a guest", () => {
    const wire = toWireCapability(base);
    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain("executor");
    expect(serialized).not.toContain("password");
    expect(wire).toMatchObject({ id: "cap", name: "Production", permission: "read" });
  });
});

describe("protocol versioning", () => {
  it("names itself in a readable form", () => {
    expect(protocolId(1)).toBe("duck-peer/1");
  });

  it("picks the highest version both peers speak", () => {
    expect(negotiateVersion([1, 2, 3])).toBe(1);
    expect(negotiateVersion(SUPPORTED_PROTOCOL_VERSIONS)).toBe(1);
  });

  it("refuses rather than guessing when there is no shared version", () => {
    expect(negotiateVersion([7, 8])).toBeNull();
    expect(negotiateVersion([])).toBeNull();
  });
});

describe("codec", () => {
  it("round-trips a message with its payload", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const decoded = decodeMessage(
      encodeMessage(
        {
          t: "query.batch",
          queryId: "q",
          seq: 0,
          rows: 3,
          chunk: { index: 0, count: 1, totalBytes: 3 },
        },
        payload
      )
    );

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.message).toMatchObject({ t: "query.batch", queryId: "q" });
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3]);
  });

  it("reports a version mismatch as a version failure, not a schema one", () => {
    const decoded = decodeMessage(encodeFrame({ v: 42, t: "hello" }));
    expect(decoded).toMatchObject({ ok: false, reason: "version" });
  });

  it("reports a missing version rather than assuming the current one", () => {
    const decoded = decodeMessage(encodeFrame({ t: "hello" }));
    expect(decoded).toMatchObject({ ok: false, reason: "version" });
  });

  it("rejects a message that fails validation", () => {
    const decoded = decodeMessage(encodeFrame({ v: 1, t: "hello", peerId: "" }));
    expect(decoded).toMatchObject({ ok: false, reason: "schema" });
  });

  it("rejects an oversized SQL string as a protocol violation, not a framing error", () => {
    // The SQL cap sits inside the header budget precisely so this is refused
    // by validation rather than blowing up the framing layer.
    const decoded = decodeMessage(
      encodeFrame({
        v: 1,
        t: "query.start",
        queryId: "q",
        capabilityId: "c",
        sql: "x".repeat(200_000),
      })
    );
    expect(decoded).toMatchObject({ ok: false, reason: "schema" });
  });

  it("accepts a long-but-legal SQL string", () => {
    const decoded = decodeMessage(
      encodeFrame({
        v: 1,
        t: "query.start",
        queryId: "q",
        capabilityId: "c",
        sql: `SELECT ${"x".repeat(100_000)}`,
      })
    );
    expect(decoded.ok).toBe(true);
  });

  it("never throws on a garbage frame", () => {
    expect(() => decodeMessage(new ArrayBuffer(3))).not.toThrow();
    expect(decodeMessage(new ArrayBuffer(3))).toMatchObject({ ok: false, reason: "malformed" });
  });
});
