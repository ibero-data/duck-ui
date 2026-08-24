import { useEffect, useMemo, useState } from "react";
import { useDuckStore } from "@/store";
import { runQuery } from "@/services/engine";
import { decodeShare, readShareParam, queryReadsRemoteSource } from "@/lib/share";
import type { ChartConfig, QueryResult } from "@/store/types";
import DuckUiTable from "@/components/table/DuckUItable";
import ChartVisualizationPro from "@/components/charts/ChartVisualizationPro";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, BarChart3, Loader2, ExternalLink, DatabaseZap, AlertTriangle } from "lucide-react";
import Logo from "/logo.png";

type EmbedState =
  | { status: "loading" }
  | { status: "no-share" }
  | { status: "invalid" }
  | { status: "needs-data"; title: string }
  | { status: "error"; title: string; message: string }
  | { status: "ready"; title: string; sql: string; result: QueryResult; chartConfig?: ChartConfig };

/**
 * Chrome-free, auto-running viewer for a shared analysis. Rendered at /embed,
 * served by a cross-origin-isolated origin (demo.duckui.com) so DuckDB-WASM
 * works inside an <iframe> regardless of the host page's headers. No editor,
 * no sidebar, no profile — just the result, with a fork link back to Duck-UI.
 */
export default function EmbedView() {
  const currentSession = useDuckStore((s) => s.currentSession);
  const maxResultRows = useDuckStore((s) => s.maxResultRows);
  const isInitialized = useDuckStore((s) => s.isInitialized);
  const [state, setState] = useState<EmbedState>({ status: "loading" });
  const [liveChartConfig, setLiveChartConfig] = useState<ChartConfig | undefined>();

  // The full-app deep link that "Open in Duck-UI" points back to.
  const forkUrl = useMemo(() => {
    const param = readShareParam();
    return param ? `${window.location.origin}/#s=${param}` : window.location.origin;
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;

    (async () => {
      const param = readShareParam();
      if (!param) {
        setState({ status: "no-share" });
        return;
      }

      const payload = await decodeShare(param);
      if (!payload) {
        setState({ status: "invalid" });
        return;
      }

      const title = payload.title || "Shared analysis";

      // Phase 1 focuses on single-query embeds.
      const sql = payload.type === "sql" ? (payload.sql ?? "").trim() : "";
      if (!sql) {
        setState({ status: "needs-data", title });
        return;
      }

      try {
        if (!currentSession) throw new Error("No active connection");
        const result = await runQuery(currentSession, sql, "embed", { maxRows: maxResultRows });
        if (cancelled) return;

        if (result.error) {
          throw new Error(result.error);
        }
        setLiveChartConfig(payload.chartConfig);
        setState({ status: "ready", title, sql, result, chartConfig: payload.chartConfig });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Query failed";
        // A query with no remote source that fails on a missing table almost
        // certainly relied on locally-imported data the viewer doesn't have.
        const looksLikeMissingData =
          !queryReadsRemoteSource(sql) &&
          /catalog error|does not exist|not found|no such table|referenced table/i.test(message);
        setState(
          looksLikeMissingData
            ? { status: "needs-data", title }
            : { status: "error", title, message }
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isInitialized, currentSession, maxResultRows]);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground">
      <EmbedBody
        state={state}
        liveChartConfig={liveChartConfig}
        onConfigChange={setLiveChartConfig}
      />
      <EmbedFooter forkUrl={forkUrl} />
    </div>
  );
}

function EmbedBody({
  state,
  liveChartConfig,
  onConfigChange,
}: {
  state: EmbedState;
  liveChartConfig: ChartConfig | undefined;
  onConfigChange: (c: ChartConfig | undefined) => void;
}) {
  if (state.status === "loading") {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-3">Running analysis…</p>
      </Centered>
    );
  }

  if (state.status === "no-share" || state.status === "invalid") {
    return (
      <Centered>
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-3">
          {state.status === "no-share"
            ? "No analysis to display."
            : "This shared link is invalid or corrupted."}
        </p>
      </Centered>
    );
  }

  if (state.status === "needs-data") {
    return (
      <Centered>
        <DatabaseZap className="h-8 w-8 text-primary" />
        <p className="text-sm font-medium mt-3">This analysis needs data that isn't public</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
          The shared link carries the query, not the data. It reads from a table that was imported
          locally, so it can't reproduce here. Analyses that read from a URL (e.g.{" "}
          <code>read_parquet('https://…')</code>) embed fully.
        </p>
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <Centered>
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium mt-3">Query error</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md text-center font-mono">
          {state.message}
        </p>
      </Centered>
    );
  }

  // ready
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {state.title && (
        <div className="px-4 pt-3 pb-1 shrink-0">
          <h1 className="text-sm font-semibold truncate">{state.title}</h1>
        </div>
      )}
      <Tabs
        defaultValue={liveChartConfig ? "charts" : "table"}
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList className="mx-4 mt-1 self-start">
          <TabsTrigger value="table" className="flex items-center gap-2">
            <Table className="w-4 h-4" />
            Table
          </TabsTrigger>
          <TabsTrigger value="charts" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Chart
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="flex-1 min-h-0">
          <DuckUiTable data={state.result.data} />
        </TabsContent>
        <TabsContent value="charts" className="flex-1 min-h-0">
          <ChartVisualizationPro
            result={state.result}
            chartConfig={liveChartConfig}
            onConfigChange={onConfigChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmbedFooter({ forkUrl }: { forkUrl: string }) {
  return (
    <div className="shrink-0 flex items-center justify-between border-t px-3 py-1.5 bg-muted/40">
      <a
        href={forkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <img src={Logo} alt="" className="h-4 w-4" />
        Powered by Duck-UI
      </a>
      <a
        href={forkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        Open in Duck-UI
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6">{children}</div>
  );
}
