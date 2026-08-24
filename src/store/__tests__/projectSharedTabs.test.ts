import { describe, it, expect } from "vitest";

/**
 * Tab projection, isolated from the store.
 *
 * The reconciliation below mirrors `sessionSlice.projectSharedTabs`. Worth
 * pinning on its own because getting it wrong deletes tabs someone is actively
 * typing into — which is what the first version did.
 */

interface LocalTab {
  id: string;
  title: string;
  type: string;
  content: string | { database?: string; table?: string };
  result?: { rowCount: number };
}

interface SharedTab {
  id: string;
  title: string;
  type: string;
  content: string;
}

const project = (
  tabs: LocalTab[],
  shared: SharedTab[],
  activeTabId: string | null
): { tabs: LocalTab[]; activeTabId: string | null } => {
  const sharedById = new Map(shared.map((tab) => [tab.id, tab]));

  const next = tabs.map((tab) => {
    const remote = sharedById.get(tab.id);
    if (!remote) return tab;
    const content = typeof tab.content === "string" ? tab.content : "";
    if (remote.title === tab.title && remote.content === content) return tab;
    return { ...tab, title: remote.title, content: remote.content };
  });

  const known = new Set(next.map((tab) => tab.id));
  for (const remote of shared) {
    if (known.has(remote.id)) continue;
    next.push({ id: remote.id, title: remote.title, type: remote.type, content: remote.content });
  }

  const stillThere = next.some((tab) => tab.id === activeTabId);
  return { tabs: next, activeTabId: stillThere ? activeTabId : (next[0]?.id ?? null) };
};

const localTab = (id: string, content = "", type = "sql"): LocalTab => ({
  id,
  title: id,
  type,
  content,
});

describe("shared tab projection", () => {
  it("never deletes a local tab that is not shared yet", () => {
    // The regression: a SQL tab opened during a session, before the editor had
    // registered it in the shared document, was dropped on the next update —
    // taking whatever had been typed into it.
    const local = [localTab("home", "", "home"), localTab("fresh", "SELECT * FROM t")];
    const { tabs } = project(local, [], "fresh");

    expect(tabs.map((t) => t.id)).toEqual(["home", "fresh"]);
    expect(tabs[1].content).toBe("SELECT * FROM t");
  });

  it("keeps the active tab active when nothing about it changed", () => {
    const { activeTabId } = project([localTab("a"), localTab("b")], [], "b");
    expect(activeTabId).toBe("b");
  });

  it("adopts content for a tab both sides know about", () => {
    const { tabs } = project(
      [localTab("a", "old")],
      [{ id: "a", title: "Renamed", type: "sql", content: "new" }],
      "a"
    );
    expect(tabs[0]).toMatchObject({ title: "Renamed", content: "new" });
  });

  it("appends a tab the other peer opened", () => {
    const { tabs } = project(
      [localTab("a")],
      [{ id: "b", title: "Theirs", type: "sql", content: "SELECT 2" }],
      "a"
    );
    expect(tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("preserves query results, which are local and never shared", () => {
    const withResult: LocalTab = { ...localTab("a", "old"), result: { rowCount: 42 } };
    const { tabs } = project(
      [withResult],
      [{ id: "a", title: "a", type: "sql", content: "new" }],
      "a"
    );
    expect(tabs[0].result).toEqual({ rowCount: 42 });
    expect(tabs[0].content).toBe("new");
  });

  it("leaves untouched tabs identical, so React does not re-render them", () => {
    const stable = localTab("a", "same");
    const { tabs } = project(
      [stable],
      [{ id: "a", title: "a", type: "sql", content: "same" }],
      "a"
    );
    expect(tabs[0]).toBe(stable);
  });

  it("leaves non-editor tabs alone", () => {
    const { tabs } = project(
      [localTab("home", "", "home"), localTab("settings", "", "settings")],
      [{ id: "x", title: "X", type: "sql", content: "" }],
      "home"
    );
    expect(tabs.map((t) => t.id)).toEqual(["home", "settings", "x"]);
  });
});
