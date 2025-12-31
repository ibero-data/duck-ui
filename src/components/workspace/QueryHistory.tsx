import React, { useState } from "react";
import { useDuckStore, QueryHistoryItem } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import {
  Copy,
  CopyCheck,
  FileClock,
  Trash2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface QueryHistoryProps {
  isExpanded: boolean;
  mode?: "sheet" | "inline";
}

const QueryHistory: React.FC<QueryHistoryProps> = ({
  isExpanded,
  mode = "sheet",
}) => {
  const queryHistory = useDuckStore((state) => state.queryHistory);
  const clearHistory = useDuckStore((state) => state.clearHistory);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleCopyQuery = (query: string) => {
    navigator.clipboard.writeText(query);
    setCopiedQuery(query);
    toast.success("Query copied to clipboard", {
      duration: 1500,
    });
    setTimeout(() => setCopiedQuery(null), 1000);
  };

  const getStatusIcon = (item: QueryHistoryItem) => {
    if (item.error) return <XCircle className="w-4 h-4 text-red-500" />;
    return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  };

  // Shared history list content
  const HistoryContent = () => (
    <>
      {queryHistory.length === 0 ? (
        <Alert>
          <AlertCircle className="w-4 h-4 mt-6" />
          <AlertTitle>No History</AlertTitle>
          <AlertDescription>
            Your query history will appear here once you start executing
            queries.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3 mt-4">
          {queryHistory.map((item: QueryHistoryItem) => (
            <Card key={item.id} className="relative">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-start gap-2 w-full">
                      <div className="mt-1 shrink-0">{getStatusIcon(item)}</div>
                      <pre className="font-mono text-xs bg-muted overflow-x-auto p-2 rounded flex-1 min-w-0">
                        <code className="break-all whitespace-pre-wrap">
                          {item.query.length > 150
                            ? item.query.slice(0, 150) + "..."
                            : item.query}
                        </code>
                      </pre>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(item.timestamp, "MMM d, h:mm a")}
                      </div>
                    </div>

                    {item.error && (
                      <Alert variant="destructive" className="mt-2 py-2">
                        <AlertCircle className="w-3 h-3" />
                        <AlertDescription className="text-xs">
                          {item.error.length > 100
                            ? item.error.slice(0, 100) + "..."
                            : item.error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleCopyQuery(item.query)}
                  >
                    {copiedQuery === item.query ? (
                      <CopyCheck className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  // Shared clear history button
  const ClearHistoryButton = () => (
    <>
      {queryHistory.length > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear History
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Query History?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your
                query history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearHistory}>
                Clear History
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );

  // Inline mode: render content directly without Sheet wrapper
  if (mode === "inline") {
    return (
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1 px-3">
          <HistoryContent />
        </ScrollArea>
        <div className="p-3 border-t flex justify-end">
          <ClearHistoryButton />
        </div>
      </div>
    );
  }

  // Sheet mode: default behavior with Sheet wrapper
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {!isExpanded && (
        <SheetTrigger asChild>
          <Button variant="ghost">
            <FileClock className="w-8 h-8" />
          </Button>
        </SheetTrigger>
      )}
      {isExpanded && (
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2"
          >
            <FileClock className="w-5 h-5" />
            Query History
          </Button>
        </SheetTrigger>
      )}

      <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileClock className="w-5 h-5" />
            Query History
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-12rem)] mt-4 pr-4">
          <HistoryContent />
        </ScrollArea>

        <SheetFooter className="absolute bottom-4 right-4">
          <ClearHistoryButton />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default QueryHistory;
