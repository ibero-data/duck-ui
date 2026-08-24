import { useState } from "react";
import { useDuckStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GitFork, Radio, UserMinus, UserPlus, X } from "lucide-react";
import ForkDialog from "./ForkDialog";
import type { SharedCapability } from "@/services/collaboration/capabilities/capability";
import ShareLiveDialog from "./ShareLiveDialog";
import JoinByCodeDialog from "./JoinByCodeDialog";

/**
 * Live-session status in the sidebar rail (§23).
 *
 * Icon-only, like every other control in that column. An earlier version used
 * `hidden lg:inline` for the label, which keys off the VIEWPORT rather than the
 * rail — so on a wide screen the text rendered and spilled out of a 64px
 * column. A container's width is not something a viewport breakpoint can see,
 * so the label belongs in a tooltip.
 *
 * Restrained when idle, which is most of the time: one quiet button, and no
 * collaboration machinery running behind it at all.
 */
export default function SessionIndicator() {
  const session = useDuckStore((s) => s.session);
  const endLiveSession = useDuckStore((s) => s.endLiveSession);
  const revokeCapability = useDuckStore((s) => s.revokeCapability);
  const removeParticipant = useDuckStore((s) => s.removeParticipant);
  const [shareOpen, setShareOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [forking, setForking] = useState<SharedCapability | null>(null);

  const isLive =
    session.status === "connected" ||
    session.status === "awaiting-guest" ||
    session.status === "awaiting-host";

  // The link died after a session was up (network drop, host gone). Manual
  // signaling cannot silently re-pair — a rejoin needs a fresh invite — so be
  // explicit about what happened and what survives: everything local.
  const dropped =
    session.role !== null && (session.status === "disconnected" || session.status === "failed");

  if (dropped) {
    return (
      <>
        <Popover>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mx-auto h-9 w-9"
                    aria-label="Session disconnected"
                  >
                    <Radio className="h-4 w-4 text-destructive" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Session disconnected</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent side="right" align="end" className="w-72 space-y-3">
            <div>
              <p className="text-sm font-medium">The live session dropped</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your workspace, results and any forked tables are untouched — they live in this
                browser. To reconnect,{" "}
                {session.role === "guest"
                  ? "ask the host for a fresh invite"
                  : "send a fresh invite"}
                ; rejoining brings the shared workspace back where it was.
              </p>
            </div>
            <div className="flex gap-2">
              {session.role === "guest" ? (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={async () => {
                    await endLiveSession();
                    setJoinOpen(true);
                  }}
                >
                  Rejoin with a new code
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={async () => {
                    await endLiveSession();
                    setShareOpen(true);
                  }}
                >
                  Start a new session
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void endLiveSession()}>
                Dismiss
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <ShareLiveDialog open={shareOpen} onOpenChange={setShareOpen} />
        <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </>
    );
  }

  if (!isLive) {
    return (
      <>
        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mx-auto h-9 w-9"
                    aria-label="Live session"
                  >
                    <Radio className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Share Live</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenuContent side="right" align="end">
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              Share Live — host a session
            </DropdownMenuItem>
            {/* An invite normally arrives as a link, but a link can be mangled
                by whatever carried it. The code alone is always enough. */}
            <DropdownMenuItem onClick={() => setJoinOpen(true)}>
              Join with an invite code
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ShareLiveDialog open={shareOpen} onOpenChange={setShareOpen} />
        <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </>
    );
  }

  const waiting = session.status === "awaiting-guest" || session.status === "awaiting-host";
  const guests = session.participants.filter((person) => !person.isHost).length;

  return (
    <>
      <Popover>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto h-9 w-9 relative"
                  aria-label="Session details"
                >
                  <Radio className={`h-4 w-4 ${waiting ? "text-amber-500" : "text-emerald-500"}`} />
                  {waiting && (
                    <span className="absolute right-1 top-1 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                    </span>
                  )}
                  {!waiting && guests > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-medium text-black">
                      {guests}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">
              {waiting ? "Waiting to connect" : session.sessionName || "Live session"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PopoverContent side="right" align="end" className="w-72 space-y-3">
          <div>
            <p className="text-sm font-medium">{session.sessionName || "Live session"}</p>
            <p className="text-xs text-muted-foreground">
              {session.role === "host" ? "You're hosting" : `Hosted by ${session.hostName}`}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Participants</p>
            {session.participants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {session.role === "host"
                  ? "Waiting for someone to join…"
                  : "Connecting to the session…"}
              </p>
            ) : (
              session.participants.map((person) => (
                <div key={person.peerId} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: person.color }}
                  />
                  <span className="flex-1 truncate">{person.displayName}</span>
                  {person.isHost && <span className="text-xs text-muted-foreground">host</span>}
                  {session.role === "host" && !person.isHost && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => removeParticipant(person.peerId)}
                      aria-label={`Remove ${person.displayName} from the session`}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {session.sharedCapabilities.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared data</p>
              {session.sharedCapabilities.map((capability) => (
                <div key={capability.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{capability.name}</p>
                    <p className="text-xs text-muted-foreground">Read-only</p>
                  </div>
                  {session.role === "guest" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setForking(capability)}
                      aria-label={`Fork ${capability.name}`}
                    >
                      <GitFork className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {session.role === "host" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => revokeCapability(capability.id)}
                      aria-label={`Withdraw access to ${capability.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {session.role === "host" && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => setShareOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Invite
              </Button>
            )}
            <Button size="sm" variant="destructive" className="flex-1" onClick={endLiveSession}>
              {session.role === "host" ? "End session" : "Leave"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <ShareLiveDialog open={shareOpen} onOpenChange={setShareOpen} />
      {forking && (
        <ForkDialog capability={forking} open onOpenChange={(open) => !open && setForking(null)} />
      )}
    </>
  );
}
