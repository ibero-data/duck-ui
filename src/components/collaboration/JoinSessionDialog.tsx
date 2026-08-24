import { useEffect, useState } from "react";
import { useDuckStore } from "@/store";
import {
  clearInviteHash,
  decodeInvite,
  subscribeToInvites,
  type ManualInvite,
} from "@/services/collaboration/signaling/manualSignaling";
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
import { Check, Copy, Loader2, Lock, Radio } from "lucide-react";
import { toast } from "sonner";

/**
 * Guest flow (§45).
 *
 * Mounted once and driven by the URL. Nothing runs on arrival: opening an
 * invite shows what the session is and who is hosting it, and waits. No SQL is
 * executed, no local file is read, and no data access exists until the host
 * grants it after the connection is up.
 */
export default function JoinSessionDialog() {
  const session = useDuckStore((s) => s.session);
  const joinLiveSession = useDuckStore((s) => s.joinLiveSession);
  const endLiveSession = useDuckStore((s) => s.endLiveSession);

  const [invite, setInvite] = useState<ManualInvite | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Subscribed, not read once: pasting an invite while already on the page
    // changes only the fragment, which does not reload anything.
    const unsubscribe = subscribeToInvites((encoded) => {
      void (async () => {
        const decoded = await decodeInvite<ManualInvite>(encoded);
        if (cancelled) return;
        if (!decoded || !("offer" in decoded)) {
          toast.error("That invite link isn't readable");
          clearInviteHash();
          return;
        }
        setInvite(decoded);
        setInviteCode((current) => {
          // A different invite is a new offer to consider, even if the last
          // one was dismissed.
          if (current !== encoded) setDismissed(false);
          return encoded;
        });
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!invite || dismissed) return null;

  const isConnecting = session.status === "connecting";
  // The code appears the moment it exists — waiting for "connected" would mean
  // waiting for the host to paste a code the guest has not been shown yet.
  const hasCode = Boolean(session.answerCode) && session.role === "guest";
  const isConnected = session.status === "connected" && session.role === "guest";

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Copied — send this back to the host");
  };

  const decline = async () => {
    await endLiveSession();
    clearInviteHash();
    setDismissed(true);
  };

  return (
    <Sheet open onOpenChange={(open) => !open && decline()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-amber-500" />
            Join “{invite.sessionName}”
          </SheetTitle>
          <SheetDescription>Hosted by {invite.hostDisplayName}</SheetDescription>
        </SheetHeader>

        {!hasCode ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p>This session can share workspace state with your browser.</p>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>
                  Your own data stays private. Nothing runs and no file is read until you join, and
                  any shared data appears only if {invite.hostDisplayName} grants it.
                </span>
              </div>
            </div>

            {session.error && <p className="text-xs text-destructive">{session.error}</p>}

            <SheetFooter>
              <Button variant="ghost" onClick={decline}>
                Not now
              </Button>
              <Button
                onClick={() => inviteCode && joinLiveSession(inviteCode)}
                disabled={isConnecting}
              >
                {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join
              </Button>
            </SheetFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Send this code back to {invite.hostDisplayName}</Label>
              <div className="flex gap-2">
                <Input readOnly value={session.answerCode ?? ""} className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copy(session.answerCode ?? "")}
                  aria-label="Copy connection code"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {isConnected ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                  <Check className="h-3.5 w-3.5" />
                  Connected to {invite.hostDisplayName}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Waiting for {invite.hostDisplayName} to paste it…
                </p>
              )}
            </div>

            {session.sharedCapabilities.length > 0 && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <p className="font-medium">Shared data available</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {session.sharedCapabilities.map((capability) => (
                    <li key={capability.id}>
                      {capability.name} · read-only
                      {capability.policy.maxResultRows
                        ? ` · up to ${capability.policy.maxResultRows.toLocaleString()} rows`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.error && <p className="text-xs text-destructive">{session.error}</p>}

            <SheetFooter>
              <Button
                variant="outline"
                onClick={() => {
                  clearInviteHash();
                  setDismissed(true);
                }}
              >
                {isConnected ? "Open workspace" : "Hide"}
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
