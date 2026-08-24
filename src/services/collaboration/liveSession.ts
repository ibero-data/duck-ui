/**
 * Live session orchestration — the layer the UI actually talks to.
 *
 * Ties together the four pieces built underneath: signaling produces a
 * connection, the transport carries frames, the capability model says what a
 * guest may do, and the share runtime is where its SQL runs.
 *
 * Two roles, deliberately separate types. A host owns compute and grants
 * access; a guest holds a grant and asks. Modelling them as one class with an
 * `isHost` flag is how you end up shipping a guest that can revoke its own
 * limits.
 */

import { generateUUID } from "@/lib/utils";
import { Table, type RecordBatch } from "apache-arrow";
import {
  asLocalDuckSession,
  collectExecution,
  registerPeerSession,
  unregisterPeerSession,
  PeerSession,
  type CatalogSnapshot,
  type DataSession,
} from "@/services/engine";
import {
  DEFAULT_CAPABILITY_POLICY,
  toWireCapability,
  type CapabilityPolicy,
  type SharedCapability,
} from "./capabilities/capability";
import { PeerHost } from "./peerHost";
import { WorkspaceDocument, type SharedTab } from "./document";
import { PresenceChannel } from "./presence";
import { ShareRuntime } from "./shareRuntime";
import type { ChannelTransport } from "./transport/channelTransport";
import {
  acceptAnswer,
  awaitHostChannels,
  createGuestConnection,
  createHostConnection,
} from "./transport/webrtcTransport";
import {
  buildInviteUrl,
  decodeInvite,
  encodeInvite,
  type ManualAnswer,
  type ManualInvite,
} from "./signaling/manualSignaling";
import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateVersion,
} from "./protocol/version";
import type { PeerMessage } from "./protocol/messages";

/** A participant, as shown in the session panel. */
export interface Participant {
  peerId: string;
  displayName: string;
  isHost: boolean;
  /** Assigned locally for cursors and avatars. */
  color: string;
}

/** Deterministic per-peer colour, so both sides show the same one. */
const colorForPeer = (peerId: string): string => {
  const palette = [
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#ec4899",
    "#8b5cf6",
    "#ef4444",
    "#14b8a6",
    "#f97316",
  ];
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
};

/** One table a host is offering. */
export interface ShareSelection {
  /** Fully-qualified source, as it exists in the host's own session. */
  qualifiedName: string;
  /** Name the guest will see. */
  exposedName: string;
}

export interface HostSessionOptions {
  sessionName: string;
  displayName: string;
  /** The host's own session, which the shared data is read FROM. */
  source: DataSession;
  /** Tables to expose. Empty means workspace-only sharing, no data access. */
  shared: ShareSelection[];
  /**
   * "All data" mode: share every table on the connection, INCLUDING tables
   * created after the session starts. The host re-scans its catalog and copies
   * anything new into the share runtime, then tells guests the grant grew.
   */
  shareAll?: boolean;
  policy?: Partial<CapabilityPolicy>;
  /** Tabs the shared workspace opens with. */
  initialTabs?: SharedTab[];
}

export type SessionStatus =
  | "idle"
  /** Host: invite created, nobody has joined yet. */
  | "awaiting-guest"
  /** Guest: answer produced and shown, waiting for the host to paste it back. */
  | "awaiting-host"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

/** One offer waiting for its answer. */
interface PendingInvite {
  inviteId: string;
  connection: RTCPeerConnection;
  transport: ChannelTransport;
  channels: RTCDataChannel[];
}

/** One connected guest. */
interface ConnectedGuest {
  peerId: string;
  displayName: string;
  connection: RTCPeerConnection;
  transport: ChannelTransport;
  server: PeerHost;
  detachDocument: () => void;
  detachPresence: () => void;
}

/**
 * The host half of a live session.
 *
 * Host topology (§12): every guest holds one connection, to the host. The host
 * holds one per guest and relays collaboration between them. Nothing is a mesh,
 * so a guest never learns another guest's network address.
 *
 * Each guest needs its OWN offer — an SDP offer belongs to a single peer
 * connection — so inviting a second person mints a second invite rather than
 * reusing the first. That also makes every invite single-use, which is the
 * behaviour you want from a link someone might forward.
 */
