/**
 * Statement screening for guest SQL.
 *
 * Read this before relying on it: **this is defence in depth, not the security
 * boundary.** Pattern-matching SQL is a denylist, and denylists leak. A
 * sufficiently creative statement will eventually get past any list of
 * forbidden keywords.
 *
 * The boundary that actually holds is architectural, and lives elsewhere:
 *
 *   1. Guest SQL runs in a SEPARATE DuckDB-WASM instance (`shareRuntime.ts`),
 *      in its own worker, containing only data the host explicitly put there.
 *      A guest that defeats every check on this page still cannot see the
 *      host's private tables, OPFS databases, or credentials — those are in a
 *      different engine that this one has no handle to.
 *   2. That instance runs with `enable_external_access=false` and
 *      `lock_configuration=true`, which DuckDB itself enforces. No httpfs, no
 *      reading local files, no ATTACH to a remote source, no extension
 *      loading, and no way to turn any of that back on from SQL.
 *
 * What this module adds on top is early, legible refusal: a guest that types
 * `DROP TABLE` gets "this connection is read-only" instead of a confusing
 * engine error, and the host gets a log line. Treat a bypass here as a bug
 * worth fixing, not as a breach.
 */

import type { CapabilityPolicy } from "./capability";

export interface PolicyVerdict {
  allowed: boolean;
  /** Present when refused. Written for the guest to read. */
  reason?: string;
}

const ALLOWED: PolicyVerdict = { allowed: true };
const refuse = (reason: string): PolicyVerdict => ({ allowed: false, reason });

/**
 * Strips comments and string literals before matching.
 *
 * Without this, `SELECT 'DROP TABLE'` trips a naive scan and a real statement
 * hides inside a block comment. Literals become empty strings, which keeps the
 * statement's structure intact for the checks below.
 */
export const normalizeForScreening = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''")
    .replace(/\s+/g, " ")
    .trim();

/** Statements that mutate data or schema. */
const MUTATING =
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|DROP|ALTER|REPLACE|GRANT|REVOKE|VACUUM|CHECKPOINT)\b/i;

/** Statements that reach outside the runtime. */
const ATTACHING = /\b(ATTACH|DETACH)\b/i;
const COPYING = /\b(COPY|EXPORT|IMPORT)\b/i;
const EXTENSION_LOADING = /\b(INSTALL|LOAD|FORCE\s+INSTALL)\b/i;

/**
 * Configuration changes. Blocked because `lock_configuration=true` already
 * refuses them at the engine — catching them here turns an opaque engine error
 * into a clear message, and flags a guest probing the boundary.
 */
const CONFIGURING = /\bSET\s+(?!SESSION\s+TIME\s+ZONE)/i;

/** Functions that read from disk or the network. */
const EXTERNAL_READERS =
  /\b(read_csv|read_csv_auto|read_json|read_json_auto|read_ndjson|read_parquet|read_blob|read_text|parquet_scan|glob|sniff_csv)\s*\(/i;

/**
 * Screens one statement against a capability's policy.
 *
 * Fails closed: anything not recognised as a read is refused.
 */
export const screenStatement = (sql: string, policy: CapabilityPolicy): PolicyVerdict => {
  const normalized = normalizeForScreening(sql);

  if (!normalized) return refuse("Empty statement");

  // Multiple statements would let a permitted SELECT carry a forbidden second
  // statement behind a semicolon.
  const withoutTrailing = normalized.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return refuse("Run one statement at a time on a shared connection");
  }

  if (policy.readonly && MUTATING.test(withoutTrailing)) {
    return refuse("This shared connection is read-only");
  }
  if (!policy.allowAttach && ATTACHING.test(withoutTrailing)) {
    return refuse("ATTACH is not available on a shared connection");
  }
  if (!policy.allowCopy && COPYING.test(withoutTrailing)) {
    return refuse("COPY, EXPORT and IMPORT are not available on a shared connection");
  }
  if (EXTENSION_LOADING.test(withoutTrailing)) {
    return refuse("Extensions cannot be loaded on a shared connection");
  }
  if (CONFIGURING.test(withoutTrailing)) {
    return refuse("Configuration cannot be changed on a shared connection");
  }
  if (EXTERNAL_READERS.test(withoutTrailing)) {
    return refuse("Reading files or URLs is not available on a shared connection");
  }

  // Allowlist the shapes that are unambiguously reads. Anything else — an
  // unfamiliar statement, a new DuckDB keyword — is refused rather than waved
  // through, because a denylist that has not heard of a statement lets it run.
  if (
    !/^\s*(WITH|SELECT|FROM|DESCRIBE|SHOW|SUMMARIZE|EXPLAIN|PRAGMA\s+table_info|VALUES|TABLE)\b/i.test(
      withoutTrailing
    )
  ) {
    return refuse("Only read queries can run on a shared connection");
  }

  return ALLOWED;
};

/**
 * Checks referenced object names against an allowlist, when one is set.
 *
 * Coarse by design: it looks at identifiers after FROM/JOIN. A host that
 * restricts to specific schemas should ALSO put only those tables into the
 * share runtime — this check exists so a mistake is caught twice, not so it
 * can be the only thing standing in the way.
 */
export const screenReferences = (sql: string, policy: CapabilityPolicy): PolicyVerdict => {
  const allowed = policy.allowedTables;
  if (!allowed || allowed.length === 0) return ALLOWED;

  const normalized = normalizeForScreening(sql).toLowerCase();
  const permitted = new Set(allowed.map((name) => name.toLowerCase()));
  const referenced = [...normalized.matchAll(/\b(?:from|join)\s+([a-z0-9_."]+)/g)].map((match) =>
    match[1].replace(/"/g, "")
  );

  for (const reference of referenced) {
    const bare = reference.split(".").pop() ?? reference;
    if (!permitted.has(reference) && !permitted.has(bare)) {
      return refuse(`"${reference}" is not part of this shared connection`);
    }
  }
  return ALLOWED;
};

/** Runs every check a guest statement must pass. */
export const screenGuestQuery = (sql: string, policy: CapabilityPolicy): PolicyVerdict => {
  const statement = screenStatement(sql, policy);
  if (!statement.allowed) return statement;
  return screenReferences(sql, policy);
};
