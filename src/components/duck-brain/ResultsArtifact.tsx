import React, { useState } from "react";
import { Loader2, AlertCircle, ChevronDown, ChevronUp, Table2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { QueryResultArtifact } from "@/store";

interface ResultsArtifactProps {
  queryResult: QueryResultArtifact;
  onRetry?: () => void;
  className?: string;
}

const MAX_INLINE_ROWS = 5;
const MAX_INLINE_COLUMNS = 6;

const ResultsArtifact: React.FC<ResultsArtifactProps> = ({ queryResult, onRetry, className }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status, data, error } = queryResult;

  // Running state
  if (status === "running") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Executing query...</span>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div
        className={cn("p-3 rounded-lg border border-destructive/50 bg-destructive/5", className)}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Query failed</p>
            <p className="text-xs text-muted-foreground mt-1 break-words">
              {error || "Unknown error occurred"}
            </p>
          </div>
          {onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} className="flex-shrink-0 h-7 px-2">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Pending state - shouldn't normally show, but handle it
  if (status === "pending" || !data) {
    return null;
  }

  // Success state - show results
  const { columns, columnTypes, data: rows, rowCount } = data;
  const hasMoreRows = rowCount > MAX_INLINE_ROWS;
  const hasMoreColumns = columns.length > MAX_INLINE_COLUMNS;
  const displayRows = isExpanded ? rows.slice(0, 50) : rows.slice(0, MAX_INLINE_ROWS);
  const displayColumns = columns.slice(0, MAX_INLINE_COLUMNS);

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Results</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              {displayColumns.map((col, i) => (
                <th
                  key={col}
                  className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  <div className="flex flex-col">
                    <span>{col}</span>
                    <span className="text-[10px] font-normal opacity-60">{columnTypes[i]}</span>
                  </div>
                </th>
              ))}
              {hasMoreColumns && (
                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                  <span className="text-[10px]">+{columns.length - MAX_INLINE_COLUMNS} more</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-0 hover:bg-muted/20">
                {displayColumns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate"
                    title={String(row[col] ?? "")}
                  >
                    {formatCellValue(row[col])}
                  </td>
                ))}
                {hasMoreColumns && <td className="px-3 py-1.5 text-muted-foreground">...</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expand/Collapse */}
      {hasMoreRows && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="w-full px-3 py-1.5 text-xs text-center text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center gap-1 border-t">
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show more ({Math.min(50, rowCount) - MAX_INLINE_ROWS} more rows)
                </>
              )}
            </button>
          </CollapsibleTrigger>
        </Collapsible>
      )}
    </div>
  );
};

// Helper to format cell values for display
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    // Format numbers nicely
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

export default ResultsArtifact;