export class HostLiveSession {
  readonly sessionId = generateUUID();
  readonly peerId = generateUUID();

  status: SessionStatus = "idle";

  private readonly capabilities = new Map<string, SharedCapability>();
  private runtime: ShareRuntime | null = null;
  private readonly pending = new Map<string, PendingInvite>();
  private readonly guests = new Map<string, ConnectedGuest>();

  /** Shared workspace. Created on connect — no session, no CRDT, no cost. */
  document: WorkspaceDocument | null = null;
  presence: PresenceChannel | null = null;

  private onChanged: (() => void) | null = null;

  /** The tables currently shared. Grows over time in "all data" mode. */
  private sharedSelectionsValue: ShareSelection[];
  /** Serializes catalog refreshes so two triggers cannot copy the same table twice. */
  private refreshing: Promise<void> | null = null;

  private constructor(readonly options: HostSessionOptions) {
    this.sharedSelectionsValue = [...options.shared];
  }

  private get sharedSelections(): ShareSelection[] {
    return this.sharedSelectionsValue;
  }

  private set sharedSelections(value: ShareSelection[]) {
    this.sharedSelectionsValue = value;
  }

  /** Called when the guest list changes. */
  onUpdate(handler: () => void): void {
    this.onChanged = handler;
  }

  /**
   * Starts hosting: builds the share runtime, gathers ICE, and returns the
   * invite the host sends to whoever they want in the session.
   */
  static async create(
    options: HostSessionOptions
  ): Promise<{ session: HostLiveSession; inviteUrl: string; inviteCode: string }> {
    const session = new HostLiveSession(options);

    // "All data" resolves to whatever the connection holds right now; the
    // refresh loop picks up anything created later.
    if (options.shareAll) {
      session.sharedSelections = await shareableTables(options.source);
    }

    // Data first: a failure here must happen before an invite exists, so a
    // guest is never handed a link to a session that cannot serve them.
    // In "all data" mode the runtime exists even with zero tables today,
    // because tables added later need somewhere to land.
    if (session.sharedSelections.length > 0 || options.shareAll) {
      await session.buildShareRuntime();
    }

    // The document exists from the start now, so guests joining at different
    // times all converge on the same workspace.
    session.document = new WorkspaceDocument();
    session.document.seedTabs(options.initialTabs ?? []);
    session.presence = new PresenceChannel(session.document.doc, [], {
      peerId: session.peerId,
      displayName: options.displayName,
      color: colorForPeer(session.peerId),
    });

    const invite = await session.createInvite();
    session.status = "awaiting-guest";

    return { session, inviteUrl: buildInviteUrl(invite.code), inviteCode: invite.code };
  }

  /**
   * Mints a fresh invite for one more person.
   *
   * Gathers a new offer, so this costs an ICE round; the caller shows a
   * spinner. Pending invites are kept until answered or the session ends.
   */
  async createInvite(): Promise<{ inviteId: string; code: string; url: string }> {
    const { connection, transport, channels, localDescription } = await createHostConnection(
      this.peerId
    );
    const inviteId = generateUUID();
    this.pending.set(inviteId, { inviteId, connection, transport, channels });

    const invite: ManualInvite = {
      v: 1,
      sessionId: this.sessionId,
      inviteId,
      sessionName: this.options.sessionName,
      hostPeerId: this.peerId,
      hostDisplayName: this.options.displayName,
      offer: localDescription,
    };

    const code = await encodeInvite(invite);
    return { inviteId, code, url: buildInviteUrl(code) };
  }

