import { describe, it, expect, afterEach } from "vitest";
import { ChannelTransport } from "../transport/channelTransport";
import { createLoopbackPair } from "../transport/loopback";
import { WorkspaceDocument } from "../document";
import { PresenceChannel } from "../presence";

/**
 * Host topology (§12).
 *
 *        Host
 *       /    \
 *   Guest A  Guest B
 *
 * Guests never connect to each other, so the host RELAYS collaboration between
 * them. Without that relay each guest sees only the host's edits — which looks
 * like collaboration until a second person joins.
 */

const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

/** A host document with two guests attached, as the real session builds it. */
const buildStar = () => {
  const linkA = createLoopbackPair();
  const linkB = createLoopbackPair();

  const hostToA = new ChannelTransport({ peerId: "host", channels: linkA.a });
  const guestA = new ChannelTransport({ peerId: "a", channels: linkA.b });
  const hostToB = new ChannelTransport({ peerId: "host", channels: linkB.a });
  const guestB = new ChannelTransport({ peerId: "b", channels: linkB.b });

  for (const transport of [hostToA, guestA, hostToB, guestB]) transport.setState("connected");

  const host = new WorkspaceDocument([hostToA, hostToB]);
  const docA = new WorkspaceDocument([guestA]);
  const docB = new WorkspaceDocument([guestB]);

  cleanups.push(async () => {
    host.close();
    docA.close();
    docB.close();
    await Promise.all([hostToA.close(), guestA.close(), hostToB.close(), guestB.close()]);
  });

  return { host, docA, docB, hostToA, hostToB, guestA, guestB };
};

describe("workspace document — host relay", () => {
  it("carries the host's edits to every guest", async () => {
    const { host, docA, docB } = buildStar();

    host.addTab({ id: "t", title: "Shared", type: "sql" }, "SELECT 1");
    await settle();

    expect(docA.listTabs()[0]).toMatchObject({ id: "t", content: "SELECT 1" });
    expect(docB.listTabs()[0]).toMatchObject({ id: "t", content: "SELECT 1" });
  });

  it("carries one guest's edits to the OTHER guest, through the host", async () => {
    // The relay. Guest A and Guest B have no link between them.
    const { host, docA, docB } = buildStar();

    host.addTab({ id: "t", title: "Shared", type: "sql" });
    await settle();

    docA.textFor("t")?.insert(0, "-- from A\n");
    await settle();

    expect(host.textFor("t")?.toString()).toContain("-- from A");
    expect(docB.textFor("t")?.toString()).toContain("-- from A");
  });

  it("does not echo an update back to the guest that sent it", async () => {
    const { host, docA, guestA } = buildStar();
    host.addTab({ id: "t", title: "Shared", type: "sql" });
    await settle();

    const before = guestA.metrics().messagesReceived;
    docA.textFor("t")?.insert(0, "x");
    await settle();

    // One message for the relayed state from the host is expected; a doubled
    // count would mean the sender's own update came straight back.
    const received = guestA.metrics().messagesReceived - before;
    expect(received).toBeLessThanOrEqual(1);
  });

  it("converges when both guests type at once", async () => {
    const { host, docA, docB } = buildStar();
    host.addTab({ id: "t", title: "Shared", type: "sql" });
    await settle();

    docA.textFor("t")?.insert(0, "AAA");
    docB.textFor("t")?.insert(0, "BBB");
    await settle(40);

    const texts = [
      host.textFor("t")?.toString(),
      docA.textFor("t")?.toString(),
      docB.textFor("t")?.toString(),
    ];
    expect(texts[0]).toBe(texts[1]);
    expect(texts[1]).toBe(texts[2]);
    expect(texts[0]).toContain("AAA");
    expect(texts[0]).toContain("BBB");
  });

  it("gives a guest joining later everything already in the session", async () => {
    const linkA = createLoopbackPair();
    const hostToA = new ChannelTransport({ peerId: "host", channels: linkA.a });
    const guestA = new ChannelTransport({ peerId: "a", channels: linkA.b });
    hostToA.setState("connected");
    guestA.setState("connected");

    const host = new WorkspaceDocument([hostToA]);
    const docA = new WorkspaceDocument([guestA]);
    host.addTab({ id: "old", title: "Earlier", type: "sql" }, "SELECT * FROM sales");
    await settle();

    // Second guest arrives after the work already exists.
    const linkB = createLoopbackPair();
    const hostToB = new ChannelTransport({ peerId: "host", channels: linkB.a });
    const guestB = new ChannelTransport({ peerId: "b", channels: linkB.b });
    hostToB.setState("connected");
    guestB.setState("connected");

    host.attach(hostToB);
    const docB = new WorkspaceDocument([guestB]);
    await docB.requestSync();
    await settle();

    expect(docB.listTabs()[0]).toMatchObject({ id: "old", content: "SELECT * FROM sales" });

    cleanups.push(async () => {
      host.close();
      docA.close();
      docB.close();
      await Promise.all([hostToA.close(), guestA.close(), hostToB.close(), guestB.close()]);
    });
  });

  it("stops relaying to a guest that has been detached", async () => {
    const { host, docA, docB, hostToB } = buildStar();
    host.addTab({ id: "t", title: "Shared", type: "sql" });
    await settle();

    host.detach(hostToB);
    docA.textFor("t")?.insert(0, "after removal");
    await settle();

    expect(host.textFor("t")?.toString()).toContain("after removal");
    expect(docB.textFor("t")?.toString()).not.toContain("after removal");
  });
});

