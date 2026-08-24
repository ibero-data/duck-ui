import { describe, it, expect } from "vitest";
import {
  decodeDashboardShare,
  encodeDashboardShare,
  parseDashboardShareHash,
  subscribeToDashboardShares,
} from "../share";

const SOURCE = `# Report\n\n\`\`\`sql q\nselect 1 as n\n\`\`\`\n\n<DataTable data={q}/>\n`;

describe("dashboard share codec", () => {
  it("round-trips a viewer payload", async () => {
    const encoded = await encodeDashboardShare({ mode: "viewer", name: "Q3", source: SOURCE });
    expect(await decodeDashboardShare(encoded)).toEqual({
      v: 1,
      mode: "viewer",
      name: "Q3",
      source: SOURCE,
    });
  });

  it("round-trips an editor payload distinctly from a viewer one", async () => {
    const viewer = await encodeDashboardShare({ mode: "viewer", name: "Q3", source: SOURCE });
    const editor = await encodeDashboardShare({ mode: "editor", name: "Q3", source: SOURCE });
    expect(viewer).not.toBe(editor);
    expect((await decodeDashboardShare(editor))?.mode).toBe("editor");
  });

  it("is URL-safe with no padding", async () => {
    const encoded = await encodeDashboardShare({ mode: "viewer", name: "Q3", source: SOURCE });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null for garbage rather than throwing", async () => {
    expect(await decodeDashboardShare("not-a-share")).toBeNull();
    expect(await decodeDashboardShare("")).toBeNull();
  });

  it("rejects an unknown mode — a link cannot mint its own role", async () => {
    // Craft a payload with a bogus mode through the encoder's own plumbing.
    const encoded = await encodeDashboardShare({
      mode: "admin" as never,
      name: "Q3",
      source: SOURCE,
    });
    expect(await decodeDashboardShare(encoded)).toBeNull();
  });
});

describe("dashboard share URL watching", () => {
  it("reads the #dash fragment", () => {
    expect(parseDashboardShareHash("#dash=abc123")).toBe("abc123");
    expect(parseDashboardShareHash("#s=other")).toBeNull();
  });

  it("fires for a share pasted while already on the page", () => {
    const listeners = new Set<() => void>();
    const target = {
      location: { hash: "" },
      addEventListener: (type: string, handler: () => void) => {
        if (type === "hashchange") listeners.add(handler);
      },
      removeEventListener: (_type: string, handler: () => void) => {
        listeners.delete(handler);
      },
    };
    const seen: string[] = [];
    subscribeToDashboardShares((encoded) => seen.push(encoded), target as unknown as Window);

    target.location.hash = "#dash=late";
    for (const handler of [...listeners]) handler();
    expect(seen).toEqual(["late"]);
  });
});