  /**
   * Copies the selected tables into an isolated runtime.
   *
   * The data is read through the host's OWN session (so it can come from
   * anywhere the host can reach — memory, OPFS, an external server) and
   * written into a separate engine. That copy is what makes the boundary real:
   * the guest queries the copy, never the source.
   */
  private async buildShareRuntime(): Promise<void> {
    const runtime = await ShareRuntime.create();
    this.runtime = runtime;

    // Named after the runtime's REAL catalog, so the qualified names a guest's
    // explorer builds resolve against the engine that will run them.
    const catalog: CatalogSnapshot = {
      databases: [{ name: runtime.catalogName, tables: [] }],
      capturedAt: "",
    };

    try {
      for (const selection of this.sharedSelections) {
        await this.copyIntoRuntime(runtime, selection, catalog);
      }

      // Seal AFTER loading: once locked, nothing can change engine config,
      // including this code.
      await runtime.seal();
      catalog.capturedAt = new Date().toISOString();

      const capability: SharedCapability = {
        id: generateUUID(),
        ownerPeerId: this.peerId,
        name: this.options.sessionName,
        type: "query",
        permission: "read",
        executor: { kind: "peer", peerId: this.peerId },
        catalog,
        policy: this.policy(),
      };
      this.capabilities.set(capability.id, capability);
    } catch (error) {
      // Never leave a half-built runtime holding a worker and its heap.
      await runtime.close();
      this.runtime = null;
      throw error;
    }
  }

  private policy(): CapabilityPolicy {
    return { ...DEFAULT_CAPABILITY_POLICY, ...this.options.policy, readonly: true };
  }

  /**
   * Reads one table through the host's own session and copies it into the
   * runtime, recording its shape in the catalog guests are shown.
   */
  private async copyIntoRuntime(
    runtime: ShareRuntime,
    selection: ShareSelection,
    catalog: CatalogSnapshot
  ): Promise<void> {
    const collected = await collectExecution(
      this.options.source.execute({
        sql: `SELECT * FROM ${selection.qualifiedName}`,
        label: `share:${selection.exposedName}`,
        maxRows: this.policy().maxResultRows,
      })
    );

    if (collected.error) {
      throw new Error(`Couldn't share "${selection.exposedName}": ${collected.error.message}`);
    }

    const batches: RecordBatch[] = collected.batches.length
      ? collected.batches
      : new Table(collected.schema?.arrow ?? new Table([]).schema).batches;

    if (batches.length === 0) {
      throw new Error(`Couldn't share "${selection.exposedName}": it returned no columns`);
    }

    await runtime.addTable({ name: selection.exposedName, batches });

    const schema = collected.schema;
    catalog.databases[0].tables.push({
      name: selection.exposedName,
      schema: runtime.schemaName,
      rowCount: collected.rowCount,
      columns: (schema?.fields ?? []).map((field) => ({
        name: field.name,
        type: field.type,
        nullable: field.nullable,
      })),
    });
  }

