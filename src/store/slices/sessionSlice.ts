import type { StateCreator } from "zustand";
import { toast } from "sonner";
import {
  GuestLiveSession,
  HostLiveSession,
  shareableTables,
  type Participant,
  type SessionStatus,
  type ShareSelection,
} from "@/services/collaboration/liveSession";
import { isWebRtcAvailable } from "@/services/collaboration/signaling/client";
import type { WorkspaceDocument } from "@/services/collaboration/document";
import type { PresenceChannel } from "@/services/collaboration/presence";
import type { SharedCapability } from "@/services/collaboration/capabilities/capability";
import {
  getSession,
  openSession,
  toConnectionDefinition,
  toCredentialMaterial,
  WASM_CONNECTION_ID,
} from "@/services/engine";
import { forkTables } from "@/services/collaboration/fork";
import {
  mergeSharedIntoLocal,
  projectionKey,
  toSyncableCells,
} from "@/services/collaboration/notebookSync";
import { saveDashboard } from "@/services/persistence/repositories/dashboardRepository";
import { createDashboard as createDashboardModel } from "@/services/dashboard/types";
import * as storeModule from "../index";
import type { ConnectionProvider, DuckStoreState, SessionSlice } from "../types";

/**
 * Live-session state.
 *
 * Deliberately a PROJECTION, not the session itself (§35). The classes in
 * `services/collaboration` own the transport, the runtime and the grants; this
 * slice holds only what a component renders. High-frequency traffic — batches,
 * presence ticks, cursor moves — never reaches Zustand, because pushing every frame
 * through a store subscription is how a collaborative UI ends up unusable.
 */

/** Live handles, kept outside the store: they are resources, not state. */
let hostSession: HostLiveSession | null = null;
let guestSession: GuestLiveSession | null = null;
let unwatchWorkspace: (() => void) | null = null;
let unwatchNotebookPush: (() => void) | null = null;
/** "All data" mode: stops watching the host catalog when the session ends. */
let unwatchHostCatalog: (() => void) | null = null;
let hostCatalogRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const adoptPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Raw notebook JSON last seen per tab — skips re-parsing untouched notebooks. */
const lastNotebookRaw = new Map<string, string>();
/** Shareable projection last synced per tab, to stop adopt→push echo loops. */
const lastNotebookProjection = new Map<string, string>();

/**
 * The store, imported statically but ACCESSED only at call time.
 *
 * `sessionSlice` and `store/index` are circular; ESM tolerates that as long
 * as nothing dereferences the import during module evaluation. Subscription
 * happens when a session starts, long after both modules exist. (Named to
 * stay clear of the React hooks lint rule — this is not a hook call.)
 */
const liveStore = () => storeModule.useDuckStore;

export const getHostSession = (): HostLiveSession | null => hostSession;
export const getGuestSession = (): GuestLiveSession | null => guestSession;

/**
 * The live collaboration objects, or null when no session is running.
 *
 * Components reach for this directly rather than through the store: a Y.Doc
 * and an awareness channel are live resources, and routing cursor traffic
 * through a Zustand subscription would re-render the app on every keystroke
 * anyone types (§35).
 */
export const getCollaboration = (): {
  document: WorkspaceDocument;
  presence: PresenceChannel;
} | null => {
  const session = hostSession ?? guestSession;
  if (!session?.document || !session.presence) return null;
  return { document: session.document, presence: session.presence };
};

