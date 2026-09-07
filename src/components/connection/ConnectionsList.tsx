import { useState } from "react";
import type { ConnectionProvider } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Database, Edit2, ExternalLink, InfoIcon, Radio, Trash2 } from "lucide-react";

interface ConnectionsListProps {
  connections: ConnectionProvider[];
  currentConnectionId?: string;
  isLoading: boolean;
  onConnect: (connectionId: string) => void;
  onEdit: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
}

/** Why a connection cannot be edited or deleted, when it cannot. */
const readOnlyReason = (connection: ConnectionProvider): string | null => {
  switch (connection.environment) {
    case "ENV":
      return "Configured via environment variables — cannot be edited or deleted.";
    case "BUILT_IN":
      return "Built-in connection — cannot be edited or deleted.";
    case "SESSION":
      return "Granted by a live session. It disappears when the session ends.";
    default:
      return null;
  }
};

const scopeIcon = (scope: ConnectionProvider["scope"]) => {
  if (scope === "WASM" || scope === "OPFS") return <Database size={16} />;
  if (scope === "Peer") return <Radio size={16} className="text-amber-500" />;
  return <ExternalLink size={16} />;
};

/**
 * The connections table, extracted from ConnectionsTab so the tab is form
 * wiring and this is presentation. One row per connection; the row knows
 * which environments are read-only and says why instead of hiding buttons.
 */
export function ConnectionsList({
  connections,
  currentConnectionId,
  isLoading,
  onConnect,
  onEdit,
  onDelete,
}: ConnectionsListProps) {
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  return (
    <ScrollArea className="h-[calc(100vh-400px)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Database</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {connections.map((connection) => {
            const isCurrent = connection.id === currentConnectionId;
            const reason = readOnlyReason(connection);
            return (
              <TableRow key={connection.id}>
                <TableCell className={isCurrent ? "border-l-4 border-green-500" : ""}>
                  <div className="flex items-center gap-2">
                    {scopeIcon(connection.scope)}
                    {connection.name}
                  </div>
                </TableCell>
                <TableCell>{connection.scope}</TableCell>
                <TableCell>
                  {connection.host || (connection.scope === "WASM" ? "Local" : "-")}
                </TableCell>
                <TableCell>
                  {connection.database || (connection.scope === "WASM" ? "memory" : "-")}
                </TableCell>
                <TableCell>{connection.environment}</TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 items-center">
                    {connection.environment !== "BUILT_IN" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isCurrent || isLoading}
                        onClick={() => onConnect(connection.id)}
                      >
                        {isCurrent ? "Connected" : "Connect"}
                      </Button>
                    )}

                    {reason ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon size={18} className="text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-sm max-w-[220px] !text-center">{reason}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(connection.id)}
                          disabled={connection.id === "WASM"}
                          aria-label={`Edit ${connection.name}`}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <AlertDialog
                          open={deleteConfirmationId === connection.id}
                          onOpenChange={(isOpen) =>
                            setDeleteConfirmationId(isOpen ? connection.id : null)
                          }
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isLoading}
                              aria-label={`Delete ${connection.name}`}
                            >
                              <Trash2 size={16} className="text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Connection</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the connection "{connection.name}"?
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  onDelete(connection.id);
                                  setDeleteConfirmationId(null);
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {/* Without this, Radix's ScrollArea only enables the vertical axis —
          a narrow container (e.g. the sidebar's Sheet) clips the table's
          right-hand columns with no way to reach them. */}
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
