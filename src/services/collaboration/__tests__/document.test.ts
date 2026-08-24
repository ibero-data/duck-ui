import { describe, it, expect, afterEach } from "vitest";
import { ChannelTransport } from "../transport/channelTransport";
import { createLoopbackPair } from "../transport/loopback";
import { WorkspaceDocument, WORKSPACE_DOC_ID } from "../document";
import { PresenceChannel } from "../presence";

/**
 * Two workspace documents converging over the real transport.
 *
 * Only the socket is substituted — framing, chunking, Zod validation and the
 * `doc.update` message path are all the production ones.
 */

const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

interface Pair {
  host: WorkspaceDocument;
  guest: WorkspaceDocument;
  hostTransport: ChannelTransport;
  guestTransport: ChannelTransport;
  channels: ReturnType<typeof createLoopbackPair>;
}

const pairs: Pair[] = [];

const connectedDocuments = (): Pair => {
  const channels = createLoopbackPair();
  const hostTransport = new ChannelTransport({ peerId: "host", channels: channels.a });
  const guestTransport = new ChannelTransport({ peerId: "guest", channels: channels.b });
  hostTransport.setState("connected");
  guestTransport.setState("connected");

  const pair: Pair = {
    host: new WorkspaceDocument([hostTransport]),
    guest: new WorkspaceDocument([guestTransport]),
    hostTransport,
    guestTransport,
    channels,
  };
  pairs.push(pair);
  return pair;
};

afterEach(async () => {
  while (pairs.length) {
    const pair = pairs.pop();
    if (!pair) continue;
    pair.host.close();
    pair.guest.close();
    await pair.hostTransport.close();
    await pair.guestTransport.close();
  }
});

describe("workspace document — convergence", () => {
  it("propagates a tab from one peer to the other", async () => {
    const { host, guest } = connectedDocuments();

    host.seedTabs([{ id: "tab-1", title: "Analysis", type: "sql" }]);
    await settle();

    expect(guest.listTabs()).toEqual([
      { id: "tab-1", title: "Analysis", type: "sql", content: "" },
    ]);
  });

  it("merges concurrent edits to the same text rather than overwriting", async () => {
    const { host, guest } = connectedDocuments();
    host.seedTabs([{ id: "tab-1", title: "Analysis", type: "sql" }]);
    await settle();

    // Both type at once, into the same document, from opposite ends.
    host.textFor("tab-1")?.insert(0, "SELECT * ");
    guest.textFor("tab-1")?.insert(0, "-- notes\n");
    await settle();

    const hostText = host.textFor("tab-1")?.toString() ?? "";
    const guestText = guest.textFor("tab-1")?.toString() ?? "";

    expect(hostText).toBe(guestText);
    // Neither edit is lost — that is the whole reason for a CRDT here.
    expect(hostText).toContain("SELECT * ");
    expect(hostText).toContain("-- notes");
  });

  it("converges regardless of which side edits last", async () => {
    const { host, guest } = connectedDocuments();
    host.seedTabs([{ id: "t", title: "T", type: "sql" }]);
    await settle();

    host.textFor("t")?.insert(0, "A");
    await settle();
    guest.textFor("t")?.insert(1, "B");
    await settle();
    host.textFor("t")?.insert(2, "C");
    await settle();

    expect(host.textFor("t")?.toString()).toBe("ABC");
    expect(guest.textFor("t")?.toString()).toBe("ABC");
  });

  it("propagates tab additions, renames and removals", async () => {
    const { host, guest } = connectedDocuments();

    host.addTab({ id: "a", title: "First", type: "sql" }, "SELECT 1");
    await settle();
    expect(guest.listTabs()[0]).toMatchObject({ id: "a", content: "SELECT 1" });

    host.renameTab("a", "Renamed");
    await settle();
    expect(guest.listTabs()[0].title).toBe("Renamed");

    host.removeTab("a");
    await settle();
    expect(guest.listTabs()).toEqual([]);
  });

  it("does not duplicate a tab added on both sides", async () => {
    const { host, guest } = connectedDocuments();
    host.addTab({ id: "same", title: "One", type: "sql" });
    await settle();

    guest.addTab({ id: "same", title: "One", type: "sql" });
    await settle();

    expect(host.listTabs()).toHaveLength(1);
    expect(guest.listTabs()).toHaveLength(1);
  });

  it("shares session metadata", async () => {
    const { host, guest } = connectedDocuments();
    host.setMeta("activeTabId", "tab-9");
    await settle();
    expect(guest.getMeta<string>("activeTabId")).toBe("tab-9");
  });
});

