import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  decodeInvite,
  encodeInvite,
  ManualSignaling,
  type ManualAnswer,
  type ManualInvite,
} from "../signaling/manualSignaling";
import { resolveIceServers } from "../signaling/client";

const invite = (overrides: Partial<ManualInvite> = {}): ManualInvite => ({
  v: 1,
  sessionId: "session-1",
  inviteId: "invite-1",
  sessionName: "Q3 analysis",
  hostPeerId: "host-1",
  hostDisplayName: "Caio",
  // Roughly the shape and size of a real gathered SDP.
  offer: JSON.stringify({
    type: "offer",
    sdp: ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0"]
      .concat(
        Array.from(
          { length: 40 },
          (_, i) => `a=candidate:${i} 1 udp 2130706431 10.0.0.${i} 5000${i} typ host`
        )
      )
      .join("\r\n"),
  }),
  ...overrides,
});

describe("manual invite encoding", () => {
  it("round-trips an invite", async () => {
    const original = invite();
    const decoded = await decodeInvite<ManualInvite>(await encodeInvite(original));
    expect(decoded).toEqual(original);
  });

  it("round-trips an answer", async () => {
    const answer: ManualAnswer = {
      v: 1,
      sessionId: "session-1",
      inviteId: "invite-1",
      guestPeerId: "guest-1",
      guestDisplayName: "Sam",
      answer: JSON.stringify({ type: "answer", sdp: "v=0\r\n" }),
    };
    expect(await decodeInvite<ManualAnswer>(await encodeInvite(answer))).toEqual(answer);
  });

  it("compresses hard enough for a realistic SDP to fit in a link", async () => {
    const encoded = await encodeInvite(invite());
    // SDP is repetitive ASCII, so gzip does most of the work. If this ever
    // regresses, invites stop being shareable as URLs.
    expect(encoded.length).toBeLessThan(2_000);
  });

  it("produces URL-safe output with no padding", async () => {
    const encoded = await encodeInvite(invite());
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("refuses a payload too large to survive a link", async () => {
    const huge = invite({ offer: "x".repeat(50 * 1024 * 1024) });
    await expect(encodeInvite(huge)).rejects.toThrow(/too large/i);
  });
});

describe("manual invite decoding — untrusted input", () => {
  it("returns null for garbage rather than throwing", async () => {
    expect(await decodeInvite("not-a-real-code")).toBeNull();
    expect(await decodeInvite("")).toBeNull();
  });

  it("returns null for a valid-looking blob with the wrong version", async () => {
    const encoded = await encodeInvite({ ...invite(), v: 99 as 1 });
    expect(await decodeInvite(encoded)).toBeNull();
  });

  it("returns null when the session id is missing", async () => {
    const encoded = await encodeInvite({ ...invite(), sessionId: "" });
    expect(await decodeInvite(encoded)).toBeNull();
  });

  it("tolerates surrounding whitespace from a sloppy paste", async () => {
    const encoded = await encodeInvite(invite());
    expect(await decodeInvite(`  ${encoded}\n`)).not.toBeNull();
  });
});

describe("ManualSignaling", () => {
  it("creates a session descriptor without contacting anything", async () => {
    const signaling = new ManualSignaling();
    const descriptor = await signaling.createSession({
      sessionName: "Q3",
      hostPeerId: "host-1",
      hostDisplayName: "Caio",
    });

    expect(descriptor).toMatchObject({
      sessionName: "Q3",
      hostPeerId: "host-1",
      signaling: "manual",
    });
    expect(descriptor.sessionId).toBeTruthy();
  });

  it("hands outbound signals to the UI instead of a network", async () => {
    const signaling = new ManualSignaling();
    const outbound = vi.fn();
    signaling.onOutboundSignal(outbound);

    await signaling.sendSignal({
      sessionId: "s",
      fromPeerId: "a",
      payload: { kind: "offer", sdp: "v=0" },
    });

    expect(outbound).toHaveBeenCalledTimes(1);
  });

  it("delivers signals a human pasted in", () => {
    const signaling = new ManualSignaling();
    const handler = vi.fn();
    signaling.onSignal(handler);

    signaling.receiveSignal({
      sessionId: "s",
      fromPeerId: "b",
      payload: { kind: "answer", sdp: "v=0" },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses to join without a session id", async () => {
    await expect(new ManualSignaling().joinSession("")).rejects.toThrow(/session id/i);
  });

  it("drops its handlers on close", async () => {
    const signaling = new ManualSignaling();
    const handler = vi.fn();
    signaling.onSignal(handler);
    await signaling.close();
    signaling.receiveSignal({
      sessionId: "s",
      fromPeerId: "b",
      payload: { kind: "answer", sdp: "" },
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("ICE configuration", () => {
  beforeEach(() => {
    (globalThis as { env?: Record<string, string> }).env = undefined;
  });

  it("falls back to public STUN when nothing is configured", () => {
    const servers = resolveIceServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toEqual(["stun:stun.l.google.com:19302"]);
  });

  it("uses configured STUN servers", () => {
    (globalThis as { env?: Record<string, string> }).env = {
      DUCK_UI_STUN_URLS: "stun:a.example:3478, stun:b.example:3478",
    };
    expect(resolveIceServers()[0].urls).toEqual(["stun:a.example:3478", "stun:b.example:3478"]);
  });

  it("adds TURN only when configured — never hardcoded", () => {
    (globalThis as { env?: Record<string, string> }).env = {
      DUCK_UI_TURN_URLS: "turn:relay.example:3478",
      DUCK_UI_TURN_USERNAME: "user",
      DUCK_UI_TURN_CREDENTIAL: "secret",
    };
    const servers = resolveIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[1]).toMatchObject({
      urls: ["turn:relay.example:3478"],
      username: "user",
      credential: "secret",
    });
  });

  it("treats an explicitly empty STUN list as no STUN at all", () => {
    // A LAN-only deployment configures no STUN on purpose. Falling back to a
    // public server there means waiting on something unreachable.
    (globalThis as { env?: Record<string, string> }).env = { DUCK_UI_STUN_URLS: "" };
    expect(resolveIceServers()).toEqual([]);
  });

  it("still adds TURN when STUN is explicitly disabled", () => {
    (globalThis as { env?: Record<string, string> }).env = {
      DUCK_UI_STUN_URLS: "",
      DUCK_UI_TURN_URLS: "turn:relay.example:3478",
    };
    const servers = resolveIceServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toEqual(["turn:relay.example:3478"]);
  });

  it("ignores blank entries in a configured list", () => {
    (globalThis as { env?: Record<string, string> }).env = {
      DUCK_UI_STUN_URLS: "stun:a.example:3478,, ,",
    };
    expect(resolveIceServers()[0].urls).toEqual(["stun:a.example:3478"]);
  });
});

describe("guest session roster", () => {
  it("knows who is in the session from the invite alone", async () => {
    // Regression: a connected guest showed "waiting for someone to join",
    // because participants were only ever populated on the host. The roster is
    // derivable from the invite plus the guest's own identity, with no
    // handshake and no roster message.
    const { GuestLiveSession } = await import("../liveSession");

    const session = Object.create(GuestLiveSession.prototype) as {
      people: { peerId: string; displayName: string; isHost: boolean; color: string }[];
    };
    Object.defineProperty(session, "invite", { value: invite() });
    Object.defineProperty(session, "displayName", { value: "Sam" });
    Object.defineProperty(session, "peerId", { value: "guest-1" });

    const people = session.people;
    expect(people).toHaveLength(2);
    expect(people[0]).toMatchObject({ displayName: "Caio", isHost: true });
    expect(people[1]).toMatchObject({ displayName: "Sam", isHost: false });
    expect(people[0].color).toBeTruthy();
    expect(people[1].color).toBeTruthy();
  });
});

describe("invite URL watching", () => {
  /** Minimal stand-in for the parts of `window` the watcher touches. */
  const fakeWindow = (initialHash: string) => {
    const listeners = new Set<() => void>();
    const target = {
      location: { hash: initialHash },
      addEventListener: (type: string, handler: () => void) => {
        if (type === "hashchange") listeners.add(handler);
      },
      removeEventListener: (type: string, handler: () => void) => {
        if (type === "hashchange") listeners.delete(handler);
      },
      /** Simulates pasting a URL while already on the page. */
      navigate(hash: string) {
        target.location.hash = hash;
        for (const handler of [...listeners]) handler();
      },
      get listenerCount() {
        return listeners.size;
      },
    };
    return target;
  };

  const watch = async (target: ReturnType<typeof fakeWindow>) => {
    const { subscribeToInvites } = await import("../signaling/manualSignaling");
    const seen: string[] = [];
    const unsubscribe = subscribeToInvites((code) => seen.push(code), target as unknown as Window);
    return { seen, unsubscribe };
  };

  it("reads an invite already in the URL on load", async () => {
    const { seen } = await watch(fakeWindow("#live=abc123"));
    expect(seen).toEqual(["abc123"]);
  });

  it("picks up an invite pasted while already on the page", async () => {
    // The bug: a fragment-only change does not reload, so reading once on
    // mount silently ignores the most common way an invite arrives.
    const target = fakeWindow("");
    const { seen } = await watch(target);
    expect(seen).toEqual([]);

    target.navigate("#live=abc123");
    expect(seen).toEqual(["abc123"]);
  });

  it("picks up a second, different invite", async () => {
    const target = fakeWindow("#live=first");
    const { seen } = await watch(target);
    target.navigate("#live=second");
    expect(seen).toEqual(["first", "second"]);
  });

  it("ignores a hash carrying no invite", async () => {
    const target = fakeWindow("#s=a-share-link");
    const { seen } = await watch(target);
    target.navigate("#something=else");
    expect(seen).toEqual([]);
  });

  it("coexists with the existing share-link parameter", async () => {
    const { seen } = await watch(fakeWindow("#s=share&live=abc123"));
    expect(seen).toEqual(["abc123"]);
  });

  it("detaches its listener when unsubscribed", async () => {
    const target = fakeWindow("");
    const { seen, unsubscribe } = await watch(target);
    unsubscribe();
    expect(target.listenerCount).toBe(0);

    target.navigate("#live=abc123");
    expect(seen).toEqual([]);
  });

  it("is inert where there is no window at all", async () => {
    const { subscribeToInvites } = await import("../signaling/manualSignaling");
    const unsubscribe = subscribeToInvites(() => {
      throw new Error("should not fire");
    }, undefined);
    expect(() => unsubscribe()).not.toThrow();
  });
});
