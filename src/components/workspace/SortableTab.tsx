import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { TabsTrigger } from "@/components/ui/tabs";
import { X, Home, Terminal, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDuckStore } from "@/store";

interface Tab {
  id: string;
  title: string;
  type: "sql" | "home";
  content: string | { database?: string; table?: string };
}

interface SortableTabProps {
  tab: Tab;
  isActive: boolean;
}

function SortableTab({ tab, isActive }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    disabled: tab.id === "home",
  });

  const { isExecuting, closeTab } = useDuckStore();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: tab.type === "home" ? "100px" : "150px",
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1 && tab.id !== "home") {
      e.preventDefault();
      closeTab(tab.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" && tab.id !== "home") {
      closeTab(tab.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center group relative",
        isDragging ? "opacity-50" : "",
        isActive ? "z-10" : "z-0"
      )}
      onAuxClick={handleMiddleClick}
      onKeyDown={handleKeyDown}
    >
      {tab.type === "sql" && (
        <div
          className="absolute left-0 top-0 h-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing z-50"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 mt-2 ml-1 text-secondary" />
        </div>
      )}
      <TabsTrigger
        disabled={isExecuting}
        value={tab.id}
        className={cn(
          "flex h-8 items-center rounded-sm px-3 relative w-full",
          "data-[state=active]:bg-primary data-[state=active]:text-black",
          "transition-colors duration-200",
          "hover:bg-primary/40",
          tab.id === "home" ? "cursor-default" : "cursor-pointer",
          tab.type === "sql" ? "pl-7" : "pl-3", // Add padding for drag handle
          isExecuting ? "pointer-events-none opacity-50" : ""
        )}
      >
        <div className="flex items-center space-x-2 overflow-hidden w-full">
          <div className="flex-shrink-0">
            {tab.type === "home" ? (
              <Home className="h-4 w-4" />
            ) : tab.type === "sql" ? (
              <Terminal className="h-4 w-4" />
            ) : null}
          </div>
          <span className="truncate text-xs">{tab.title}</span>
          {tab.type === "sql" && (
            <div className="ml-auto flex items-center space-x-1 text-xs text-gray-500">
              <span
                className="cursor-pointer hover:bg-red-500/10 p-1 rounded transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X className="h-4 w-4 text-red-500 hover:text-red-500 transition-colors" />
              </span>
            </div>
          )}
        </div>
      </TabsTrigger>
    </div>
  );
}

export default SortableTab;
