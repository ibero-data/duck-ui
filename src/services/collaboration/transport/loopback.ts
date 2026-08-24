/**
 * In-process channel pair implementing `DataChannelLike`.
 *
 * Lets the full peer stack — codec, chunking, backpressure, session logic,
 * the peer driver — run end to end without WebRTC, ICE, or a signaling
 * server. That matters beyond convenience: the parts most likely to be wrong
 * (framing, reassembly, cancellation races, disconnect mid-query) are exactly
 * the parts a browser-only test can barely reach and can never make
 * deterministic.
 *
 * Test scaffolding, not a production transport. It lives in `src/` rather than
 * a test folder because several test files import it.
 */

import type { DataChannelLike } from "./channelTransport";
import { CHANNEL_NAMES, type ChannelName } from "./transport";

type Listener = (event: unknown) => void;

export interface LoopbackOptions {
  /** Delay before delivery, to model latency. Default 0 (next microtask). */
  latencyMs?: number;
  /**
   * Report queued frames as buffered bytes. Non-zero drives the backpressure
   * path; the buffer drains as frames are delivered.
   */
  simulateBuffering?: boolean;
}

export class LoopbackChannel implements DataChannelLike {
  binaryType = "arraybuffer";
  bufferedAmountLowThreshold = 0;

  peer: LoopbackChannel | null = null;

  private listeners = new Map<string, Set<Listener>>();
  private state: "open" | "closed" = "open";
  private buffered = 0;

  constructor(
    readonly label: string,
    private readonly options: LoopbackOptions = {}
  ) {}

  get readyState(): string {
    return this.state;
  }

  get bufferedAmount(): number {
    return this.buffered;
  }

  send(data: ArrayBuffer): void {
    if (this.state !== "open") throw new Error(`Channel "${this.label}" is not open`);
    const target = this.peer;
    if (!target) return;

    if (this.options.simulateBuffering) {
      this.buffered += data.byteLength;
    }

    const deliver = () => {
      if (this.options.simulateBuffering) {
        this.buffered = Math.max(0, this.buffered - data.byteLength);
        if (this.buffered <= this.bufferedAmountLowThreshold) {
          this.emit("bufferedamountlow", {});
        }
      }
      if (target.state === "open") {
        target.emit("message", { data });
      }
    };

    if (this.options.latencyMs && this.options.latencyMs > 0) {
      setTimeout(deliver, this.options.latencyMs);
    } else {
      queueMicrotask(deliver);
    }
  }

  close(): void {
    if (this.state === "closed") return;
    this.state = "closed";
    this.emit("close", {});
    // The far end learns the link is gone, which is what drives
    // disconnect-mid-query handling.
    const target = this.peer;
    if (target && target.state === "open") {
      queueMicrotask(() => target.close());
    }
  }

  /** Drops delivery without a clean close, modelling a crashed tab. */
  sever(): void {
    this.peer = null;
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

  private emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

export interface LoopbackPair {
  a: Record<ChannelName, LoopbackChannel>;
  b: Record<ChannelName, LoopbackChannel>;
  /** Closes every channel on both sides. */
  closeAll(): void;
  /** Drops delivery in both directions without close events. */
  severAll(): void;
}

/** Creates a connected pair of channel sets, one per logical channel. */
export const createLoopbackPair = (options: LoopbackOptions = {}): LoopbackPair => {
  const a = {} as Record<ChannelName, LoopbackChannel>;
  const b = {} as Record<ChannelName, LoopbackChannel>;

  for (const name of CHANNEL_NAMES) {
    const channelA = new LoopbackChannel(name, options);
    const channelB = new LoopbackChannel(name, options);
    channelA.peer = channelB;
    channelB.peer = channelA;
    a[name] = channelA;
    b[name] = channelB;
  }

  return {
    a,
    b,
    closeAll: () => {
      for (const name of CHANNEL_NAMES) {
        a[name].close();
        b[name].close();
      }
    },
    severAll: () => {
      for (const name of CHANNEL_NAMES) {
        a[name].sever();
        b[name].sever();
      }
    },
  };
};