describe("presence — host relay", () => {
  it("shows each guest the other, not just the host", async () => {
    const { host, docA, docB, hostToA, hostToB, guestA, guestB } = buildStar();

    const hostPresence = new PresenceChannel(host.doc, [hostToA, hostToB], {
      peerId: "host",
      displayName: "Host",
      color: "#f59e0b",
    });
    const presenceA = new PresenceChannel(docA.doc, [guestA], {
      peerId: "a",
      displayName: "Ann",
      color: "#10b981",
    });
    const presenceB = new PresenceChannel(docB.doc, [guestB], {
      peerId: "b",
      displayName: "Ben",
      color: "#3b82f6",
    });

    presenceA.publish(
      {
        peerId: "a",
        displayName: "Ann",
        color: "#10b981",
        cursor: { tabId: "t", anchor: 1, head: 1 },
      },
      true
    );
    await settle(40);

    // Ben must see Ann, whose browser he has no connection to.
    const seenByBen = presenceB.peers().map((peer) => peer.displayName);
    expect(seenByBen).toContain("Ann");

    hostPresence.close();
    presenceA.close();
    presenceB.close();
  });
});

describe("shared dashboards — co-edited reports", () => {
  it("relays a dashboard's source between guests through the host", async () => {
    const { host, docA, docB } = buildStar();

    host.ensureDashboard("dash-1", "Q3 report", "# Q3\n");
    await settle();

    // Both guests see it, and an edit from one reaches the other.
    expect(docB.listSharedDashboards()).toEqual([
      { id: "dash-1", name: "Q3 report", source: "# Q3\n" },
    ]);

    docA.dashboardText("dash-1")?.insert(4, "\nEdited by A.");
    await settle();

    expect(docB.dashboardText("dash-1")?.toString()).toContain("Edited by A.");
    expect(host.dashboardText("dash-1")?.toString()).toContain("Edited by A.");
  });

  it("merges concurrent edits to the same report", async () => {
    const { host, docA, docB } = buildStar();
    host.ensureDashboard("d", "R", "middle");
    await settle();

    docA.dashboardText("d")?.insert(0, "start ");
    docB.dashboardText("d")?.insert(6, " end");
    await settle(40);

    const a = docA.dashboardText("d")?.toString();
    expect(a).toBe(docB.dashboardText("d")?.toString());
    expect(a).toContain("start");
    expect(a).toContain("end");
  });

  it("registering an existing dashboard never resets its content", async () => {
    const { host, docA } = buildStar();
    host.ensureDashboard("d", "R", "original");
    await settle();

    // A guest opening the same dashboard registers it again, with whatever
    // stale local copy it has. The session's content must win.
    docA.ensureDashboard("d", "R", "stale local copy");
    await settle();

    expect(host.dashboardText("d")?.toString()).toBe("original");
    expect(docA.dashboardText("d")?.toString()).toBe("original");
  });
});

