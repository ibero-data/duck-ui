import type { ChartConfig, EditorTab, NotebookCell } from "@/store/types";

/**
 * Shareable analysis links.
 *
 * A share encodes a single workspace tab (SQL query or notebook) plus its chart
 * configuration into a compact, URL-safe string. The payload travels entirely in
 * the URL hash fragment (`#s=…`) so it never reaches a server — sharing stays
 * fully client-side, no backend required.
 *
 * Payloads are gzip-compressed (native CompressionStream) then base64url-encoded
 * to keep links short even for notebooks with several cells.
 *
 * Limitation: only the query/notebook definition travels, not the underlying
 * data. Shares that read from remote sources (read_parquet('https://…'), httpfs,
 * cloud URLs) reproduce fully on open; shares that read locally-imported tables
 * need the recipient to load the same data first.
 */

export const SHARE_VERSION = 2;
export const SHARE_HASH_KEY = "s";

/** An interactive filter exposed on an embed, keyed by a result column. */
export interface SharedParam {
  /** Result column this control filters on. */
  column: string;
  /** Display label (defaults to the column name). */
  label?: string;
  /** Control kind: dropdown of values, free-text contains, or numeric range. */
  type: "select" | "search" | "range";
}

export interface SharePayload {
  /** Schema version, for forward compatibility. */
  v: number;
  /** Tab kind being shared. */
  type: "sql" | "notebook";
  /** Tab title. */
  title: string;
  /** SQL text (for `type: "sql"`). */
  sql?: string;
  /** Serialized notebook cells (for `type: "notebook"`). */
  cells?: NotebookCell[];
  /** Chart configuration for the result (sql tabs). */
  chartConfig?: ChartConfig;
  /** Interactive filter controls for embeds (v2+). */
  params?: SharedParam[];
  /** Whether the query should auto-run when the link is opened. */
  autoRun?: boolean;
}

//
// base64url helpers (URL-safe, no padding)
//

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

//
// gzip helpers (native Web Streams)
//

async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(
    new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))
  );
  return new Uint8Array(await stream.arrayBuffer());
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(
    new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))
  );
  return new Uint8Array(await stream.arrayBuffer());
}

//
// Encode / decode
//

/** Encode a share payload into a URL-safe string. */
export async function encodeShare(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  const compressed = await gzip(new TextEncoder().encode(json));
  return bytesToBase64Url(compressed);
}

/** Decode a share string back into a payload, or null if invalid. */
export async function decodeShare(value: string): Promise<SharePayload | null> {
  try {
    const bytes = base64UrlToBytes(value);
    const json = new TextDecoder().decode(await gunzip(bytes));
    const parsed = JSON.parse(json) as SharePayload;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed.type !== "sql" && parsed.type !== "notebook")
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("Failed to decode share payload:", error);
    return null;
  }
}

//
// Tab <-> payload mapping
//

/** Build a share payload from a workspace tab. `params` adds interactive embed filters (sql only). */
export function tabToSharePayload(
  tab: EditorTab,
  autoRun = true,
  params?: SharedParam[]
): SharePayload | null {
  if (tab.type === "sql") {
    const sql = typeof tab.content === "string" ? tab.content : "";
    return {
      v: SHARE_VERSION,
      type: "sql",
      title: tab.title,
      sql,
      chartConfig: tab.chartConfig,
      params: params && params.length > 0 ? params : undefined,
      autoRun,
    };
  }
  if (tab.type === "notebook") {
    let cells: NotebookCell[] = [];
    if (typeof tab.content === "string") {
      try {
        cells = JSON.parse(tab.content) as NotebookCell[];
      } catch {
        cells = [];
      }
    }
    // Strip cached results — only the definition is shared.
    const cleanCells = cells.map((cell) => ({ ...cell, result: null }));
    return {
      v: SHARE_VERSION,
      type: "notebook",
      title: tab.title,
      cells: cleanCells,
      autoRun,
    };
  }
  return null;
}

