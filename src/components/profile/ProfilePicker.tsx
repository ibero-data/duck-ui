import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Lock, UserPlus, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Profile } from "@/store/types";
import PasswordDialog from "./PasswordDialog";
import ProfileEditor from "./ProfileEditor";
import ProfileAvatar from "./ProfileAvatar";

import Logo from "/logo.png";

interface ProfilePickerProps {
  profiles: Profile[];
  onSelectProfile: (profileId: string, password?: string) => Promise<void>;
  onCreateProfile: (name: string, password?: string, avatarEmoji?: string) => Promise<string>;
}

export default function ProfilePicker({
  profiles,
  onSelectProfile,
  onCreateProfile,
}: ProfilePickerProps) {
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(profiles.length === 0);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectProfile = async (profile: Profile) => {
    if (profile.hasPassword) {
      setSelectedProfile(profile);
      setShowPasswordDialog(true);
    } else {
      setIsLoading(true);
      try {
        await onSelectProfile(profile.id);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!selectedProfile) return;
    await onSelectProfile(selectedProfile.id, password);
    setShowPasswordDialog(false);
  };

  const handleCreate = async (values: { name: string; avatarEmoji: string; password?: string }) => {
    setIsLoading(true);
    try {
      await onCreateProfile(values.name, values.password, values.avatarEmoji);
      setShowCreateDialog(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center max-w-3xl w-full px-6 space-y-8">
        <img src={Logo} alt="Duck-UI" className="h-16 mx-auto" />
        <h1 className="text-3xl font-bold tracking-tight">
          {profiles.length === 0 ? "Welcome to Duck-UI" : "Choose Profile"}
        </h1>

        {profiles.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((profile) => (
                <Card
                  key={profile.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => !isLoading && handleSelectProfile(profile)}
                >
                  <CardContent className="p-6 flex flex-col items-center gap-2">
                    <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="xl" />
                    <span className="font-medium text-lg">{profile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(profile.lastActive), { addSuffix: true })}
                    </span>
                    {profile.hasPassword && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Protected
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading profile...</span>
              </div>
            )}

            <Separator />
          </>
        )}

        <Button variant="outline" onClick={() => setShowCreateDialog(true)} disabled={isLoading}>
          <UserPlus className="h-4 w-4 mr-2" />
          Create New Profile
        </Button>
        <p className="text-xs text-muted-foreground">
          Your profiles are stored locally on your device. Creating a profile does not share any
          data... This application is 100% offline and private by design, it's runs on the client
          side and does not send any data to any server.
        </p>
      </div>

      {selectedProfile && (
        <PasswordDialog
          open={showPasswordDialog}
          onOpenChange={setShowPasswordDialog}
          profile={selectedProfile}
          onSubmit={handlePasswordSubmit}
        />
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Profile</DialogTitle>
          </DialogHeader>
          <ProfileEditor
            mode="create"
            onSave={handleCreate}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