describe("shared notebooks — per-cell CRDT", () => {
  it("relays notebook cells between guests", async () => {
    const { host, docA, docB } = buildStar();

    docA.syncNotebookCells("nb-1", [{ id: "c1", type: "sql", content: "select 1" }]);
    await settle();

    expect(docB.notebookCells("nb-1")).toEqual([
      { id: "c1", type: "sql", content: "select 1", collapsed: undefined, chartConfig: undefined },
    ]);
    expect(host.listNotebookIds()).toEqual(["nb-1"]);
  });

  it("merges concurrent edits to DIFFERENT cells — nobody loses work", async () => {
    const { host, docA, docB } = buildStar();
    host.syncNotebookCells("nb", [
      { id: "a", type: "sql", content: "select 1" },
      { id: "b", type: "sql", content: "select 2" },
    ]);
    await settle();

    // Two people, two cells, at the same time.
    docA.syncNotebookCells("nb", [
      { id: "a", type: "sql", content: "select 1 -- annotated by A" },
      { id: "b", type: "sql", content: "select 2" },
    ]);
    docB.syncNotebookCells("nb", [
      { id: "a", type: "sql", content: "select 1" },
      { id: "b", type: "sql", content: "select 2 -- annotated by B" },
    ]);
    await settle(40);

    const settled = host.notebookCells("nb");
    expect(settled?.find((c) => c.id === "a")?.content).toBe("select 1 -- annotated by A");
    expect(settled?.find((c) => c.id === "b")?.content).toBe("select 2 -- annotated by B");
    expect(docA.notebookCells("nb")).toEqual(docB.notebookCells("nb"));
  });

  it("merges concurrent edits to the SAME cell character by character", async () => {
    const { host, docA, docB } = buildStar();
    host.syncNotebookCells("nb", [{ id: "a", type: "sql", content: "select 1" }]);
    await settle();

    docA.syncNotebookCells("nb", [{ id: "a", type: "sql", content: "-- A\nselect 1" }]);
    docB.syncNotebookCells("nb", [{ id: "a", type: "sql", content: "select 1\n-- B" }]);
    await settle(40);

    const content = host.notebookCells("nb")?.[0]?.content;
    expect(content).toContain("-- A");
    expect(content).toContain("-- B");
    expect(content).toContain("select 1");
    expect(docA.notebookCells("nb")?.[0]?.content).toBe(docB.notebookCells("nb")?.[0]?.content);
  });

  it("adds, removes and reorders cells by id", async () => {
    const { host, docA } = buildStar();
    host.syncNotebookCells("nb", [
      { id: "a", type: "sql", content: "1" },
      { id: "b", type: "markdown", content: "2" },
      { id: "c", type: "sql", content: "3" },
    ]);
    await settle();

    // Guest removes b, moves c first, adds d.
    docA.syncNotebookCells("nb", [
      { id: "c", type: "sql", content: "3" },
      { id: "a", type: "sql", content: "1" },
      { id: "d", type: "markdown", content: "new" },
    ]);
    await settle();

    expect(host.notebookCells("nb")?.map((c) => c.id)).toEqual(["c", "a", "d"]);
  });

  it("a no-op sync sends nothing, so adoption cannot echo forever", async () => {
    const { host, hostToA } = buildStar();
    host.syncNotebookCells("nb", [{ id: "a", type: "sql", content: "select 1" }]);
    await settle();

    const before = hostToA.metrics().messagesSent;
    host.syncNotebookCells("nb", [{ id: "a", type: "sql", content: "select 1" }]);
    await settle();
    expect(hostToA.metrics().messagesSent).toBe(before);
  });

  it("carries cell view state but has no field for results", async () => {
    const { host, docA } = buildStar();
    host.syncNotebookCells("nb", [
      { id: "a", type: "sql", content: "select 1", collapsed: true, chartConfig: '{"type":"bar"}' },
    ]);
    await settle();

    const cell = docA.notebookCells("nb")?.[0];
    expect(cell?.collapsed).toBe(true);
    expect(cell?.chartConfig).toBe('{"type":"bar"}');
    // The projection type simply has nowhere to put a result — that absence
    // is the §9 enforcement, pinned here so a future field addition is loud.
    expect(Object.keys(cell ?? {}).sort()).toEqual([
      "chartConfig",
      "collapsed",
      "content",
      "id",
      "type",
    ]);
  });
});
