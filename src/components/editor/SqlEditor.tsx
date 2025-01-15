import React, { useRef, useEffect } from "react";
import { Play, Loader2, Lightbulb, Command } from "lucide-react";
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
  const { tabs, executeQuery, isExecuting } = useDuckStore();
  const monacoConfig = useMonacoConfig(theme);

  const currentTab = tabs.find((tab) => tab.id === tabId);
  const currentContent =
    currentTab?.type === "sql" && typeof currentTab.content === "string"
      ? currentTab.content
      : "";

  useEffect(() => {
    if (!editorRef.current) return;

    editorInstanceRef.current = createEditor(
      editorRef.current,
      monacoConfig,
      currentContent,
      tabId,
      executeQuery
    );

    return () => {
      editorInstanceRef.current?.dispose();
    };
  }, [tabId, monacoConfig]);

  useEffect(() => {
    if (
      editorInstanceRef.current?.editor &&
      currentContent !== editorInstanceRef.current.editor.getValue()
    ) {
      editorInstanceRef.current.editor.setValue(currentContent);
    }
  }, [currentContent]);

  const handleExecuteQuery = async () => {
    const editor = editorInstanceRef.current?.editor;
    if (!editor) return;

    const query = editor.getValue().trim();
    if (!query) return;

    try {
      await executeQuery(query, tabId);
    } catch (error) {
      console.error("Query execution failed:", error);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-lg font-medium truncate">{title}</h2>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-sm text-muted-foreground">
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
