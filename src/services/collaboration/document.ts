/**
 * Shared workspace document.
 *
 * The collaboration plane, as distinct from the data plane. What lives here:
 *
 *   SQL editor contents          notebook cells        tab structure
 *   dashboard layout (later)     chart config          filters / parameters
 *
 * What deliberately does NOT (§9):
 *
 *   DuckDB databases     credentials     query results     private local state
 *
 * That split is the whole point. Workspace state is small, edited by several
 * people, and benefits from convergence. Query results are large, derived, and
 * belong to whoever ran the query — replicating them through a CRDT would turn
 * every scroll of a million-row table into network traffic and would quietly
 * make "your data stays in your browser" untrue.
 *
 * Yjs does the merging, but nothing outside this file imports it. The protocol
 * carries opaque `doc.update` payloads (§13), so replacing the CRDT later is a
 * change here rather than a protocol break.
 *
 * ## Host topology
 *
 * A document can be attached to several transports at once. Guests connect
 * only to the host (§12), so the host RELAYS: an update arriving from one guest
 * is applied locally and forwarded to every other guest. Without that relay,
 * two guests in the same session would each see the host's edits and never each
 * other's.
 */

import * as Y from "yjs";
import { diffStrings } from "@/lib/textDiff";
import type { PeerTransport } from "./transport/transport";

/** Identifier for the one document a session shares today. */
export const WORKSPACE_DOC_ID = "workspace";

/** A tab as it appears in shared state. Results are excluded by construction. */
export interface SharedTab {
  id: string;
  title: string;
  type: string;
}

/**
 * A notebook cell as it crosses the collaboration plane. Note what is absent:
 * `result`. Query results never enter shared state (§9) — each browser keeps
 * its own, and a peer re-runs cells against whatever data it can reach.
 */
export interface SyncableNotebookCell {
  id: string;
  type: string;
  content: string;
  collapsed?: boolean;
  /** Chart configuration as JSON, opaque to the CRDT. */
  chartConfig?: string;
}

export type DocumentChangeOrigin = "local" | "remote";

/**
 * The shared workspace, and the transports it syncs over.
 *
 * Created only when a session starts. With no session there is no document, no
 * observers and no traffic — collaboration has to be free when it is off (§10).
 */
export class WorkspaceDocument {
  readonly doc = new Y.Doc();

  private readonly transports = new Set<PeerTransport>();
  private readonly detachers = new Map<PeerTransport, () => void>();
  private closed = false;

  /** Tab order and metadata. */
  private readonly tabs = this.doc.getArray<Y.Map<unknown>>("tabs");
  /** Free-form session metadata (name, active tab). */
  private readonly meta = this.doc.getMap<unknown>("meta");
  /**
   * Shared dashboards, keyed by dashboard id. Each entry holds a Y.Text of
   * the SOURCE — the whole report is one string, so co-editing it costs
   * nothing beyond what SQL tabs already have.
   */
  private readonly sharedDashboards = this.doc.getMap<Y.Map<unknown>>("dashboards");
  /**
   * Notebook state, keyed by tab id, as a Y.Array of per-cell Y.Maps.
   *
   * Per-cell CRDT: cell STRUCTURE (add, remove, reorder) merges at the cell
   * level, and each cell's text is a Y.Text that merges character by
   * character. Two people editing different cells never conflict; two people
   * in the same cell merge like the SQL editor does. What never enters this
   * structure: query results — those belong to whoever ran the query (§9).
   */
  private readonly notebooks = this.doc.getMap<Y.Array<Y.Map<unknown>>>("notebook-cells");

  constructor(transports: PeerTransport[] = []) {
    // Local edits go to everyone currently attached.
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (this.closed) return;
      // An update applied FROM a transport is relayed by that transport's own
      // handler, which knows who to exclude. Broadcasting it here as well
      // would echo it back to its sender.
      if (origin !== null && origin !== undefined && origin !== "local") return;
      this.broadcast(update);
    };
    this.doc.on("update", onUpdate);

