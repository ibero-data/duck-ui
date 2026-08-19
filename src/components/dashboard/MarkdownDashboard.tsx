import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/notebook/MarkdownRenderer";
import ChartVisualizationPro from "@/components/charts/ChartVisualizationPro";
import DuckUiTable from "@/components/table/DuckUItable";
import {
  CHART_COMPONENTS,
  INPUT_COMPONENTS,
  interpolate,
  type ComponentBlock,
  type ComponentPropValue,
  type DocumentBlock,
} from "@/services/dashboard/markdown";
import { pivotForSeries } from "@/services/dashboard/chartData";
import type { InputsStore, InputValue } from "@/services/dashboard/inputs";
import InputComponent from "./EvidenceInputs";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import type { DatasetResult } from "@/services/dashboard/queryRunner";
import { computeMetric, formatMetric } from "@/services/dashboard/metrics";
import type { ChartConfig, ChartType, QueryResult } from "@/store/types";
import type { MetricConfig } from "@/services/dashboard/types";

/**
 * Renders a parsed dashboard document.
 *
 * Markdown flows through the sanitizer the notebooks already use; component
 * tags become live React elements bound to query results by name. The failure
 * states are the design (§8): a query still running shows a spinner in place,
 * a failed one shows its error IN PLACE, and an unknown tag renders as its own
 * source text — a typo must never silently delete a chart.
 */

interface MarkdownDashboardProps {
  blocks: DocumentBlock[];
  results: ReadonlyMap<string, DatasetResult>;
  inputs?: InputsStore;
  inputValues?: ReadonlyMap<string, InputValue>;
}

const propText = (value: ComponentPropValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.kind === "literal") return value.value;
  if (value.kind === "number") return String(value.value);
  if (value.kind === "boolean") return value.value ? "true" : "false";
  return value.name;
};

/** The result a component's `data={name}` points at, in every state. */
const resolveData = (
  block: ComponentBlock,
  results: ReadonlyMap<string, DatasetResult>
): { state: "missing" | "loading" | "error" | "ready"; result?: QueryResult; error?: string } => {
  const data = block.props.data;
  if (!data || data.kind !== "reference") return { state: "missing" };
  const entry = results.get(data.name);
  if (!entry) return { state: "missing" };
  if (entry.status === "loading") return { state: "loading" };
  if (entry.status === "error") return { state: "error", error: entry.error };
  return { state: "ready", result: entry.result };
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="my-3 flex min-h-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
    {children}
  </div>
);

const ErrorBox = ({ message }: { message?: string }) => (
  <div className="my-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
    <span className="font-mono">{message ?? "Query failed"}</span>
  </div>
);

interface RenderContext {
  results: ReadonlyMap<string, DatasetResult>;
  inputs?: InputsStore;
  inputValues?: ReadonlyMap<string, InputValue>;
}

