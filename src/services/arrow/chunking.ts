/**
 * Framing and chunking for the peer data plane.
 *
 * A WebRTC DataChannel is not a byte stream — it delivers discrete messages,
 * and implementations cap how large one may be. Chrome tolerates a few hundred
 * kilobytes; the number every browser agrees on is much smaller. An Arrow
 * batch routinely exceeds both, so anything binary is split, numbered, and
 * reassembled.
 *
 * Every frame on the wire is:
 *
 *   [ uint32 LE: header byte length ]
 *   [ header:  UTF-8 JSON, validated by protocol/messages.ts ]
 *   [ payload: raw bytes, may be empty ]
 *
 * One shape for control and data alike. The header is always a protocol
 * message; the payload is always opaque bytes. Nothing is base64'd, so Arrow
 * batches travel at their natural size.
 */

/**
 * Payload bytes per frame.
 *
 * 64 KiB is the size every WebRTC implementation is required to handle. Larger
 * frames work in practice between two Chromium browsers and fail against
 * others, which is exactly the kind of bug that only shows up in front of
 * someone else. Header and framing overhead sit on top of this, so the figure
 * leaves room below the 64 KiB message ceiling itself.
 */
export const MAX_CHUNK_BYTES = 60 * 1024;

/** Refuse a header this large — it is a malformed or hostile frame. */
export const MAX_HEADER_BYTES = 256 * 1024;

/** Refuse to reassemble a message larger than this from one peer. */
export const MAX_MESSAGE_BYTES = 256 * 1024 * 1024;

export interface Frame<H = unknown> {
  header: H;
  payload: Uint8Array;
}

const EMPTY = new Uint8Array(0);

/** Packs a header and payload into a single wire frame. */
export const encodeFrame = (header: unknown, payload: Uint8Array = EMPTY): ArrayBuffer => {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  if (headerBytes.byteLength > MAX_HEADER_BYTES) {
    throw new Error(`Frame header exceeds ${MAX_HEADER_BYTES} bytes`);
  }

  const buffer = new ArrayBuffer(4 + headerBytes.byteLength + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, headerBytes.byteLength, true);

  const bytes = new Uint8Array(buffer);
  bytes.set(headerBytes, 4);
  bytes.set(payload, 4 + headerBytes.byteLength);
  return buffer;
};

/**
 * Unpacks a wire frame.
 *
 * Every length is checked against the buffer before it is used: these bytes
 * come from another browser, and a truncated or crafted frame must fail
 * cleanly rather than read past the end or allocate wildly.
 */
export const decodeFrame = (buffer: ArrayBuffer): Frame => {
  if (buffer.byteLength < 4) {
    throw new Error("Frame is too short to contain a header length");
  }

  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, true);

  if (headerLength > MAX_HEADER_BYTES) {
    throw new Error(`Frame header claims ${headerLength} bytes, over the limit`);
  }
  if (4 + headerLength > buffer.byteLength) {
    throw new Error("Frame header length runs past the end of the frame");
  }

  const headerBytes = new Uint8Array(buffer, 4, headerLength);
  let header: unknown;
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes));
  } catch {
    throw new Error("Frame header is not valid JSON");
  }

  return {
    header,
    payload: new Uint8Array(buffer, 4 + headerLength),
  };
};

/**
 * Splits a payload into transmittable pieces.
 *
 * An empty payload still yields one chunk: the receiver counts chunks to know
 * when a message is complete, and zero chunks would never complete.
 */
export const splitPayload = (
  payload: Uint8Array,
  chunkBytes: number = MAX_CHUNK_BYTES
): Uint8Array[] => {
  if (chunkBytes <= 0) throw new Error("Chunk size must be positive");
  if (payload.byteLength === 0) return [EMPTY];

  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < payload.byteLength; offset += chunkBytes) {
    chunks.push(payload.subarray(offset, Math.min(offset + chunkBytes, payload.byteLength)));
  }
  return chunks;
};

/** Chunk bookkeeping carried in the header of a split message. */
export interface ChunkInfo {
  /** Zero-based position. */
  index: number;
  /** Total pieces in this message. */
  count: number;
  /** Byte length of the complete payload, for pre-allocation and validation. */
  totalBytes: number;
}

interface PendingMessage {
  chunks: (Uint8Array | undefined)[];
  received: number;
  receivedBytes: number;
  totalBytes: number;
}

/**
 * Reassembles chunked payloads, keyed by message id.
 *
 * Holds partial messages, so it is also where a peer could exhaust memory:
 * every declared size is validated up front, a chunk that contradicts an
 * earlier declaration is rejected, and duplicates are ignored rather than
 * counted twice.
 */
export class ChunkAssembler {
  private readonly pending = new Map<string, PendingMessage>();

  constructor(private readonly maxMessageBytes: number = MAX_MESSAGE_BYTES) {}

  /** Number of part-built messages currently held. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Accepts one chunk. Returns the complete payload once the last piece
   * arrives, otherwise null. Throws on anything inconsistent.
   */
  accept(messageId: string, info: ChunkInfo, chunk: Uint8Array): Uint8Array | null {
    if (!Number.isInteger(info.count) || info.count <= 0) {
      throw new Error("Chunk count must be a positive integer");
    }
    if (!Number.isInteger(info.index) || info.index < 0 || info.index >= info.count) {
      throw new Error("Chunk index is outside the declared range");
    }
    if (!Number.isInteger(info.totalBytes) || info.totalBytes < 0) {
      throw new Error("Chunk total size must be a non-negative integer");
    }
    if (info.totalBytes > this.maxMessageBytes) {
      throw new Error(
        `Incoming message declares ${info.totalBytes} bytes, over the ${this.maxMessageBytes} byte limit`
      );
    }

    let entry = this.pending.get(messageId);
    if (!entry) {
      entry = {
        chunks: new Array(info.count),
        received: 0,
        receivedBytes: 0,
        totalBytes: info.totalBytes,
      };
      this.pending.set(messageId, entry);
    }

    if (entry.chunks.length !== info.count || entry.totalBytes !== info.totalBytes) {
      this.pending.delete(messageId);
      throw new Error("Chunk contradicts the earlier declaration for this message");
    }

    // A duplicate is not an error — a retransmit is legitimate — but it must
    // not inflate the byte count and trip the size check.
    if (entry.chunks[info.index] !== undefined) {
      return null;
    }

    if (entry.receivedBytes + chunk.byteLength > entry.totalBytes) {
      this.pending.delete(messageId);
      throw new Error("Chunks exceed the declared message size");
    }

    entry.chunks[info.index] = chunk;
    entry.received += 1;
    entry.receivedBytes += chunk.byteLength;

    if (entry.received < info.count) return null;

    this.pending.delete(messageId);

    if (entry.receivedBytes !== entry.totalBytes) {
      throw new Error(
        `Reassembled ${entry.receivedBytes} bytes but the message declared ${entry.totalBytes}`
      );
    }

    const complete = new Uint8Array(entry.totalBytes);
    let offset = 0;
    for (const piece of entry.chunks) {
      // Unreachable while `received === count`, but the assembler must never
      // silently produce a buffer with a hole in it.
      if (!piece) throw new Error("Reassembly found a missing chunk");
      complete.set(piece, offset);
      offset += piece.byteLength;
    }
    return complete;
  }

  /** Drops a partial message, e.g. when its query is cancelled. */
  discard(messageId: string): void {
    this.pending.delete(messageId);
  }

  /** Drops everything. Used when a peer disconnects. */
  clear(): void {
    this.pending.clear();
  }
}
