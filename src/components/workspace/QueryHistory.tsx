import React, { useState } from "react";
import { useDuckStore, QueryHistoryItem } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
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
}

const QueryHistory: React.FC<QueryHistoryProps> = ({ isExpanded }) => {
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
          <SheetDescription>
            View and manage your recent SQL queries
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-12rem)] mt-4 pr-4">
          {queryHistory.length === 0 ? (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertTitle>No History</AlertTitle>
              <AlertDescription>
                Your query history will appear here once you start executing
                queries.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {queryHistory.map((item: QueryHistoryItem) => (
                <Card key={item.id} className="relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 w-full">
                          {getStatusIcon(item)}
                          <pre className="font-mono text-sm bg-muted overflow-x-auto p-2 rounded w-full">
                            <code className="break-all whitespace-pre-wrap">
                              {item.query.length > 200
                                ? item.query.slice(0, 200) + "..."
                                : item.query}
                            </code>
                          </pre>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(item.timestamp, "MMM d, yyyy h:mm a")}
                          </div>
                          {item.duration && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {item.duration.toFixed(2)} ms
                            </div>
                          )}
                        </div>

                        {item.error && (
                          <Alert variant="destructive" className="mt-2">
                            <AlertCircle className="w-4 h-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{item.error}</AlertDescription>
                          </Alert>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyQuery(item.query)}
                        className="flex-shrink-0"
                      >
                        {copiedQuery === item.query ? (
                          <CopyCheck className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="absolute bottom-4 right-4">
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
                    This action cannot be undone. This will permanently delete
                    your query history.
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default QueryHistory;
