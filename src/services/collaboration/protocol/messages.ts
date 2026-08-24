/**
 * Duck Peer Protocol message schemas.
 *
 * Everything here crosses a network boundary from a browser Duck-UI does not
 * control. TypeScript types are erased at runtime and prove nothing about what
 * actually arrived, so every inbound message is parsed with Zod before any
 * field is touched. A peer is assumed hostile until a message validates.
 *
 * Two logical planes share one schema set:
 *
 *   CONTROL / COLLABORATION   hello, capabilities, grants, revocations
 *   DATA / COMPUTE            query lifecycle, dataset transfer
 *
 * The union is deliberately closed. An unrecognised `t` is rejected rather
 * than ignored, because silently dropping a message a newer peer considers
 * essential produces a session that looks connected and does nothing.
 */

import { z } from "zod";
import { MAX_HEADER_BYTES, MAX_MESSAGE_BYTES } from "@/services/arrow/chunking";

/** Bounds on free-text fields, so a peer cannot spend our memory on strings. */
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
/**
 * SQL travels in the frame HEADER, so this must stay comfortably inside the
 * header budget. Setting it above `MAX_HEADER_BYTES` would mean a long
 * statement failed at the sender with a framing error instead of being
 * refused cleanly as a protocol violation — the guest would see "frame header
 * exceeds…" rather than "that query is too long".
 */
const MAX_SQL_LENGTH = Math.floor(MAX_HEADER_BYTES / 2);
const MAX_ERROR_LENGTH = 4_000;
const MAX_LIST_LENGTH = 5_000;

const id = z.string().min(1).max(MAX_ID_LENGTH);
const name = z.string().min(1).max(MAX_NAME_LENGTH);

/** Chunk bookkeeping on any frame carrying a split binary payload. */
export const chunkInfoSchema = z.object({
  index: z.number().int().min(0),
  count: z.number().int().min(1),
  totalBytes: z.number().int().min(0).max(MAX_MESSAGE_BYTES),
  /**
   * Sender-assigned identity for this message.
   *
   * Present on streams with no natural per-message id (document updates,
   * presence), where two messages could otherwise be in flight at once and
   * reassemble into each other.
   */
  key: z.string().min(1).max(MAX_ID_LENGTH).optional(),
});

//
// Control plane
//

export const helloSchema = z.object({
  t: z.literal("hello"),
  peerId: id,
  displayName: name,
  /** Every protocol version the sender can speak. */
  protocolVersions: z.array(z.number().int().min(0)).min(1).max(32),
  /** Build identifier. Diagnostics only — never trusted for behaviour. */
  appVersion: z.string().max(64).optional(),
});

export const helloAckSchema = z.object({
  t: z.literal("hello.ack"),
  peerId: id,
  displayName: name,
  /** Version the host chose. Both sides use it from here on. */
  protocolVersion: z.number().int().min(0),
  /** True when this peer hosts the session. */
  isHost: z.boolean(),
});

/**
 * Why a peer refused to proceed. Sent instead of dropping the connection, so
 * the other side can say something useful rather than "disconnected".
 */
export const rejectSchema = z.object({
  t: z.literal("reject"),
  reason: z.enum(["version", "unauthorized", "full", "closed"]),
  message: z.string().max(MAX_ERROR_LENGTH),
});

//
// Capability plane
//

/**
 * What a guest is told about a shared data source.
 *
 * Note what is absent: host, port, user, password, key, connection string.
 * A guest learns that "Production" exists and what tables it has. It never
 * learns how to reach it, and could not connect to it on its own.
 */
export const sharedCapabilitySchema = z.object({
  id,
  ownerPeerId: id,
  name,
  type: z.literal("query"),
  permission: z.literal("read"),
  /** Table/column listing. Names and types only — never rows. */
  catalog: z
    .object({
      databases: z
        .array(
          z.object({
            name: z.string().max(MAX_NAME_LENGTH),
            tables: z
              .array(
                z.object({
                  name: z.string().max(MAX_NAME_LENGTH),
                  schema: z.string().max(MAX_NAME_LENGTH),
                  columns: z
                    .array(
                      z.object({
                        name: z.string().max(MAX_NAME_LENGTH),
                        type: z.string().max(MAX_NAME_LENGTH),
                        nullable: z.boolean(),
                      })
                    )
                    .max(MAX_LIST_LENGTH),
                  rowCount: z.number().int().min(-1),
                })
              )
              .max(MAX_LIST_LENGTH),
          })
        )
        .max(MAX_LIST_LENGTH),
      capturedAt: z.string().max(64),
    })
    .optional(),
  /** Limits the guest is told about, so its UI can show them honestly. */
  policy: z.object({
    readonly: z.literal(true),
    maxResultRows: z.number().int().min(1).optional(),
    maxResultBytes: z.number().int().min(1).optional(),
    expiresAt: z.string().max(64).optional(),
  }),
});

export const capabilityListSchema = z.object({
  t: z.literal("capability.list"),
  capabilities: z.array(sharedCapabilitySchema).max(256),
});

export const capabilityGrantSchema = z.object({
  t: z.literal("capability.grant"),
  capability: sharedCapabilitySchema,
});

/**
 * A grant the guest already holds changed shape — the host shared a new table
 * into the session ("all data" mode picks up tables created after sharing).
 * Same payload as a grant; the id identifies which one to replace.
 */
export const capabilityUpdateSchema = z.object({
  t: z.literal("capability.update"),
  capability: sharedCapabilitySchema,
});

export const capabilityRevokeSchema = z.object({
  t: z.literal("capability.revoke"),
  capabilityId: id,
  /** Shown to the guest so a revocation is not a silent failure. */
  reason: z.string().max(MAX_ERROR_LENGTH).optional(),
});

