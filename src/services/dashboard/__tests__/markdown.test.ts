import { describe, it, expect } from "vitest";
import { interpolate, parseDashboardSource, parseProps, toQueryName } from "../markdown";

const EVIDENCE_PAGE = `---
title: Sales Analysis
---

# Top Categories

\`\`\`sql orders_by_month
select month, count(*) as n, sum(sales) as sales_usd
from orders group by 1
\`\`\`

Some prose between blocks.

<LineChart data={orders_by_month} x=month y=sales_usd title='Sales by Month, USD'/>

There were {orders_by_month[0].n} orders last month.
`;

describe("parseDashboardSource — the Evidence page shape", () => {
  it("extracts frontmatter title, named queries, and component tags", () => {
    const parsed = parseDashboardSource(EVIDENCE_PAGE);

    expect(parsed.title).toBe("Sales Analysis");
    expect(parsed.queries).toEqual([
      {
        name: "orders_by_month",
        sql: "select month, count(*) as n, sum(sales) as sales_usd\nfrom orders group by 1",
      },
    ]);

    const component = parsed.blocks.find((b) => b.kind === "component");
    expect(component).toMatchObject({
      tag: "LineChart",
      props: {
        data: { kind: "reference", name: "orders_by_month" },
        x: { kind: "literal", value: "month" },
        y: { kind: "literal", value: "sales_usd" },
        title: { kind: "literal", value: "Sales by Month, USD" },
      },
    });
  });

  it("removes SQL fences from the visible document", () => {
    const parsed = parseDashboardSource(EVIDENCE_PAGE);
    const markdown = parsed.blocks
      .filter((b) => b.kind === "markdown")
      .map((b) => b.text)
      .join("");
    expect(markdown).not.toContain("select month");
    expect(markdown).toContain("# Top Categories");
    expect(markdown).toContain("Some prose between blocks.");
  });

  it("keeps document order: markdown, component, markdown", () => {
    const kinds = parseDashboardSource(EVIDENCE_PAGE).blocks.map((b) => b.kind);
    expect(kinds).toEqual(["markdown", "component", "markdown"]);
  });

  it("leaves an unnamed sql fence alone — it is a code sample, not a query", () => {
    const parsed = parseDashboardSource("```sql\nselect 1\n```\n");
    expect(parsed.queries).toEqual([]);
    const markdown = parsed.blocks.map((b) => (b.kind === "markdown" ? b.text : "")).join("");
    expect(markdown).toContain("select 1");
  });

  it("keeps the FIRST definition when a query name repeats", () => {
    const parsed = parseDashboardSource("```sql q\nselect 1\n```\n\n```sql q\nselect 2\n```\n");
    expect(parsed.queries).toEqual([{ name: "q", sql: "select 1" }]);
  });

  it("never throws, whatever the input", () => {
    for (const input of [
      "",
      "<",
      "<Broken",
      "```sql q\nnever closed",
      "<Grid cols=2>",
      "{a[0].b}",
    ]) {
      expect(() => parseDashboardSource(input)).not.toThrow();
    }
  });
});

describe("component tags", () => {
  it("parses a Grid container with nested components", () => {
    const parsed = parseDashboardSource(
      `<Grid cols=2>\n<BigValue data={a} value=x/>\n<BigValue data={b} value=y/>\n</Grid>`
    );
    const grid = parsed.blocks[0];
    expect(grid).toMatchObject({ kind: "component", tag: "Grid" });
    if (grid.kind !== "component") throw new Error("unreachable");
    expect(grid.props.cols).toEqual({ kind: "number", value: 2 });
    const children = (grid.children ?? []).filter((b) => b.kind === "component");
    expect(children).toHaveLength(2);
  });

  it("treats an unclosed Grid as wrapping the rest of the document", () => {
    const parsed = parseDashboardSource(`<Grid cols=2>\n<Value data={a} column=x/>`);
    const grid = parsed.blocks[0];
    if (grid.kind !== "component") throw new Error("unreachable");
    expect((grid.children ?? []).some((b) => b.kind === "component")).toBe(true);
  });

  it("keeps the raw text of a tag, so unknown tags can render visibly", () => {
    const parsed = parseDashboardSource(`<Sparkline data={q} x=a/>`);
    const block = parsed.blocks[0];
    if (block.kind !== "component") throw new Error("unreachable");
    expect(block.raw).toBe("<Sparkline data={q} x=a/>");
  });

  it("does not mistake markdown links or comparisons for tags", () => {
    const parsed = parseDashboardSource("a < b and [link](https://x.dev) and 3 > 2");
    expect(parsed.blocks.every((b) => b.kind === "markdown")).toBe(true);
  });
});

