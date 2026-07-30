import { sqlEscapeString, sqlEscapeIdentifier } from "@/lib/sqlSanitize";

/**
 * "Open in Duck-UI" deep links.
 *
 * `?load=<url>` points at a remote dataset (Parquet/CSV/JSON file, a .duckdb
 * database, or a DuckLake catalog). Optional `&sql=<query>` supplies the query
 * to open with it, `&format=` overrides format inference, and `&run=0` skips
 * auto-running after the user confirms. `load` can repeat for multiple sources.
 *
 * Nothing here runs automatically: the app shows a confirmation listing the
 * hosts and the SQL before touching the network or executing anything —
 * these links arrive from strangers' READMEs by design.
 */

export type SourceFormat = "csv" | "json" | "parquet" | "duckdb" | "ducklake";

export interface DeepLinkSource {
  url: string;
  format: SourceFormat;
  /** View/attach name derived from the URL (already sanitized, not escaped). */
  name: string;
}

export interface DeepLinkRequest {
  sources: DeepLinkSource[];
  sql: string | null;
  autoRun: boolean;
}

/** Infer the source format from the URL shape. */
export function inferFormat(url: string): SourceFormat | null {
  if (/^ducklake:/i.test(url)) return "ducklake";
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(csv|tsv|csv\.gz|tsv\.gz)$/.test(path)) return "csv";
  if (/\.(json|jsonl|ndjson|json\.gz)$/.test(path)) return "json";
  if (/\.parquet$/.test(path)) return "parquet";
  if (/\.(duckdb|ddb|db)$/.test(path)) return "duckdb";
  return null;
}

/** Derive a safe table/view/attach name from the URL's filename. */
export function deriveSourceName(url: string, index = 0): string {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "");
  const path = withoutScheme.split(/[?#]/)[0];
  const fileName = path.split("/").filter(Boolean).pop() ?? "";
  const base = fileName.replace(/\.[a-z0-9.]+$/i, "");
  const cleaned = base
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const name = cleaned || `data_${index + 1}`;
  return /^[0-9]/.test(name) ? `t_${name}` : name;
}

/**
 * Parses deep-link params. Returns null when the URL carries no `load` param.
 * Only http(s) and ducklake-over-https sources are accepted — anything else
 * (file:, data:, chrome-extension:, ...) is dropped.
 */
export function parseDeepLink(params: URLSearchParams): DeepLinkRequest | null {
  const loads = params.getAll("load").filter(Boolean);
  if (loads.length === 0) return null;

  const formatOverride = params.get("format")?.toLowerCase() ?? null;
  const isFormat = (value: string | null): value is SourceFormat =>
    value === "csv" ||
    value === "json" ||
    value === "parquet" ||
    value === "duckdb" ||
    value === "ducklake";

  const sources: DeepLinkSource[] = [];
  loads.forEach((url, index) => {
    const trimmed = url.trim();
    const isHttp = /^https?:\/\//i.test(trimmed);
    const isDuckLake = /^ducklake:https?:\/\//i.test(trimmed);
    if (!isHttp && !isDuckLake) return;
    const format = isDuckLake
      ? "ducklake"
      : isFormat(formatOverride)
        ? formatOverride
        : inferFormat(trimmed);
    if (!format) return;
    sources.push({ url: trimmed, format, name: deriveSourceName(trimmed, index) });
  });

  if (sources.length === 0) return null;

  return {
    sources,
    sql: params.get("sql")?.trim() || null,
    autoRun: params.get("run") !== "0",
  };
}

/** SQL statement that makes one source queryable under its derived name. */
export function buildSourceSQL(source: DeepLinkSource): string {
  const ident = sqlEscapeIdentifier(source.name);
  const literal = sqlEscapeString(source.url);
  switch (source.format) {
    case "csv":
      return `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM read_csv('${literal}')`;
    case "json":
      return `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM read_json('${literal}', auto_detect=true)`;
    case "parquet":
      return `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM read_parquet('${literal}')`;
    case "duckdb":
    case "ducklake":
      return `ATTACH '${literal}' AS ${ident} (READ_ONLY)`;
  }
}

/** Query opened when the link doesn't carry its own `sql`. */
export function defaultDeepLinkQuery(sources: DeepLinkSource[]): string {
  const first = sources[0];
  if (!first) return "";
  if (first.format === "duckdb" || first.format === "ducklake") {
    return `SHOW ALL TABLES;`;
  }
  return `SELECT * FROM ${sqlEscapeIdentifier(first.name)} LIMIT 100;`;
}

/** Builds an Open-in-Duck-UI link for the given app origin. */
export function buildDeepLink(
  baseUrl: string,
  sourceUrls: string[],
  sql?: string,
  options: { run?: boolean } = {}
): string {
  const url = new URL(baseUrl);
  for (const source of sourceUrls) {
    if (source.trim()) url.searchParams.append("load", source.trim());
  }
  if (sql?.trim()) url.searchParams.set("sql", sql.trim());
  if (options.run === false) url.searchParams.set("run", "0");
  return url.toString();
}

/** Markdown badge snippet dataset publishers paste into a README. */
export function buildBadgeMarkdown(deepLink: string, appOrigin: string): string {
  return `[![Open in Duck-UI](${appOrigin.replace(/\/$/, "")}/badge.svg)](${deepLink})`;
}

/**
 * Pulls remote data sources out of a SQL text: URLs inside read_csv/read_json/
 * read_parquet calls and http(s)/ducklake ATTACH targets. Used to prefill the
 * badge generator from the query being shared.
 */
export function extractRemoteSources(sql: string): string[] {
  const found = new Set<string>();
  const readerPattern = /read_(?:csv|json|parquet)[a-z_]*\s*\(\s*'((?:https?:)[^']+)'/gi;
  const attachPattern = /attach\s+(?:database\s+)?'((?:ducklake:)?https?:[^']+)'/gi;
  for (const match of sql.matchAll(readerPattern)) found.add(match[1]);
  for (const match of sql.matchAll(attachPattern)) found.add(match[1]);
  return [...found];
}

/**
 * Best-effort detection of a CORS/network failure from a remote read. In the
 * browser a blocked cross-origin fetch surfaces as a generic network error,
 * so this errs on the side of showing the hosting hint.
 */
export function isLikelyCorsError(message: string): boolean {
  return /failed to fetch|cors|networkerror|load failed|access-control|http error|403|401/i.test(
    message
  );
}
