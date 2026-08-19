/**
 * Presence — who is here, and where they are working.
 *
 * Rides the `presence` channel, which is the one channel configured as
 * unordered and non-retransmitting. That is deliberate: a cursor position that
 * arrives late is worse than one that never arrives, and retransmitting stale
 * positions behind a slow link makes every other channel wait.
 *
 * Presence never touches Zustand. Cursor movement produces updates many times a
 * second, and routing that through a store subscription re-renders the world on
 * every keystroke someone else makes (§35). Components that need it subscribe
 * here directly.
 *
 * Like the document, this attaches to several transports at once. Guests talk
 * only to the host (§12), so the host relays awareness between them — otherwise
 * two guests would each see the host's cursor and never each other's.
 */

import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type * as Y from "yjs";
import type { PeerTransport } from "./transport/transport";

/** What a peer publishes about itself. */
export interface PresenceState {
  peerId: string;
  displayName: string;
  color: string;
  /** Where their caret is, when they are editing. */
  cursor?: {
    tabId: string;
    anchor: number;
    head: number;
  };
}

/** A peer's presence, as observed locally. */
export interface RemotePresence extends PresenceState {
  /** Awareness client id, for reconciling with the CRDT. */
  clientId: number;
}

/**
 * How often local cursor movement is published, at most.
 *
 * 60ms reads as continuous to a person watching, and bounds a fast typist to
 * ~16 messages a second rather than one per keystroke.
 */
export const PRESENCE_THROTTLE_MS = 60;

export class PresenceChannel {
  readonly awareness: Awareness;

  private readonly transports = new Set<PeerTransport>();
  private readonly detachers = new Map<PeerTransport, () => void>();
  private readonly handlers = new Set<(peers: RemotePresence[]) => void>();
  private pending: PresenceState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private offAwareness: (() => void) | null = null;

  constructor(
    doc: Y.Doc,
    transports: PeerTransport[],
    private readonly self: PresenceState
  ) {
    this.awareness = new Awareness(doc);
    this.awareness.setLocalState(self);
    this.listen();
    for (const transport of transports) this.attach(transport);
    this.publish(self, true);
  }

  private listen(): void {
    const onAwareness = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      if (this.closed) return;
      const changed = [...added, ...updated, ...removed];
      if (changed.length > 0) this.notify();
    };
    this.awareness.on("change", onAwareness);
    this.offAwareness = () => this.awareness.off("change", onAwareness);
  }

  /** Publishes and receives presence over one more transport. */
  attach(transport: PeerTransport): () => void {
    if (this.closed || this.transports.has(transport)) return () => {};
    this.transports.add(transport);

    const off = transport.onMessage(({ message, payload }) => {
      if (this.closed || message.t !== "presence") return;
      // A bare "I am here" carries no payload; only awareness updates do.
      if (payload.byteLength === 0) return;
      try {
        applyAwarenessUpdate(this.awareness, payload, "remote");
      } catch {
        // A malformed awareness frame costs a cursor, not the session.
        return;
      }
      // Relay to the other peers, so guests see each other and not just the host.
      this.send(message.peerId, message.displayName, message.color, payload, transport);
    });

    const offState = transport.onStateChange((state) => {
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.forgetPeersOn(transport);
      }
    });

    const detach = () => {
      off();
      offState();
      this.transports.delete(transport);
      this.detachers.delete(transport);
    };
    this.detachers.set(transport, detach);
    return detach;
  }

  detach(transport: PeerTransport): void {
    this.detachers.get(transport)?.();
  }

  /**
   * Drops remote cursors when a link goes away.
   *
   * A cursor left hovering where someone used to be is worse than no cursor.
   * With one transport this clears everyone; the host clears on each guest's
   * own disconnect.
   */
  private forgetPeersOn(transport: PeerTransport): void {
    this.detach(transport);
    if (this.transports.size === 0) {
      removeAwarenessStates(
        this.awareness,
        [...this.awareness.getStates().keys()].filter((id) => id !== this.awareness.clientID),
        "disconnect"
      );
    }
    this.notify();
  }

  private send(
    peerId: string,
    displayName: string,
    color: string | undefined,
    payload: Uint8Array,
    exclude?: PeerTransport
  ): void {
    for (const transport of this.transports) {
      if (transport === exclude) continue;
      void transport
        .send("presence", { t: "presence", peerId, displayName, color }, payload)
        .catch(() => {
          // Presence is lossy by design — a dropped cursor update is fine.
        });
    }
  }

  /** Publishes local state, throttled unless forced. */
  publish(state: PresenceState, immediate = false): void {
    if (this.closed) return;
    this.pending = state;

    if (immediate) {
      this.flush();
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, PRESENCE_THROTTLE_MS);
  }

  private flush(): void {
    const state = this.pending;
    this.pending = null;
    if (!state || this.closed) return;

    this.awareness.setLocalState(state);
    const update = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
    this.send(state.peerId, state.displayName, state.color, update);
  }

  /** Everyone except this peer. */
  peers(): RemotePresence[] {
    const result: RemotePresence[] = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue;
      const presence = state as Partial<PresenceState>;
      if (!presence?.peerId) continue;
      result.push({
        clientId,
        peerId: presence.peerId,
        displayName: presence.displayName ?? "Someone",
        color: presence.color ?? "#888888",
        cursor: presence.cursor,
      });
    }
    return result;
  }

  onChange(handler: (peers: RemotePresence[]) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify(): void {
    const peers = this.peers();
    for (const handler of this.handlers) handler(peers);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const detach of [...this.detachers.values()]) detach();
    this.detachers.clear();
    this.transports.clear();
    this.offAwareness?.();
    this.offAwareness = null;
    this.handlers.clear();
    this.awareness.destroy();
  }

  get identity(): PresenceState {
    return this.self;
  }
}
