import React, { useEffect, useState } from "react";
import { useDuckStore } from "@/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect"; // Import the isomorphic layout effect

interface ActivityManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ActivityManager: React.FC<ActivityManagerProps> = ({
  isOpen,
  onClose,
}) => {
  const { isExecuting, queryHistory, db, connection } = useDuckStore();
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);

   // Using isomorphic layout effect so this works on the server (avoid SSR issues)
  useIsomorphicLayoutEffect(() => {
    let intervalId: any;

    if (isOpen) {
      intervalId = setInterval(() => {
        // Using isInitialized because db and connections are null on first render
        if (db && db.getMemoryUsage && connection) {
          db.getMemoryUsage().then((memoryUsage) => {
            setMemoryUsage(memoryUsage);
          });
        } else {
          setMemoryUsage(null);
        }
      }, 1000); // Update every second
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isOpen, db, connection]); // add connection as a dependency

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>DuckDB Activity Manager</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[70vh]">
          <div className="space-y-4 p-2">
            {/* Connection Status */}
            <Card>
              <CardHeader>
                <CardTitle>Connection</CardTitle>
                <CardDescription>
                  Information about the current connection
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Connection Status:{" "}
                  <span className="font-medium">
                    {connection ? "Connected" : "Not Connected"}
                  </span>
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Active Queries:{" "}
                  <span className="font-medium">
                    {isExecuting ? "Running" : "Idle"}
                  </span>
                </p>
              </CardContent>
            </Card>

            {/* Memory Usage */}
            <Card>
              <CardHeader>
                <CardTitle>Memory</CardTitle>
                <CardDescription>
                  Information about the memory used
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Memory Usage:{" "}
                  <span className="font-medium">
                    {memoryUsage !== null
                      ? `${(memoryUsage / (1024 * 1024)).toFixed(2)} MB`
                      : "Not Available"}
                  </span>
                </p>
              </CardContent>
            </Card>

            {/* Query History */}
            <Card>
              <CardHeader>
                <CardTitle>Query History</CardTitle>
                <CardDescription>Recent queries history.</CardDescription>
              </CardHeader>
              <CardContent>
                {queryHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No query history available.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {queryHistory.map((item) => (
                      <li
                        key={item.id}
                        className="border-b border-gray-200 dark:border-gray-700 pb-1 last:border-b-0"
                      >
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(item.timestamp, "yyyy-MM-dd HH:mm:ss")}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {item.query}
                        </p>
                        {item.duration && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Duration: {item.duration.toFixed(2)} ms
                          </p>
                        )}
                        {item.error && (
                          <p className="text-xs text-red-500 dark:text-red-400">
                            Error: {item.error}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
        <div className="flex justify-end pt-4">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActivityManager;