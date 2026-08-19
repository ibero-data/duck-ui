/**
 * Transport logic over a set of message-oriented channels.
 *
 * Deliberately knows nothing about WebRTC. It talks to a `DataChannelLike`
 * interface that `RTCDataChannel` already satisfies structurally, which means
 * the entire protocol — chunking, backpressure, reassembly, validation,
 * per-message routing — is exercised in tests against an in-process loopback
 * rather than only against a real browser stack.
 *
 * Backpressure is the part worth reading. `send` waits whenever a channel's
 * buffer is above the high-water mark, so streaming a large result applies
 * back-pressure to the producer instead of queueing gigabytes in the browser
 * and taking the tab down. §39: an unbounded peer query must not freeze the
 * host.
 */

import {
  ChunkAssembler,
  MAX_CHUNK_BYTES,
  MAX_MESSAGE_BYTES,
  splitPayload,
} from "@/services/arrow/chunking";
import { decodeMessage, encodeMessage } from "../protocol/codec";
import type { PeerMessage } from "../protocol/messages";
import {
  chunkKeyFor,
  outboundChunkKey,
  type ChannelName,
  type InboundMessage,
  type PeerTransport,
  type SendableMessage,
  type TransportMetrics,
  type TransportProtocolError,
  type TransportState,
  type Unsubscribe,
} from "./transport";

/** The slice of `RTCDataChannel` this transport actually uses. */
export interface DataChannelLike {
  readonly label: string;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: string;
  readonly readyState: string;
  send(data: ArrayBuffer): void;
  close(): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

/**
 * Stop queueing above this many buffered bytes and wait for the channel to
 * drain. 1 MiB is enough to keep the link saturated on a fast connection and
 * small enough that a slow one cannot accumulate an unbounded backlog.
 */
export const BUFFER_HIGH_WATER = 1024 * 1024;

/** Resume sending once the buffer falls back to this. */
export const BUFFER_LOW_WATER = 256 * 1024;

/** Give up on a drain that never comes rather than hanging a query forever. */
export const DRAIN_TIMEOUT_MS = 30_000;

export interface ChannelTransportOptions {
  peerId: string;
  channels: Partial<Record<ChannelName, DataChannelLike>>;
  maxMessageBytes?: number;
  chunkBytes?: number;
}

export class ChannelTransport implements PeerTransport {
  readonly peerId: string;

  private currentState: TransportState = "connecting";
  private readonly channels: Partial<Record<ChannelName, DataChannelLike>>;
  private readonly assemblers = new Map<ChannelName, ChunkAssembler>();
  private readonly messageHandlers = new Set<(inbound: InboundMessage) => void>();
  private readonly errorHandlers = new Set<(error: TransportProtocolError) => void>();
  private readonly stateHandlers = new Set<(state: TransportState) => void>();
  private readonly detachers: Unsubscribe[] = [];
  private readonly chunkBytes: number;

  private readonly counters = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    protocolErrors: 0,
  };

  constructor(options: ChannelTransportOptions) {
    this.peerId = options.peerId;
    this.channels = options.channels;
    this.chunkBytes = options.chunkBytes ?? MAX_CHUNK_BYTES;

    for (const [name, channel] of Object.entries(this.channels) as [
      ChannelName,
      DataChannelLike,
    ][]) {
      if (!channel) continue;
      this.assemblers.set(name, new ChunkAssembler(options.maxMessageBytes ?? MAX_MESSAGE_BYTES));
      channel.binaryType = "arraybuffer";
      channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;

      const onMessage = (event: unknown) => this.handleFrame(name, event);
      const onClose = () => this.setState("disconnected");
      const onError = () => this.setState("failed");

      channel.addEventListener("message", onMessage);
      channel.addEventListener("close", onClose);
      channel.addEventListener("error", onError);
      this.detachers.push(() => {
        channel.removeEventListener("message", onMessage);
        channel.removeEventListener("close", onClose);
        channel.removeEventListener("error", onError);
      });
    }
  }

  get state(): TransportState {
    return this.currentState;
  }

  /**
   * A method, not a comparison on `this.state`: TypeScript narrows a property
   * access and keeps that narrowing across `await`, which is exactly wrong
   * here — the state changes while frames are in flight. A call re-reads.
   */
  private isClosed(): boolean {
    return this.currentState === "closed";
  }

  setState(state: TransportState): void {
    if (this.currentState === state) return;
    // "closed" is terminal — a late event from a channel tearing down must not
    // walk the transport back into a live-looking state.
    if (this.currentState === "closed") return;
    this.currentState = state;
    for (const handler of this.stateHandlers) handler(state);
  }

