import { useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import type { Profile } from "@/store/types";
import ProfileAvatar from "./ProfileAvatar";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  onSubmit: (password: string) => Promise<void>;
}

export default function PasswordDialog({ open, onOpenChange, profile, onSubmit }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await onSubmit(password);
      setPassword("");
    } catch {
      setError("Incorrect password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword("");
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Unlock Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="xl" />
            <span className="font-medium">{profile.name}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-password">Password</Label>
            <Input
              id="profile-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoFocus
              placeholder="Enter password"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!password.trim() || isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
