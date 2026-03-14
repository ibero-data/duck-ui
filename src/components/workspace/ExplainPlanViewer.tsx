import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface ExplainPlanViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  explainText: string;
}

const OPERATOR_COLORS: Record<string, string> = {
  SEQ_SCAN: "text-blue-500",
  INDEX_SCAN: "text-green-500",
  HASH_JOIN: "text-purple-500",
  NESTED_LOOP_JOIN: "text-purple-400",
  HASH_GROUP_BY: "text-orange-500",
  PERFECT_HASH_GROUP_BY: "text-orange-400",
  UNGROUPED_AGGREGATE: "text-orange-300",
  ORDER_BY: "text-yellow-500",
  TOP_N: "text-yellow-400",
  FILTER: "text-red-400",
  PROJECTION: "text-cyan-500",
  TABLE_SCAN: "text-blue-400",
  CHUNK_SCAN: "text-blue-300",
  RESULT_COLLECTOR: "text-gray-400",
  EXPLAIN_ANALYZE: "text-gray-400",
  LIMIT: "text-pink-400",
  CROSS_PRODUCT: "text-red-500",
};

function colorizeOperators(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    let colorClass: string | null = null;
    for (const [key, color] of Object.entries(OPERATOR_COLORS)) {
      if (line.toUpperCase().includes(key)) {
        colorClass = color;
        break;
      }
    }
    return (
      <span key={i} className={colorClass ?? undefined}>
        {line}
        {"\n"}
      </span>
    );
  });
}

export function ExplainPlanViewer({ open, onOpenChange, explainText }: ExplainPlanViewerProps) {
  const colorized = useMemo(() => colorizeOperators(explainText), [explainText]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>Explain Analyze</SheetTitle>
          <SheetDescription>Query execution plan from DuckDB</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto">
            {explainText.trim() ? colorized : "No explain plan available"}
          </pre>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
