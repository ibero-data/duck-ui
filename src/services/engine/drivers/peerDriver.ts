/**
 * Execution routed through another participant's browser.
 *
 * This is the payoff for the whole engine layer. A peer session is a
 * `DataSession` like any other: the SQL editor, the data explorer, the charts
 * and (later) dashboards drive it through the same interface they use for a
 * local DuckDB, and none of them contain a line of code about WebRTC.
 *
 * What the guest holds is a capability id — a name for something the host
 * agreed to run on its behalf. It has no host, no port, no credentials, and no
 * way to reach the underlying data except by asking. If the host closes its
 * tab, the capability stops working, which is exactly the intended semantics:
 * shared compute lives only as long as the browser providing it.
 */

import { generateUUID } from "@/lib/utils";
import { decodeRecordBatches, decodeTable } from "@/services/arrow/ipc";
import type { InboundMessage, PeerTransport } from "@/services/collaboration/transport/transport";
import type { SharedCapability } from "@/services/collaboration/capabilities/capability";
import { createExecution, type ProducedItem } from "../queryStream";
import { arrowSchemaToQuerySchema, catalogSnapshot } from "../session";
import { NO_CAPABILITIES } from "../types";
import type {
  CatalogSnapshot,
  ConnectionDefinition,
  DataDriver,
  DataSession,
  QueryExecution,
  QueryRequest,
  SessionCapabilities,
} from "../types";

/**
 * Capabilities of a peer-hosted session.
 *
 * Read-only and remote, and NOT `shareable`: re-sharing a capability someone
 * granted you would let access travel further than the host agreed to, so the
 * chain stops here.
 */
export const PEER_CAPABILITIES: SessionCapabilities = {
  ...NO_CAPABILITIES,
  streaming: true,
  cancellation: true,
  readonly: true,
  writable: false,
  remote: true,
  supportsCatalog: true,
  arrowNative: true,
};

/** How long to wait for a host to answer before giving up on a query. */
export const PEER_QUERY_TIMEOUT_MS = 120_000;

/** One message the host sent about a query, normalized for the stream. */
type QueryEvent =
  | { kind: "schema"; payload: Uint8Array }
  | { kind: "batch"; rows: number; payload: Uint8Array }
  | { kind: "complete"; truncated: boolean }
  | { kind: "error"; message: string; cancelled: boolean };

/**
 * A queue per in-flight query.
 *
 * Messages arrive from the transport whether or not the consumer is ready for
 * them, so they are buffered and handed over as the async generator pulls.
 * Without this, batches delivered faster than they are rendered would be lost.
 */
class QueryInbox {
  private readonly buffered: QueryEvent[] = [];
  private waiting: ((event: QueryEvent) => void) | null = null;
  private finished = false;

  push(event: QueryEvent): void {
    if (this.finished) return;
    if (event.kind === "complete" || event.kind === "error") this.finished = true;

    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(event);
      return;
    }
    this.buffered.push(event);
  }

  next(): Promise<QueryEvent> {
    const buffered = this.buffered.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  /** Ends the query with an error — used when the link drops. */
  abort(message: string): void {
    this.push({ kind: "error", message, cancelled: false });
  }
}

export interface PeerSessionOptions {
  connectionId: string;
  transport: PeerTransport;
  capability: SharedCapability;
  timeoutMs?: number;
}

export class PeerSession implements DataSession {
  readonly id = generateUUID();
  readonly connectionId: string;
  readonly kind = "peer" as const;
  readonly capabilities: SessionCapabilities = PEER_CAPABILITIES;

  private readonly inboxes = new Map<string, QueryInbox>();
  private readonly detachMessage: () => void;
  private readonly detachState: () => void;
  private open = true;

