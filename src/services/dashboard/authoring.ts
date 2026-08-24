/**
 * Authoring intelligence for the dashboard markdown editor.
 *
 * Everything here is pure text analysis — no Monaco imports — so the
 * completion logic is unit-testable and the editor wiring
 * (`components/dashboard/dashboardCompletions.ts`) stays a thin adapter.
 *
 * Three questions this module answers:
 *   1. WHERE is the cursor? (`authoringContext` — inside a tag, a data ref,
 *      an input variable, or plain markdown)
 *   2. WHAT exists in this document? (query names, input names)
 *   3. WHAT can be inserted? (component snippets with sensible tabstops)
 */

import { CHART_COMPONENTS, INPUT_COMPONENTS, parseDashboardSource } from "./markdown";
import type { DocumentBlock } from "./markdown";

//
// Cursor context
//

export type AuthoringContext =
  /** Inside `<Tag …` before its closing `>` — offer that tag's props. */
  | { kind: "component-props"; tag: string }
  /** Inside `data={…` or an `{…}` interpolation — offer query names. */
  | { kind: "query-ref" }
  /** Inside `${…` — offer `inputs.<name>.value` variables. */
  | { kind: "input-var" }
  /** Inside a ```sql fence — SQL territory, not ours. */
  | { kind: "sql" }
  /** Plain markdown — offer component and query scaffolds. */
  | { kind: "top" };

/**
 * Classifies the cursor position from everything before it.
 *
 * Order matters: `${` wins over `{`, and an unclosed tag wins over markdown.
 * All patterns anchor on the CURRENT line (component tags and refs do not
 * span lines in this dialect), except fences, which are counted document-wide.
 */
