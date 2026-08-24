/**
 * Evidence-flavoured markdown for dashboards.
 *
 * A dashboard IS a markdown document (the Evidence model, MIT — adapted to run
 * on Duck-UI's engine layer instead of a build step). Queries are named SQL
 * fences, charts are component tags bound to those names:
 *
 *   # Sales overview
 *
 *   ```sql orders_by_month
 *   select month, sum(sales) as sales_usd from orders group by 1
 *   ```
 *
 *   <LineChart data={orders_by_month} x=month y=sales_usd title='Sales'/>
 *
 *   Last month: {orders_by_month[0].sales_usd}
 *
 * Why a document and not a drag-grid: a report reads top to bottom, versions
 * as text, diffs cleanly, travels through the collaborative workspace as one
 * string, and never needs a layout editor to look right. The first grid
 * attempt proved the opposite point.
 *
 * The parser is deliberately hand-rolled and total: any input produces a
 * render, never a throw. Unknown tags render as visible placeholders rather
 * than vanishing, because a typo that silently deletes a chart is the worst
 * failure mode a document editor can have.
 */

/** A named query declared in the document. */
export interface DashboardQuery {
  name: string;
  sql: string;
}

/** One prop on a component tag. */
export type ComponentPropValue =
  | { kind: "literal"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  /** `data={query_name}` — a reference to a named query's result. */
  | { kind: "reference"; name: string };

export interface ComponentBlock {
  kind: "component";
  tag: string;
  props: Record<string, ComponentPropValue>;
  /** Raw inner source for container tags (Grid). Parsed recursively. */
  children?: DocumentBlock[];
  /** The raw tag text, shown when the tag is not recognised. */
  raw: string;
}

export interface MarkdownBlock {
  kind: "markdown";
  text: string;
}

export type DocumentBlock = MarkdownBlock | ComponentBlock;

export interface ParsedDashboard {
  title: string | null;
  queries: DashboardQuery[];
  blocks: DocumentBlock[];
}

/**
 * Chart tags, mapped onto the chart types the app already renders.
 *
 * Evidence's names, plus aliases for what people type from instinct —
 * `TimeSeries` is Grafana muscle memory and should just work.
 */
export const CHART_COMPONENTS: Record<string, string> = {
  LineChart: "line",
  TimeSeries: "line",
  Sparkline: "line",
  BarChart: "bar",
  Histogram: "bar",
  AreaChart: "area",
  ScatterPlot: "scatter",
  BubbleChart: "bubble",
  PieChart: "pie",
  DonutChart: "donut",
  FunnelChart: "funnel",
  BoxPlot: "box",
  Heatmap: "heatmap",
};

/** Input tags — Grafana-style variables, Evidence syntax. */
export const INPUT_COMPONENTS = new Set([
  "Dropdown",
  "TextInput",
  "DateInput",
  "DatePicker",
  "DateRange",
  "Slider",
  "Checkbox",
  "ButtonGroup",
]);

/** Component tags the renderer knows. Matches Evidence's names. */
export const KNOWN_COMPONENTS = new Set([
  ...Object.keys(CHART_COMPONENTS),
  ...INPUT_COMPONENTS,
  "DataTable",
  "BigValue",
  "Value",
  "Delta",
  "Grid",
  "Alert",
  "Details",
  "LinkButton",
  "DownloadData",
]);

/** Tags that wrap children rather than self-closing. */
const CONTAINER_COMPONENTS = new Set(["Grid", "Details", "Alert"]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Query names must be valid identifiers; anything else is markdown, not SQL. */
export const isValidQueryName = (name: string): boolean => IDENTIFIER.test(name);

//
// Frontmatter
//

const parseFrontmatter = (source: string): { title: string | null; body: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { title: null, body: source };

  const titleLine = match[1]
    .split(/\r?\n/)
    .map((line) => /^title:\s*(.+)$/.exec(line.trim()))
    .find(Boolean);
  return {
    title: titleLine ? titleLine[1].trim().replace(/^['"]|['"]$/g, "") : null,
    body: source.slice(match[0].length),
  };
};

//
// SQL fences
//

interface FenceMatch {
  name: string;
  sql: string;
  start: number;
  end: number;
}

const findSqlFences = (body: string): FenceMatch[] => {
  const fences: FenceMatch[] = [];
  const pattern = /^```sql[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  for (const match of body.matchAll(pattern)) {
    fences.push({
      name: match[1],
      sql: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return fences;
};

//
// Component tags
//

/**
 * Parses the props inside a tag: `x=col y='label' n=3 flag data={q}`.
 *
 * Tolerant by design — a malformed prop is skipped, not fatal. The author is
 * mid-keystroke most of the time this runs.
 */
export const parseProps = (raw: string): Record<string, ComponentPropValue> => {
  const props: Record<string, ComponentPropValue> = {};
  const pattern =
    /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\{([^}]*)\}|'([^']*)'|"([^"]*)"|([^\s/>'"]+))|([A-Za-z_][A-Za-z0-9_]*)(?=[\s/>]|$)/g;

  for (const match of raw.matchAll(pattern)) {
    const [, name, ref, single, double, bare, flag] = match;
    if (flag) {
      props[flag] = { kind: "boolean", value: true };
      continue;
    }
    if (!name) continue;

    if (ref !== undefined) {
      const trimmed = ref.trim();
      props[name] = IDENTIFIER.test(trimmed)
        ? { kind: "reference", name: trimmed }
        : { kind: "literal", value: trimmed };
      continue;
    }
    const value = single ?? double ?? bare ?? "";
    const asNumber = Number(value);
    if (bare !== undefined && value !== "" && Number.isFinite(asNumber)) {
      props[name] = { kind: "number", value: asNumber };
    } else if (bare !== undefined && (value === "true" || value === "false")) {
      props[name] = { kind: "boolean", value: value === "true" };
    } else {
      props[name] = { kind: "literal", value };
    }
  }
  return props;
};

interface TagMatch {
  tag: string;
  props: Record<string, ComponentPropValue>;
  children?: string;
  raw: string;
  start: number;
  end: number;
}

/** Finds the next component tag at or after `from`. */
const findNextTag = (body: string, from: number): TagMatch | null => {
  const open = /<([A-Z][A-Za-z0-9]*)((?:[^>'"]|'[^']*'|"[^"]*")*?)(\/?)>/g;
  open.lastIndex = from;
  const match = open.exec(body);
  if (!match) return null;

  const [raw, tag, propText, selfClose] = match;
  const start = match.index;

  if (selfClose === "/" || !CONTAINER_COMPONENTS.has(tag)) {
    return { tag, props: parseProps(propText), raw, start, end: start + raw.length };
  }

  // Container: find its closing tag. An unclosed container swallows the rest
  // of the document as children, which renders SOMETHING rather than nothing.
  const closer = `</${tag}>`;
  const closeAt = body.indexOf(closer, start + raw.length);
  const childEnd = closeAt === -1 ? body.length : closeAt;
  return {
    tag,
    props: parseProps(propText),
    children: body.slice(start + raw.length, childEnd),
    raw: body.slice(start, closeAt === -1 ? body.length : closeAt + closer.length),
    start,
    end: closeAt === -1 ? body.length : closeAt + closer.length,
  };
};

//
// Document assembly
//

/**
 * Ranges of the body that are code — fenced blocks and inline spans.
 *
 * A tag inside a backtick span is documentation ABOUT a component, not a
 * component: \`<BarChart .../>\` in prose must render as code, and treating it
 * as live split the surrounding markdown and left orphan backticks behind.
 */
const codeRanges = (body: string): [number, number][] => {
  const ranges: [number, number][] = [];
  for (const match of body.matchAll(/```[\s\S]*?(?:```|$)/g)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  for (const match of body.matchAll(/`[^`\n]*`/g)) {
    const inFence = ranges.some(([start, end]) => match.index >= start && match.index < end);
    if (!inFence) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
};

const parseBlocks = (body: string): DocumentBlock[] => {
  const blocks: DocumentBlock[] = [];
  const protectedRanges = codeRanges(body);
  const inCode = (index: number) =>
    protectedRanges.some(([start, end]) => index >= start && index < end);
  let cursor = 0;

  const pushMarkdown = (text: string) => {
    if (text.trim().length > 0) blocks.push({ kind: "markdown", text });
  };

  while (cursor < body.length) {
    let tag = findNextTag(body, cursor);
    while (tag && inCode(tag.start)) {
      tag = findNextTag(body, tag.start + 1);
    }
    if (!tag) {
      pushMarkdown(body.slice(cursor));
      break;
    }
    pushMarkdown(body.slice(cursor, tag.start));
    blocks.push({
      kind: "component",
      tag: tag.tag,
      props: tag.props,
      children: tag.children !== undefined ? parseBlocks(tag.children) : undefined,
      raw: tag.raw,
    });
    cursor = tag.end;
  }
  return blocks;
};

/** Parses a dashboard source. Total: never throws, whatever the input. */
export const parseDashboardSource = (source: string): ParsedDashboard => {
  const { title, body } = parseFrontmatter(source ?? "");

  // Queries come out first; the fences are removed from the visible document.
  const fences = findSqlFences(body);
  const queries: DashboardQuery[] = [];
  const seen = new Set<string>();
  for (const fence of fences) {
    // A repeated name keeps the FIRST definition, matching how the reference
    // resolves; silently letting the last one win reorders meaning at a
    // distance.
    if (seen.has(fence.name)) continue;
    seen.add(fence.name);
    queries.push({ name: fence.name, sql: fence.sql });
  }

  let visible = "";
  let cursor = 0;
  for (const fence of fences) {
    visible += body.slice(cursor, fence.start);
    cursor = fence.end;
  }
  visible += body.slice(cursor);

  return { title, queries, blocks: parseBlocks(visible) };
};

//
// Text interpolation
//

/**
 * Replaces `{query_name[0].column}` in markdown text with values.
 *
 * Deliberately this one shape and nothing more — it is a lookup, not an
 * expression language, and there is no eval anywhere near a shared document.
 */
export const interpolate = (
  text: string,
  lookup: (name: string, row: number, column: string) => unknown
): string =>
  text.replace(
    /\{([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]\.([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (whole, name: string, row: string, column: string) => {
      const value = lookup(name, Number(row), column);
      if (value === undefined) return whole;
      if (value === null) return "null";
      if (typeof value === "number") return value.toLocaleString();
      if (typeof value === "bigint") return value.toLocaleString();
      return String(value);
    }
  );

//
// Authoring helpers
//

/** Turns a widget title into a unique, valid query name. */
export const toQueryName = (title: string, taken: Set<string>): string => {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "q$1") || "query";
  let name = base;
  let suffix = 2;
  while (taken.has(name)) name = `${base}_${suffix++}`;
  return name;
};

/** The starter document a new dashboard opens with. */
export const starterSource = (name: string): string => `# ${name}

Write markdown here. Add a query:

\`\`\`sql my_query
SELECT 'hello' AS greeting, 42 AS answer
\`\`\`

Then show it:

<DataTable data={my_query}/>

Charts bind the same way: \`<BarChart data={my_query} x=greeting y=answer/>\`
`;