  /**
   * "All data" mode: picks up tables created since the share started.
   *
   * Re-scans the host's catalog, copies anything the runtime does not hold
   * yet, and tells every guest the grant grew. Safe to call often — a scan
   * that finds nothing new sends nothing. Serialized so overlapping triggers
   * (schema refresh + poll) cannot copy the same table twice.
   *
   * Deliberately additive: a table that already crossed is NOT re-copied when
   * its rows change, and a dropped table stays available to guests until the
   * session ends. Snapshot semantics per table, live discovery of new ones.
   */
  async refreshSharedData(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefreshSharedData().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefreshSharedData(): Promise<void> {
    const runtime = this.runtime;
    if (!this.options.shareAll || !runtime?.isRunning) return;

    const capability = [...this.capabilities.values()][0];
    const catalog = capability?.catalog;
    if (!capability || !catalog) return;

    const all = await shareableTables(this.options.source);
    const known = new Set(runtime.tableNames);
    const fresh = all.filter((selection) => !known.has(selection.exposedName));
    if (fresh.length === 0) return;

    for (const selection of fresh) {
      try {
        await this.copyIntoRuntime(runtime, selection, catalog);
        this.sharedSelectionsValue.push(selection);
      } catch (error) {
        // One unreadable table must not stop the others from crossing.
        console.warn(`[session] couldn't share new table "${selection.exposedName}":`, error);
      }
    }
    catalog.capturedAt = new Date().toISOString();

    await this.sendAll({ t: "capability.update", capability: toWireCapability(capability) });
    this.onChanged?.();
  }

  /** Completes the handshake with the code the guest sent back. */
  async acceptGuestCode(code: string): Promise<void> {
    const answer = await decodeInvite<ManualAnswer>(code);
    if (!answer || !("answer" in answer)) {
      throw new Error("That code isn't readable — ask them to copy it again");
    }
    if (answer.sessionId !== this.sessionId) {
      throw new Error("That code is for a different session");
    }

    const invite = this.pending.get(answer.inviteId);
    if (!invite) {
      // Either already used or from an older session. Both mean the same thing
      // to whoever is holding it.
      throw new Error("That invite has already been used — send them a new one");
    }
    this.pending.delete(answer.inviteId);

    this.status = "connecting";
    await acceptAnswer(invite.connection, answer.answer);
    await awaitHostChannels(invite.connection, invite.transport, invite.channels);

    // One query server per guest, all sharing the same runtime and the same
    // grants. A guest cannot reach another guest's queries.
    const server = new PeerHost({
      transport: invite.transport,
      runtime: this.runtime as ShareRuntime,
      capabilities: this.capabilities,
    });

    const document = this.document;
    const presence = this.presence;
    if (!document || !presence) throw new Error("Session is not ready");

    const guest: ConnectedGuest = {
      peerId: answer.guestPeerId,
      displayName: answer.guestDisplayName,
      connection: invite.connection,
      transport: invite.transport,
      server,
      detachDocument: document.attach(invite.transport),
      detachPresence: presence.attach(invite.transport),
    };
    this.guests.set(guest.peerId, guest);

    // A guest that drops must stop counting as a participant, and its cursor
    // must go with it.
    invite.transport.onStateChange((state) => {
      if (state === "disconnected" || state === "failed" || state === "closed") {
        void this.dropGuest(guest.peerId);
      }
    });

    this.status = "connected";

    await this.sendTo(guest, {
      t: "hello.ack",
      peerId: this.peerId,
      displayName: this.options.displayName,
      protocolVersion: PROTOCOL_VERSION,
      isHost: true,
    });

    // Only now does the guest learn what it may query. Joining grants nothing
    // on its own (§31).
    for (const capability of this.capabilities.values()) {
      await this.sendTo(guest, {
        t: "capability.grant",
        capability: toWireCapability(capability),
      });
    }

    this.onChanged?.();
  }

  /** Removes one guest: closes its link and forgets it. */
  async dropGuest(peerId: string): Promise<void> {
    const guest = this.guests.get(peerId);
    if (!guest) return;
    this.guests.delete(peerId);

    guest.detachDocument();
    guest.detachPresence();
    await guest.server.close();
    await guest.transport.close();
    guest.connection.close();

    // Back to waiting if that was the last one, rather than claiming to be
    // connected to nobody.
    if (this.guests.size === 0 && this.status === "connected") {
      this.status = "awaiting-guest";
    }
    this.onChanged?.();
  }

  private async sendTo(guest: ConnectedGuest, message: PeerMessage): Promise<void> {
    await guest.transport.send("control", message as never).catch(() => {});
  }

  /** Sends to every connected guest. */
  private async sendAll(message: PeerMessage): Promise<void> {
    await Promise.all([...this.guests.values()].map((guest) => this.sendTo(guest, message)));
  }

  /** Withdraws a grant. In-flight queries against it fail immediately. */
  async revoke(capabilityId: string, reason?: string): Promise<void> {
    this.capabilities.delete(capabilityId);
    // Withdrawn from everyone at once: a grant belongs to the session, so
    // leaving one guest holding it would be a surprise.
    await this.sendAll({ t: "capability.revoke", capabilityId, reason });
  }

  get grantedCapabilities(): SharedCapability[] {
    return [...this.capabilities.values()];
  }

  get people(): Participant[] {
    return [
      {
        peerId: this.peerId,
        displayName: this.options.displayName,
        isHost: true,
        color: colorForPeer(this.peerId),
      },
      ...[...this.guests.values()].map((guest) => ({
        peerId: guest.peerId,
        displayName: guest.displayName,
        isHost: false,
        color: colorForPeer(guest.peerId),
      })),
    ];
  }

  /** Invites minted but not yet answered. */
  get pendingInviteCount(): number {
    return this.pending.size;
  }

  /** Ends the session. Every shared capability stops existing (§46). */
  async end(): Promise<void> {
    this.status = "disconnected";
    this.capabilities.clear();

    for (const guest of [...this.guests.values()]) {
      guest.detachDocument();
      guest.detachPresence();
      await guest.server.close();
      await guest.transport.close();
      guest.connection.close();
    }
    this.guests.clear();

    // Offers nobody answered still hold a peer connection open.
    for (const invite of this.pending.values()) {
      await invite.transport.close();
      invite.connection.close();
    }
    this.pending.clear();

    this.presence?.close();
    this.document?.close();
    this.presence = null;
    this.document = null;

    await this.runtime?.close();
    this.runtime = null;
    this.onChanged?.();
  }
}

/** The guest half of a live session. */
export class GuestLiveSession {
  readonly peerId = generateUUID();

