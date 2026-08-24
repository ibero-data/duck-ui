// src/components/workspace/SqlTab.tsx
import React, { useState } from "react";
import { useDuckStore } from "@/store";
import SqlEditor from "@/components/editor/SqlEditor";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DuckUiTable from "@/components/table/DuckUItable";
import ChartVisualizationPro from "@/components/charts/ChartVisualizationPro";
import {
  FileX2,
  Table,
  BarChart3,
  AlertTriangle,
  Sparkles,
  Loader2,
  Scissors,
  LayoutDashboard,
} from "lucide-react";
import AddToDashboardDialog from "@/components/dashboard/AddToDashboardDialog";
import { isNumericColumn } from "@/lib/chartDataTransform";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "../ui/skeleton";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { toast } from "sonner";

const TableErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="h-full flex items-center justify-center p-4">
    <div className="text-center max-w-md">
      <AlertTriangle className="mx-auto mb-4 text-destructive" size={32} />
      <h3 className="text-sm font-medium mb-2">Failed to render table</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {error instanceof Error ? error.message : "An error occurred while displaying the results."}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  </div>
);

interface SqlTabProps {
  tabId: string;
}

const SqlTab: React.FC<SqlTabProps> = ({ tabId }) => {
  const tabs = useDuckStore((s) => s.tabs);
  const isExecuting = useDuckStore((s) => !!s.executingTabs[tabId]);
  const progress = useDuckStore((s) => s.queryProgress[tabId]);
  const cancelQuery = useDuckStore((s) => s.cancelQuery);
  const updateTabChartConfig = useDuckStore((s) => s.updateTabChartConfig);
  const generateSQL = useDuckStore((s) => s.generateSQL);
  const updateTabQuery = useDuckStore((s) => s.updateTabQuery);
  const [isFixing, setIsFixing] = useState(false);
  const [addToDashboardOpen, setAddToDashboardOpen] = useState(false);
  const currentTab = tabs.find((tab) => tab.id === tabId);

  const handleFixWithBrain = async () => {
    if (!currentTab || typeof currentTab.content !== "string" || !currentTab.result?.error) return;
    setIsFixing(true);
    try {
      const { buildFixQueryRequest } = await import("@/lib/duckBrain");
      const fixed = await generateSQL(
        buildFixQueryRequest(currentTab.content, currentTab.result.error)
      );
      if (fixed) {
        updateTabQuery(tabId, fixed);
        toast.success("Duck Brain suggested a fix — review it and run again");
      }
    } finally {
      setIsFixing(false);
    }
  };

  const renderResults = () => {
    if (!currentTab || currentTab.type !== "sql") {
      return null;
    }

    // While the query runs, report what the engine has actually delivered so
    // far. The column headers arrive before the first row, so a long query
    // shows its real shape instead of a placeholder.
    if (isExecuting) {
      const headers = progress?.columns ?? [];
      return (
        <div className="h-full p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span aria-live="polite">
                {progress && progress.rows > 0
                  ? `${progress.rows.toLocaleString()} rows so far`
                  : "Running query…"}
              </span>
              {progress && progress.elapsedMs > 1000 && (
                <span className="tabular-nums">· {(progress.elapsedMs / 1000).toFixed(1)}s</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => cancelQuery(tabId)}>
              Stop
            </Button>
          </div>

          <div className="space-y-4">
            <div className="flex space-x-4">
              {headers.length > 0
                ? headers.slice(0, 15).map((name) => (
                    <div
                      key={name}
                      className="h-4 min-w-24 max-w-48 truncate text-xs font-medium text-muted-foreground"
                      title={name}
                    >
                      {name}
                    </div>
                  ))
                : Array.from({ length: 15 }).map((_, index) => (
                    <Skeleton key={`header-${index}`} className="h-4 w-32" />
                  ))}
            </div>

            <div className="space-y-2">
              {Array.from({ length: 22 }).map((_, rowIndex) => (
                <Skeleton key={`row-${rowIndex}`} className="flex space-x-4">
                  {Array.from({ length: 5 }).map((_, colIndex) => (
                    <div
                      key={`cell-${rowIndex}-${colIndex}`}
                      className="h-5 w-24 rounded-md animate-pulse"
                    />
                  ))}
                </Skeleton>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Show empty state if no query has been run
    if (!currentTab.result) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-col items-center">
            <FileX2 size={48} className="text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              There's no data yet! Run a query to get started.
            </p>
          </div>
        </div>
      );
    }

    // Show error if query failed
    if (currentTab.result.error) {
      return (
        <div className="m-4 space-y-3">
          <Alert variant="destructive">
            <AlertTitle>Query Error</AlertTitle>
            <AlertDescription>{currentTab.result.error}</AlertDescription>
          </Alert>
          <Button size="sm" variant="outline" onClick={handleFixWithBrain} disabled={isFixing}>
            {isFixing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {isFixing ? "Duck Brain is thinking…" : "Fix with Duck Brain"}
          </Button>
        </div>
      );
    }

    // Show results in tabs (Table and Charts)
    return (
      <Tabs defaultValue="table" className="h-full flex flex-col">
        {currentTab.result.truncated && (
          <div className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              Showing the first {currentTab.result.rowCount.toLocaleString()} rows. The query
              returns more — add a <code className="font-mono">LIMIT</code>, or raise the row limit
              in Settings. Parquet export still writes the complete result.
            </span>
          </div>
        )}
        <TabsContent value="table" className="flex-1 min-h-0 mt-0">
          <div className="h-full">
            <ErrorBoundary FallbackComponent={TableErrorFallback}>
              <DuckUiTable data={currentTab.result.data} />
            </ErrorBoundary>
          </div>
        </TabsContent>
        <TabsContent value="charts" className="flex-1 min-h-0 mt-0">
          <div className="h-full">
            <ChartVisualizationPro
              result={currentTab.result}
              chartConfig={currentTab.chartConfig}
              onConfigChange={(config) => updateTabChartConfig(tabId, config)}
            />
          </div>
        </TabsContent>

        {/* Sits at the bottom, beside the paging controls, rather than as a
            full-width band above the results. The results panel is the part
            worth giving space to. */}
        <TabsList className="h-8 shrink-0 justify-start gap-1 rounded-none border-t bg-transparent px-4 py-0">
          <TabsTrigger value="table" className="h-6 gap-1.5 px-2 text-xs">
            <Table className="h-3.5 w-3.5" />
            Table
          </TabsTrigger>
          <TabsTrigger value="charts" className="h-6 gap-1.5 px-2 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            Charts
          </TabsTrigger>

          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1.5 px-2 text-xs"
            onClick={() => setAddToDashboardOpen(true)}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Add to dashboard
          </Button>
        </TabsList>
      </Tabs>
    );
  };

  if (!currentTab || currentTab.type !== "sql") {
    return null;
  }

  const currentSql = typeof currentTab.content === "string" ? currentTab.content : "";

  return (
    <div className="h-full">
      <AddToDashboardDialog
        open={addToDashboardOpen}
        onOpenChange={setAddToDashboardOpen}
        sql={currentSql}
        title={currentTab.title}
        chartConfig={currentTab.chartConfig}
        columns={currentTab.result?.columns.map((name) => ({
          name,
          numeric: isNumericColumn(currentTab.result?.data ?? [], name),
        }))}
      />
      <ResizablePanelGroup direction="horizontal">
        {/* Main Editor + Results Panel */}
        <ResizablePanel defaultSize={100} minSize={50}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={50} minSize={25}>
              <SqlEditor tabId={tabId} title={currentTab.title} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              {renderResults()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default SqlTab;
