import { describe, it, expect, vi, afterEach } from "vitest";
import { createGuestConnection } from "../transport/webrtcTransport";

/**
 * The pairing handshake, and the deadlock it must never reintroduce.
 *
 * A guest's data channels cannot open until the host applies its answer, and
 * the host cannot apply an answer that has not been produced. Awaiting the
 * channels before returning the answer therefore deadlocks: the guest shows no
 * code, and the host waits forever for one.
 *
 * `RTCPeerConnection` does not exist in Node, so these drive a fake that
 * behaves the way a real one does at the points that matter — ICE completes,
 * and `datachannel` events arrive only after the far side acts.
 */

type Listener = (event: unknown) => void;

class FakePeerConnection {
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription: unknown = null;
  remoteDescription: unknown = null;

  private listeners = new Map<string, Set<Listener>>();

  async setRemoteDescription(description: unknown): Promise<void> {
    this.remoteDescription = description;
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: "answer", sdp: "v=0\r\na=fake-answer" };
  }

  async setLocalDescription(description: unknown): Promise<void> {
    this.localDescription = description;
  }

  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {}

  /** Simulates the host applying the answer and the channels appearing. */
  emitChannels(labels: string[]): void {
    for (const label of labels) {
      const channel = {
        label,
        readyState: "open",
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 0,
        binaryType: "arraybuffer",
        send: () => {},
        close: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      for (const listener of this.listeners.get("datachannel") ?? []) {
        listener({ channel });
      }
    }
  }
}

const installFake = () => {
  const created: FakePeerConnection[] = [];
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      constructor() {
        const instance = new FakePeerConnection();
        created.push(instance);
        return instance as unknown as RTCPeerConnection;
      }
    }
  );
  return created;
};

const offer = JSON.stringify({ type: "offer", sdp: "v=0\r\na=fake-offer" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guest handshake", () => {
  it("returns the answer WITHOUT waiting for data channels to open", async () => {
    installFake();

    // No channels are ever emitted. If the implementation awaited them, this
    // would hang and the test would time out — which is precisely the bug.
    const handshake = await createGuestConnection("guest-1", offer);

    expect(handshake.localDescription).toContain("fake-answer");
    expect(handshake.ready).toBeInstanceOf(Promise);
  });

  it("resolves `ready` only once every channel has arrived", async () => {
    const connections = installFake();
    const handshake = await createGuestConnection("guest-1", offer);

    let settled = false;
    void handshake.ready.then(() => {
      settled = true;
    });

    // A partial set is not enough — a session missing its query channel would
    // look connected and then fail on the first run.
    connections[0].emitChannels(["control", "collaboration"]);
    await Promise.resolve();
    expect(settled).toBe(false);

    connections[0].emitChannels(["query", "data", "presence"]);
    await handshake.ready;
    expect(settled).toBe(true);
  });

  it("builds a transport carrying all five channels once ready", async () => {
    const connections = installFake();
    const handshake = await createGuestConnection("guest-1", offer);

    connections[0].emitChannels(["control", "collaboration", "query", "data", "presence"]);
    const { transport, channels } = await handshake.ready;

    expect(channels).toHaveLength(5);
    expect(transport.peerId).toBe("guest-1");
  });

  it("rejects an invite that is not a readable offer", async () => {
    installFake();
    await expect(createGuestConnection("guest-1", "not-json")).rejects.toThrow(/not readable/i);
  });

  it("rejects a description that is an answer rather than an offer", async () => {
    installFake();
    await expect(
      createGuestConnection("guest-1", JSON.stringify({ type: "answer", sdp: "v=0" }))
    ).rejects.toThrow(/does not contain a connection offer/i);
  });

  it("ignores a channel with a label the protocol does not define", async () => {
    const connections = installFake();
    const handshake = await createGuestConnection("guest-1", offer);

    let settled = false;
    void handshake.ready.then(() => {
      settled = true;
    });

    connections[0].emitChannels(["definitely-not-ours"]);
    await Promise.resolve();
    expect(settled).toBe(false);
  });
});
