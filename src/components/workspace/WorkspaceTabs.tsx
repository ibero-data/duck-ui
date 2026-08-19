// src/components/workspace/WorkspaceTabs.tsx
import { useMemo, useEffect, lazy, Suspense } from "react";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus, XSquareIcon, Loader2, Terminal, BookOpen } from "lucide-react";
import { useQueryFromURL } from "@/hooks/useQueryFromURL";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SortableTab from "@/components/workspace/SortableTab";
import { useDuckStore } from "@/store";
import { isGatedTabHidden } from "@/lib/appConfig";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { AlertTriangle, RefreshCw } from "lucide-react";

const TabErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="h-full flex items-center justify-center p-4">
    <div className="text-center max-w-md">
      <AlertTriangle className="mx-auto mb-4 text-destructive" size={32} />
      <h3 className="text-sm font-medium mb-2">This tab encountered an error</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {error instanceof Error ? error.message : "An unexpected error occurred."}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="inline-flex items-center gap-2 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  </div>
);

const HomeTab = lazy(() => import("@/components/workspace/HomeTab"));
const SqlTab = lazy(() => import("@/components/workspace/SqlTab"));
const NotebookTab = lazy(() => import("@/components/notebook/NotebookTab"));
const DashboardTab = lazy(() => import("@/components/dashboard/DashboardTab"));
const ConnectionsTab = lazy(() => import("@/components/workspace/ConnectionsTab"));
const SettingsTab = lazy(() => import("@/components/workspace/SettingsTab"));

const TabFallback = () => (
  <div className="h-full flex items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function WorkspaceTabs() {
  const tabs = useDuckStore((s) => s.tabs);
  const activeTabId = useDuckStore((s) => s.activeTabId);
  const createTab = useDuckStore((s) => s.createTab);
  const setActiveTab = useDuckStore((s) => s.setActiveTab);
  const moveTab = useDuckStore((s) => s.moveTab);
  const closeAllTabs = useDuckStore((s) => s.closeAllTabs);
  const initialize = useDuckStore((s) => s.initialize);
  const isInitialized = useDuckStore((s) => s.isInitialized);

  // Initialize DuckDB when component mounts
  useEffect(() => {
    if (!isInitialized) {
      initialize().catch(console.error);
    }
  }, [isInitialized, initialize]);

  // Handle loading query from URL parameters
  useQueryFromURL();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && active.id !== "home" && over?.id !== "home") {
      const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
      const newIndex = tabs.findIndex((tab) => tab.id === over?.id);
      moveTab(oldIndex, newIndex);
    }
  };

  const sortedTabs = useMemo(() => {
    // Backstop: a persisted or URL-restored tab of a gated type must never
    // render in kiosk mode, even though createTab already refuses new ones.
    const visibleTabs = tabs.filter((tab) => !isGatedTabHidden(tab.type));
    const homeTab = visibleTabs.find((tab) => tab.id === "home");
    const otherTabs = visibleTabs.filter((tab) => tab.id !== "home");
    return homeTab ? [homeTab, ...otherTabs] : otherTabs;
  }, [tabs]);

  const addNewCodeTab = () => {
    createTab("sql", "");
  };

  const addNewNotebookTab = () => {
    createTab("notebook");
  };

  return (
    <div className="flex flex-col h-full">
      <Tabs
        value={activeTabId || undefined}
        onValueChange={setActiveTab}
        className="flex flex-col h-full"
      >
        <div className="flex-shrink-0 flex items-center border-b bg-muted">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none hover:bg-accent h-9 px-3 gap-2"
                aria-label="New tab"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={addNewCodeTab}>
                <Terminal className="h-4 w-4 mr-2" />
                SQL Tab
              </DropdownMenuItem>
              <DropdownMenuItem onClick={addNewNotebookTab}>
                <BookOpen className="h-4 w-4 mr-2" />
                Notebook
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ScrollArea className="flex-grow">
            <ContextMenu>
              <ContextMenuTrigger>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortedTabs.map((tab) => tab.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex">
                      <TabsList className="inline-flex h-9 space-x-1 items-center justify-start rounded-none w-full bg-transparent">
                        {sortedTabs.map((tab) => (
                          <SortableTab key={tab.id} tab={tab} isActive={activeTabId === tab.id} />
                        ))}
                      </TabsList>
                    </div>
                  </SortableContext>
                </DndContext>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={addNewCodeTab}>
                  <Terminal className="h-4 w-4 mr-2" />
                  New SQL Tab
                </ContextMenuItem>
                <ContextMenuItem onClick={addNewNotebookTab}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  New Notebook
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={closeAllTabs} className="text-red-600">
                  Close All Tabs <XSquareIcon className="ml-4 h-4 w-4" />
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        <div className="flex-1 overflow-hidden">
          {sortedTabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="h-full m-0 outline-none data-[state=active]:flex-1"
            >
              <ErrorBoundary FallbackComponent={TabErrorFallback}>
                <Suspense fallback={<TabFallback />}>
                  {tab.type === "home" ? (
                    <HomeTab />
                  ) : tab.type === "sql" ? (
                    <SqlTab tabId={tab.id} />
                  ) : tab.type === "notebook" ? (
                    <NotebookTab tabId={tab.id} />
                  ) : tab.type === "dashboard" ? (
                    <DashboardTab tabId={tab.id} />
                  ) : tab.type === "connections" ? (
                    <ConnectionsTab />
                  ) : tab.type === "settings" ? (
                    <SettingsTab />
                  ) : null}
                </Suspense>
              </ErrorBoundary>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
