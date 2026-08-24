/**
 * Pairing with no infrastructure at all.
 *
 * WebRTC needs an offer to reach the guest and an answer to reach the host.
 * Normally a small service holds them. Here the two people carry them: the
 * host sends an invite link, the guest sends back a short code, and that is
 * the entire handshake.
 *
 *   Host                                            Guest
 *   ────                                            ─────
 *   creates offer (candidates included)
 *   #live=<compressed offer>            ───────▶    opens the link
 *                                                   creates answer
 *   pastes the code                     ◀───────    <compressed answer>
 *   connected ═══════════ WebRTC ═══════════════    connected
 *
 * Two copy-pastes, and in exchange: no server, no account, no session id
 * registry, nothing to deploy, nothing to keep running, nothing that can be
 * down. It works between two laptops on a café wifi with no internet, and it
 * works between two tabs on the same machine.
 *
 * The payloads are SDP — IP addresses, ports, codec parameters, a DTLS
 * fingerprint. Pasting one into a chat reveals your network addresses to
 * whoever can read that chat, and nothing else: no data, no SQL, no
 * credentials. An offer is also useless to anyone but the first peer to answer
 * it, because the DTLS handshake binds the connection to that fingerprint.
 */

import type { SessionDescriptor, SignalEnvelope, SignalingClient, Unsubscribe } from "./client";

/** URL fragment key carrying an invite. */
export const LIVE_HASH_KEY = "live";

//
// Compression — the same approach the existing share links use
//

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

/** What travels in an invite link. */
export interface ManualInvite {
  v: 1;
  sessionId: string;
  /**
   * Identifies this specific invite.
   *
   * An SDP offer belongs to exactly one peer connection, so a host inviting
   * several people mints one offer each. The answer echoes this back so the
   * host can apply it to the right connection — and so a single invite cannot
   * be used twice.
   */
  inviteId: string;
  sessionName: string;
  hostPeerId: string;
  hostDisplayName: string;
  /** Host's SDP offer, candidates already gathered. */
  offer: string;
}

/** What the guest hands back. */
export interface ManualAnswer {
  v: 1;
  sessionId: string;
  /** The invite this answers. */
  inviteId: string;
  guestPeerId: string;
  guestDisplayName: string;
  /** Guest's SDP answer, candidates already gathered. */
  answer: string;
}

/**
 * SDP compresses extremely well — it is repetitive ASCII. Even so, refuse a
 * payload that would produce a link no browser or chat app will carry intact.
 */
const MAX_ENCODED_LENGTH = 30_000;

export const encodeInvite = async (invite: ManualInvite | ManualAnswer): Promise<string> => {
  const compressed = await gzip(new TextEncoder().encode(JSON.stringify(invite)));
  const encoded = bytesToBase64Url(compressed);
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error(
      "This connection code is too large to share as a link. Try again on a simpler network, or use a signaling relay."
    );
  }
  return encoded;
};

export const decodeInvite = async <T extends ManualInvite | ManualAnswer>(
  value: string
): Promise<T | null> => {
  try {
    const json = new TextDecoder().decode(await gunzip(base64UrlToBytes(value.trim())));
    const parsed = JSON.parse(json) as T;
    // Shape check before anything downstream trusts it: this string came from
    // a chat message and could be anything.
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1) return null;
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
};

/** Builds the URL a host sends to invite someone. */
export const buildInviteUrl = (encoded: string): string => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${LIVE_HASH_KEY}=${encoded}`;
};

/** Reads an invite out of a URL hash. */
export const parseInviteHash = (rawHash: string): string | null => {
  const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (!hash) return null;
  return new URLSearchParams(hash).get(LIVE_HASH_KEY);
};

/** Reads an invite out of the current URL, if there is one. */
export const readInviteFromHash = (): string | null =>
  typeof window === "undefined" ? null : parseInviteHash(window.location.hash);

/**
 * Watches the URL for invites.
 *
 * Reads the current one immediately, then keeps listening. That second part is
 * not optional: changing only the fragment does NOT reload the page, so
 * someone already sitting on Duck-UI who pastes an invite into the address bar
 * gets a `hashchange` and nothing else. Reading once on mount silently ignores
 * exactly the case where a link is most likely to be pasted.
 *
 * The payload stays in the fragment rather than the query string on purpose:
 * a fragment is never sent to a server, so an SDP offer — which carries local
 * and public IP addresses, ports and a DTLS fingerprint — stays out of access
 * logs, referrer headers and proxy logs. Correctness here is a listener, not a
 * different place to put the bytes.
 */
export const subscribeToInvites = (
  onInvite: (code: string) => void,
  target:
    | Pick<Window, "addEventListener" | "removeEventListener" | "location">
    | undefined = typeof window === "undefined" ? undefined : window
): (() => void) => {
  if (!target) return () => {};

  const emit = () => {
    const code = parseInviteHash(target.location.hash);
    if (code) onInvite(code);
  };

  emit();
  const handler = () => emit();
  target.addEventListener("hashchange", handler);
  return () => target.removeEventListener("hashchange", handler);
};

/** Removes the invite from the URL without reloading. */
export const clearInviteHash = (): void => {
  const { origin, pathname, search } = window.location;
  window.history.replaceState(null, "", `${origin}${pathname}${search}`);
};

/**
 * `SignalingClient` over human-carried messages.
 *
 * `sendSignal` does not send anything over a network — it hands the payload to
 * whatever the UI registered, which renders it as a link or a code for a
 * person to copy. Signals arriving the other way are pushed in by the UI when
 * someone pastes.
 */
export class ManualSignaling implements SignalingClient {
  readonly kind = "manual" as const;

  private descriptor: SessionDescriptor | null = null;
  private readonly handlers = new Set<(envelope: SignalEnvelope) => void>();
  private readonly outbound = new Set<(envelope: SignalEnvelope) => void>();

  async createSession(options: {
    sessionName: string;
    hostPeerId: string;
    hostDisplayName: string;
  }): Promise<SessionDescriptor> {
    this.descriptor = {
      sessionId: crypto.randomUUID(),
      sessionName: options.sessionName,
      hostPeerId: options.hostPeerId,
      hostDisplayName: options.hostDisplayName,
      signaling: "manual",
      createdAt: new Date().toISOString(),
    };
    return this.descriptor;
  }

  async joinSession(sessionId: string): Promise<void> {
    // Nothing to reach out to — the guest already holds the offer, because it
    // arrived in the link they opened.
    if (!sessionId) throw new Error("This invite is missing a session id");
  }

  async sendSignal(envelope: SignalEnvelope): Promise<void> {
    for (const handler of this.outbound) handler(envelope);
  }

  onSignal(handler: (envelope: SignalEnvelope) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** UI hook: called when this peer produces a signal a human must carry. */
  onOutboundSignal(handler: (envelope: SignalEnvelope) => void): Unsubscribe {
    this.outbound.add(handler);
    return () => this.outbound.delete(handler);
  }

  /** UI hook: called when a human pastes a signal in. */
  receiveSignal(envelope: SignalEnvelope): void {
    for (const handler of this.handlers) handler(envelope);
  }

  async close(): Promise<void> {
    this.handlers.clear();
    this.outbound.clear();
    this.descriptor = null;
  }

  get session(): SessionDescriptor | null {
    return this.descriptor;
  }
}
