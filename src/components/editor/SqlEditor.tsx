import React, { useRef, useEffect, useState, useCallback } from "react";
import { Play, Loader2, Lightbulb, Command, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDuckStore } from "@/store";
import { useTheme } from "../theme/theme-provider";
import { cn } from "@/lib/utils";
import {
  createEditor,
  useMonacoConfig,
  type EditorInstance,
} from "./monacoConfig";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ConnectionPill from "@/components/common/ConnectionPill";
import { Badge } from "@/components/ui/badge";

interface SqlEditorProps {
  tabId: string;
  title: string;
  className?: string;
}

const SqlEditor: React.FC<SqlEditorProps> = ({ tabId, title, className }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<EditorInstance | null>(null);
  const { theme } = useTheme();
  const { tabs, executeQuery, isExecuting, updateTabTitle, currentConnection } =
    useDuckStore();
  const monacoConfig = useMonacoConfig(theme);

  const currentTab = tabs.find((tab) => tab.id === tabId);
  const currentContent =
    currentTab?.type === "sql" && typeof currentTab.content === "string"
      ? currentTab.content
      : "";

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);

  // Stable callback for query execution
  const stableExecuteCallback = useCallback(
    async (query: string, queryTabId: string) => {
      await executeQuery(query, queryTabId);
    },
    [executeQuery]  // Add executeQuery as a dependency
  );

  // Editor initialization effect
  useEffect(() => {
    if (!editorRef.current) return;

    // Initialize editor with stable configuration
    editorInstanceRef.current = createEditor(
      editorRef.current,
      monacoConfig,
      currentContent,
      tabId,
      stableExecuteCallback
    );

    // Cleanup function
    return () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.dispose();
        editorInstanceRef.current = null;
      }
    };
  }, [tabId, monacoConfig, stableExecuteCallback]); // Keep stableExecuteCallback

  // Content sync effect
  useEffect(() => {
    const editor = editorInstanceRef.current?.editor;
    if (editor && currentContent !== editor.getValue()) {
      const position = editor.getPosition();
      editor.setValue(currentContent);
      if (position) {
        editor.setPosition(position);
      }
    }
  }, [currentContent]);  // Only depend on currentContent

  const handleExecuteQuery = async () => {
    const editor = editorInstanceRef.current?.editor;
    if (!editor || isExecuting) return;

    const query = editor.getValue().trim();
    if (!query) return;

    try {
      await executeQuery(query, tabId);
    } catch (error) {
      console.error("Query execution failed:", error);
      toast.error("Query execution failed");
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTitle(e.target.value);
  };

  const handleTitleSubmit = () => {
    if (currentTitle.trim()) {
      updateTabTitle(tabId, currentTitle);
      setIsEditingTitle(false);
      toast.success(`Tab title updated to ${currentTitle}`);
    } else {
      setCurrentTitle(title);
      setIsEditingTitle(false);
      toast.error("Title cannot be empty");
    }
  };

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <Input
              className="text-sm font-medium truncate"
              value={currentTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTitleSubmit();
                } else if (e.key === "Escape") {
                  setCurrentTitle(title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium truncate text-sm">
                {currentTitle}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleTitleEdit}
                className="group-hover:opacity-100 transition-opacity"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-sm text-muted-foreground">
            <ConnectionPill connection={currentConnection} />
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger className="hover:bg-muted/50 p-2 rounded-md transition-colors">
                  <Lightbulb className="h-5 w-5 text-yellow-500/70 hover:text-yellow-500 transition-colors" />
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="w-72 p-0"
                  sideOffset={5}
                >
                  <div className="bg-card px-3 py-2 rounded-t-sm border-b">
                    <h4 className="font-medium flex items-center gap-2">
                      <Command className="h-4 w-4" />
                      SQL Editor Shortcuts
                    </h4>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Run Query</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        Ctrl + Enter
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Run Selected</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        Ctrl + Shift + Enter
                      </Badge>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            onClick={handleExecuteQuery}
            disabled={isExecuting}
            variant="outline"
            className="flex items-center gap-2 min-w-[100px]"
          >
            {isExecuting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isExecuting ? "Running..." : "Run Query"}
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={editorRef} className="h-full w-full absolute inset-0" />
      </div>
    </div>
  );
};

export default SqlEditor;