export const createSessionSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  SessionSlice
> = (set, get) => ({
  session: {
    role: null,
    status: "idle",
    sessionName: "",
    hostName: "",
    inviteUrl: null,
    inviteCode: null,
    answerCode: null,
    participants: [],
    sharedCapabilities: [],
    isWebRtcSupported: isWebRtcAvailable(),
    error: null,
  },

  listShareableTables: async () => {
    const source = get().currentSession;
    if (!source) return [];
    try {
      return await shareableTables(source);
    } catch (error) {
      console.warn("[session] failed to list shareable tables:", error);
      return [];
    }
  },

  startLiveSession: async (options: {
    sessionName: string;
    shared: ShareSelection[];
    shareAll?: boolean;
    maxResultRows?: number;
  }) => {
    const source = get().currentSession;
    if (!source) {
      toast.error("Connect to a database before sharing");
      return;
    }
    if (!isWebRtcAvailable()) {
      toast.error("This browser can't make peer connections");
      return;
    }

    set((state) => ({
      session: { ...state.session, status: "connecting", error: null, role: "host" },
    }));

    try {
      const displayName = get().currentProfile?.name ?? "Host";
      const { session, inviteUrl, inviteCode } = await HostLiveSession.create({
        sessionName: options.sessionName,
        displayName,
        source,
        shared: options.shared,
        shareAll: options.shareAll,
        policy: options.maxResultRows ? { maxResultRows: options.maxResultRows } : undefined,
        // The session opens on what the host is already working on, rather
        // than on an empty workspace they then have to recreate.
        initialTabs: get()
          .tabs.filter((tab) => tab.type === "sql" || tab.type === "notebook")
          .map((tab) => ({ id: tab.id, title: tab.title, type: tab.type })),
      });

      hostSession = session;

      if (options.shareAll) {
        // Every schema refresh (imports, DDL, file drops) re-publishes
        // `databases`; that is the signal a new table may exist. Debounced,
        // and refreshSharedData itself is a no-op when nothing new appeared.
        let lastSeen = get().databases;
        unwatchHostCatalog = liveStore().subscribe((state) => {
          if (state.databases === lastSeen) return;
          lastSeen = state.databases;
          if (hostCatalogRefreshTimer) clearTimeout(hostCatalogRefreshTimer);
          hostCatalogRefreshTimer = setTimeout(() => {
            hostCatalogRefreshTimer = null;
            void hostSession?.refreshSharedData().catch((error) => {
              console.warn("[session] catalog refresh failed:", error);
            });
          }, 500);
        });
      }

      session.onUpdate(() => {
        set((state) => ({
          session: {
            ...state.session,
            status: session.status,
            participants: session.people,
            sharedCapabilities: session.grantedCapabilities,
          },
        }));
      });
      set((state) => ({
        session: {
          ...state.session,
          role: "host",
          status: "awaiting-guest",
          sessionName: options.sessionName,
          hostName: displayName,
          inviteUrl,
          inviteCode,
          participants: session.people,
          sharedCapabilities: session.grantedCapabilities,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't start the session";
      set((state) => ({ session: { ...state.session, status: "failed", error: message } }));
      toast.error(message);
    }
  },

  acceptGuestCode: async (code: string) => {
    if (!hostSession) return;
    set((state) => ({ session: { ...state.session, status: "connecting", error: null } }));
    try {
      await hostSession.acceptGuestCode(code);

      // The document exists only once connected, so the host's current SQL is
      // pushed in here rather than at create time.
      const collaboration = getCollaboration();
      if (collaboration) {
        for (const tab of get().tabs) {
          if (tab.type === "dashboard" && typeof tab.content === "string") {
            // Open dashboards join the session as co-editable documents.
            const dashboard = get().dashboards.find((entry) => entry.id === tab.content);
            if (dashboard) {
              collaboration.document.ensureDashboard(
                dashboard.id,
                dashboard.name,
                dashboard.source
              );
            }
            continue;
          }
          if (tab.type !== "sql" && tab.type !== "notebook") continue;
          const content = typeof tab.content === "string" ? tab.content : "";
          // A notebook's JSON never enters the tab's Y.Text — its cells sync
          // through the per-cell structure, where results cannot follow.
          const seed = tab.type === "notebook" ? "" : content;
          collaboration.document.addTab({ id: tab.id, title: tab.title, type: tab.type }, seed);
          const text = collaboration.document.textFor(tab.id);
          if (text && text.length === 0 && seed) text.insert(0, seed);
          if (tab.type === "notebook" && content) {
            const cells = toSyncableCells(content);
            if (cells) {
              collaboration.document.syncNotebookCells(tab.id, cells);
              lastNotebookRaw.set(tab.id, content);
              lastNotebookProjection.set(tab.id, projectionKey(cells));
            }
          }
        }
        get().watchSharedWorkspace();
      }

      set((state) => ({
        session: {
          ...state.session,
          status: "connected",
          participants: hostSession?.people ?? [],
          sharedCapabilities: hostSession?.grantedCapabilities ?? [],
        },
      }));
      toast.success("Connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't complete the connection";
      set((state) => ({ session: { ...state.session, status: "failed", error: message } }));
      toast.error(message);
    }
  },

  joinLiveSession: async (inviteCode: string) => {
    if (!isWebRtcAvailable()) {
      toast.error("This browser can't make peer connections");
      return;
    }

    set((state) => ({
      session: { ...state.session, status: "connecting", error: null, role: "guest" },
    }));

    try {
      const displayName = get().currentProfile?.name ?? "Guest";
      const { session, answerCode } = await GuestLiveSession.join(inviteCode, displayName);
      guestSession = session;

      // Status and grants both change AFTER the code is handed over: the
      // channels open when the host pastes it, and grants arrive after that.
      let lastStatus = session.status;
      session.onUpdate(() => {
        const capabilities = session.capabilities;
        // Say it once, when it happens — a dead session discovered only by a
        // failing query is the worst way to learn about it.
        if (
          lastStatus === "connected" &&
          (session.status === "disconnected" || session.status === "failed")
        ) {
          toast.error("The live session dropped. Your workspace stays as it is.");
        }
        lastStatus = session.status;
        set((state) => ({
          session: {
            ...state.session,
            status: session.status,
            participants: session.people,
            sharedCapabilities: capabilities,
            error: session.failure,
          },
        }));
        get().syncSessionConnections(capabilities);

        // A grant that grew ("all data" picked up a new table) must show up
        // in the explorer without the guest reconnecting. Introspection on a
        // peer session is a local catalog lookup, so this is cheap.
        if (capabilities.some((c) => c.id === get().currentConnection?.id)) {
          void get()
            .fetchDatabasesAndTablesInfo()
            .catch(() => {});
        }

        // Shared tabs arrive with the document, not with the grant.
        get().watchSharedWorkspace();

        // Select the first grant automatically. A guest joined this session to
        // see the shared data; leaving them on their own empty in-memory
        // database with the shared tables listed but unreachable is a dead end.
        const active = get().currentConnection;
        const alreadyOnSession = capabilities.some((c) => c.id === active?.id);
        if (capabilities.length > 0 && !alreadyOnSession) {
          void get().setCurrentConnection(capabilities[0].id);
        }
      });

      set((state) => ({
        session: {
          ...state.session,
          role: "guest",
          // "awaiting-host": the guest has its code and is waiting for the
          // other person to paste it. Not connected yet.
          status: session.status,
          sessionName: session.sessionName,
          hostName: session.hostName,
          answerCode,
          participants: session.people,
          sharedCapabilities: session.capabilities,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't join the session";
      set((state) => ({ session: { ...state.session, status: "failed", error: message } }));
      toast.error(message);
    }
  },

  /**
   * Mirrors granted capabilities into the connection list.
   *
   * They appear under "Session" and vanish the moment a grant is revoked or
   * the host leaves — never silently falling back to something else (§43).
   */
  syncSessionConnections: (capabilities: SharedCapability[]) => {
    const active = get().currentConnection;
    const wasOnRevokedSession =
      active?.environment === "SESSION" && !capabilities.some((c) => c.id === active.id);

    set((state) => {
      const withoutSession = state.connectionList.connections.filter(
        (connection) => connection.environment !== "SESSION"
      );
      const sessionConnections: ConnectionProvider[] = capabilities.map((capability) => ({
        environment: "SESSION",
        id: capability.id,
        name: capability.name,
        scope: "Peer",
      }));

      return {
        connectionList: { connections: [...withoutSession, ...sessionConnections] },
      };
    });

    // A revoked or ended grant must never stay selected and silently execute
    // against something else (§43). Fall back to this browser's own engine so
    // the app is still usable rather than left with no connection at all.
    if (wasOnRevokedSession) {
      void get().setCurrentConnection(WASM_CONNECTION_ID);
      toast.info("That shared connection is no longer available");
    }
  },

  /**
   * Reconciles the local tab list with the shared workspace.
   *
   * Shared tabs must carry the SAME ids on both sides, or the editor binding
   * has nothing to attach to and two people "collaborating" would each be
   * editing their own document. Local-only tabs (home, settings, connections)
   * are untouched — those belong to one browser.
   */
  projectSharedTabs: () => {
    const collaboration = getCollaboration();
    if (!collaboration) return;

    const shared = collaboration.document.listTabs();

    set((state) => {
      const sharedById = new Map(shared.map((tab) => [tab.id, tab]));

      // Update in place, never rebuild. An earlier version replaced the tab
      // list with "local-only tabs + shared tabs", which silently deleted any
      // SQL tab opened locally during a session before it had been registered
      // in the shared document — taking whatever was typed in it with it.
      const tabs = state.tabs.map((tab) => {
        const remote = sharedById.get(tab.id);
        if (!remote) return tab;
        // Notebook content lives in the per-cell CRDT, adopted separately —
        // the tab-level Y.Text only carries the title for those.
        if (tab.type === "notebook") {
          return remote.title === tab.title ? tab : { ...tab, title: remote.title };
        }
        const content = typeof tab.content === "string" ? tab.content : "";
        if (remote.title === tab.title && remote.content === content) return tab;
        return {
          ...tab,
          title: remote.title,
          content: remote.content,
          // Results are local and are never shared, so a projection must not
          // discard what this browser already ran.
        };
      });

      // Anything shared that this browser has not seen yet is appended.
      const known = new Set(tabs.map((tab) => tab.id));
      for (const remote of shared) {
        if (known.has(remote.id)) continue;
        const isNotebook = remote.type === "notebook";
        tabs.push({
          id: remote.id,
          title: remote.title,
          type: (isNotebook ? "notebook" : "sql") as "notebook" | "sql",
          // A shared notebook materializes empty here; its cells arrive from
          // the per-cell structure in the adoption pass that follows.
          content: isNotebook ? "[]" : remote.content,
        });
      }

      const activeStillExists = tabs.some((tab) => tab.id === state.activeTabId);
      return {
        tabs,
        activeTabId: activeStillExists ? state.activeTabId : (tabs[0]?.id ?? null),
      };
    });
  },

  /**
   * Mints another invite so one more person can join.
   *
   * An SDP offer belongs to one connection, so each guest needs its own. That
   * also means every invite is single-use — reusing one is refused rather than
   * silently connecting the wrong person.
   */
  inviteAnotherGuest: async () => {
    if (!hostSession) return;
    set((state) => ({ session: { ...state.session, error: null } }));
    try {
      const invite = await hostSession.createInvite();
      set((state) => ({
        session: { ...state.session, inviteUrl: invite.url, inviteCode: invite.code },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't create another invite";
      set((state) => ({ session: { ...state.session, error: message } }));
      toast.error(message);
    }
  },

  removeParticipant: async (peerId: string) => {
    if (!hostSession) return;
    await hostSession.dropGuest(peerId);
    toast.success("Removed from the session");
  },

  revokeCapability: async (capabilityId: string) => {
    if (!hostSession) return;
    await hostSession.revoke(capabilityId, "The host withdrew access");
    set((state) => ({
      session: {
        ...state.session,
        sharedCapabilities: hostSession?.grantedCapabilities ?? [],
      },
    }));
    toast.success("Access withdrawn");
  },

  /**
   * Adopts shared dashboards into the local store, so every participant sees
   * co-edited reports render live — not just whoever has the editor open.
   */
  adoptSharedDashboards: () => {
    const collaboration = getCollaboration();
    if (!collaboration) return;

    const shared = collaboration.document.listSharedDashboards();
    if (shared.length === 0) return;

    const profileId = get().currentProfileId;
    const local = new Map(get().dashboards.map((dashboard) => [dashboard.id, dashboard]));

    for (const entry of shared) {
      const existing = local.get(entry.id);
      if (!existing) {
        // First sight of a dashboard someone else shared: materialize it.
        const dashboard = {
          ...createDashboardModel(entry.name, entry.id, new Date().toISOString()),
          source: entry.source,
          execution: { mode: "local" as const, connectionId: "WASM" },
        };
        set((state) => ({ dashboards: [dashboard, ...state.dashboards] }));
        if (profileId) void saveDashboard(profileId, dashboard).catch(() => {});
        continue;
      }
      if (existing.source === entry.source && existing.name === entry.name) continue;

      // Remote edits land in state immediately; persistence is debounced so a
      // peer typing does not hammer IndexedDB per keystroke.
      const updated = { ...existing, source: entry.source, name: entry.name };
      set((state) => ({
        dashboards: state.dashboards.map((d) => (d.id === updated.id ? updated : d)),
      }));
      if (profileId) {
        clearTimeout(adoptPersistTimers.get(updated.id));
        adoptPersistTimers.set(
          updated.id,
          setTimeout(() => void saveDashboard(profileId, updated).catch(() => {}), 1_000)
        );
      }
    }
  },

  /**
   * Adopts shared notebook cells into local tabs.
   *
   * Per-cell: shared state decides structure and text, and each cell's local
   * results are re-attached by id — a peer editing a cell never wipes the
   * table this browser just produced under it.
   */
  adoptSharedNotebooks: () => {
    const collaboration = getCollaboration();
    if (!collaboration) return;

    for (const tabId of collaboration.document.listNotebookIds()) {
      const shared = collaboration.document.notebookCells(tabId);
      if (!shared) continue;
      const tab = get().tabs.find((entry) => entry.id === tabId && entry.type === "notebook");
      if (!tab || typeof tab.content !== "string") continue;

      const key = projectionKey(shared);
      if (lastNotebookProjection.get(tabId) === key) continue;
      const localCells = toSyncableCells(tab.content);
      if (localCells && projectionKey(localCells) === key) {
        lastNotebookProjection.set(tabId, key);
        continue;
      }

      const merged = mergeSharedIntoLocal(shared, tab.content);
      lastNotebookProjection.set(tabId, key);
      lastNotebookRaw.set(tabId, merged);
      set((state) => ({
        tabs: state.tabs.map((entry) =>
          entry.id === tabId ? { ...entry, content: merged } : entry
        ),
      }));
    }
  },

  /** Keeps the local tab list in step with the shared document. */
  watchSharedWorkspace: () => {
    const collaboration = getCollaboration();
    if (!collaboration || unwatchWorkspace) return;

    get().projectSharedTabs();
    get().adoptSharedDashboards();
    get().adoptSharedNotebooks();
    unwatchWorkspace = collaboration.document.observe(() => {
      get().projectSharedTabs();
      get().adoptSharedDashboards();
      get().adoptSharedNotebooks();
    });

    // Local notebook edits flow the other way, as per-cell updates. Raw JSON
    // is compared first so untouched notebooks cost a string compare, and the
    // projection second so a change that is ONLY a query result — which never
    // enters shared state — pushes nothing at all.
    unwatchNotebookPush = liveStore().subscribe((state) => {
      const active = getCollaboration();
      if (!active) return;
      for (const tab of state.tabs) {
        if (tab.type !== "notebook" || typeof tab.content !== "string") continue;
        if (lastNotebookRaw.get(tab.id) === tab.content) continue;
        lastNotebookRaw.set(tab.id, tab.content);
        const cells = toSyncableCells(tab.content);
        if (!cells) continue;
        const key = projectionKey(cells);
        if (lastNotebookProjection.get(tab.id) === key) continue;
        lastNotebookProjection.set(tab.id, key);
        active.document.syncNotebookCells(tab.id, cells);
      }
    });
  },

  /**
   * Fork: copy shared tables into this browser's own engine (§22).
   *
   * Runs through the capability's peer session, so the host's limits apply;
   * lands in the local WASM engine, so the copy outlives the session.
   */
  forkCapability: async (capabilityId, tables, onProgress, targetConnectionId) => {
    const source = getSession(capabilityId);
    if (!source) {
      toast.error("That shared connection is no longer available");
      return [];
    }

    // Default destination: this browser's in-memory engine. An OPFS
    // connection may be picked instead, so the copy survives closing the tab.
    let target = getSession(WASM_CONNECTION_ID);
    if (targetConnectionId && targetConnectionId !== WASM_CONNECTION_ID) {
      const provider = get().connectionList.connections.find(
        (connection) => connection.id === targetConnectionId
      );
      if (!provider) {
        toast.error("That destination connection no longer exists");
        return [];
      }
      try {
        target = await openSession(
          toConnectionDefinition(provider),
          toCredentialMaterial(provider)
        );
      } catch (error) {
        toast.error(
          `Couldn't open the destination: ${error instanceof Error ? error.message : "unknown error"}`
        );
        return [];
      }
    }
    if (!target) {
      toast.error("The local engine is not ready");
      return [];
    }

    const results = await forkTables({ source, target, tables, onProgress });

    // The copies live in the local engine — show them there.
    const failed = results.filter((entry) => entry.status === "error").length;
    if (failed === 0) {
      toast.success(
        results.length === 1
          ? "Forked. Your copy is independent of the host."
          : `Forked ${results.length} tables. Your copies are independent of the host.`
      );
    } else {
      toast.error(`${failed} of ${results.length} tables failed to fork`);
    }
    await get()
      .fetchDatabasesAndTablesInfo()
      .catch(() => {});
    return results;
  },

  endLiveSession: async () => {
    const role = get().session.role;
    try {
      if (role === "host") await hostSession?.end();
      if (role === "guest") await guestSession?.leave();
    } finally {
      unwatchWorkspace?.();
      unwatchWorkspace = null;
      unwatchNotebookPush?.();
      unwatchNotebookPush = null;
      unwatchHostCatalog?.();
      unwatchHostCatalog = null;
      if (hostCatalogRefreshTimer) clearTimeout(hostCatalogRefreshTimer);
      hostCatalogRefreshTimer = null;
      lastNotebookRaw.clear();
      lastNotebookProjection.clear();
      hostSession = null;
      guestSession = null;
      get().syncSessionConnections([]);
      set((state) => ({
        session: {
          ...state.session,
          role: null,
          status: "idle" as SessionStatus,
          sessionName: "",
          hostName: "",
          inviteUrl: null,
          inviteCode: null,
          answerCode: null,
          participants: [] as Participant[],
          sharedCapabilities: [],
          error: null,
        },
      }));
    }
  },
});
