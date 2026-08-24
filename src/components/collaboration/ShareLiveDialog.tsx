import { useEffect, useState } from "react";
import { useDuckStore } from "@/store";
import type { ShareSelection } from "@/services/collaboration/liveSession";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2, Radio, ShieldCheck, UserPlus, Waypoints } from "lucide-react";
import {
  isTurnConfigured,
  verifyTurnRelay,
  type TurnCheckResult,
} from "@/services/collaboration/signaling/client";
import { toast } from "sonner";

interface ShareLiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Host flow for "Share Live" (§44).
 *
 * Deliberately explicit about data access. The default is NO data access —
 * sharing a workspace and sharing your database are different decisions, and
 * conflating them is how people accidentally hand over more than they meant.
 */
export default function ShareLiveDialog({ open, onOpenChange }: ShareLiveDialogProps) {
  const session = useDuckStore((s) => s.session);
  const listShareableTables = useDuckStore((s) => s.listShareableTables);
  const startLiveSession = useDuckStore((s) => s.startLiveSession);
  const acceptGuestCode = useDuckStore((s) => s.acceptGuestCode);
  const endLiveSession = useDuckStore((s) => s.endLiveSession);
  const inviteAnotherGuest = useDuckStore((s) => s.inviteAnotherGuest);
  const profileName = useDuckStore((s) => s.currentProfile?.name);

  // Draft-only state, derived below. Seeding a default via an effect would be
  // a synchronous setState inside one, which cascades renders.
  const [sessionNameDraft, setSessionNameDraft] = useState<string | null>(null);
  const [tables, setTables] = useState<ShareSelection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareMode, setShareMode] = useState<"none" | "all" | "selected">("none");
  const [rowLimit, setRowLimit] = useState(100_000);
  const [guestCode, setGuestCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [turnCheck, setTurnCheck] = useState<TurnCheckResult | "checking" | null>(null);

  const sessionName = sessionNameDraft ?? `${profileName ?? "My"} session`;

  useEffect(() => {
    if (!open) return;
    listShareableTables().then(setTables);
  }, [open, listShareableTables]);

  const isStarting = session.status === "connecting";
  const hasInvite = Boolean(session.inviteUrl);
  const isConnected = session.status === "connected";

  const toggleTable = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Copied");
  };

  const handleStart = async () => {
    const shared =
      shareMode === "selected" ? tables.filter((t) => selected.has(t.exposedName)) : [];
    await startLiveSession({
      sessionName: sessionName.trim() || "Live session",
      shared,
      shareAll: shareMode === "all",
      maxResultRows: rowLimit,
    });
  };

  const handleClose = async (nextOpen: boolean) => {
    if (!nextOpen && session.role === "host" && session.status !== "idle") {
      // Closing the dialog must not silently end a live session — the panel
      // stays reachable from the header.
      onOpenChange(false);
      return;
    }
    onOpenChange(nextOpen);
  };

  if (!session.isWebRtcSupported) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Live sharing isn't available</SheetTitle>
            <SheetDescription>
              This browser doesn't support the peer connections a live session needs. Everything
              else in Duck-UI works normally, and you can still share a snapshot link.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-amber-500" />
            Share Live
          </SheetTitle>
          <SheetDescription>
            Someone else joins your workspace from their own browser. Queries they run execute here,
            in your browser, and results stream straight to them.
          </SheetDescription>
        </SheetHeader>

        {!hasInvite ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="session-name">Session name</Label>
              <Input
                id="session-name"
                value={sessionName}
                onChange={(event) => setSessionNameDraft(event.target.value)}
                placeholder="Q3 analysis"
              />
            </div>

            <div className="space-y-3">
              <Label>Data access</Label>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="no-data"
                  checked={shareMode === "none"}
                  onCheckedChange={() => setShareMode("none")}
                />
                <div className="grid gap-0.5">
                  <label htmlFor="no-data" className="text-sm font-medium leading-none">
                    No data access
                  </label>
                  <p className="text-xs text-muted-foreground">
                    They see the workspace. They cannot query your data.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="all-data"
                  checked={shareMode === "all"}
                  onCheckedChange={() => setShareMode("all")}
                />
                <div className="grid gap-0.5">
                  <label htmlFor="all-data" className="text-sm font-medium leading-none">
                    All data
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Every table on this connection, including ones you add while the session is
                    live. Read-only, copied into an isolated engine.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="share-data"
                  checked={shareMode === "selected"}
                  onCheckedChange={() => setShareMode("selected")}
                />
                <div className="grid gap-0.5">
                  <label htmlFor="share-data" className="text-sm font-medium leading-none">
                    Share selected tables
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Read-only. Copied into an isolated engine — the rest of your data stays out of
                    reach.
                  </p>
                </div>
              </div>
            </div>

            {shareMode === "all" && (
              <div className="space-y-1 rounded-md border p-3">
                <Label htmlFor="row-limit-all" className="text-xs">
                  Result limit (rows)
                </Label>
                <Input
                  id="row-limit-all"
                  type="number"
                  min={100}
                  step={1000}
                  value={rowLimit}
                  onChange={(event) => setRowLimit(Number(event.target.value))}
                  className="max-w-[160px]"
                />
                <p className="text-xs text-muted-foreground">
                  {tables.length === 0
                    ? "Nothing here yet. Tables you create or import will be shared as they appear."
                    : `${tables.length} ${tables.length === 1 ? "table" : "tables"} now, plus whatever you add later.`}
                </p>
              </div>
            )}

            {shareMode === "selected" && (
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tables
                </Label>
                <ScrollArea className="h-40">
                  <div className="space-y-2 pr-3">
                    {tables.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No tables to share on this connection.
                      </p>
                    )}
                    {tables.map((table) => (
                      <div key={table.qualifiedName} className="flex items-center gap-2">
                        <Checkbox
                          id={table.qualifiedName}
                          checked={selected.has(table.exposedName)}
                          onCheckedChange={() => toggleTable(table.exposedName)}
                        />
                        <label htmlFor={table.qualifiedName} className="text-sm font-mono">
                          {table.exposedName}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="space-y-1">
                  <Label htmlFor="row-limit" className="text-xs">
                    Result limit (rows)
                  </Label>
                  <Input
                    id="row-limit"
                    type="number"
                    min={100}
                    step={1000}
                    value={rowLimit}
                    onChange={(event) => setRowLimit(Number(event.target.value))}
                    className="max-w-[160px]"
                  />
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                Database passwords and API keys never leave this browser, whatever you share here.
              </span>
            </div>

            {isTurnConfigured() && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Waypoints className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">
                  {turnCheck === null && (
                    <>
                      This deployment has a TURN relay for strict networks.{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={async () => {
                          setTurnCheck("checking");
                          setTurnCheck(await verifyTurnRelay());
                        }}
                      >
                        Test it
                      </button>
                    </>
                  )}
                  {turnCheck === "checking" && "Asking the relay for a candidate…"}
                  {turnCheck !== null && turnCheck !== "checking" && (
                    <span className={turnCheck.reachable ? "text-emerald-500" : "text-destructive"}>
                      {turnCheck.detail}
                    </span>
                  )}
                </span>
              </div>
            )}

            <SheetFooter>
              <Button
                onClick={handleStart}
                disabled={isStarting || (shareMode === "selected" && selected.size === 0)}
              >
                {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create session
              </Button>
            </SheetFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>1. Send them this link</Label>
              <div className="flex gap-2">
                <Input readOnly value={session.inviteUrl ?? ""} className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copy(session.inviteUrl ?? "")}
                  aria-label="Copy invite link"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-code">2. Paste the code they send back</Label>
              <Textarea
                id="guest-code"
                value={guestCode}
                onChange={(event) => setGuestCode(event.target.value)}
                placeholder="Paste their connection code here"
                className="h-24 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Two links, no server. Nothing about this session touches the internet beyond your
                browsers finding each other.
              </p>
              <Button
                onClick={async () => {
                  await acceptGuestCode(guestCode);
                  setGuestCode("");
                }}
                disabled={!guestCode.trim() || isStarting}
                className="w-full"
              >
                {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect
              </Button>
            </div>

            {isConnected && (
              <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <p>
                  Connected · {session.participants.length}{" "}
                  {session.participants.length === 1 ? "person" : "people"} in this session
                </p>
                <p className="text-xs text-muted-foreground">
                  Each invite works once. To add someone else, create a new one.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={inviteAnotherGuest}
                  disabled={isStarting}
                  className="gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite someone else
                </Button>
              </div>
            )}

            {session.error && <p className="text-xs text-destructive">{session.error}</p>}

            <SheetFooter>
              <Button
                variant="outline"
                onClick={async () => {
                  await endLiveSession();
                  onOpenChange(false);
                }}
              >
                End session
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
