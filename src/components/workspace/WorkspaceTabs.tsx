// src/components/workspace/WorkspaceTabs.tsx
import { useMemo, useEffect } from "react";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus, XSquareIcon } from "lucide-react";
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
import HomeTab from "@/components/workspace/HomeTab";
import SqlTab from "@/components/workspace/SqlTab";
import SortableTab from "@/components/workspace/SortableTab";
import { useDuckStore } from "@/store";

export default function WorkspaceTabs() {
  const {
    tabs,
    activeTabId,
    createTab,
    setActiveTab,
    moveTab,
    closeAllTabs,
    initialize,
    isInitialized,
  } = useDuckStore();

  // Initialize DuckDB when component mounts
  useEffect(() => {
    if (!isInitialized) {
      initialize().catch(console.error);
    }
  }, [isInitialized, initialize]);

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
    const homeTab = tabs.find((tab) => tab.id === "home");
    const otherTabs = tabs.filter((tab) => tab.id !== "home");
    return homeTab ? [homeTab, ...otherTabs] : otherTabs;
  }, [tabs]);

  const addNewCodeTab = () => {
    createTab("sql", "");
  };

  return (
    <div className="flex flex-col h-full">
      <Tabs
        value={activeTabId || undefined}
        onValueChange={setActiveTab}
        className="flex flex-col h-full"
      >
        <div className="flex-shrink-0 flex items-center border-b">
          <Button
            variant="ghost"
            className="rounded-none hover:bg-gray-100 dark:hover:bg-gray-800 h-8 px-2 sticky left-0 z-10"
            onClick={addNewCodeTab}
          >
            <Plus className="h-4 w-4" />
          </Button>
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
                          <SortableTab
                            key={tab.id}
                            tab={tab}
                            isActive={activeTabId === tab.id}
                          />
                        ))}
                      </TabsList>
                    </div>
                  </SortableContext>
                </DndContext>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={addNewCodeTab}>
                  New Query Tab <Plus className="ml-4 h-4 w-4" />
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={closeAllTabs}
                  className="text-red-600"
                >
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
              {tab.type === "home" ? (
                <HomeTab />
              ) : tab.type === "sql" ? (
                <SqlTab tabId={tab.id} />
              ) : null}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
