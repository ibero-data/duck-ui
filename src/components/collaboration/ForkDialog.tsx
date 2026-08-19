import { useMemo, useState } from "react";
import { useDuckStore } from "@/store";
import { WASM_CONNECTION_ID } from "@/services/engine";
import type { SharedCapability } from "@/services/collaboration/capabilities/capability";
import type { ForkTableProgress } from "@/services/collaboration/fork";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, Database, GitFork, Loader2, Scissors } from "lucide-react";

interface ForkDialogProps {
  capability: SharedCapability;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Fork Session, guest side (§22).
 *
 * Pick tables, watch them transfer, and leave with an independent copy. The
 * dialog is explicit about the two things people need to know: the copy is
 * theirs afterwards, and the host's grant limits bound what crosses.
 */
export default function ForkDialog({ capability, open, onOpenChange }: ForkDialogProps) {
  const forkCapability = useDuckStore((s) => s.forkCapability);
  const connections = useDuckStore((s) => s.connectionList.connections);

  // Fork destinations: the in-memory engine (gone when the tab closes) or an
  // OPFS database (persists on this device). Never a remote or peer target —
  // "your copy, in your browser" is the whole promise.
  const destinations = useMemo(
    () => [
      { id: WASM_CONNECTION_ID, label: "This browser (in-memory)" },
      ...connections
        .filter((connection) => connection.scope === "OPFS")
        .map((connection) => ({ id: connection.id, label: `${connection.name} (persistent)` })),
    ],
    [connections]
  );
  const [destination, setDestination] = useState<string>(WASM_CONNECTION_ID);

  const tables = useMemo(
    () =>
      (capability.catalog?.databases ?? []).flatMap((database) =>
        database.tables.map((table) => table.name)
      ),
    [capability.catalog]
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(tables));
  const [progress, setProgress] = useState<Map<string, ForkTableProgress>>(new Map());
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const toggle = (table: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  const handleFork = async () => {
    setRunning(true);
    setFinished(false);
    setProgress(new Map());
    try {
      await forkCapability(
        capability.id,
        [...selected],
        (update) => {
          setProgress((current) => new Map(current).set(update.table, update));
        },
        destination
      );
      setFinished(true);
    } finally {
      setRunning(false);
    }
  };

  const rowLimit = capability.policy.maxResultRows;

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="h-4 w-4" />
            Fork “{capability.name}”
          </DialogTitle>
          <DialogDescription>
            Copies the selected tables into your browser. Afterwards your copy is independent —
            their changes don't reach you, and yours don't reach them.
          </DialogDescription>
        </DialogHeader>

        {rowLimit !== undefined && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Scissors className="mt-0.5 h-3 w-3 shrink-0" />
            The host's limit of {rowLimit.toLocaleString()} rows per table applies to the copy.
          </p>
        )}

        <ScrollArea className="max-h-56">
          <div className="space-y-1.5 pr-3">
            {tables.length === 0 && (
              <p className="text-xs text-muted-foreground">This share lists no tables.</p>
            )}
            {tables.map((table) => {
              const state = progress.get(table);
              return (
                <div key={table} className="flex items-center gap-2">
                  <Checkbox
                    id={`fork-${table}`}
                    checked={selected.has(table)}
                    disabled={running}
                    onCheckedChange={() => toggle(table)}
                  />
                  <label htmlFor={`fork-${table}`} className="flex-1 font-mono text-sm">
                    {table}
                  </label>
                  {state && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {state.status === "transferring" && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {state.rows.toLocaleString()} rows
                        </>
                      )}
                      {state.status === "importing" && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          importing
                        </>
                      )}
                      {state.status === "done" && (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          {state.rows.toLocaleString()} rows
                          {state.truncated ? " (truncated by the host's limit)" : ""}
                        </>
                      )}
                      {state.status === "error" && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {state.error}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {destinations.length > 1 && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              Destination
            </label>
            <Select value={destination} onValueChange={setDestination} disabled={running}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              In-memory copies vanish when this tab closes. An OPFS database keeps them on this
              device.
            </p>
          </div>
        )}

        {finished && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs">
            Done. The copies are{" "}
            {destination === "WASM"
              ? "in your local in-memory database"
              : "saved in your persistent database"}{" "}
            — they stay even if the host leaves.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            {finished ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleFork} disabled={running || selected.size === 0}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Fork {selected.size > 0 ? `${selected.size} ` : ""}
            {selected.size === 1 ? "table" : "tables"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
