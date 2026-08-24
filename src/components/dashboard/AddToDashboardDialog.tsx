import { useEffect, useState } from "react";
import { useDuckStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutDashboard, Plus } from "lucide-react";
import type { ChartConfig } from "@/store/types";

type AddKind = "chart" | "table" | "metric";

const KINDS: { kind: AddKind; label: string }[] = [
  { kind: "table", label: "Table" },
  { kind: "chart", label: "Chart" },
  { kind: "metric", label: "Metric" },
];

interface AddToDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sql: string;
  title: string;
  chartConfig?: ChartConfig;
  /** Result columns with a numeric flag, for x/y selection in the tag. */
  columns?: { name: string; numeric: boolean }[];
}

/**
 * "Add to dashboard", from a query result (§8).
 *
 * The SQL travels, not the rows. A widget re-runs its dataset when the
 * dashboard opens, so what lands there stays current instead of freezing the
 * numbers that happened to be on screen.
 */
export default function AddToDashboardDialog({
  open,
  onOpenChange,
  sql,
  title,
  chartConfig,
  columns,
}: AddToDashboardDialogProps) {
  const dashboards = useDuckStore((s) => s.dashboards);
  const loadDashboards = useDuckStore((s) => s.loadDashboards);
  const createDashboard = useDuckStore((s) => s.createDashboard);
  const appendQueryToDashboard = useDuckStore((s) => s.appendQueryToDashboard);

  const [kind, setKind] = useState<AddKind>(chartConfig ? "chart" : "table");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) void loadDashboards();
  }, [open, loadDashboards]);

  const addTo = async (dashboardId: string) => {
    setBusy(true);
    try {
      await appendQueryToDashboard({ dashboardId, kind, title, sql, chartConfig, columns });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim() || "Untitled dashboard";
    setBusy(true);
    try {
      const dashboard = await createDashboard(name);
      if (dashboard) {
        await appendQueryToDashboard({
          dashboardId: dashboard.id,
          kind,
          title,
          sql,
          chartConfig,
          columns,
        });
        onOpenChange(false);
        setNewName("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Add to dashboard
          </DialogTitle>
          <DialogDescription>
            The query is saved, not the rows — the widget re-runs it so the numbers stay current.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Show as</Label>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <Button
                key={option.kind}
                size="sm"
                variant={kind === option.kind ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setKind(option.kind)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {dashboards.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Existing
            </Label>
            <ScrollArea className="max-h-40">
              <div className="space-y-1 pr-3">
                {dashboards.map((dashboard) => (
                  <Button
                    key={dashboard.id}
                    variant="outline"
                    className="w-full justify-start text-sm"
                    disabled={busy}
                    onClick={() => addTo(dashboard.id)}
                  >
                    {dashboard.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="space-y-2">
          <Label
            htmlFor="new-dashboard"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            New dashboard
          </Label>
          <div className="flex gap-2">
            <Input
              id="new-dashboard"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Q3 overview"
              onKeyDown={(event) => event.key === "Enter" && createAndAdd()}
            />
            <Button onClick={createAndAdd} disabled={busy} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
