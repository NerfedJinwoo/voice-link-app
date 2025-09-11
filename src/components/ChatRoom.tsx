import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Phone, Video, Mic, MicOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  is_online: boolean;
  avatar_url?: string;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  message_type: string;
  sender: Profile;
}

interface ChatRoomData {
  id: string;
  name?: string;
  is_group: boolean;
  participants: Profile[];
}

interface ChatRoomProps {
  chatRoom: ChatRoomData;
  onBack: () => void;
  currentUser: User;
}

export const ChatRoom = ({ chatRoom, onBack, currentUser }: ChatRoomProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    subscribeToMessages();
    
    // Mark user as online when entering chat
    updateUserStatus(true);

    return () => {
      // Cleanup subscription and mark user as offline when leaving
      updateUserStatus(false);
    };
  }, [chatRoom.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      // First get messages, then manually fetch profile data for senders
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_room_id', chatRoom.id)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      if (!messagesData || messagesData.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // Get unique sender IDs
      const senderIds = [...new Set(messagesData.map(msg => msg.sender_id))];

      // Fetch profile data for all senders
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', senderIds);

      if (profilesError) throw profilesError;

      // Create a map of user_id to profile
      const profileMap = new Map<string, Profile>();
      profilesData?.forEach(profile => {
        profileMap.set(profile.user_id, profile);
      });

      const formattedMessages = messagesData.map(msg => ({
        id: msg.id,
        content: msg.content,
        created_at: msg.created_at,
        sender_id: msg.sender_id,
        message_type: msg.message_type || 'text',
        sender: profileMap.get(msg.sender_id) || {
          id: '',
          user_id: msg.sender_id,
          username: 'unknown',
          display_name: 'Unknown User',
          is_online: false
        }
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_room_id=eq.${chatRoom.id}`
        },
        async (payload) => {
          // Fetch the complete message with profile data
          const { data: messageData, error: messageError } = await supabase
            .from('messages')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (messageError || !messageData) return;

          // Fetch the sender's profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', messageData.sender_id)
            .single();

          if (!profileError && profileData) {
            const newMessage = {
              id: messageData.id,
              content: messageData.content,
              created_at: messageData.created_at,
              sender_id: messageData.sender_id,
              message_type: messageData.message_type || 'text',
              sender: profileData
            };
            setMessages(prev => [...prev, newMessage]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const updateUserStatus = async (isOnline: boolean) => {
    try {
      const { error } = await supabase.rpc('update_user_status', {
        user_uuid: currentUser.id,
        online_status: isOnline
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          chat_room_id: chatRoom.id,
          sender_id: currentUser.id,
          content: newMessage.trim(),
          message_type: 'text'
        });

      if (error) throw error;

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const getChatRoomDisplayName = () => {
    if (chatRoom.is_group) {
      return chatRoom.name || 'Group Chat';
    }
    
    const otherParticipant = chatRoom.participants.find(p => p.user_id !== currentUser.id);
    return otherParticipant?.display_name || otherParticipant?.username || 'Unknown User';
  };

  const getOtherParticipant = () => {
    return chatRoom.participants.find(p => p.user_id !== currentUser.id);
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleVoiceCall = () => {
    const otherUser = getOtherParticipant();
    toast({
      title: "Voice Call",
      description: `Calling ${otherUser?.display_name || 'user'}... (Feature coming soon)`,
    });
  };

  const handleVideoCall = () => {
    const otherUser = getOtherParticipant();
    toast({
      title: "Video Call",
      description: `Video calling ${otherUser?.display_name || 'user'}... (Feature coming soon)`,
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="p-4 border-b bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={onBack} variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Avatar>
            <AvatarFallback>
              {getChatRoomDisplayName()[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{getChatRoomDisplayName()}</h2>
            {!chatRoom.is_group && (
              <p className="text-sm text-muted-foreground">
                {getOtherParticipant()?.is_online ? (
                  <Badge variant="secondary">Online</Badge>
                ) : (
                  'Last seen recently'
                )}
              </p>
            )}
          </div>
        </div>
        
        {!chatRoom.is_group && (
          <div className="flex gap-2">
            <Button onClick={handleVoiceCall} variant="ghost" size="sm">
              <Phone className="w-4 h-4" />
            </Button>
            <Button onClick={handleVideoCall} variant="ghost" size="sm">
              <Video className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isCurrentUser = message.sender_id === currentUser.id;
            return (
              <div
                key={message.id}
                className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-2 max-w-xs lg:max-w-md ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                  {!isCurrentUser && (
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs">
                        {message.sender.display_name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`px-3 py-2 rounded-lg ${
                      isCurrentUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {!isCurrentUser && !chatRoom.is_group && (
                      <p className="text-xs font-medium mb-1">
                        {message.sender.display_name}
                      </p>
                    )}
                    <p className="text-sm">{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      isCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t bg-card">
        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim()}
            size="sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};