/**
 * Signaling — the one thing WebRTC cannot do for itself.
 *
 * Two browsers that have never met must exchange an SDP offer, an SDP answer,
 * and a set of ICE candidates before a peer connection can exist. There is no
 * way around that; it is how the protocol works.
 *
 * What IS a choice is who carries those bytes. This interface exists so the
 * answer can be "a person" rather than "a server we run":
 *
 *   ManualSignaling   the offer and answer travel as links the two people
 *                     paste to each other. Zero infrastructure. Works on a
 *                     plane, works on a LAN with no internet, works when
 *                     duckui.com is down.
 *
 *   RelaySignaling    a tiny service holds an offer under a session id with a
 *                     TTL so the flow is one link instead of two. Optional,
 *                     configured by URL, never required.
 *
 * Whatever carries them, note what these bytes ARE: network addresses and
 * codec parameters. No SQL, no results, no datasets, no credentials. A
 * signaling relay that logged everything it ever saw would learn which IPs
 * talked to each other and nothing else. That is why §11 calls it
 * infrastructure rather than a backend.
 */

/** How a session's participants find each other. */
export type SignalingKind = "manual" | "relay";

/** Enough to join a session. Shared as a link. */
export interface SessionDescriptor {
  sessionId: string;
  /** Display name the host chose, shown on the join screen. */
  sessionName: string;
  hostPeerId: string;
  hostDisplayName: string;
  /** How the guest should complete the handshake. */
  signaling: SignalingKind;
  createdAt: string;
}

/** A signal in flight between two peers. */
export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

export interface SignalEnvelope {
  sessionId: string;
  /** Peer the signal came from. */
  fromPeerId: string;
  /** Peer it is meant for. Absent means "anyone in the session". */
  toPeerId?: string;
  payload: SignalPayload;
}

export type Unsubscribe = () => void;

/**
 * A way for two peers to swap handshake bytes.
 *
 * Kept deliberately small. A manual implementation satisfies it by handing the
 * bytes to the UI; a relay satisfies it by POSTing them. Nothing above this
 * interface knows which is in use.
 */
export interface SignalingClient {
  readonly kind: SignalingKind;

  /** Host: announces a session and returns what a guest needs to join. */
  createSession(options: {
    sessionName: string;
    hostPeerId: string;
    hostDisplayName: string;
  }): Promise<SessionDescriptor>;

  /** Guest: attaches to a session it was invited to. */
  joinSession(sessionId: string, token?: string): Promise<void>;

  sendSignal(envelope: SignalEnvelope): Promise<void>;
  onSignal(handler: (envelope: SignalEnvelope) => void): Unsubscribe;

  close(): Promise<void>;
}

/**
 * ICE servers, from runtime config (§33).
 *
 * Never hardcoded to production infrastructure. A deployment that sets nothing
 * gets Google's public STUN, which is enough for most networks; TURN is opt-in
 * because a relay sees the encrypted stream and someone has to pay for it.
 */
export const resolveIceServers = (): RTCIceServer[] => {
  // Read through globalThis: this module is also reachable from a worker and
  // from tests, where `window` does not exist.
  const runtime = globalThis as { env?: Record<string, string | undefined> };
  const env = runtime.env ?? {};

  const split = (value: string | undefined): string[] =>
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const stunUrls = split(env.DUCK_UI_STUN_URLS);
  const turnUrls = split(env.DUCK_UI_TURN_URLS);

  // Configured-but-empty means "no STUN", which is different from unset.
  // A LAN-only or air-gapped deployment wants host candidates and nothing
  // else; without this it would sit waiting on a STUN server it cannot reach.
  const stunConfigured = env.DUCK_UI_STUN_URLS !== undefined;

  const servers: RTCIceServer[] = [];
  if (stunUrls.length > 0) {
    servers.push({ urls: stunUrls });
  } else if (!stunConfigured) {
    servers.push({ urls: ["stun:stun.l.google.com:19302"] });
  }

  if (turnUrls.length > 0) {
    servers.push({
      urls: turnUrls,
      username: env.DUCK_UI_TURN_USERNAME,
      credential: env.DUCK_UI_TURN_CREDENTIAL,
    });
  }

  return servers;
};

/** Whether a TURN relay is configured for this deployment. */
export const isTurnConfigured = (): boolean => {
  const runtime = globalThis as { env?: Record<string, string | undefined> };
  return Boolean(
    (runtime.env?.DUCK_UI_TURN_URLS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean).length
  );
};

export interface TurnCheckResult {
  configured: boolean;
  reachable: boolean;
  /** Human-readable outcome, shown as-is in the UI. */
  detail: string;
}

/**
 * Verifies the configured TURN relay by asking it for a relay candidate.
 *
 * `iceTransportPolicy: "relay"` forbids host and STUN candidates, so the ONLY
 * way this probe produces a candidate is the TURN server allocating one —
 * which exercises the URL, the credentials and the allocation path. This is
 * the same mechanism a real session would fall back on behind a symmetric
 * NAT, so a green here means the relay actually works, not that it pings.
 */
export const verifyTurnRelay = async (timeoutMs = 8_000): Promise<TurnCheckResult> => {
  const turnServers = resolveIceServers().filter((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => url.startsWith("turn"))
  );
  if (turnServers.length === 0) {
    return {
      configured: false,
      reachable: false,
      detail: "No TURN relay is configured (DUCK_UI_TURN_URLS).",
    };
  }

  const connection = new RTCPeerConnection({
    iceServers: turnServers,
    iceTransportPolicy: "relay",
  });
  try {
    connection.createDataChannel("turn-probe");
    const sawRelay = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      connection.onicecandidate = (event) => {
        if (event.candidate && / typ relay/.test(event.candidate.candidate)) {
          clearTimeout(timer);
          resolve(true);
        } else if (event.candidate === null) {
          // Gathering finished without a relay allocation.
          clearTimeout(timer);
          resolve(false);
        }
      };
    });
    await connection.setLocalDescription(await connection.createOffer());
    const reachable = await sawRelay;
    return reachable
      ? {
          configured: true,
          reachable: true,
          detail: "The relay allocated a candidate. Sessions can traverse strict NATs.",
        }
      : {
          configured: true,
          reachable: false,
          detail:
            "The relay never answered with a candidate. Check the TURN URL, username and credential.",
        };
  } finally {
    connection.close();
  }
};

/** Whether this browser can do WebRTC at all (§34). */
export const isWebRtcAvailable = (): boolean =>
  typeof RTCPeerConnection !== "undefined" &&
  typeof RTCPeerConnection.prototype.createDataChannel === "function";
