import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDuckStore } from "@/store";
import { saveQuery } from "@/services/persistence/repositories/savedQueryRepository";

interface SaveQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  sqlText: string;
}

export default function SaveQueryDialog({
  open,
  onOpenChange,
  defaultName,
  sqlText,
}: SaveQueryDialogProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { currentProfileId, bumpSavedQueriesVersion } = useDuckStore();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription("");
    }
  }, [open, defaultName]);

  const handleSave = async () => {
    if (!name.trim() || !currentProfileId) return;
    setIsSaving(true);
    try {
      await saveQuery(currentProfileId, {
        name: name.trim(),
        sqlText,
        description: description.trim() || undefined,
      });
      bumpSavedQueriesVersion();
      toast.success("Query saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save query");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Query</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query-name">Name</Label>
            <Input
              id="query-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Query name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="query-description">Description (optional)</Label>
            <Textarea
              id="query-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this query do?"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