function ComponentRenderer({ block, context }: { block: ComponentBlock; context: RenderContext }) {
  const { results } = context;
  const chartType = CHART_COMPONENTS[block.tag] as ChartType | undefined;

  // Inputs render regardless of data state — a Dropdown may be waiting for
  // its options query, and it says so itself.
  if (INPUT_COMPONENTS.has(block.tag)) {
    if (!context.inputs || !context.inputValues) {
      return <Placeholder>Inputs are not available in this view</Placeholder>;
    }
    return (
      <InputComponent
        block={block}
        inputs={context.inputs}
        values={context.inputValues}
        results={results}
      />
    );
  }

  if (block.tag === "Alert") {
    const status = propText(block.props.status) ?? "info";
    const tone =
      status === "danger" || status === "error"
        ? "border-destructive/40 bg-destructive/10"
        : status === "warning"
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-sky-500/40 bg-sky-500/10";
    return (
      <div className={`my-3 rounded-md border p-3 text-sm ${tone}`}>
        {(block.children ?? []).map((child, index) => (
          <BlockRenderer key={index} block={child} context={context} />
        ))}
      </div>
    );
  }

  if (block.tag === "Details") {
    return (
      <details className="my-3 rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {propText(block.props.title) ?? "Details"}
        </summary>
        <div className="mt-2">
          {(block.children ?? []).map((child, index) => (
            <BlockRenderer key={index} block={child} context={context} />
          ))}
        </div>
      </details>
    );
  }

  if (block.tag === "LinkButton") {
    const href = propText(block.props.url) ?? propText(block.props.href) ?? "#";
    return (
      <Button asChild size="sm" variant="outline" className="my-2 gap-1.5">
        <a href={href} target="_blank" rel="noreferrer">
          {propText(block.props.title) ?? href}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    );
  }

  if (block.tag === "Grid") {
    const cols = block.props.cols?.kind === "number" ? block.props.cols.value : 2;
    return (
      <div
        className="my-3 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(6, cols))}, minmax(0, 1fr))` }}
      >
        {(block.children ?? []).map((child, index) => (
          <div key={index} className="min-w-0">
            <BlockRenderer block={child} context={context} />
          </div>
        ))}
      </div>
    );
  }

  const bound = resolveData(block, results);
  if (bound.state === "missing") {
    return (
      <Placeholder>
        {block.props.data
          ? `Unknown query "${propText(block.props.data)}" — declare it in a \`\`\`sql fence`
          : `<${block.tag}> needs data={query_name}`}
      </Placeholder>
    );
  }
  if (bound.state === "loading") {
    return (
      <Placeholder>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Placeholder>
    );
  }
  if (bound.state === "error") return <ErrorBox message={bound.error} />;
  const result = bound.result!;

  if (chartType) {
    const x = propText(block.props.x) ?? result.columns[0] ?? "";
    const y = propText(block.props.y);
    const seriesColumn = propText(block.props.series);

    // `series=col` pivots long data into one series per distinct value.
    const pivoted = seriesColumn && y ? pivotForSeries(result, x, y, seriesColumn) : null;
    const chartData = pivoted?.result ?? result;

    // `type=stacked|grouped` refines bar/area the way Evidence does.
    const variant = propText(block.props.type);
    const resolvedType: ChartType =
      chartType === "bar" && variant === "stacked"
        ? "stacked_bar"
        : chartType === "bar" && variant === "grouped"
          ? "grouped_bar"
          : chartType === "area" && (variant === "stacked" || pivoted)
            ? "stacked_area"
            : chartType === "bar" && pivoted
              ? "grouped_bar"
              : chartType;

    const config: ChartConfig = {
      type: resolvedType,
      xAxis: x,
      yAxis: pivoted ? undefined : y,
      series: pivoted
        ? pivoted.seriesColumns.map((column) => ({ column, label: column }))
        : undefined,
      title: propText(block.props.title),
      showGrid: block.tag !== "Sparkline",
      legend: { show: block.tag !== "Sparkline", position: "bottom" },
    };

    // A sparkline is a glance, not a figure.
    const height = block.tag === "Sparkline" ? "h-12" : "h-80";
    const frame = block.tag === "Sparkline" ? "" : "rounded-md border p-2";
    return (
      <div className={`my-3 ${height} ${frame}`}>
        <ChartVisualizationPro result={chartData} chartConfig={config} readOnly />
      </div>
    );
  }

  if (block.tag === "Delta") {
    const config: MetricConfig = {
      column: propText(block.props.column) ?? result.columns[0] ?? "",
      aggregation: (propText(block.props.agg) as MetricConfig["aggregation"]) ?? "first",
    };
    const value = computeMetric(result, config);
    const positive = (value ?? 0) >= 0;
    return (
      <span
        className={`font-medium tabular-nums ${positive ? "text-emerald-500" : "text-red-500"}`}
      >
        {positive ? "▲" : "▼"} {formatMetric(value === null ? null : Math.abs(value), config)}
      </span>
    );
  }

  if (block.tag === "DownloadData") {
    const dataName = block.props.data?.kind === "reference" ? block.props.data.name : "data";
    const download = () => {
      const header = result.columns.join(",");
      const rows = result.data.map((row) =>
        result.columns
          .map((column) => {
            const cell = row[column];
            const text = cell === null || cell === undefined ? "" : String(cell);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(",")
      );
      const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${dataName}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    };
    return (
      <Button size="sm" variant="outline" className="my-2 gap-1.5" onClick={download}>
        <Download className="h-3.5 w-3.5" />
        {propText(block.props.title) ?? "Download data"}
      </Button>
    );
  }

  if (block.tag === "DataTable") {
    return (
      <div className="my-3 max-h-96 overflow-auto rounded-md border">
        <DuckUiTable data={result.data} />
      </div>
    );
  }

  if (block.tag === "BigValue") {
    const config: MetricConfig = {
      column: propText(block.props.value) ?? result.columns[0] ?? "",
      aggregation: (propText(block.props.agg) as MetricConfig["aggregation"]) ?? "first",
      format: propText(block.props.fmt) as MetricConfig["format"],
    };
    return (
      <div className="my-2 inline-flex min-w-40 flex-col rounded-md border p-3">
        <span className="text-xs text-muted-foreground">
          {propText(block.props.title) ?? config.column}
        </span>
        <span className="text-2xl font-semibold tabular-nums">
          {formatMetric(computeMetric(result, config), config)}
        </span>
      </div>
    );
  }

  if (block.tag === "Value") {
    const config: MetricConfig = {
      column: propText(block.props.column) ?? result.columns[0] ?? "",
      aggregation: (propText(block.props.agg) as MetricConfig["aggregation"]) ?? "first",
    };
    return (
      <span className="font-medium tabular-nums">
        {formatMetric(computeMetric(result, config), config)}
      </span>
    );
  }

  // Unknown tag: show its source. Vanishing would hide the typo that caused it.
  return (
    <Placeholder>
      <code className="px-2">{block.raw}</code>
    </Placeholder>
  );
}

function BlockRenderer({ block, context }: { block: DocumentBlock; context: RenderContext }) {
  const { results } = context;
  const interpolated = useMemo(() => {
    if (block.kind !== "markdown") return "";
    return interpolate(block.text, (name, row, column) => {
      const entry = results.get(name);
      if (entry?.status !== "ready") return undefined;
      return entry.result?.data[row]?.[column];
    });
  }, [block, results]);

  if (block.kind === "markdown") {
    return (
      <MarkdownRenderer
        content={interpolated}
        className="prose prose-sm dark:prose-invert max-w-none"
      />
    );
  }
  return <ComponentRenderer block={block} context={context} />;
}

export default function MarkdownDashboard({
  blocks,
  results,
  inputs,
  inputValues,
}: MarkdownDashboardProps) {
  const context: RenderContext = { results, inputs, inputValues };
  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        An empty page. Switch to Edit and start writing.
      </div>
    );
  }

  // A readable measure, like a report — not edge-to-edge like an app screen.
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      {blocks.map((block, index) => (
        <BlockRenderer key={index} block={block} context={context} />
      ))}
    </div>
  );
}