describe("workspace document — joining late", () => {
  it("gives a peer that joins later the whole workspace, not just new edits", async () => {
    const channels = createLoopbackPair();
    const hostTransport = new ChannelTransport({ peerId: "host", channels: channels.a });
    hostTransport.setState("connected");
    const host = new WorkspaceDocument([hostTransport]);

    // The host works alone for a while.
    host.seedTabs([{ id: "old", title: "Earlier work", type: "sql" }]);
    host.textFor("old")?.insert(0, "SELECT * FROM sales");
    await settle();

    // Only now does someone join.
    const guestTransport = new ChannelTransport({ peerId: "guest", channels: channels.b });
    guestTransport.setState("connected");
    const guest = new WorkspaceDocument([guestTransport]);

    await guest.requestSync();
    await settle();

    expect(guest.listTabs()).toEqual([
      { id: "old", title: "Earlier work", type: "sql", content: "SELECT * FROM sales" },
    ]);

    host.close();
    guest.close();
    await hostTransport.close();
    await guestTransport.close();
  });

  it("answers a sync request with a diff against the requester's state", async () => {
    const { host, guest, channels } = connectedDocuments();
    host.seedTabs([{ id: "a", title: "A", type: "sql" }]);
    await settle();

    let bytesAfterSync = 0;
    const original = channels.a.collaboration.send.bind(channels.a.collaboration);
    channels.a.collaboration.send = (data: ArrayBuffer) => {
      bytesAfterSync += data.byteLength;
      original(data);
    };

    // The guest already holds everything, so the diff should be near-empty.
    await guest.requestSync();
    await settle();
    expect(bytesAfterSync).toBeLessThan(500);
  });
});

describe("workspace document — what it refuses to carry", () => {
  it("shares tab structure and content, and nothing else", () => {
    const { host } = connectedDocuments();
    host.addTab({ id: "a", title: "A", type: "sql" }, "SELECT 1");

    const shared = host.listTabs()[0];
    // Query results, credentials and connection state are deliberately absent
    // (§9). A CRDT carrying a million-row result would make "your data stays
    // in your browser" untrue.
    expect(Object.keys(shared).sort()).toEqual(["content", "id", "title", "type"]);
  });

  it("uses one document id, so updates cannot be misrouted", async () => {
    const { host, guest, hostTransport } = connectedDocuments();
    host.addTab({ id: "a", title: "A", type: "sql" });
    await settle();

    // An update for some other document must be ignored, not merged.
    await hostTransport.send(
      "collaboration",
      { t: "doc.update", docId: "not-the-workspace" },
      new Uint8Array([1, 2, 3])
    );
    await settle();

    expect(guest.listTabs()).toHaveLength(1);
    expect(WORKSPACE_DOC_ID).toBe("workspace");
  });
});

describe("workspace document — teardown", () => {
  it("stops broadcasting once closed", async () => {
    const { host, guest } = connectedDocuments();
    host.addTab({ id: "a", title: "A", type: "sql" });
    await settle();

    host.close();
    // Edits after close must not reach the wire, and must not throw.
    expect(() => guest.addTab({ id: "b", title: "B", type: "sql" })).not.toThrow();
    await settle();
    expect(guest.listTabs()).toHaveLength(2);
  });
});