export const authoringContext = (before: string): AuthoringContext => {
  // An odd number of fence openers above the cursor means we are inside one.
  const fences = before.match(/^```/gm)?.length ?? 0;
  if (fences % 2 === 1) return { kind: "sql" };

  const line = before.slice(before.lastIndexOf("\n") + 1);

  if (/\$\{(?:inputs\.?)?[A-Za-z0-9_.]*$/.test(line)) return { kind: "input-var" };
  if (/data=\{[A-Za-z0-9_]*$/.test(line)) return { kind: "query-ref" };

  const tag = /<([A-Z][A-Za-z0-9]*)\s[^>]*$/.exec(line);
  if (tag) return { kind: "component-props", tag: tag[1] };

  if (/\{[A-Za-z0-9_]*$/.test(line)) return { kind: "query-ref" };
  return { kind: "top" };
};

//
// Document facts
//

/** Names of every ```sql fence declared in the document. */
export const queryNamesIn = (source: string): string[] =>
  parseDashboardSource(source).queries.map((query) => query.name);

export interface DeclaredInput {
  name: string;
  /** DateRange exposes `.start`/`.end` instead of `.value`. */
  isRange: boolean;
}

const collectInputs = (blocks: DocumentBlock[], found: DeclaredInput[]): void => {
  for (const block of blocks) {
    if (block.kind !== "component") continue;
    if (INPUT_COMPONENTS.has(block.tag)) {
      const name = block.props.name;
      const text =
        name?.kind === "literal" ? name.value : name?.kind === "reference" ? name.name : "";
      if (text) found.push({ name: text, isRange: block.tag === "DateRange" });
    }
    if (block.children) collectInputs(block.children, found);
  }
};

/** Every input declared with a `name=` in the document. */
export const inputNamesIn = (source: string): DeclaredInput[] => {
  const found: DeclaredInput[] = [];
  collectInputs(parseDashboardSource(source).blocks, found);
  return found;
};

//
// Snippets
//

export interface AuthoringSnippet {
  /** What the completion list shows. */
  label: string;
  /** Monaco snippet syntax (`${1:placeholder}` tabstops). */
  insertText: string;
  /** One-line description under the label. */
  detail: string;
  /** Sort bucket: scaffolds first, charts next, the rest after. */
  sort: string;
}

const chartDetail: Record<string, string> = {
  LineChart: "Line chart — trends over an x axis",
  TimeSeries: "Alias of LineChart (Grafana muscle memory)",
  Sparkline: "Compact line without axes",
  BarChart: "Vertical bars per category",
  Histogram: "Alias of BarChart for distributions",
  AreaChart: "Filled line chart",
  ScatterPlot: "Points on two numeric axes",
  BubbleChart: "Scatter with a size dimension",
  PieChart: "Part-to-whole, circular",
  DonutChart: "Pie with a hole",
  FunnelChart: "Stage-by-stage drop-off",
  BoxPlot: "Distribution summary per category",
  Heatmap: "Matrix of intensities",
};

/** Component and scaffold snippets offered in plain markdown. */
export const authoringSnippets = (): AuthoringSnippet[] => {
  const snippets: AuthoringSnippet[] = [
    {
      label: "sql",
      insertText: "```sql ${1:query_name}\n${2:SELECT 1 AS value}\n```\n",
      detail: "Named SQL query block — components bind to it by name",
      sort: "0",
    },
    {
      label: "frontmatter",
      insertText: "---\ntitle: ${1:Dashboard title}\n---\n",
      detail: "Document title (shown instead of the first heading)",
      sort: "0",
    },
    {
      label: "DataTable",
      insertText: "<DataTable data={${1:query_name}}/>",
      detail: "Full result table with sorting and filtering",
      sort: "1",
    },
    {
      label: "BigValue",
      insertText:
        "<BigValue data={${1:query_name}} column=${2:column} agg=${3|sum,avg,min,max,count,first|} title='${4:Title}'/>",
      detail: "Single headline number",
      sort: "1",
    },
    {
      label: "Value",
      insertText: "<Value data={${1:query_name}} value=${2:column}/>",
      detail: "Inline value inside a sentence",
      sort: "2",
    },
    {
      label: "Delta",
      insertText: "<Delta data={${1:query_name}} column=${2:column}/>",
      detail: "Change indicator with up/down coloring",
      sort: "2",
    },
    {
      label: "Grid",
      insertText: "<Grid cols=${1:2}>\n\t$0\n</Grid>",
      detail: "Side-by-side layout for the components inside",
      sort: "2",
    },
    {
      label: "Alert",
      insertText: "<Alert status=${1|info,warning,error,success|}>\n\t${2:Message}\n</Alert>",
      detail: "Callout box",
      sort: "2",
    },
    {
      label: "Details",
      insertText: "<Details title='${1:More}'>\n\t$0\n</Details>",
      detail: "Collapsible section",
      sort: "2",
    },
    {
      label: "LinkButton",
      insertText: "<LinkButton url='${1:https://…}' title='${2:Open}'/>",
      detail: "Button that opens a link",
      sort: "2",
    },
    {
      label: "DownloadData",
      insertText: "<DownloadData data={${1:query_name}} title='${2:Download CSV}'/>",
      detail: "CSV download of a query's result",
      sort: "2",
    },
    {
      label: "Dropdown",
      insertText: "<Dropdown name=${1:variable} options='${2:a,b,c}' title='${3:Pick one}'/>",
      detail: "Input variable: select. Read it in SQL as ${inputs.<name>.value}",
      sort: "1",
    },
    {
      label: "TextInput",
      insertText: "<TextInput name=${1:variable} defaultValue='${2:}' title='${3:Search}'/>",
      detail: "Input variable: free text",
      sort: "2",
    },
    {
      label: "DateInput",
      insertText: "<DateInput name=${1:variable}/>",
      detail: "Input variable: single date",
      sort: "2",
    },
    {
      label: "DatePicker",
      insertText: "<DatePicker name=${1:variable}/>",
      detail: "Alias of DateInput",
      sort: "2",
    },
    {
      label: "DateRange",
      insertText: "<DateRange name=${1:period}/>",
      detail: "Input variable: date range. Read as ${inputs.<name>.start} / .end",
      sort: "1",
    },
    {
      label: "Slider",
      insertText: "<Slider name=${1:variable} min=${2:0} max=${3:100} step=${4:1}/>",
      detail: "Input variable: numeric slider",
      sort: "2",
    },
    {
      label: "Checkbox",
      insertText: "<Checkbox name=${1:variable} title='${2:Enabled}'/>",
      detail: "Input variable: true/false",
      sort: "2",
    },
    {
      label: "ButtonGroup",
      insertText: "<ButtonGroup name=${1:variable} options='${2:a,b,c}'/>",
      detail: "Input variable: one-of buttons",
      sort: "2",
    },
  ];

  for (const chart of Object.keys(CHART_COMPONENTS)) {
    snippets.push({
      label: chart,
      insertText:
        chart === "PieChart" || chart === "DonutChart" || chart === "FunnelChart"
          ? `<${chart} data={\${1:query_name}} x=\${2:label_column} y=\${3:value_column}/>`
          : `<${chart} data={\${1:query_name}} x=\${2:x_column} y=\${3:y_column}/>`,
      detail: chartDetail[chart] ?? "Chart",
      sort: "1",
    });
  }
  return snippets;
};

//
// Props per component
//

const CHART_PROPS = ["data", "x", "y", "series", "title", "type"];

/** Props the renderer reads for each tag, offered inside an open tag. */
export const propsForComponent = (tag: string): string[] => {
  if (tag in CHART_COMPONENTS) return CHART_PROPS;
  if (INPUT_COMPONENTS.has(tag)) {
    if (tag === "Slider") return ["name", "min", "max", "step", "defaultValue", "title"];
    if (tag === "Dropdown" || tag === "ButtonGroup") {
      return ["name", "options", "data", "value", "label", "defaultValue", "title"];
    }
    return ["name", "defaultValue", "title"];
  }
  switch (tag) {
    case "DataTable":
      return ["data", "title"];
    case "BigValue":
      return ["data", "column", "agg", "fmt", "title"];
    case "Value":
      return ["data", "value", "agg", "fmt"];
    case "Delta":
      return ["data", "column", "agg", "fmt"];
    case "Grid":
      return ["cols"];
    case "Alert":
      return ["status"];
    case "Details":
      return ["title"];
    case "LinkButton":
      return ["url", "title"];
    case "DownloadData":
      return ["data", "title"];
    default:
      return [];
  }
};
