import { useEffect, useState } from "react";
import { useDuckStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutDashboard, MoreVertical, Plus } from "lucide-react";

interface DashboardsPanelProps {
  onClose: () => void;
}

/**
 * The dashboards index (the Grafana/Evidence "home" for reports).
 *
 * This list is what makes a dashboard durable in practice: closing its tab, or
 * reloading, must never mean losing it. Everything here is already persisted —
 * the list is how you get back to it.
 */
export default function DashboardsPanel({ onClose }: DashboardsPanelProps) {
  const dashboards = useDuckStore((s) => s.dashboards);
  const loadDashboards = useDuckStore((s) => s.loadDashboards);
  const createDashboard = useDuckStore((s) => s.createDashboard);
  const duplicateDashboard = useDuckStore((s) => s.duplicateDashboard);
  const deleteDashboard = useDuckStore((s) => s.deleteDashboard);
  const openDashboardTab = useDuckStore((s) => s.openDashboardTab);

  const [newName, setNewName] = useState("");

  useEffect(() => {
    void loadDashboards();
  }, [loadDashboards]);

  const handleCreate = async () => {
    const dashboard = await createDashboard(newName.trim() || "Untitled dashboard");
    if (dashboard) {
      setNewName("");
      openDashboardTab(dashboard.id, dashboard.name);
      onClose();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <LayoutDashboard className="h-4 w-4" />
          Dashboards
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <span className="sr-only">Close</span>×
        </Button>
      </div>

      <div className="flex gap-2 border-b p-3">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New dashboard name"
          className="h-8 text-sm"
          onKeyDown={(event) => event.key === "Enter" && handleCreate()}
        />
        <Button size="sm" className="h-8 gap-1.5" onClick={handleCreate}>
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {dashboards.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No dashboards yet. Create one above, or run a query and use{" "}
            <span className="font-medium">Add to dashboard</span>.
          </p>
        ) : (
          <div className="space-y-0.5 p-2">
            {dashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    openDashboardTab(dashboard.id, dashboard.name);
                    onClose();
                  }}
                >
                  <p className="truncate text-sm">{dashboard.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Updated {new Date(dashboard.updatedAt).toLocaleString()}
                  </p>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      aria-label={`${dashboard.name} options`}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => duplicateDashboard(dashboard.id)}>
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteDashboard(dashboard.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