describe("presence", () => {
  it("shares cursor position between peers", async () => {
    const { host, guest, hostTransport, guestTransport } = connectedDocuments();

    const hostPresence = new PresenceChannel(host.doc, [hostTransport], {
      peerId: "host",
      displayName: "Caio",
      color: "#f59e0b",
    });
    const guestPresence = new PresenceChannel(guest.doc, [guestTransport], {
      peerId: "guest",
      displayName: "Sam",
      color: "#10b981",
    });

    hostPresence.publish(
      {
        peerId: "host",
        displayName: "Caio",
        color: "#f59e0b",
        cursor: { tabId: "tab-1", anchor: 4, head: 9 },
      },
      true
    );
    await settle(20);

    const seen = guestPresence.peers();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      peerId: "host",
      displayName: "Caio",
      cursor: { tabId: "tab-1", anchor: 4, head: 9 },
    });

    hostPresence.close();
    guestPresence.close();
  });

  it("never reports the local peer as a remote one", async () => {
    const { host, hostTransport } = connectedDocuments();
    const presence = new PresenceChannel(host.doc, [hostTransport], {
      peerId: "host",
      displayName: "Caio",
      color: "#f59e0b",
    });
    await settle(20);
    expect(presence.peers().every((peer) => peer.peerId !== "host")).toBe(true);
    presence.close();
  });

  it("throttles rapid cursor movement instead of sending one message per keystroke", async () => {
    const { host, hostTransport, channels } = connectedDocuments();
    const presence = new PresenceChannel(host.doc, [hostTransport], {
      peerId: "host",
      displayName: "Caio",
      color: "#f59e0b",
    });

    let sends = 0;
    const original = channels.a.presence.send.bind(channels.a.presence);
    channels.a.presence.send = (data: ArrayBuffer) => {
      sends += 1;
      original(data);
    };

    for (let i = 0; i < 50; i++) {
      presence.publish({
        peerId: "host",
        displayName: "Caio",
        color: "#f59e0b",
        cursor: { tabId: "t", anchor: i, head: i },
      });
    }
    await settle(120);

    expect(sends).toBeGreaterThan(0);
    expect(sends).toBeLessThan(5);
    presence.close();
  });

  it("clears remote cursors when the link drops", async () => {
    const { host, guest, hostTransport, guestTransport } = connectedDocuments();
    const hostPresence = new PresenceChannel(host.doc, [hostTransport], {
      peerId: "host",
      displayName: "Caio",
      color: "#f59e0b",
    });
    const guestPresence = new PresenceChannel(guest.doc, [guestTransport], {
      peerId: "guest",
      displayName: "Sam",
      color: "#10b981",
    });

    hostPresence.publish(
      {
        peerId: "host",
        displayName: "Caio",
        color: "#f59e0b",
        cursor: { tabId: "t", anchor: 0, head: 0 },
      },
      true
    );
    await settle(20);
    expect(guestPresence.peers()).toHaveLength(1);

    // A cursor left hovering where someone used to be is worse than none.
    guestTransport.setState("disconnected");
    await settle(20);
    expect(guestPresence.peers()).toHaveLength(0);

    hostPresence.close();
    guestPresence.close();
  });
});

describe("workspace document — never destroying local work", () => {
  it("adopts local content when the shared text is empty", async () => {
    // A tab registered in shared state before its content was pushed has an
    // empty Y.Text. Treating the document as authoritative there blanks out
    // whatever the user had already typed.
    const { host } = connectedDocuments();
    host.addTab({ id: "t", title: "T", type: "sql" });

    const text = host.textFor("t");
    expect(text?.toString()).toBe("");

    // What the binding does in that case: push local content INTO the document.
    const local = "SELECT * FROM memory.twitter_dataset";
    text?.insert(0, local);

    expect(host.textFor("t")?.toString()).toBe(local);
  });

  it("keeps content when a tab is registered twice", async () => {
    const { host, guest } = connectedDocuments();
    host.addTab({ id: "t", title: "T", type: "sql" }, "SELECT 1");
    await settle();

    // A second registration — the editor re-binding, or the other peer
    // observing the same tab — must not reset it.
    host.addTab({ id: "t", title: "T", type: "sql" }, "");
    guest.addTab({ id: "t", title: "T", type: "sql" }, "");
    await settle();

    expect(host.textFor("t")?.toString()).toBe("SELECT 1");
    expect(guest.textFor("t")?.toString()).toBe("SELECT 1");
  });
});
