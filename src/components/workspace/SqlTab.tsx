// src/components/workspace/SqlTab.tsx
import React from "react";
import { useDuckStore } from "@/store";
import SqlEditor from "@/components/editor/SqlEditor";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DuckUiTable from "@/components/table/DuckUItable";
import ChartVisualizationPro from "@/components/charts/ChartVisualizationPro";
import DuckBrainPanel from "@/components/duck-brain/DuckBrainPanel";
import { FileX2, Table, BarChart3, AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "../ui/skeleton";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";

const TableErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="h-full flex items-center justify-center p-4">
    <div className="text-center max-w-md">
      <AlertTriangle className="mx-auto mb-4 text-destructive" size={32} />
      <h3 className="text-sm font-medium mb-2">Failed to render table</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {error.message || "An error occurred while displaying the results."}
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
  const { tabs, isExecuting, updateTabChartConfig, duckBrain } = useDuckStore();
  const currentTab = tabs.find((tab) => tab.id === tabId);
  const isPanelOpen = duckBrain.isPanelOpen;

  const renderResults = () => {
    if (!currentTab || currentTab.type !== "sql") {
      return null;
    }

    // Show skeleton loader while executing query

    if (isExecuting) {
      return (
        <div className="h-full p-4">
          {/* Table Skeleton */}
          <div className="space-y-4">
            {/* Skeleton Header */}
            <div className="flex space-x-4">
              {Array.from({ length: 15 }).map((_, index) => (
                <Skeleton key={`header-${index}`} className="h-4 w-32" />
              ))}
            </div>

            {/* Skeleton Rows */}
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
        <div className="m-4">
          <Alert variant="destructive">
            <AlertTitle>Query Error</AlertTitle>
            <AlertDescription>{currentTab.result.error}</AlertDescription>
          </Alert>
        </div>
      );
    }

    // Show results in tabs (Table and Charts)
    return (
      <Tabs defaultValue="table" className="h-full flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="table" className="flex items-center gap-2">
            <Table className="w-4 h-4" />
            Table
          </TabsTrigger>
          <TabsTrigger value="charts" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Charts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="flex-1 min-h-0">
          <div className="h-full">
            <ErrorBoundary FallbackComponent={TableErrorFallback}>
              <DuckUiTable data={currentTab.result.data} />
            </ErrorBoundary>
          </div>
        </TabsContent>
        <TabsContent value="charts" className="flex-1 min-h-0">
          <div className="h-full">
            <ChartVisualizationPro
              result={currentTab.result}
              chartConfig={currentTab.chartConfig}
              onConfigChange={(config) =>
                updateTabChartConfig(tabId, config)
              }
            />
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  if (!currentTab || currentTab.type !== "sql") {
    return null;
  }

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal">
        {/* Main Editor + Results Panel */}
        <ResizablePanel defaultSize={isPanelOpen ? 70 : 100} minSize={50}>
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

        {/* Duck Brain Panel */}
        {isPanelOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <DuckBrainPanel tabId={tabId} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
};

export default SqlTab;