//
// Data plane — query lifecycle
//

export const queryStartSchema = z.object({
  t: z.literal("query.start"),
  queryId: id,
  capabilityId: id,
  sql: z.string().min(1).max(MAX_SQL_LENGTH),
  /**
   * Row cap the guest is asking for. The host applies the stricter of this and
   * its own policy — a guest asking for more than it was granted gets the
   * grant, not the request.
   */
  maxRows: z.number().int().min(1).optional(),
});

export const queryCancelSchema = z.object({
  t: z.literal("query.cancel"),
  queryId: id,
});

/**
 * Result shape. Carries an Arrow IPC payload holding the schema with no rows,
 * so the guest reconstructs the real Arrow types rather than a JSON echo.
 */
export const querySchemaMessageSchema = z.object({
  t: z.literal("query.schema"),
  queryId: id,
  chunk: chunkInfoSchema,
});

export const queryBatchSchema = z.object({
  t: z.literal("query.batch"),
  queryId: id,
  /** Batch ordinal within the result. */
  seq: z.number().int().min(0),
  rows: z.number().int().min(0),
  chunk: chunkInfoSchema,
});

export const queryCompleteSchema = z.object({
  t: z.literal("query.complete"),
  queryId: id,
  rowCount: z.number().int().min(0),
  batchCount: z.number().int().min(0),
  durationMs: z.number().min(0),
  truncated: z.boolean(),
});

export const queryErrorSchema = z.object({
  t: z.literal("query.error"),
  queryId: id,
  message: z.string().max(MAX_ERROR_LENGTH),
  cancelled: z.boolean(),
});

//
// Collaboration plane — shared document state
//

/**
 * A CRDT update for the shared workspace.
 *
 * Carries an opaque binary payload rather than anything Yjs-shaped on purpose
 * (§13): the protocol says "here is an update for document X", and the
 * document layer decides what that means. Swapping the CRDT implementation
 * later is then a change in one module, not a protocol version bump.
 */
export const docUpdateSchema = z.object({
  t: z.literal("doc.update"),
  /** Which shared document. One workspace today; dashboards later. */
  docId: id,
  chunk: chunkInfoSchema,
});

/**
 * A request for the full document state.
 *
 * Sent by a peer that has just joined and holds nothing. The payload is the
 * requester's state vector, so the answer carries only what it is missing.
 */
export const docSyncRequestSchema = z.object({
  t: z.literal("doc.sync-request"),
  docId: id,
  chunk: chunkInfoSchema,
});

//
// Presence
//

export const presenceSchema = z.object({
  t: z.literal("presence"),
  peerId: id,
  displayName: name,
  color: z.string().max(32).optional(),
  /**
   * Awareness payload (cursor position, selection) as an opaque chunk.
   * Optional: a plain "I am here" needs no payload.
   */
  chunk: chunkInfoSchema.optional(),
  /** Where this peer is working, for cursors and the participant list. */
  location: z
    .object({
      documentId: z.string().max(MAX_ID_LENGTH).optional(),
      line: z.number().int().min(0).optional(),
      column: z.number().int().min(0).optional(),
    })
    .optional(),
});

export const peerLeftSchema = z.object({
  t: z.literal("peer.left"),
  peerId: id,
});

//
// The closed union
//

export const peerMessageSchema = z.discriminatedUnion("t", [
  helloSchema,
  helloAckSchema,
  rejectSchema,
  capabilityListSchema,
  capabilityGrantSchema,
  capabilityUpdateSchema,
  capabilityRevokeSchema,
  queryStartSchema,
  queryCancelSchema,
  querySchemaMessageSchema,
  queryBatchSchema,
  queryCompleteSchema,
  queryErrorSchema,
  docUpdateSchema,
  docSyncRequestSchema,
  presenceSchema,
  peerLeftSchema,
]);

export type ChunkInfoMessage = z.infer<typeof chunkInfoSchema>;
export type HelloMessage = z.infer<typeof helloSchema>;
export type HelloAckMessage = z.infer<typeof helloAckSchema>;
export type RejectMessage = z.infer<typeof rejectSchema>;
export type SharedCapabilityMessage = z.infer<typeof sharedCapabilitySchema>;
export type CapabilityListMessage = z.infer<typeof capabilityListSchema>;
export type CapabilityGrantMessage = z.infer<typeof capabilityGrantSchema>;
export type CapabilityUpdateMessage = z.infer<typeof capabilityUpdateSchema>;
export type CapabilityRevokeMessage = z.infer<typeof capabilityRevokeSchema>;
export type QueryStartMessage = z.infer<typeof queryStartSchema>;
export type QueryCancelMessage = z.infer<typeof queryCancelSchema>;
export type QuerySchemaMessage = z.infer<typeof querySchemaMessageSchema>;
export type QueryBatchMessage = z.infer<typeof queryBatchSchema>;
export type QueryCompleteMessage = z.infer<typeof queryCompleteSchema>;
export type QueryErrorMessage = z.infer<typeof queryErrorSchema>;
export type DocUpdateMessage = z.infer<typeof docUpdateSchema>;
export type DocSyncRequestMessage = z.infer<typeof docSyncRequestSchema>;
export type PresenceMessage = z.infer<typeof presenceSchema>;
export type PeerLeftMessage = z.infer<typeof peerLeftSchema>;

export type PeerMessage = z.infer<typeof peerMessageSchema>;
export type PeerMessageType = PeerMessage["t"];

/** Messages that carry a binary payload alongside the header. */
export const CARRIES_PAYLOAD: ReadonlySet<PeerMessageType> = new Set([
  "query.schema",
  "query.batch",
  "doc.update",
  "doc.sync-request",
]);
