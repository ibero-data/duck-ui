/**
 * Dashboard share links, with roles.
 *
 * Three ways a dashboard leaves your browser, honest about what each is
 * without a backend (§24):
 *
 *   viewer   the document opens read-only. Anyone with the link.
 *   editor   the document imports as an editable copy in their profile.
 *   live     the existing collaborative session — real co-editing, host
 *            compute, revocable. Handled by Share Live, not by a link here.
 *
 * The payload is the SOURCE — markdown text, SQL included — never results.
 * Same caveat as every share in Duck-UI: queries reproduce for the recipient
 * only if the data they read is reachable from the recipient's browser
 * (remote parquet/CSV/DuckLake yes; your locally imported tables no).
 *
 * Travels in the URL fragment, like every other Duck-UI share: a fragment is
 * never sent to a server, so the SQL stays out of access logs.
 */

export const DASHBOARD_SHARE_KEY = "dash";
export const DASHBOARD_SHARE_VERSION = 1;

export type DashboardShareMode = "viewer" | "editor";

export interface DashboardSharePayload {
  v: number;
  mode: DashboardShareMode;
  name: string;
  source: string;
}

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const gzip = async (input: Uint8Array): Promise<Uint8Array> => {
  const stream = new Response(
    new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))
  );
  return new Uint8Array(await stream.arrayBuffer());
};

const gunzip = async (input: Uint8Array): Promise<Uint8Array> => {
  const stream = new Response(
    new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))
  );
  return new Uint8Array(await stream.arrayBuffer());
};

export const encodeDashboardShare = async (
  payload: Omit<DashboardSharePayload, "v">
): Promise<string> => {
  const json = JSON.stringify({ v: DASHBOARD_SHARE_VERSION, ...payload });
  return bytesToBase64Url(await gzip(new TextEncoder().encode(json)));
};

/** Returns null for anything unreadable — this string arrives from a URL. */
export const decodeDashboardShare = async (
  value: string
): Promise<DashboardSharePayload | null> => {
  try {
    const json = new TextDecoder().decode(await gunzip(base64UrlToBytes(value.trim())));
    const parsed = JSON.parse(json) as DashboardSharePayload;
    if (parsed?.v !== DASHBOARD_SHARE_VERSION) return null;
    if (parsed.mode !== "viewer" && parsed.mode !== "editor") return null;
    if (typeof parsed.source !== "string" || typeof parsed.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const buildDashboardShareUrl = (encoded: string): string => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${DASHBOARD_SHARE_KEY}=${encoded}`;
};

/** Reads a dashboard share from a URL hash string. */
export const parseDashboardShareHash = (rawHash: string): string | null => {
  const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (!hash) return null;
  return new URLSearchParams(hash).get(DASHBOARD_SHARE_KEY);
};

/**
 * Watches the URL for dashboard shares — current value plus `hashchange`,
 * because a fragment-only paste does not reload the page (the invite-link
 * lesson, learned once already).
 */
export const subscribeToDashboardShares = (
  onShare: (encoded: string) => void,
  target:
    | Pick<Window, "addEventListener" | "removeEventListener" | "location">
    | undefined = typeof window === "undefined" ? undefined : window
): (() => void) => {
  if (!target) return () => {};
  const emit = () => {
    const encoded = parseDashboardShareHash(target.location.hash);
    if (encoded) onShare(encoded);
  };
  emit();
  const handler = () => emit();
  target.addEventListener("hashchange", handler);
  return () => target.removeEventListener("hashchange", handler);
};

export const clearDashboardShareHash = (): void => {
  const { origin, pathname, search } = window.location;
  window.history.replaceState(null, "", `${origin}${pathname}${search}`);
};