/** Serialize notebook cells to the JSON string format stored in tab content. */
export function serializeShareCells(cells: NotebookCell[]): string {
  return JSON.stringify(cells, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

/** Encode a tab to its URL-safe share param, or null if not shareable. */
export async function encodeShareForTab(
  tab: EditorTab,
  autoRun = true,
  params?: SharedParam[]
): Promise<string | null> {
  const payload = tabToSharePayload(tab, autoRun, params);
  if (!payload) return null;
  return encodeShare(payload);
}

/** Build a full shareable URL (origin + path + #s=payload) for a tab. */
export async function buildTabShareUrl(tab: EditorTab, autoRun = true): Promise<string | null> {
  const encoded = await encodeShareForTab(tab, autoRun);
  if (!encoded) return null;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${SHARE_HASH_KEY}=${encoded}`;
}

/** All shareable forms for a tab, built from a single encode pass. */
export interface ShareLinks {
  /** Full Duck-UI app link (#s=). */
  appUrl: string;
  /** Crawlable form (/a/?s=) — same payload, server-visible path (Phase 3). */
  crawlUrl: string;
  /** Chrome-free viewer link, suitable for an <iframe>. */
  embedUrl: string;
  /** Ready-to-paste <iframe> snippet (works on any host page). */
  iframeSnippet: string;
  /** Ready-to-paste <duck-embed> Web Component snippet (cross-origin-isolated hosts). */
  webComponentSnippet: string;
}

/** jsDelivr URL for the pre-bundled @duck_ui/cdn web-component bundle. */
const DUCK_UI_CDN = "https://cdn.jsdelivr.net/npm/@duck_ui/cdn/dist/duck-ui.min.js";

export async function buildShareLinks(
  tab: EditorTab,
  autoRun = true,
  params?: SharedParam[]
): Promise<ShareLinks | null> {
  const encoded = await encodeShareForTab(tab, autoRun, params);
  if (!encoded) return null;
  const { origin, pathname } = window.location;
  const embedUrl = `${origin}/embed#${SHARE_HASH_KEY}=${encoded}`;
  return {
    appUrl: `${origin}${pathname}#${SHARE_HASH_KEY}=${encoded}`,
    crawlUrl: `${origin}/a/?${SHARE_HASH_KEY}=${encoded}`,
    embedUrl,
    iframeSnippet: `<iframe src="${embedUrl}" width="100%" height="480" style="border:0;border-radius:8px" title="${(tab.title || "Duck-UI analysis").replace(/"/g, "&quot;")}"></iframe>`,
    webComponentSnippet: `<script src="${DUCK_UI_CDN}"></script>\n<duck-embed share="${encoded}"></duck-embed>`,
  };
}

/** Read and clear a share string from the current URL hash, if present. */
export function readShareFromHash(): string | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get(SHARE_HASH_KEY);
}

/** Read a share string from the `?s=` query param, if present (crawlable form). */
export function readShareFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(SHARE_HASH_KEY);
}

/** Read a share string from either the hash (#s=) or the query (?s=). */
export function readShareParam(): string | null {
  return readShareFromHash() ?? readShareFromQuery();
}

/** Remove the share param (both #s= and ?s=) from the URL without reloading. */
export function clearShareHash(): void {
  const { origin, pathname, search } = window.location;
  const params = new URLSearchParams(search);
  params.delete(SHARE_HASH_KEY);
  const cleanedSearch = params.toString();
  window.history.replaceState(
    null,
    "",
    `${origin}${pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}`
  );
}

/**
 * Heuristic: does this SQL read from a public/remote source (and so reproduce
 * for anyone), versus a locally-imported table (which a recipient won't have)?
 * Used to give honest "this needs data that isn't public" feedback in embeds.
 */
export function queryReadsRemoteSource(sql: string): boolean {
  return /https?:\/\/|read_parquet|read_csv|read_json|read_ndjson|\bhttpfs\b|s3:\/\/|gcs:\/\/|gs:\/\/|az:\/\/|azure:\/\/|r2:\/\//i.test(
    sql
  );
}

/**
 * Whether a shared query will reproduce in a viewer's browser: it either
 * reads from a remote source, or has no FROM/JOIN clause at all (constant
 * expressions like SELECT 42 read no table). Conservative: anything with a
 * FROM on a non-remote source still warns.
 */
export function queryReproducesForViewers(sql: string): boolean {
  return queryReadsRemoteSource(sql) || !/\b(from|join)\b/i.test(sql);
}