  status: SessionStatus = "idle";
  capabilities: SharedCapability[] = [];

  private connection: RTCPeerConnection | null = null;
  private transport: ChannelTransport | null = null;
  private peerSessions = new Map<string, PeerSession>();
  private onChanged: (() => void) | null = null;

  document: WorkspaceDocument | null = null;
  presence: PresenceChannel | null = null;

  /** Set when the handshake fails after the code was handed over. */
  failure: string | null = null;

  private constructor(
    readonly invite: ManualInvite,
    readonly displayName: string
  ) {}

  /**
   * Joins from an invite. Produces the code the guest sends back.
   *
   * Nothing is executed and no local file is touched by joining (§45) — the
   * guest is connected and holds no capability until the host grants one.
   */
  static async join(
    inviteCode: string,
    displayName: string
  ): Promise<{ session: GuestLiveSession; answerCode: string }> {
    const invite = await decodeInvite<ManualInvite>(inviteCode);
    if (!invite || !("offer" in invite)) {
      throw new Error("That invite link isn't readable — ask for a fresh one");
    }

    const session = new GuestLiveSession(invite, displayName);
    session.status = "connecting";

    const { connection, localDescription, ready } = await createGuestConnection(
      session.peerId,
      invite.offer
    );
    session.connection = connection;

    const answer: ManualAnswer = {
      v: 1,
      sessionId: invite.sessionId,
      // Echoed so the host can apply this to the connection that offered it.
      inviteId: invite.inviteId,
      guestPeerId: session.peerId,
      guestDisplayName: displayName,
      answer: localDescription,
    };
    const answerCode = await encodeInvite(answer);

    // The code exists now and the guest can send it. The channels only open
    // once the host pastes it back, so the rest is wired up when that happens.
    session.status = "awaiting-host";
    ready.then(
      ({ transport }) => {
        session.transport = transport;
        session.listen();

        session.document = new WorkspaceDocument([transport]);
        session.presence = new PresenceChannel(session.document.doc, [transport], {
          peerId: session.peerId,
          displayName: session.displayName,
          color: colorForPeer(session.peerId),
        });
        // The guest holds nothing yet, so it asks for the diff rather than
        // waiting for the next edit to reveal the workspace.
        void session.document.requestSync();

        session.status = "connected";
        session.onChanged?.();
      },
      (error: unknown) => {
        session.status = "failed";
        session.failure = error instanceof Error ? error.message : "Connection failed";
        session.onChanged?.();
      }
    );

    return { session, answerCode };
  }

  /** Called whenever status or the granted capability set changes. */
  onUpdate(handler: () => void): void {
    this.onChanged = handler;
  }

