import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  is_online: boolean;
  avatar_url?: string;
}

interface UserSearchProps {
  onBack: () => void;
  onSelectUser: (user: Profile) => void;
}

export const UserSearch = ({ onBack, onSelectUser }: UserSearchProps) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm.trim() || !user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .neq('user_id', user.id) // Exclude current user
        .limit(20);

      if (error) throw error;

      setSearchResults(data || []);
      setSearched(true);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    }
    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  useEffect(() => {
    if (searchTerm.trim()) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
      setSearched(false);
    }
  }, [searchTerm]);

  return (
    <div className="flex h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="p-4 border-b bg-card">
          <div className="flex items-center gap-4">
            <Button onClick={onBack} variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Find Users</h1>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b bg-card">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by username or display name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-10"
              />
            </div>
            <Button 
              onClick={handleSearch} 
              disabled={loading || !searchTerm.trim()}
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!searched && !loading && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Users className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <h2 className="text-lg font-semibold mb-2">Search for Users</h2>
              <p className="text-muted-foreground">
                Enter a username or display name to find users to chat with
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {searched && !loading && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Users className="w-12 h-12 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">
                No users found for "{searchTerm}"
              </p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-4">
                Found {searchResults.length} user{searchResults.length !== 1 ? 's' : ''}
              </p>
              
              <div className="space-y-2">
                {searchResults.map((profile) => (
                  <Card key={profile.id} className="hover:bg-accent transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {profile.display_name[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-medium">{profile.display_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              @{profile.username}
                            </p>
                            {profile.is_online && (
                              <Badge variant="secondary" className="mt-1">
                                Online
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button 
                          onClick={() => onSelectUser(profile)}
                          size="sm"
                        >
                          Start Chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};