  async send(channel: ChannelName, message: SendableMessage, payload?: Uint8Array): Promise<void> {
    const target = this.channels[channel];
    if (!target) throw new Error(`Channel "${channel}" is not open`);
    if (this.isClosed()) throw new Error("Transport is closed");

    // No payload: one frame, no chunk bookkeeping.
    if (!payload) {
      await this.writeFrame(target, encodeMessage(message as PeerMessage));
      this.counters.messagesSent += 1;
      return;
    }

    const chunks = splitPayload(payload, this.chunkBytes);
    const key = outboundChunkKey(message);

    for (let index = 0; index < chunks.length; index++) {
      const framed = {
        ...message,
        // `key` rides along so the receiver reassembles against the same
        // identity the sender split with. Without it, two concurrent document
        // updates would share a key and interleave into a corrupt payload.
        chunk: { index, count: chunks.length, totalBytes: payload.byteLength, key },
      } as PeerMessage;
      await this.writeFrame(target, encodeMessage(framed, chunks[index]));
      // Re-checked each frame: a peer that vanishes mid-result must abort the
      // send rather than keep writing into a dead channel.
      if (this.isClosed()) {
        throw new Error(`Transport closed while sending ${key}`);
      }
    }
    this.counters.messagesSent += 1;
  }

  onMessage(handler: (inbound: InboundMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onProtocolError(handler: (error: TransportProtocolError) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onStateChange(handler: (state: TransportState) => void): Unsubscribe {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  metrics(): TransportMetrics {
    let bufferedBytes = 0;
    for (const channel of Object.values(this.channels)) {
      if (channel) bufferedBytes += channel.bufferedAmount;
    }
    return { ...this.counters, bufferedBytes };
  }

  async close(): Promise<void> {
    this.setState("closed");
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    for (const assembler of this.assemblers.values()) assembler.clear();
    for (const channel of Object.values(this.channels)) {
      try {
        channel?.close();
      } catch {
        // Already gone — nothing to release.
      }
    }
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.stateHandlers.clear();
  }

  /** Writes one frame, waiting first if the channel is backed up. */
  private async writeFrame(channel: DataChannelLike, frame: ArrayBuffer): Promise<void> {
    await this.awaitDrain(channel);
    if (channel.readyState !== "open") {
      throw new Error("Channel closed before the frame could be sent");
    }
    channel.send(frame);
    this.counters.bytesSent += frame.byteLength;
  }

  /** Resolves once the channel's buffer is below the high-water mark. */
  private awaitDrain(channel: DataChannelLike): Promise<void> {
    if (channel.bufferedAmount < BUFFER_HIGH_WATER) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel.removeEventListener("bufferedamountlow", onLow);
        channel.removeEventListener("close", onClose);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const onLow = () => finish();
      const onClose = () => finish(new Error("Channel closed while waiting to drain"));
      const timer = setTimeout(
        () => finish(new Error(`Channel did not drain within ${DRAIN_TIMEOUT_MS}ms`)),
        DRAIN_TIMEOUT_MS
      );

      channel.addEventListener("bufferedamountlow", onLow);
      channel.addEventListener("close", onClose);

      // The threshold may already have been crossed between the check above
      // and the listener being attached, in which case no event is coming.
      if (channel.bufferedAmount < BUFFER_HIGH_WATER) finish();
    });
  }

  /** Validates and reassembles one inbound frame. */
  private handleFrame(channel: ChannelName, event: unknown): void {
    const data = (event as { data?: unknown }).data;
    if (!(data instanceof ArrayBuffer)) {
      this.reportError({
        channel,
        reason: "malformed",
        message: "Frame was not binary — the peer is not speaking this protocol",
      });
      return;
    }

    this.counters.bytesReceived += data.byteLength;

    const decoded = decodeMessage(data);
    if (!decoded.ok) {
      this.reportError({ channel, reason: decoded.reason, message: decoded.message });
      return;
    }

    const { message, payload } = decoded;
    const chunk = "chunk" in message ? message.chunk : null;

    // Unchunked message: deliver as-is.
    if (!chunk) {
      this.counters.messagesReceived += 1;
      this.deliver({ channel, message, payload });
      return;
    }

    const assembler = this.assemblers.get(channel);
    if (!assembler) {
      this.reportError({ channel, reason: "reassembly", message: "No assembler for channel" });
      return;
    }

    let complete: Uint8Array | null;
    try {
      complete = assembler.accept(chunk.key ?? chunkKeyFor(message), chunk, payload);
    } catch (error) {
      this.reportError({
        channel,
        reason: "reassembly",
        message: error instanceof Error ? error.message : "Reassembly failed",
      });
      return;
    }

    if (!complete) return;

    this.counters.messagesReceived += 1;
    this.deliver({ channel, message, payload: complete });
  }

  private deliver(inbound: InboundMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(inbound);
      } catch (error) {
        // One bad handler must not stop the others, or stall the channel.
        console.error("[peer] message handler threw:", error);
      }
    }
  }

  private reportError(error: TransportProtocolError): void {
    this.counters.protocolErrors += 1;
    for (const handler of this.errorHandlers) handler(error);
  }
}