describe("parseProps", () => {
  it("handles every value form", () => {
    expect(parseProps(`data={q} x=col y='two words' z="dq" n=3 on=true off=false flag`)).toEqual({
      data: { kind: "reference", name: "q" },
      x: { kind: "literal", value: "col" },
      y: { kind: "literal", value: "two words" },
      z: { kind: "literal", value: "dq" },
      n: { kind: "number", value: 3 },
      on: { kind: "boolean", value: true },
      off: { kind: "boolean", value: false },
      flag: { kind: "boolean", value: true },
    });
  });

  it("survives malformed props without throwing", () => {
    expect(() => parseProps("x= ={} '''")).not.toThrow();
  });
});

describe("interpolate", () => {
  const lookup = (name: string, row: number, column: string) =>
    name === "q" && row === 0 && column === "total" ? 1234.5 : undefined;

  it("replaces the supported shape with a formatted value", () => {
    expect(interpolate("Total: {q[0].total}.", lookup)).toBe("Total: 1,234.5.");
  });

  it("leaves unresolvable references visible rather than blanking them", () => {
    expect(interpolate("{missing[0].col}", lookup)).toBe("{missing[0].col}");
  });

  it("is a lookup, not an expression language", () => {
    // Anything beyond name[row].column must pass through untouched.
    expect(interpolate("{q[0].total + 1}", lookup)).toBe("{q[0].total + 1}");
    expect(interpolate("{alert(1)}", lookup)).toBe("{alert(1)}");
  });
});

describe("toQueryName", () => {
  it("slugifies a title into an identifier", () => {
    expect(toQueryName("Sales by Region!", new Set())).toBe("sales_by_region");
  });

  it("never starts with a digit and never collides", () => {
    expect(toQueryName("2024 totals", new Set())).toBe("q2024_totals");
    expect(toQueryName("Sales", new Set(["sales"]))).toBe("sales_2");
  });

  it("falls back for a title with nothing usable in it", () => {
    expect(toQueryName("!!!", new Set())).toBe("query");
  });
});

describe("tags inside code are examples, not components", () => {
  it("leaves a tag inside an inline code span as markdown", () => {
    // The starter document says: Charts bind the same way: `<BarChart .../>`.
    // Parsing that as a live component split the prose and orphaned backticks.
    const parsed = parseDashboardSource("Charts bind like `<BarChart data={q} x=a y=b/>` here.");
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].kind).toBe("markdown");
  });

  it("leaves a tag inside a plain code fence alone", () => {
    const parsed = parseDashboardSource("```\n<DataTable data={q}/>\n```\n");
    expect(parsed.blocks.every((block) => block.kind === "markdown")).toBe(true);
  });

  it("still parses a real tag next to a code example", () => {
    const parsed = parseDashboardSource(
      "Use `<Value data={q} column=x/>` inline.\n\n<DataTable data={q}/>\n"
    );
    const kinds = parsed.blocks.map((block) => block.kind);
    expect(kinds).toContain("component");
    const component = parsed.blocks.find((block) => block.kind === "component");
    expect(component).toMatchObject({ tag: "DataTable" });
  });
});
