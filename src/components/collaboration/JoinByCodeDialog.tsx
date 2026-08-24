import { useState } from "react";
import {
  buildInviteUrl,
  decodeInvite,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface JoinByCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Joining from a pasted invite, rather than from a link.
 *
 * An invite normally travels as a URL, but the fragment that carries it can be
 * stripped by whatever passed it along, leaving someone on a bare Duck-UI with
 * no way in. Accepting the raw code makes the flow robust against that without
 * moving the payload into a query string, where it would end up in server logs.
 *
 * Deliberately thin: it validates the code and puts it in the URL, so the
 * normal join dialog picks it up and runs exactly the flow a link would.
 */
export default function JoinByCodeDialog({ open, onOpenChange }: JoinByCodeDialogProps) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setChecking(true);
    try {
      // Accept either the whole link or just the code — people paste both.
      const fromUrl = trimmed.includes("#live=")
        ? (trimmed.split("#live=")[1] ?? "").split("&")[0]
        : trimmed;

      const invite = await decodeInvite<ManualInvite>(fromUrl);
      if (!invite || !("offer" in invite)) {
        toast.error("That code isn't readable — ask for a fresh invite");
        return;
      }

      onOpenChange(false);
      setCode("");
      // Assigning the hash raises `hashchange`, which the join dialog watches.
      window.location.hash = buildInviteUrl(fromUrl).split("#")[1] ?? "";
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Join with an invite code</SheetTitle>
          <SheetDescription>
            Paste the link or the code someone sent you. Nothing runs until you confirm.
          </SheetDescription>
        </SheetHeader>

        <Textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Paste the invite link or code"
          className="h-28 font-mono text-xs"
        />

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleJoin} disabled={!code.trim() || checking}>
            Continue
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
