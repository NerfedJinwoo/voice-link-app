import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Users, Clock, Check, X, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_online?: boolean;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

interface Friend {
  id: string;
  user1_id: string;
  user2_id: string;
  status: string;
  created_at: string;
  friend?: Profile;
}

export const FriendsManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFriendRequests();
      fetchFriends();
    }
  }, [user]);

  const fetchFriendRequests = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching friend requests:', error);
      return;
    }

    // Fetch sender and receiver profiles separately
    if (data && data.length > 0) {
      const senderIds = [...new Set(data.map(req => req.sender_id))];
      const receiverIds = [...new Set(data.map(req => req.receiver_id))];
      const allUserIds = [...new Set([...senderIds, ...receiverIds])];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', allUserIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const enrichedRequests = data.map(req => ({
        ...req,
        sender: profileMap.get(req.sender_id),
        receiver: profileMap.get(req.receiver_id)
      }));

      setFriendRequests(enrichedRequests);
    } else {
      setFriendRequests([]);
    }
  };

  const fetchFriends = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('friends')
      .select('*')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .eq('status', 'accepted');

    if (error) {
      console.error('Error fetching friends:', error);
      return;
    }

    // Fetch profiles separately
    if (data && data.length > 0) {
      const userIds = [...new Set(data.flatMap(f => [f.user1_id, f.user2_id]))];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Transform data to include the friend profile
      const friendsData = data.map(friendship => ({
        ...friendship,
        friend: profileMap.get(friendship.user1_id === user.id ? friendship.user2_id : friendship.user1_id)
      }));

      setFriends(friendsData);
    } else {
      setFriends([]);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim() || !user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
      .neq('user_id', user.id)
      .limit(10);

    if (error) {
      console.error('Error searching users:', error);
      toast({
        title: "Error",
        description: "Failed to search users",
        variant: "destructive",
      });
    } else {
      setSearchResults(data || []);
    }
    setLoading(false);
  };

  const sendFriendRequest = async (receiverId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('friend_requests')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        status: 'pending'
      });

    if (error) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: "Failed to send friend request",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Friend request sent!",
      });
      setSearchResults(prev => prev.filter(u => u.user_id !== receiverId));
    }
  };

  const respondToFriendRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (!user) return;

    if (action === 'accept') {
      // First update the friend request
      const { error: requestError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (requestError) {
        console.error('Error updating friend request:', requestError);
        return;
      }

      // Then create the friendship
      const request = friendRequests.find(r => r.id === requestId);
      if (request) {
        const { error: friendError } = await supabase
          .from('friends')
          .insert({
            user1_id: request.sender_id,
            user2_id: request.receiver_id,
            status: 'accepted'
          });

        if (friendError) {
          console.error('Error creating friendship:', friendError);
          return;
        }
      }
    } else {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (error) {
        console.error('Error rejecting friend request:', error);
        return;
      }
    }

    toast({
      title: "Success",
      description: `Friend request ${action}ed`,
    });

    fetchFriendRequests();
    if (action === 'accept') {
      fetchFriends();
    }
  };

  const getUserStatus = (userId: string): 'friend' | 'pending_sent' | 'pending_received' | 'none' => {
    if (friends.some(f => f.friend?.user_id === userId)) {
      return 'friend';
    }
    
    const sentRequest = friendRequests.find(r => r.sender_id === user?.id && r.receiver?.user_id === userId);
    if (sentRequest) return 'pending_sent';
    
    const receivedRequest = friendRequests.find(r => r.receiver_id === user?.id && r.sender?.user_id === userId);
    if (receivedRequest) return 'pending_received';
    
    return 'none';
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-4 bg-card border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">Friends</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ×
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="friends" className="h-full flex flex-col">
          <TabsList className="m-4">
            <TabsTrigger value="friends" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Friends ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Requests ({friendRequests.filter(r => r.receiver_id === user?.id).length})
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Add Friends
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <TabsContent value="friends" className="mt-0 space-y-2">
              {friends.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No friends yet</p>
                    <p className="text-sm text-muted-foreground">Add some friends to start chatting!</p>
                  </CardContent>
                </Card>
              ) : (
                friends.map((friendship) => (
                  <Card key={friendship.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground font-semibold">
                            {friendship.friend?.display_name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{friendship.friend?.display_name}</p>
                          <p className="text-sm text-muted-foreground">@{friendship.friend?.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={friendship.friend?.is_online ? "default" : "secondary"}>
                          {friendship.friend?.is_online ? "Online" : "Offline"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="requests" className="mt-0 space-y-2">
              {friendRequests.filter(r => r.receiver_id === user?.id).length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No pending requests</p>
                  </CardContent>
                </Card>
              ) : (
                friendRequests
                  .filter(r => r.receiver_id === user?.id)
                  .map((request) => (
                    <Card key={request.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-primary-foreground font-semibold">
                              {request.sender?.display_name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{request.sender?.display_name}</p>
                            <p className="text-sm text-muted-foreground">@{request.sender?.username}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => respondToFriendRequest(request.id, 'accept')}
                            className="hover:scale-105 transition-transform"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => respondToFriendRequest(request.id, 'reject')}
                            className="hover:scale-105 transition-transform"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </TabsContent>

            <TabsContent value="add" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Find Friends</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by username or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                    />
                    <Button onClick={searchUsers} disabled={loading}>
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {searchResults.map((profile) => {
                      const status = getUserStatus(profile.user_id);
                      return (
                        <Card key={profile.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                                <span className="text-primary-foreground font-semibold">
                                  {profile.display_name?.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{profile.display_name}</p>
                                <p className="text-sm text-muted-foreground">@{profile.username}</p>
                              </div>
                            </div>
                            <div>
                              {status === 'friend' && (
                                <Badge variant="default">Friends</Badge>
                              )}
                              {status === 'pending_sent' && (
                                <Badge variant="secondary">Request Sent</Badge>
                              )}
                              {status === 'pending_received' && (
                                <Badge variant="secondary">Pending</Badge>
                              )}
                              {status === 'none' && (
                                <Button
                                  size="sm"
                                  onClick={() => sendFriendRequest(profile.user_id)}
                                  className="hover:scale-105 transition-transform"
                                >
                                  <UserPlus className="w-4 h-4 mr-2" />
                                  Add Friend
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};