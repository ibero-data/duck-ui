import { useEffect, useState } from "react";
import {
  buildDashboardShareUrl,
  encodeDashboardShare,
  type DashboardShareMode,
} from "@/services/dashboard/share";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, Eye, Pencil, Radio } from "lucide-react";
import { toast } from "sonner";
import type { Dashboard } from "@/services/dashboard/types";

interface ShareDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: Dashboard;
  /** Opens the workspace-level Share Live flow. */
  onShareLive: () => void;
}

/**
 * Share a dashboard, with roles (§24 made concrete for documents).
 *
 * Viewer and editor are links carrying the SOURCE — never results, never
 * credentials. Live is the collaborative session, where editing is genuinely
 * shared and access is genuinely revocable.
 */
export default function ShareDashboardDialog({
  open,
  onOpenChange,
  dashboard,
  onShareLive,
}: ShareDashboardDialogProps) {
  const [links, setLinks] = useState<Record<DashboardShareMode, string> | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [viewer, editor] = await Promise.all(
        (["viewer", "editor"] as const).map((mode) =>
          encodeDashboardShare({ mode, name: dashboard.name, source: dashboard.source })
        )
      );
      if (!cancelled) {
        setLinks({
          viewer: buildDashboardShareUrl(viewer),
          editor: buildDashboardShareUrl(editor),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dashboard.name, dashboard.source]);

  const copy = async (mode: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(mode);
    setTimeout(() => setCopied(null), 1500);
    toast.success("Link copied");
  };

  const row = (mode: DashboardShareMode, icon: React.ReactNode, title: string, caption: string) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
      </Label>
      <div className="flex gap-2">
        <Input readOnly value={links?.[mode] ?? "…"} className="font-mono text-xs" />
        <Button
          size="icon"
          variant="outline"
          disabled={!links}
          onClick={() => links && copy(mode, links[mode])}
          aria-label={`Copy ${title} link`}
        >
          {copied === mode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Share “{dashboard.name}”</SheetTitle>
          <SheetDescription>
            Links carry the document — markdown and SQL, never results. Queries reproduce for the
            recipient when the data they read is publicly reachable.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {row(
            "viewer",
            <Eye className="h-3.5 w-3.5" />,
            "Viewer",
            "Opens read-only. Good for anyone who should look, not touch."
          )}
          {row(
            "editor",
            <Pencil className="h-3.5 w-3.5" />,
            "Editor",
            "Imports an editable copy into their Duck-UI. Their edits stay theirs."
          )}

          <div className="space-y-1.5 rounded-md border p-3">
            <Label className="flex items-center gap-1.5 text-xs font-medium">
              <Radio className="h-3.5 w-3.5 text-amber-500" />
              Live
            </Label>
            <p className="text-xs text-muted-foreground">
              Edit the same document together in real time, with queries running on your data, in
              your browser. Revocable, unlike a link.
            </p>
            <Button size="sm" variant="outline" className="mt-1" onClick={onShareLive}>
              Start a live session
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