  private listen(): void {
    this.transport?.onMessage(({ message }) => {
      switch (message.t) {
        case "hello.ack": {
          const agreed = negotiateVersion([message.protocolVersion]);
          if (agreed === null) {
            // Refuse rather than speak a protocol we do not implement.
            this.status = "failed";
            void this.leave();
          }
          break;
        }
        case "capability.grant":
          this.addCapability(message.capability as SharedCapability);
          break;
        case "capability.update":
          this.updateCapability(message.capability as SharedCapability);
          break;
        case "capability.list":
          for (const capability of message.capabilities) {
            this.addCapability(capability as SharedCapability);
          }
          break;
        case "capability.revoke":
          this.removeCapability(message.capabilityId);
          break;
        default:
          break;
      }
    });

    this.transport?.onStateChange((state) => {
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.status = state === "failed" ? "failed" : "disconnected";
        // The connection disappears, and so does everything it granted.
        for (const capability of this.capabilities) {
          unregisterPeerSession(capability.id);
        }
        this.capabilities = [];
        this.onChanged?.();
      }
    });
  }

  private addCapability(capability: SharedCapability): void {
    if (!this.transport) return;
    if (this.capabilities.some((existing) => existing.id === capability.id)) return;

    const session = new PeerSession({
      connectionId: capability.id,
      transport: this.transport,
      capability,
    });
    this.peerSessions.set(capability.id, session);
    // Registering here is what makes the capability appear as an ordinary
    // connection the SQL editor can select.
    registerPeerSession(session);
    this.capabilities = [...this.capabilities, capability];
    this.onChanged?.();
  }

  /** The host widened a grant (new tables in "all data" mode). */
  private updateCapability(capability: SharedCapability): void {
    const session = this.peerSessions.get(capability.id);
    if (!session) {
      // An update for a grant we never saw is just a grant.
      this.addCapability(capability);
      return;
    }
    session.updateCapability(capability);
    this.capabilities = this.capabilities.map((existing) =>
      existing.id === capability.id ? capability : existing
    );
    this.onChanged?.();
  }

  private removeCapability(capabilityId: string): void {
    unregisterPeerSession(capabilityId);
    void this.peerSessions.get(capabilityId)?.close();
    this.peerSessions.delete(capabilityId);
    this.capabilities = this.capabilities.filter((c) => c.id !== capabilityId);
    this.onChanged?.();
  }

  /**
   * Who is in the session, from the guest's point of view.
   *
   * Built from the invite plus itself rather than waiting for a roster
   * message: both facts are already known, and a guest showing "waiting for
   * someone to join" while demonstrably connected is just wrong.
   */
  get people(): Participant[] {
    return [
      {
        peerId: this.invite.hostPeerId,
        displayName: this.invite.hostDisplayName,
        isHost: true,
        color: colorForPeer(this.invite.hostPeerId),
      },
      {
        peerId: this.peerId,
        displayName: this.displayName,
        isHost: false,
        color: colorForPeer(this.peerId),
      },
    ];
  }

  get hostName(): string {
    return this.invite.hostDisplayName;
  }

  get sessionName(): string {
    return this.invite.sessionName;
  }

  get supportedVersions(): readonly number[] {
    return SUPPORTED_PROTOCOL_VERSIONS;
  }

  async leave(): Promise<void> {
    this.status = "disconnected";
    this.presence?.close();
    this.document?.close();
    this.presence = null;
    this.document = null;
    for (const [id, session] of this.peerSessions) {
      unregisterPeerSession(id);
      await session.close();
    }
    this.peerSessions.clear();
    this.capabilities = [];
    await this.transport?.close();
    this.connection?.close();
    this.transport = null;
    this.connection = null;
  }
}

/** Tables the host can offer, read from its live session's catalog. */
export const shareableTables = async (session: DataSession): Promise<ShareSelection[]> => {
  if (!session.capabilities.supportsCatalog) return [];
  const snapshot = await session.introspect();
  const local = asLocalDuckSession(session);

  return snapshot.databases.flatMap((database) =>
    database.tables.map((table) => ({
      // An in-tab engine addresses its own tables plainly; anything else needs
      // the full path.
      qualifiedName: local
        ? `"${database.name}"."${table.schema}"."${table.name}"`
        : `"${table.schema}"."${table.name}"`,
      exposedName: table.name,
    }))
  );
};
