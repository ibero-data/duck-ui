import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, Trash2, UserPlus } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { useDuckStore } from "@/store";
import { setSetting } from "@/services/persistence/repositories/settingsRepository";
import { toast } from "sonner";
import ProfileEditor from "@/components/profile/ProfileEditor";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import PasswordDialog from "@/components/profile/PasswordDialog";
import type { Profile } from "@/store/types";

export default function SettingsTab() {
  const { theme, setTheme } = useTheme();
  const {
    currentProfile,
    currentProfileId,
    profiles,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
  } = useDuckStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<Profile | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingDeleteTargetId, setPendingDeleteTargetId] = useState<string | null>(null);

  const handleProfileSave = async (values: { name: string; avatarEmoji: string }) => {
    try {
      await updateProfile({ name: values.name, avatarEmoji: values.avatarEmoji });
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    }
  };

  const handleThemeChange = async (value: string) => {
    setTheme(value as "dark" | "light" | "system");
    if (currentProfileId) {
      try {
        await setSetting(currentProfileId, "theme", "mode", JSON.stringify(value));
      } catch {
        // Non-critical, theme still applied in-memory
      }
    }
  };

  const handleDeleteProfile = async () => {
    if (!currentProfileId || profiles.length <= 1) return;
    const otherProfile = profiles.find((p) => p.id !== currentProfileId);
    if (!otherProfile) return;

    if (otherProfile.hasPassword) {
      setPendingDeleteTargetId(currentProfileId);
      setSwitchTarget(otherProfile);
      setShowPasswordDialog(true);
    } else {
      setIsDeleting(true);
      try {
        const deletingId = currentProfileId;
        await switchProfile(otherProfile.id);
        await deleteProfile(deletingId);
        toast.success("Profile deleted");
      } catch {
        toast.error("Failed to delete profile");
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleCreateProfile = async (values: {
    name: string;
    avatarEmoji: string;
    password?: string;
  }) => {
    try {
      await createProfile(values.name, values.password, values.avatarEmoji);
      setShowCreateDialog(false);
      toast.success(`Profile "${values.name}" created`);
    } catch {
      toast.error("Failed to create profile");
    }
  };

  const handleSwitchProfile = (profile: Profile) => {
    if (profile.hasPassword) {
      setSwitchTarget(profile);
      setShowPasswordDialog(true);
    } else {
      switchProfile(profile.id);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!switchTarget) return;
    try {
      if (pendingDeleteTargetId) {
        setIsDeleting(true);
        await switchProfile(switchTarget.id, password);
        await deleteProfile(pendingDeleteTargetId);
        setPendingDeleteTargetId(null);
        toast.success("Profile deleted");
        setIsDeleting(false);
      } else {
        await switchProfile(switchTarget.id, password);
      }
      setShowPasswordDialog(false);
    } catch {
      toast.error(pendingDeleteTargetId ? "Failed to delete profile" : "Incorrect password");
      setPendingDeleteTargetId(null);
      setIsDeleting(false);
    }
  };

  const otherProfiles = profiles.filter((p) => p.id !== currentProfileId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-6 py-3 border-b">
        <Settings className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Settings</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6">
          <Tabs defaultValue="profile">
            <TabsList className="mb-6">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-0 space-y-6">
              {/* Edit Current Profile */}
              {currentProfile && (
                <ProfileEditor
                  mode="edit"
                  initialValues={{
                    name: currentProfile.name,
                    avatarEmoji: currentProfile.avatarEmoji,
                  }}
                  onSave={handleProfileSave}
                  onCancel={() => {}}
                />
              )}

              <Separator />

              {/* Profiles Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Profiles</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateDialog(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create New Profile
                  </Button>
                </div>

                <div className="space-y-2">
                  {otherProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => handleSwitchProfile(profile)}
                    >
                      <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="md" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{profile.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Switch</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Danger Zone */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={profiles.length <= 1 || isDeleting}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Profile
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{currentProfile?.name}&quot; and all
                        associated data including saved connections, query history, and AI
                        configurations. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteProfile}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {profiles.length <= 1 && (
                  <p className="text-xs text-muted-foreground">
                    Cannot delete the only profile. Create another profile first.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="general" className="mt-0 space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Theme</Label>
                <RadioGroup value={theme} onValueChange={handleThemeChange}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="theme-dark" />
                    <Label htmlFor="theme-dark">Dark</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="theme-light" />
                    <Label htmlFor="theme-light">Light</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="theme-system" />
                    <Label htmlFor="theme-system">System</Label>
                  </div>
                </RadioGroup>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Create Profile Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Profile</DialogTitle>
          </DialogHeader>
          <ProfileEditor
            mode="create"
            onSave={handleCreateProfile}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {switchTarget && (
        <PasswordDialog
          open={showPasswordDialog}
          onOpenChange={setShowPasswordDialog}
          profile={switchTarget}
          onSubmit={handlePasswordSubmit}
        />
      )}
    </div>
  );
}
