import { useEffect, useState } from "react";
import { useDuckStore } from "@/store";
import { generateUUID } from "@/lib/utils";
import { createDashboard as newDashboardModel } from "@/services/dashboard/types";
import { parseDashboardSource } from "@/services/dashboard/markdown";
import {
  clearDashboardShareHash,
  decodeDashboardShare,
  subscribeToDashboardShares,
  type DashboardSharePayload,
} from "@/services/dashboard/share";
import { saveDashboard } from "@/services/persistence/repositories/dashboardRepository";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, LayoutDashboard, Pencil } from "lucide-react";
import { toast } from "sonner";

/**
 * Receives dashboard share links.
 *
 * Mounted once, watches `#dash=`. Nothing imports and nothing runs until the
 * person confirms — the dialog says what the document is, how many queries it
 * declares, and which role the link carries. The same consent rule every
 * other inbound link in Duck-UI follows.
 */
export default function DashboardShareLoader() {
  const loadDashboards = useDuckStore((s) => s.loadDashboards);
  const openDashboardTab = useDuckStore((s) => s.openDashboardTab);
  const currentProfileId = useDuckStore((s) => s.currentProfileId);
  const currentConnection = useDuckStore((s) => s.currentConnection);

  const [payload, setPayload] = useState<DashboardSharePayload | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeToDashboardShares((encoded) => {
      void (async () => {
        const decoded = await decodeDashboardShare(encoded);
        if (cancelled) return;
        if (!decoded) {
          toast.error("That dashboard link isn't readable");
          clearDashboardShareHash();
          return;
        }
        setPayload(decoded);
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!payload) return null;

  const queryCount = parseDashboardSource(payload.source).queries.length;

  const dismiss = () => {
    clearDashboardShareHash();
    setPayload(null);
  };

  const handleImport = async () => {
    if (!currentProfileId) {
      toast.error("Create a profile first");
      return;
    }
    setImporting(true);
    try {
      const connectionId = currentConnection?.id ?? "WASM";
      const dashboard = {
        ...newDashboardModel(payload.name, generateUUID(), new Date().toISOString()),
        source: payload.source,
        // Shared documents run on the RECIPIENT's engine against data reachable
        // from their browser. Never against the sender's.
        execution: { mode: "local" as const, connectionId },
        role: payload.mode,
      };
      await saveDashboard(currentProfileId, dashboard);
      await loadDashboards();
      openDashboardTab(dashboard.id, dashboard.name);
      dismiss();
    } finally {
      setImporting(false);
    }
  };

  const isViewer = payload.mode === "viewer";

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Open “{payload.name}”
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            {isViewer ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            Shared {isViewer ? "read-only" : "as editable"} · {queryCount}{" "}
            {queryCount === 1 ? "query" : "queries"}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          The queries run in your browser, against data your browser can reach. Nothing runs until
          you open it.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          <Button onClick={handleImport} disabled={importing}>
            Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
