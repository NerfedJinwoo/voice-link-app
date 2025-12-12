import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Plus } from 'lucide-react';
import { ChatRoom } from './ChatRoom';
import { UserSearch } from './UserSearch';
import { MobileChatDashboard } from './MobileChatDashboard';
import { toast } from '@/hooks/use-toast';
import { cache, CACHE_KEYS } from '@/utils/cache';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  is_online: boolean;
  avatar_url?: string;
}

interface ChatRoomData {
  id: string;
  name?: string;
  is_group: boolean;
  created_at: string;
  participants: Profile[];
  last_message?: {
    content: string;
    created_at: string;
    sender: Profile;
  };
}

export const ChatDashboard = () => {
  const { user, signOut } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoomData[]>([]);
  const [selectedChatRoom, setSelectedChatRoom] = useState<ChatRoomData | null>(null);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      // Load cached data immediately for faster initial render
      const cachedProfile = cache.get<Profile>(cache.userKey(user.id, CACHE_KEYS.PROFILE));
      const cachedRooms = cache.get<ChatRoomData[]>(cache.userKey(user.id, CACHE_KEYS.CHAT_ROOMS));
      
      if (cachedProfile) setUserProfile(cachedProfile);
      if (cachedRooms) {
        setChatRooms(cachedRooms);
        setLoading(false);
      }
      
      // Fetch fresh data in background
      fetchUserProfile();
      fetchChatRooms();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setUserProfile(data);
      // Cache profile for 60 minutes
      cache.set(cache.userKey(user.id, CACHE_KEYS.PROFILE), data, 60);
    }
  };

  const fetchChatRooms = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Get chat rooms where user is a participant
      const { data: participantData, error: participantError } = await supabase
        .from('chat_participants')
        .select(`
          chat_room_id,
          chat_rooms!inner (
            id,
            name,
            is_group,
            created_at
          )
        `)
        .eq('user_id', user.id);

      if (participantError) throw participantError;

      if (!participantData || participantData.length === 0) {
        setChatRooms([]);
        setLoading(false);
        return;
      }

      const roomIds = participantData.map(p => p.chat_room_id);

      // Get all participants for these rooms
      const { data: participantsData, error: participantsError } = await supabase
        .from('chat_participants')
        .select('*')
        .in('chat_room_id', roomIds);

      if (participantsError) throw participantsError;

      if (!participantsData || participantsData.length === 0) {
        setChatRooms([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs from participants
      const userIds = [...new Set(participantsData.map(p => p.user_id))];

      // Fetch all profiles for participants
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Create a map of user_id to profile
      const profileMap = new Map<string, Profile>();
      allProfiles?.forEach(profile => {
        profileMap.set(profile.user_id, profile);
      });

      // Get latest messages for each room
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('chat_room_id', roomIds)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      // Group participants by room
      const participantsByRoom: { [key: string]: Profile[] } = {};
      participantsData.forEach(p => {
        if (!participantsByRoom[p.chat_room_id]) {
          participantsByRoom[p.chat_room_id] = [];
        }
        const profile = profileMap.get(p.user_id);
        if (profile) {
          participantsByRoom[p.chat_room_id].push(profile);
        }
      });

      // Get last message for each room
      const lastMessageByRoom: { [key: string]: any } = {};
      messages?.forEach(msg => {
        if (!lastMessageByRoom[msg.chat_room_id]) {
          const senderProfile = profileMap.get(msg.sender_id);
          if (senderProfile) {
            lastMessageByRoom[msg.chat_room_id] = {
              content: msg.content,
              created_at: msg.created_at,
              sender: senderProfile
            };
          }
        }
      });

      // Combine data
      const rooms: ChatRoomData[] = participantData.map(p => ({
        id: p.chat_rooms.id,
        name: p.chat_rooms.name,
        is_group: p.chat_rooms.is_group,
        created_at: p.chat_rooms.created_at,
        participants: participantsByRoom[p.chat_room_id] || [],
        last_message: lastMessageByRoom[p.chat_room_id]
      }));

      setChatRooms(rooms);
      // Cache chat rooms for 15 minutes
      if (user) {
        cache.set(cache.userKey(user.id, CACHE_KEYS.CHAT_ROOMS), rooms, 15);
      }
    } catch (error) {
      console.error('Error fetching chat rooms:', error);
      toast({
        title: "Error",
        description: "Failed to load chat rooms",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const getChatRoomDisplayName = (room: ChatRoomData) => {
    if (room.is_group) {
      return room.name || 'Group Chat';
    }
    
    const otherParticipant = room.participants.find(p => p.user_id !== user?.id);
    return otherParticipant?.display_name || otherParticipant?.username || 'Unknown User';
  };

  const handleNewChat = async (selectedUser: Profile) => {
    if (!user) return;

    try {
      // Check if a direct chat already exists between these users
      const { data: existingRoom, error: checkError } = await supabase
        .from('chat_participants')
        .select(`
          chat_room_id,
          chat_rooms!inner (
            id,
            is_group
          )
        `)
        .eq('user_id', user.id);

      if (checkError) throw checkError;

      // Filter for rooms that are not groups and contain both users
      let directChatRoom = null;
      if (existingRoom) {
        for (const room of existingRoom) {
          if (!room.chat_rooms.is_group) {
            const { data: roomParticipants } = await supabase
              .from('chat_participants')
              .select('user_id')
              .eq('chat_room_id', room.chat_room_id);

            const participantIds = roomParticipants?.map(p => p.user_id) || [];
            if (participantIds.includes(selectedUser.user_id) && participantIds.length === 2) {
              directChatRoom = room.chat_rooms;
              break;
            }
          }
        }
      }

      if (directChatRoom) {
        // Open existing chat
        const existingChatData = chatRooms.find(room => room.id === directChatRoom.id);
        if (existingChatData) {
          setSelectedChatRoom(existingChatData);
        }
      } else {
        // Create new chat room
        const { data: newRoom, error: roomError } = await supabase
          .from('chat_rooms')
          .insert({
            created_by: user.id,
            is_group: false
          })
          .select()
          .single();

        if (roomError) throw roomError;

        // Add participants
        const { error: participantError } = await supabase
          .from('chat_participants')
          .insert([
            { chat_room_id: newRoom.id, user_id: user.id },
            { chat_room_id: newRoom.id, user_id: selectedUser.user_id }
          ]);

        if (participantError) throw participantError;

        // Refresh chat rooms
        await fetchChatRooms();
        
        toast({
          title: "Chat created",
          description: `Started chat with ${selectedUser.display_name || selectedUser.username}`,
        });
      }
      
      setShowUserSearch(false);
    } catch (error) {
      console.error('Error creating chat:', error);
      toast({
        title: "Error",
        description: "Failed to create chat",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading your chats...</p>
        </div>
      </div>
    );
  }

  if (showUserSearch) {
    return (
      <UserSearch 
        onBack={() => setShowUserSearch(false)}
        onSelectUser={handleNewChat}
      />
    );
  }

  if (selectedChatRoom) {
    return (
      <ChatRoom 
        chatRoom={selectedChatRoom}
        onBack={() => setSelectedChatRoom(null)}
        currentUser={user!}
      />
    );
  }

  // Check if mobile view
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    return <MobileChatDashboard />;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-80 border-r bg-card">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>
                  {userProfile?.display_name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold">{userProfile?.display_name}</h2>
                <p className="text-sm text-muted-foreground">@{userProfile?.username}</p>
              </div>
            </div>
            <Button onClick={signOut} variant="ghost" size="sm">
              Sign Out
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowUserSearch(true)}
              className="flex-1"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>
        </div>

        {/* Chat List */}
        <div className="overflow-y-auto">
          {chatRooms.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No chats yet</p>
              <p className="text-sm">Start a new conversation!</p>
            </div>
          ) : (
            chatRooms.map((room) => (
              <div
                key={room.id}
                onClick={() => setSelectedChatRoom(room)}
                className="p-4 border-b hover:bg-accent cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {getChatRoomDisplayName(room)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate">
                        {getChatRoomDisplayName(room)}
                      </h3>
                      {room.last_message && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(room.last_message.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {room.last_message && (
                      <p className="text-sm text-muted-foreground truncate">
                        {room.last_message.sender.username}: {room.last_message.content}
                      </p>
                    )}
                    {!room.is_group && room.participants.some(p => p.user_id !== user?.id && p.is_online) && (
                      <Badge variant="secondary" className="mt-1">
                        Online
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center">
          <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
          <h2 className="text-xl font-semibold mb-2">Welcome to Voice Link</h2>
          <p className="text-muted-foreground">Select a chat to start messaging</p>
        </div>
      </div>
    </div>
  );
};