import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Camera, Check, LogOut, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  is_online: boolean;
  avatar_url?: string;
}

interface ProfileEditorProps {
  profile: Profile;
  onBack: () => void;
  onUpdate: (updatedProfile: Profile) => void;
}

export const ProfileEditor = ({ profile, onBack, onUpdate }: ProfileEditorProps) => {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          avatar_url: avatarUrl.trim() || null
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      onUpdate(data);
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });
      onBack();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const isValidUsername = (username: string) => {
    return /^[a-zA-Z0-9_]+$/.test(username) && username.length >= 3;
  };

  const canSave = displayName.trim() && 
                  username.trim() && 
                  isValidUsername(username.trim()) &&
                  (displayName !== profile.display_name || 
                   username !== profile.username || 
                   avatarUrl !== (profile.avatar_url || ''));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              onClick={onBack} 
              variant="ghost" 
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold">Profile</h1>
          </div>
          <Button 
            onClick={handleSave}
            disabled={!canSave || saving}
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/20"
          >
            <Check className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <Avatar className="w-32 h-32">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt="Profile" />
              ) : (
                <AvatarFallback className="text-2xl">
                  {displayName[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              )}
            </Avatar>
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-0 right-0 rounded-full h-10 w-10 hover:scale-110 transition-transform"
              onClick={handleImagePicker}
            >
              <Camera className="w-4 h-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <Input
            placeholder="Avatar URL (optional)"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="max-w-xs text-center"
          />
        </div>

        {/* Form Fields */}
        <div className="space-y-4 max-w-md mx-auto">
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-2">
              Display Name
            </label>
            <Input
              placeholder="Your display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-2">
              Username
            </label>
            <Input
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={!isValidUsername(username.trim()) && username.trim() ? 'border-destructive' : ''}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Username must be at least 3 characters and contain only letters, numbers, and underscores.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="max-w-md mx-auto space-y-3">
          <Button 
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full hover:scale-105 transition-transform"
            size="lg"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          
          <Button 
            onClick={signOut}
            variant="destructive"
            className="w-full hover:scale-105 transition-transform"
            size="lg"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};