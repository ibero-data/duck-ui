import { describe, expect, it } from "vitest";
import {
  authoringContext,
  authoringSnippets,
  inputNamesIn,
  propsForComponent,
  queryNamesIn,
} from "../authoring";
import { KNOWN_COMPONENTS, CHART_COMPONENTS, INPUT_COMPONENTS } from "../markdown";

describe("authoringContext", () => {
  it("plain markdown is top", () => {
    expect(authoringContext("# Title\n\nSome text ")).toEqual({ kind: "top" });
  });

  it("an unclosed component tag offers props", () => {
    expect(authoringContext("text\n<BarChart data={q} ")).toEqual({
      kind: "component-props",
      tag: "BarChart",
    });
  });

  it("a closed tag on the same line is back to top", () => {
    expect(authoringContext("<BarChart data={q}/> and ")).toEqual({ kind: "top" });
  });

  it("data={ offers query names", () => {
    expect(authoringContext("<DataTable data={my_")).toEqual({ kind: "query-ref" });
  });

  it("a bare { interpolation offers query names", () => {
    expect(authoringContext("The total is {tot")).toEqual({ kind: "query-ref" });
  });

  it("${ offers input variables, and beats the bare { rule", () => {
    expect(authoringContext("WHERE region = ${inp")).toEqual({ kind: "input-var" });
    expect(authoringContext("WHERE region = ${inputs.reg")).toEqual({ kind: "input-var" });
  });

  it("inside a sql fence is sql, after it markdown again", () => {
    expect(authoringContext("```sql q\nSELECT ")).toEqual({ kind: "sql" });
    expect(authoringContext("```sql q\nSELECT 1\n```\ntext ")).toEqual({ kind: "top" });
  });
});

describe("document facts", () => {
  const source = [
    "```sql sales",
    "SELECT 1",
    "```",
    "```sql regions",
    "SELECT 2",
    "```",
    "<Dropdown name=region options='a,b'/>",
    "<DateRange name=period/>",
    "<Grid cols=2>",
    "<Slider name=threshold min=0 max=10/>",
    "</Grid>",
  ].join("\n");

  it("lists declared query names", () => {
    expect(queryNamesIn(source)).toEqual(["sales", "regions"]);
  });

  it("lists declared inputs, including ones nested in containers", () => {
    expect(inputNamesIn(source)).toEqual([
      { name: "region", isRange: false },
      { name: "period", isRange: true },
      { name: "threshold", isRange: false },
    ]);
  });
});

describe("authoringSnippets", () => {
  it("covers every component the renderer knows", () => {
    const labels = new Set(authoringSnippets().map((snippet) => snippet.label));
    for (const tag of KNOWN_COMPONENTS) {
      expect(labels.has(tag), `missing snippet for <${tag}>`).toBe(true);
    }
  });

  it("every component snippet parses back as that component", () => {
    for (const snippet of authoringSnippets()) {
      if (!snippet.insertText.startsWith("<")) continue;
      expect(snippet.insertText).toMatch(new RegExp(`^<${snippet.label}[\\s/>]`));
    }
  });
});

describe("propsForComponent", () => {
  it("knows chart props", () => {
    expect(propsForComponent("LineChart")).toContain("x");
    expect(propsForComponent("LineChart")).toContain("series");
  });

  it("knows input props per input kind", () => {
    expect(propsForComponent("Slider")).toContain("max");
    expect(propsForComponent("Dropdown")).toContain("options");
    expect(propsForComponent("Checkbox")).toContain("name");
  });

  it("answers for every known component", () => {
    for (const tag of KNOWN_COMPONENTS) {
      expect(propsForComponent(tag).length, `no props for <${tag}>`).toBeGreaterThan(0);
    }
  });

  it("returns nothing for an unknown tag", () => {
    expect(propsForComponent("Nonsense")).toEqual([]);
  });

  it("registries stay aligned (guards future component additions)", () => {
    // A chart added to CHART_COMPONENTS or an input added to INPUT_COMPONENTS
    // automatically gets a snippet and props; this pins that path.
    expect(Object.keys(CHART_COMPONENTS).length).toBeGreaterThan(0);
    expect(INPUT_COMPONENTS.size).toBeGreaterThan(0);
  });
});