  constructor(private readonly options: PeerSessionOptions) {
    this.connectionId = options.connectionId;

    this.detachMessage = options.transport.onMessage((inbound) => this.route(inbound));
    this.detachState = options.transport.onStateChange((state) => {
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.open = false;
        // Every waiting query fails with something a person can act on,
        // rather than hanging until its timeout.
        for (const inbox of this.inboxes.values()) {
          inbox.abort("The person hosting this connection is no longer available");
        }
        this.inboxes.clear();
      }
    });
  }

  get isOpen(): boolean {
    return this.open && this.options.transport.state === "connected";
  }

  /** The capability this session executes through. */
  get capability(): SharedCapability {
    return this.options.capability;
  }

  /**
   * Replaces the capability after the host widened it ("all data" shares grow
   * as the host adds tables). Same id, new catalog; the session keeps running
   * queries through the same transport.
   */
  updateCapability(capability: SharedCapability): void {
    if (capability.id !== this.options.capability.id) return;
    this.options.capability = capability;
  }

  execute(request: QueryRequest): QueryExecution {
    const queryId = request.id ?? generateUUID();
    const inbox = new QueryInbox();
    this.inboxes.set(queryId, inbox);

    const transport = this.options.transport;
    const capabilityId = this.options.capability.id;
    const timeoutMs = this.options.timeoutMs ?? PEER_QUERY_TIMEOUT_MS;
    const isOpen = () => this.isOpen;
    const release = () => this.inboxes.delete(queryId);

    return createExecution({
      id: queryId,
      sql: request.sql,
      signal: request.signal,
      // Not `maxRows`: the HOST enforces the cap. Applying it again here would
      // hide the fact that the host truncated, and a guest-side limit is not a
      // limit at all — the rows have already crossed the wire.
      onCancel: async () => {
        // Sent on `control`, not `query`: the query channel may be busy
        // carrying the very result being cancelled.
        await transport.send("control", { t: "query.cancel", queryId }).catch(() => {});
      },
      produce: async function* (): AsyncGenerator<ProducedItem> {
        if (!isOpen()) {
          throw new Error("The person hosting this connection is no longer available");
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await transport.send("query", {
            t: "query.start",
            queryId,
            capabilityId,
            sql: request.sql,
            maxRows: request.maxRows,
          });

          // A host that never answers must not leave the query pending
          // forever; the guest gives up on its own.
          const deadline = new Promise<QueryEvent>((resolve) => {
            timer = setTimeout(
              () =>
                resolve({
                  kind: "error",
                  message: `No response from the host after ${Math.round(timeoutMs / 1000)}s`,
                  cancelled: false,
                }),
              timeoutMs
            );
          });

          for (;;) {
            const event = await Promise.race([inbox.next(), deadline]);

            if (event.kind === "schema") {
              yield {
                kind: "schema",
                schema: arrowSchemaToQuerySchema(decodeTable(event.payload).schema),
              };
              continue;
            }
            if (event.kind === "batch") {
              for (const batch of decodeRecordBatches(event.payload)) {
                yield { kind: "chunk", rows: batch.numRows, chunk: { encoding: "arrow", batch } };
              }
              continue;
            }
            if (event.kind === "error") throw new Error(event.message);
            return; // complete
          }
        } finally {
          if (timer) clearTimeout(timer);
          release();
        }
      },
    });
  }

  /**
   * The catalog the host described when it granted the capability.
   *
   * No round trip: the guest is shown what the host chose to reveal, not
   * whatever `information_schema` happens to hold.
   */
  async introspect(): Promise<CatalogSnapshot> {
    return this.options.capability.catalog ?? catalogSnapshot([]);
  }

  async close(): Promise<void> {
    this.open = false;
    this.detachMessage();
    this.detachState();
    for (const inbox of this.inboxes.values()) {
      inbox.abort("Connection closed");
    }
    this.inboxes.clear();
  }

  private route(inbound: InboundMessage): void {
    const message = inbound.message;
    if (!("queryId" in message)) return;

    const inbox = this.inboxes.get(message.queryId);
    if (!inbox) return;

    switch (message.t) {
      case "query.schema":
        inbox.push({ kind: "schema", payload: inbound.payload });
        break;
      case "query.batch":
        inbox.push({ kind: "batch", rows: message.rows, payload: inbound.payload });
        break;
      case "query.complete":
        inbox.push({ kind: "complete", truncated: message.truncated });
        break;
      case "query.error":
        inbox.push({ kind: "error", message: message.message, cancelled: message.cancelled });
        break;
      default:
        break;
    }
  }
}

/**
 * Registry of live peer sessions, keyed by connection id.
 *
 * A peer session cannot be built from a definition alone — it needs a live
 * transport and a capability the host granted at runtime. The collaboration
 * layer registers those here as they arrive, and the driver looks them up, so
 * the engine registry stays free of collaboration concerns.
 */
const pendingSessions = new Map<string, PeerSession>();

/** Called by the collaboration layer when a host grants a capability. */
export const registerPeerSession = (session: PeerSession): void => {
  pendingSessions.set(session.connectionId, session);
};

/** Called when a grant is revoked or the session ends. */
export const unregisterPeerSession = (connectionId: string): void => {
  pendingSessions.delete(connectionId);
};

export const peerDriver: DataDriver<"peer"> = {
  kind: "peer",

  async isAvailable(): Promise<boolean> {
    return typeof RTCPeerConnection !== "undefined";
  },

  async connect(definition: ConnectionDefinition<"peer">): Promise<DataSession> {
    const session = pendingSessions.get(definition.id);
    if (!session) {
      throw new Error(
        "This shared connection is no longer available — the session may have ended."
      );
    }
    if (!session.isOpen) {
      throw new Error("The person hosting this connection is no longer available");
    }
    return session;
  },

  async test(definition: ConnectionDefinition<"peer">): Promise<void> {
    const session = pendingSessions.get(definition.id);
    if (!session?.isOpen) {
      throw new Error("The person hosting this connection is no longer available");
    }
  },
};
