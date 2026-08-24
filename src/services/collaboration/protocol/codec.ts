/**
 * Wire codec for the Duck Peer Protocol.
 *
 * Sits between the transport (which moves bytes) and the session logic (which
 * handles messages). Its whole job is to make sure nothing untrusted reaches
 * the layer above: every inbound frame is length-checked, JSON-parsed,
 * version-checked and schema-validated before it becomes a `PeerMessage`.
 *
 * Decoding never throws. A malformed frame from a peer is an ordinary event,
 * not an exception — it returns a `DecodeFailure` the caller can log, count
 * and rate-limit against.
 */

import { decodeFrame, encodeFrame, type Frame } from "@/services/arrow/chunking";
import { peerMessageSchema, type PeerMessage } from "./messages";
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "./version";

/** Frame header as it appears on the wire: the message plus its version. */
interface WireHeader {
  v: number;
  [key: string]: unknown;
}

export interface DecodedMessage {
  ok: true;
  version: number;
  message: PeerMessage;
  /** Empty for messages that carry no binary payload. */
  payload: Uint8Array;
}

export interface DecodeFailure {
  ok: false;
  /** Machine-readable cause, for metrics and rate limiting. */
  reason: "malformed" | "version" | "schema";
  message: string;
}

export type DecodeResult = DecodedMessage | DecodeFailure;

/** Packs a message (and any binary payload) into a wire frame. */
export const encodeMessage = (
  message: PeerMessage,
  payload?: Uint8Array,
  version: number = PROTOCOL_VERSION
): ArrayBuffer => encodeFrame({ v: version, ...message } satisfies WireHeader, payload);

/**
 * Parses a wire frame.
 *
 * Order matters: shape, then version, then schema. Validating the schema of a
 * frame whose version we cannot interpret would produce a misleading error —
 * "unknown field" instead of "your Duck-UI is too old".
 */
export const decodeMessage = (buffer: ArrayBuffer): DecodeResult => {
  let frame: Frame;
  try {
    frame = decodeFrame(buffer);
  } catch (error) {
    return {
      ok: false,
      reason: "malformed",
      message: error instanceof Error ? error.message : "Unreadable frame",
    };
  }

  if (typeof frame.header !== "object" || frame.header === null) {
    return { ok: false, reason: "malformed", message: "Frame header is not an object" };
  }

  const header = frame.header as WireHeader;
  if (typeof header.v !== "number") {
    return { ok: false, reason: "version", message: "Frame header carries no protocol version" };
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(header.v)) {
    return {
      ok: false,
      reason: "version",
      message: `Unsupported protocol version ${header.v}`,
    };
  }

  const parsed = peerMessageSchema.safeParse(header);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "schema",
      // Only the first issue: the full Zod report can be large, and this text
      // may end up in a log a peer can flood.
      message: parsed.error.issues[0]?.message ?? "Message failed validation",
    };
  }

  return { ok: true, version: header.v, message: parsed.data, payload: frame.payload };
};