    for (const transport of transports) this.attach(transport);
  }

  /**
   * Syncs this document over one more transport.
   *
   * Returns a detach hook. Called once per guest on a host, and once in total
   * on a guest.
   */
  attach(transport: PeerTransport): () => void {
    if (this.closed || this.transports.has(transport)) return () => {};
    this.transports.add(transport);

    const off = transport.onMessage(({ message, payload }) => {
      if (this.closed) return;

      if (message.t === "doc.update" && message.docId === WORKSPACE_DOC_ID) {
        // Tagged with the sending transport so the relay below can skip it.
        Y.applyUpdate(this.doc, payload, transport);
        this.broadcast(payload, transport);
        return;
      }

      // A peer that just joined asks for what it is missing, and gets exactly
      // that — a diff against its state vector, not the whole history. Replied
      // to on the transport it arrived on, not to everyone.
      if (message.t === "doc.sync-request" && message.docId === WORKSPACE_DOC_ID) {
        const diff = Y.encodeStateAsUpdate(this.doc, payload);
        void transport
          .send("collaboration", { t: "doc.update", docId: WORKSPACE_DOC_ID }, diff)
          .catch(() => {});
      }
    });

    const detach = () => {
      off();
      this.transports.delete(transport);
      this.detachers.delete(transport);
    };
    this.detachers.set(transport, detach);
    return detach;
  }

  /** Stops syncing over one transport, e.g. when a guest leaves. */
  detach(transport: PeerTransport): void {
    this.detachers.get(transport)?.();
  }

  /** Sends an update to every attached transport except the excluded one. */
  private broadcast(update: Uint8Array, exclude?: PeerTransport): void {
    for (const transport of this.transports) {
      if (transport === exclude) continue;
      void transport
        .send("collaboration", { t: "doc.update", docId: WORKSPACE_DOC_ID }, update)
        .catch(() => {
          // That peer is gone; its own state change handles the cleanup.
        });
    }
  }

  /**
   * Asks peers for anything this document has not seen.
   *
   * Sends a state vector rather than requesting everything, so a guest joining
   * a long-running session receives a diff instead of the full history.
   */
  async requestSync(): Promise<void> {
    const vector = Y.encodeStateVector(this.doc);
    await Promise.all(
      [...this.transports].map((transport) =>
        transport
          .send("collaboration", { t: "doc.sync-request", docId: WORKSPACE_DOC_ID }, vector)
          .catch(() => {})
      )
    );
  }

  /** Seeds an empty document. Used by the host when a session opens. */
  seedTabs(tabs: SharedTab[]): void {
    if (this.tabs.length > 0) return;
    this.doc.transact(() => {
      for (const tab of tabs) this.tabs.push([this.buildTab(tab)]);
    }, "local");
  }

  private buildTab(tab: SharedTab): Y.Map<unknown> {
    const entry = new Y.Map<unknown>();
    entry.set("id", tab.id);
    entry.set("title", tab.title);
    entry.set("type", tab.type);
    // Content is a Y.Text, not a string: two people typing in the same editor
    // must merge character by character, not overwrite each other.
    entry.set("content", new Y.Text());
    return entry;
  }

  /** The shared text for one tab, or null when the tab is unknown. */
  textFor(tabId: string): Y.Text | null {
    for (const entry of this.tabs) {
      if (entry.get("id") === tabId) {
        const content = entry.get("content");
        return content instanceof Y.Text ? content : null;
      }
    }
    return null;
  }

  /** Adds a tab to shared state. A tab that already exists is left alone. */
  addTab(tab: SharedTab, initialContent = ""): void {
    if (this.tabs.toArray().some((entry) => entry.get("id") === tab.id)) return;
    this.doc.transact(() => {
      const entry = this.buildTab(tab);
      this.tabs.push([entry]);
      if (initialContent) (entry.get("content") as Y.Text).insert(0, initialContent);
    }, "local");
  }

  removeTab(tabId: string): void {
    const index = this.tabs.toArray().findIndex((entry) => entry.get("id") === tabId);
    if (index >= 0) this.doc.transact(() => this.tabs.delete(index, 1), "local");
  }

  renameTab(tabId: string, title: string): void {
    for (const entry of this.tabs) {
      if (entry.get("id") === tabId) {
        this.doc.transact(() => entry.set("title", title), "local");
        return;
      }
    }
  }

  /** Current shared tabs, flattened for the store to project. */
  listTabs(): (SharedTab & { content: string })[] {
    return this.tabs.toArray().map((entry) => ({
      id: String(entry.get("id") ?? ""),
      title: String(entry.get("title") ?? "Untitled"),
      type: String(entry.get("type") ?? "sql"),
      content: entry.get("content") instanceof Y.Text ? String(entry.get("content")) : "",
    }));
  }

  /** Registers a dashboard in the session. Existing content is left alone. */
  ensureDashboard(id: string, name: string, initialSource: string): void {
    const existing = this.sharedDashboards.get(id);
    if (existing) {
      if (existing.get("name") !== name) {
        this.doc.transact(() => existing.set("name", name), "local");
      }
      return;
    }
    this.doc.transact(() => {
      const entry = new Y.Map<unknown>();
      entry.set("id", id);
      entry.set("name", name);
      const content = new Y.Text();
      entry.set("content", content);
      if (initialSource) content.insert(0, initialSource);
      this.sharedDashboards.set(id, entry);
    }, "local");
  }

  /** The collaborative source text for a shared dashboard. */
  dashboardText(id: string): Y.Text | null {
    const entry = this.sharedDashboards.get(id);
    const content = entry?.get("content");
    return content instanceof Y.Text ? content : null;
  }

  /** Every dashboard shared into this session, flattened for projection. */
  listSharedDashboards(): { id: string; name: string; source: string }[] {
    const dashboards: { id: string; name: string; source: string }[] = [];
    for (const [id, entry] of this.sharedDashboards) {
      const content = entry.get("content");
      dashboards.push({
        id,
        name: String(entry.get("name") ?? "Shared dashboard"),
        source: content instanceof Y.Text ? content.toString() : "",
      });
    }
    return dashboards;
  }

  /**
   * Reconciles a notebook's shared state with the local cell list.
   *
   * Structure by id, text by diff: a cell already shared gets its fields
   * updated in place (content as a minimal Y.Text edit, so concurrent remote
   * keystrokes merge), a new cell is inserted at its position, a removed cell
   * is deleted, and a moved cell is recreated at its new index — moves are
   * discrete user actions, and recreating is the price of Yjs having no move.
   */
  syncNotebookCells(tabId: string, cells: SyncableNotebookCell[]): void {
    this.doc.transact(() => {
      let list = this.notebooks.get(tabId);
      if (!list) {
        list = new Y.Array<Y.Map<unknown>>();
        this.notebooks.set(tabId, list);
      }

      // Cells that no longer exist locally leave the shared list.
      const ids = new Set(cells.map((cell) => cell.id));
      for (let i = list.length - 1; i >= 0; i--) {
        if (!ids.has(String(list.get(i).get("id") ?? ""))) list.delete(i, 1);
      }

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const existing = i < list.length ? list.get(i) : null;
        if (existing && String(existing.get("id") ?? "") === cell.id) {
          this.updateCellEntry(existing, cell);
          continue;
        }

        // Present elsewhere means moved: recreate at the new index.
        for (let j = i + 1; j < list.length; j++) {
          if (String(list.get(j).get("id") ?? "") === cell.id) {
            list.delete(j, 1);
            break;
          }
        }
        list.insert(i, [this.buildCellEntry(cell)]);
      }

      while (list.length > cells.length) list.delete(list.length - 1, 1);
    }, "local");
  }

  private buildCellEntry(cell: SyncableNotebookCell): Y.Map<unknown> {
    const entry = new Y.Map<unknown>();
    entry.set("id", cell.id);
    entry.set("type", cell.type);
    if (cell.collapsed !== undefined) entry.set("collapsed", cell.collapsed);
    if (cell.chartConfig !== undefined) entry.set("chartConfig", cell.chartConfig);
    const content = new Y.Text();
    entry.set("content", content);
    if (cell.content) content.insert(0, cell.content);
    return entry;
  }

  private updateCellEntry(entry: Y.Map<unknown>, cell: SyncableNotebookCell): void {
    if (entry.get("type") !== cell.type) entry.set("type", cell.type);
    if ((entry.get("collapsed") ?? undefined) !== cell.collapsed) {
      if (cell.collapsed === undefined) entry.delete("collapsed");
      else entry.set("collapsed", cell.collapsed);
    }
    if ((entry.get("chartConfig") ?? undefined) !== cell.chartConfig) {
      if (cell.chartConfig === undefined) entry.delete("chartConfig");
      else entry.set("chartConfig", cell.chartConfig);
    }

    const content = entry.get("content");
    if (!(content instanceof Y.Text)) return;
    const diff = diffStrings(content.toString(), cell.content);
    if (!diff) return;
    if (diff.deleteLength > 0) content.delete(diff.start, diff.deleteLength);
    if (diff.insert) content.insert(diff.start, diff.insert);
  }

  /** Tab ids of every shared notebook. */
  listNotebookIds(): string[] {
    return [...this.notebooks.keys()];
  }

  /** The shared cells of one notebook, flattened for adoption. */
  notebookCells(tabId: string): SyncableNotebookCell[] | null {
    const list = this.notebooks.get(tabId);
    if (!list) return null;
    return list.toArray().map((entry) => {
      const content = entry.get("content");
      const collapsed = entry.get("collapsed");
      const chartConfig = entry.get("chartConfig");
      return {
        id: String(entry.get("id") ?? ""),
        type: String(entry.get("type") ?? "sql"),
        content: content instanceof Y.Text ? content.toString() : "",
        collapsed: collapsed === true ? true : undefined,
        chartConfig: typeof chartConfig === "string" ? chartConfig : undefined,
      };
    });
  }

  setMeta(key: string, value: unknown): void {
    this.doc.transact(() => this.meta.set(key, value), "local");
  }

  getMeta<T>(key: string): T | undefined {
    return this.meta.get(key) as T | undefined;
  }

  /**
   * Observes shared state.
   *
   * Fires for local and remote edits alike, with the origin, so a projection
   * can skip work it caused itself.
   */
  observe(handler: (origin: DocumentChangeOrigin) => void): () => void {
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      handler(origin === "local" || origin === null || origin === undefined ? "local" : "remote");
    };
    this.doc.on("update", onUpdate);
    return () => this.doc.off("update", onUpdate);
  }

  close(): void {
    this.closed = true;
    for (const detach of [...this.detachers.values()]) detach();
    this.detachers.clear();
    this.transports.clear();
    this.doc.destroy();
  }
}
