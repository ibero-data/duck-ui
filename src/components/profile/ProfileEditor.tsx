import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ProfileAvatar from "./ProfileAvatar";

const AVATAR_OPTIONS = [
  "logo",
  "\u{1F986}",
  "\u{1F424}",
  "\u{1F985}",
  "\u{1F427}",
  "\u{1F989}",
  "\u{1F426}",
  "\u{1F99C}",
  "\u{1F438}",
  "\u{1F43B}",
  "\u{1F98A}",
  "\u{1F431}",
  "\u{1F436}",
  "\u{1F43C}",
  "\u{1F981}",
  "\u{1F428}",
  "\u{1F42F}",
  "\u{1F430}",
  "\u{1F419}",
  "\u{1F98B}",
  "\u{1F31F}",
];

interface ProfileEditorProps {
  mode: "create" | "edit";
  initialValues?: { name: string; avatarEmoji: string };
  onSave: (values: { name: string; avatarEmoji: string; password?: string }) => void;
  onCancel: () => void;
}

export default function ProfileEditor({
  mode,
  initialValues,
  onSave,
  onCancel,
}: ProfileEditorProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [avatarEmoji, setAvatarEmoji] = useState(initialValues?.avatarEmoji ?? "logo");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);

  const passwordMismatch =
    passwordEnabled && password !== confirmPassword && confirmPassword.length > 0;
  const passwordTooShort = passwordEnabled && password.length > 0 && password.length < 4;

  const isValid =
    name.trim().length > 0 &&
    (!passwordEnabled || (password.length >= 4 && password === confirmPassword));

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      name: name.trim(),
      avatarEmoji,
      ...(passwordEnabled && password ? { password } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="Profile name"
          autoFocus={mode === "create"}
        />
      </div>

      <div className="space-y-2">
        <Label>Avatar</Label>
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-14 w-14 p-0 flex items-center justify-center">
              <ProfileAvatar avatarEmoji={avatarEmoji} size="lg" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-1">
              {AVATAR_OPTIONS.map((option) => (
                <Button
                  key={option}
                  variant={option === avatarEmoji ? "secondary" : "ghost"}
                  className="h-10 w-10 p-0 flex items-center justify-center"
                  onClick={() => {
                    setAvatarEmoji(option);
                    setEmojiOpen(false);
                  }}
                >
                  <ProfileAvatar avatarEmoji={option} size="md" />
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {mode === "create" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="password-toggle">Password Protection</Label>
            <Switch
              id="password-toggle"
              checked={passwordEnabled}
              onCheckedChange={setPasswordEnabled}
            />
          </div>
          {passwordEnabled && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 4 characters"
                />
                {passwordTooShort && (
                  <p className="text-destructive text-sm">Password must be at least 4 characters</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
                {passwordMismatch && (
                  <p className="text-destructive text-sm">Passwords don&apos;t match</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {mode === "create" && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} disabled={!isValid}>
          {mode === "create" ? "Create Profile" : "Save"}
        </Button>
      </div>
    </div>
  );
}
