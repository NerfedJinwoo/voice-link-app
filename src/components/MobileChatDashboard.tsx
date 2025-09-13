import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Camera, 
  MoreVertical, 
  MessageSquare, 
  Users, 
  Phone, 
  Archive,
  Plus,
  Video
} from 'lucide-react';
import { MobileChatRoom } from './MobileChatRoom';
import { UserSearch } from './UserSearch';
import { ProfileEditor } from './ProfileEditor';
import { FriendsManager } from './FriendsManager';
import { toast } from '@/hooks/use-toast';

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
    message_type?: string;
  };
}

export const MobileChatDashboard = () => {
  const { user, signOut } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoomData[]>([]);
  const [selectedChatRoom, setSelectedChatRoom] = useState<ChatRoomData | null>(null);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showFriendsManager, setShowFriendsManager] = useState(false);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'favourites' | 'groups'>('all');
  const [bottomTab, setBottomTab] = useState<'chats' | 'updates' | 'communities' | 'calls'>('chats');

  useEffect(() => {
    if (user) {
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
    }
  };

  const fetchChatRooms = async () => {
    if (!user) return;
    setLoading(true);

    try {
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

      const userIds = [...new Set(participantsData.map(p => p.user_id))];

      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map<string, Profile>();
      allProfiles?.forEach(profile => {
        profileMap.set(profile.user_id, profile);
      });

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('chat_room_id', roomIds)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

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

      const lastMessageByRoom: { [key: string]: any } = {};
      messages?.forEach(msg => {
        if (!lastMessageByRoom[msg.chat_room_id]) {
          const senderProfile = profileMap.get(msg.sender_id);
          if (senderProfile) {
            lastMessageByRoom[msg.chat_room_id] = {
              content: msg.content,
              created_at: msg.created_at,
              message_type: msg.message_type,
              sender: senderProfile
            };
          }
        }
      });

      const rooms: ChatRoomData[] = participantData.map(p => ({
        id: p.chat_rooms.id,
        name: p.chat_rooms.name,
        is_group: p.chat_rooms.is_group,
        created_at: p.chat_rooms.created_at,
        participants: participantsByRoom[p.chat_room_id] || [],
        last_message: lastMessageByRoom[p.chat_room_id]
      }));

      setChatRooms(rooms);
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
        const existingChatData = chatRooms.find(room => room.id === directChatRoom.id);
        if (existingChatData) {
          setSelectedChatRoom(existingChatData);
        }
      } else {
        const { data: newRoom, error: roomError } = await supabase
          .from('chat_rooms')
          .insert({
            created_by: user.id,
            is_group: false
          })
          .select()
          .single();

        if (roomError) throw roomError;

        const { error: participantError } = await supabase
          .from('chat_participants')
          .insert([
            { chat_room_id: newRoom.id, user_id: user.id },
            { chat_room_id: newRoom.id, user_id: selectedUser.user_id }
          ]);

        if (participantError) throw participantError;

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

  const formatLastMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return 'Yesterday';
    }
  };

  const getLastMessagePreview = (room: ChatRoomData) => {
    if (!room.last_message) return '';
    
    const { message_type, content, sender } = room.last_message;
    const isCurrentUser = sender.user_id === user?.id;
    const senderName = isCurrentUser ? 'You' : sender.display_name;

    if (message_type === 'voice_call') {
      return `📞 ${senderName}: Voice call`;
    } else if (message_type === 'video_call') {
      return `📹 ${senderName}: Video call`;
    }

    return `${senderName}: ${content}`;
  };

  const filteredChatRooms = chatRooms.filter(room => {
    if (searchTerm) {
      const displayName = getChatRoomDisplayName(room).toLowerCase();
      return displayName.includes(searchTerm.toLowerCase());
    }
    
    switch (activeTab) {
      case 'unread':
        // For demo purposes, show rooms with recent activity
        return room.last_message;
      case 'groups':
        return room.is_group;
      case 'favourites':
        return false; // Not implemented yet
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
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

  if (showProfileEditor && userProfile) {
    return (
      <ProfileEditor 
        profile={userProfile}
        onBack={() => setShowProfileEditor(false)}
        onUpdate={(updatedProfile) => {
          setUserProfile(updatedProfile);
          setShowProfileEditor(false);
        }}
      />
    );
  }

  if (showFriendsManager) {
    return (
      <FriendsManager onClose={() => setShowFriendsManager(false)} />
    );
  }

  if (selectedChatRoom) {
    return (
      <MobileChatRoom 
        chatRoom={selectedChatRoom}
        onBack={() => setSelectedChatRoom(null)}
        currentUser={user!}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background dark">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">EchoVerse</h1>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/20">
              <Camera className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setShowProfileEditor(true)}
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Ask Meta AI or Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background/10 border-0 text-primary-foreground placeholder:text-primary-foreground/70"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-card px-4 py-3 flex gap-2 overflow-x-auto border-b">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread', count: filteredChatRooms.filter(r => r.last_message).length },
          { key: 'favourites', label: 'Favourites' },
          { key: 'groups', label: 'Groups' }
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.key as any)}
            className={`whitespace-nowrap ${
              activeTab === tab.key 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count && tab.count > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {tab.count}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Archived Section */}
      <div className="px-4 py-3 border-b flex items-center gap-3 text-muted-foreground">
        <Archive className="w-5 h-5" />
        <span className="font-medium">Archived</span>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto pb-20">
        {filteredChatRooms.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No chats yet</p>
            <p className="text-sm">Start a new conversation!</p>
          </div>
        ) : (
          filteredChatRooms.map((room) => {
            const otherParticipant = room.participants.find(p => p.user_id !== user?.id);
            const hasUnread = Math.random() > 0.7; // Simulate unread messages
            
            return (
              <div
                key={room.id}
                onClick={() => setSelectedChatRoom(room)}
                className="px-4 py-3 border-b border-border/50 hover:bg-accent cursor-pointer transition-all duration-200 active:bg-accent/80 hover:scale-105 animate-fade-in"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      {otherParticipant?.avatar_url ? (
                        <AvatarImage src={otherParticipant.avatar_url} alt="Profile" />
                      ) : (
                        <AvatarFallback className="text-lg font-semibold">
                          {getChatRoomDisplayName(room)[0]?.toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold truncate text-foreground">
                        {getChatRoomDisplayName(room)}
                      </h3>
                      <div className="flex items-center gap-2">
                        {room.last_message && (
                          <span className="text-xs text-muted-foreground">
                            {formatLastMessageTime(room.last_message.created_at)}
                          </span>
                        )}
                        {hasUnread && (
                          <Badge className="bg-primary text-primary-foreground min-w-[20px] h-5 rounded-full text-xs flex items-center justify-center">
                            1
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {room.last_message ? (
                      <div className="flex items-center gap-2">
                        {room.last_message.message_type === 'video_call' && (
                          <Video className="w-4 h-4 text-muted-foreground" />
                        )}
                        {room.last_message.message_type === 'voice_call' && (
                          <Phone className="w-4 h-4 text-muted-foreground" />
                        )}
                        <p className="text-sm text-muted-foreground truncate">
                          {getLastMessagePreview(room)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Tap to chat</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button */}
      <Button
        onClick={() => setShowUserSearch(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg"
        size="sm"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border">
        <div className="flex">
          {[
            { key: 'chats', label: 'Chats', icon: MessageSquare },
            { key: 'updates', label: 'Friends', icon: Users, action: () => setShowFriendsManager(true) },
            { key: 'communities', label: 'Communities', icon: Users },
            { key: 'calls', label: 'Calls', icon: Phone }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = bottomTab === tab.key;
            
            return (
              <button
                key={tab.key}
                onClick={() => tab.action ? tab.action() : setBottomTab(tab.key as any)}
                className={`flex-1 py-3 px-4 flex flex-col items-center gap-1 transition-colors ${
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.label}</span>
                {tab.key === 'chats' && chatRooms.length > 0 && (
                  <div className="absolute top-1 right-1/4 w-2 h-2 bg-primary rounded-full"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};