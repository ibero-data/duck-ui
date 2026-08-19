/**
 * Peer transport interface.
 *
 * Sits between the codec (which turns messages into frames) and session logic
 * (which does not care how frames move). WebRTC is the only implementation
 * today; keeping the interface separate is what lets the POC be driven by an
 * in-process loopback in tests, without either side knowing the difference.
 *
 * A transport is responsible for chunking, reassembly, backpressure and
 * validation. Everything above it sees whole, already-validated messages.
 */

import type { ChunkInfoMessage, PeerMessage } from "../protocol/messages";

/**
 * Logical channels. Separating them keeps a large result transfer from
 * blocking a cancel: head-of-line blocking is per-channel, so `control`
 * carries a `query.cancel` past a `query` channel busy with megabytes.
 */
export type ChannelName = "control" | "collaboration" | "query" | "data" | "presence";

export const CHANNEL_NAMES: readonly ChannelName[] = [
  "control",
  "collaboration",
  "query",
  "data",
  "presence",
];

/**
 * Delivery guarantees per channel.
 *
 * Presence is the only lossy one, and deliberately: a cursor position that
 * arrives late is worse than one that never arrives, and retransmitting stale
 * positions behind a slow link makes every other channel wait.
 */
export const CHANNEL_CONFIG: Record<ChannelName, { ordered: boolean; maxRetransmits?: number }> = {
  control: { ordered: true },
  collaboration: { ordered: true },
  query: { ordered: true },
  data: { ordered: true },
  presence: { ordered: false, maxRetransmits: 0 },
};

export type TransportState = "connecting" | "connected" | "disconnected" | "failed" | "closed";

/**
 * A message ready to send. The two chunked message types are accepted without
 * their `chunk` field — the transport owns splitting, so a caller cannot
 * declare chunk bookkeeping that contradicts what is actually sent.
 */
export type SendableMessage =
  | Exclude<PeerMessage, { chunk: ChunkInfoMessage }>
  | Omit<Extract<PeerMessage, { t: "query.schema" }>, "chunk">
  | Omit<Extract<PeerMessage, { t: "query.batch" }>, "chunk">
  | Omit<Extract<PeerMessage, { t: "doc.update" }>, "chunk">
  | Omit<Extract<PeerMessage, { t: "doc.sync-request" }>, "chunk">;

export interface InboundMessage {
  channel: ChannelName;
  message: PeerMessage;
  /** Complete, reassembled payload. Empty when the message carries none. */
  payload: Uint8Array;
}

/** A frame that arrived but could not be trusted. Surfaced, never silent. */
export interface TransportProtocolError {
  channel: ChannelName;
  reason: "malformed" | "version" | "schema" | "reassembly";
  message: string;
}

export interface TransportMetrics {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  /** Frames rejected by validation. A climbing count means a bad or hostile peer. */
  protocolErrors: number;
  /** Bytes queued in the transport right now, summed across channels. */
  bufferedBytes: number;
}

export type Unsubscribe = () => void;

export interface PeerTransport {
  readonly peerId: string;
  readonly state: TransportState;

  /**
   * Sends a message, splitting any payload across as many frames as needed.
   * Resolves once the bytes are handed to the transport — which applies
   * backpressure, so a large send resolves slowly rather than filling memory.
   */
  send(channel: ChannelName, message: SendableMessage, payload?: Uint8Array): Promise<void>;

  onMessage(handler: (inbound: InboundMessage) => void): Unsubscribe;
  onProtocolError(handler: (error: TransportProtocolError) => void): Unsubscribe;
  onStateChange(handler: (state: TransportState) => void): Unsubscribe;

  metrics(): TransportMetrics;
  close(): Promise<void>;
}

/**
 * Reassembly key for a chunked message.
 *
 * Scoped per query and per batch so two results streaming at once, or a schema
 * and its first batch, can never collide in the assembler.
 */
let chunkSequence = 0;

export const chunkKeyFor = (message: SendableMessage): string => {
  switch (message.t) {
    case "query.schema":
      return `${message.queryId}:schema`;
    case "query.batch":
      return `${message.queryId}:b${message.seq}`;
    default:
      return message.t;
  }
};

/**
 * Reassembly key for an outbound chunked message.
 *
 * Document updates and presence carry no natural per-message id, and they are
 * sent continuously — two updates in flight at once would otherwise share a
 * key and interleave into corruption. A monotonic counter per sender keeps
 * them apart; the receiver only needs the key to be unique, not meaningful.
 */
export const outboundChunkKey = (message: SendableMessage): string => {
  switch (message.t) {
    case "doc.update":
    case "doc.sync-request":
      return `${message.t}:${message.docId}:${chunkSequence++}`;
    case "presence":
      return `presence:${message.peerId}:${chunkSequence++}`;
    default:
      return chunkKeyFor(message);
  }
};
