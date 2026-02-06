import React from "react";
import { Copy, Play, FileInput, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { QueryResultArtifact } from "@/store";
import ResultsArtifact from "./ResultsArtifact";

interface DuckBrainCodeBlockProps {
  sql: string;
  messageId: string;
  queryResult?: QueryResultArtifact;
  onExecute?: (messageId: string, sql: string) => void;
  onInsert?: (sql: string) => void;
  className?: string;
}

const DuckBrainCodeBlock: React.FC<DuckBrainCodeBlockProps> = ({
  sql,
  messageId,
  queryResult,
  onExecute,
  onInsert,
  className,
}) => {
  const [copied, setCopied] = React.useState(false);
  const isRunning = queryResult?.status === "running";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      toast.success("SQL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleExecute = () => {
    if (onExecute && !isRunning) {
      onExecute(messageId, sql);
    }
  };

  const handleRetry = () => {
    handleExecute();
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* SQL Code Block */}
      <div className="rounded-lg overflow-hidden border bg-muted/30">
        {/* SQL Code */}
        <pre className="p-3 text-xs overflow-x-auto">
          <code className="text-foreground font-mono whitespace-pre-wrap break-all">{sql}</code>
        </pre>

        {/* Actions */}
        <div className="flex items-center gap-1 p-2 border-t bg-muted/50">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1">
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </Button>

          {onInsert && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onInsert(sql)}
              className="h-7 text-xs gap-1"
            >
              <FileInput className="h-3 w-3" />
              Insert
            </Button>
          )}

          {onExecute && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExecute}
              disabled={isRunning}
              className="h-7 text-xs gap-1 text-primary"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Run
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Results Artifact */}
      {queryResult && queryResult.status !== "pending" && (
        <ResultsArtifact queryResult={queryResult} onRetry={handleRetry} />
      )}
    </div>
  );
};

export default DuckBrainCodeBlock;
