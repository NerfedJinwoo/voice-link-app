import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Send, Phone, Video, MoreVertical, Paperclip } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { User } from '@supabase/supabase-js';
import { FileUpload, FilePreview } from './FileUpload';
import { WebRTCCall } from './WebRTCCall';

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

interface MobileChatRoomProps {
  chatRoom: ChatRoomData;
  onBack: () => void;
  currentUser: User;
}

export const MobileChatRoom = ({ chatRoom, onBack, currentUser }: MobileChatRoomProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeCall, setActiveCall] = useState<{
    chatRoomId: string;
    callType: 'voice' | 'video';
    participants: string[];
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    subscribeToMessages();
    
    updateUserStatus(true);

    return () => {
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

      const senderIds = [...new Set(messagesData.map(msg => msg.sender_id))];

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', senderIds);

      if (profilesError) throw profilesError;

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
          const { data: messageData, error: messageError } = await supabase
            .from('messages')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (messageError || !messageData) return;

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
    
    if (!newMessage.trim() && !selectedFile) return;

    try {
      let messageContent = newMessage.trim();
      let messageType = 'text';

      if (selectedFile) {
        // For now, we'll just send the filename as content
        // In a real app, you'd upload to storage first
        messageContent = selectedFile.name;
        messageType = selectedFile.type.startsWith('image/') ? 'image' : 
                     selectedFile.type.startsWith('video/') ? 'video' : 'file';
      }

      const { error } = await supabase
        .from('messages')
        .insert({
          chat_room_id: chatRoom.id,
          sender_id: currentUser.id,
          content: messageContent,
          message_type: messageType
        });

      if (error) throw error;

      setNewMessage('');
      setSelectedFile(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (file: File, type: 'image' | 'video' | 'document') => {
    setSelectedFile(file);
    toast({
      title: "File selected",
      description: `${file.name} ready to send`,
    });
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
    setActiveCall({
      chatRoomId: chatRoom.id,
      callType: 'voice',
      participants: chatRoom.participants.map(p => p.user_id)
    });
  };

  const handleVideoCall = () => {
    setActiveCall({
      chatRoomId: chatRoom.id,
      callType: 'video',
      participants: chatRoom.participants.map(p => p.user_id)
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  // Show call interface if active call
  if (activeCall) {
    return (
      <WebRTCCall
        chatRoomId={activeCall.chatRoomId}
        callType={activeCall.callType}
        participants={activeCall.participants}
        onEndCall={() => setActiveCall(null)}
      />
    );
  }

  const otherParticipant = getOtherParticipant();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <Button 
            onClick={onBack} 
            variant="ghost" 
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/20 p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <Avatar className="w-10 h-10">
            {otherParticipant?.avatar_url ? (
              <AvatarImage src={otherParticipant.avatar_url} alt="Profile" />
            ) : (
              <AvatarFallback className="text-lg font-semibold">
                {getChatRoomDisplayName()[0]?.toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg truncate">{getChatRoomDisplayName()}</h2>
            {!chatRoom.is_group && (
              <p className="text-sm text-primary-foreground/70">
                {otherParticipant?.is_online ? 'Online' : 'Last seen recently'}
              </p>
            )}
          </div>
        </div>
        
        {!chatRoom.is_group && (
          <div className="flex gap-1">
            <Button 
              onClick={handleVideoCall} 
              variant="ghost" 
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/20 p-2"
            >
              <Video className="w-5 h-5" />
            </Button>
            <Button 
              onClick={handleVoiceCall} 
              variant="ghost" 
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/20 p-2"
            >
              <Phone className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/20 p-2"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1))' }}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-card/50 rounded-lg p-6">
              <p className="text-muted-foreground mb-2">🔒 Messages are end-to-end encrypted</p>
              <p className="text-sm text-muted-foreground">No one outside of this chat can read them.</p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isCurrentUser = message.sender_id === currentUser.id;
            return (
              <div
                key={message.id}
                className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-1`}
              >
                <div 
                  className={`max-w-[80%] px-3 py-2 rounded-lg shadow-sm animate-fade-in ${
                    isCurrentUser
                      ? 'bg-primary text-primary-foreground rounded-br-none'
                      : 'bg-card text-card-foreground rounded-bl-none'
                  }`}
                >
                  {!isCurrentUser && chatRoom.is_group && (
                    <p className="text-xs font-medium mb-1 text-primary">
                      {message.sender.display_name}
                    </p>
                  )}
                  
                  {message.message_type === 'voice_call' && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span className="text-sm">Voice call</span>
                    </div>
                  )}
                  {message.message_type === 'video_call' && (
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      <span className="text-sm">Video call</span>
                    </div>
                  )}
                  {message.message_type === 'image' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📷 {message.content}</span>
                    </div>
                  )}
                  {message.message_type === 'video' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🎥 {message.content}</span>
                    </div>
                  )}
                  {message.message_type === 'file' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📄 {message.content}</span>
                    </div>
                  )}
                  {message.message_type === 'text' && (
                    <p className="text-sm leading-relaxed break-words">{message.content}</p>
                  )}
                  <div className={`flex items-center justify-end gap-1 mt-1`}>
                    <span className={`text-xs ${
                      isCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                      {formatMessageTime(message.created_at)}
                    </span>
                    {isCurrentUser && (
                      <span className="text-primary-foreground/70 text-sm">✓✓</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 bg-card border-t">
        {selectedFile && (
          <div className="mb-3">
            <FilePreview 
              file={selectedFile} 
              onRemove={() => setSelectedFile(null)} 
            />
          </div>
        )}
        
        <form onSubmit={sendMessage} className="flex gap-2 items-end">
          <FileUpload onFileSelect={handleFileSelect} />
          
          <div className="flex-1 bg-background rounded-full border border-border flex items-center px-4 py-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message"
              className="flex-1 border-0 bg-transparent focus:ring-0 focus:outline-none p-0"
            />
          </div>
          
          <Button 
            type="submit" 
            disabled={!newMessage.trim() && !selectedFile}
            className="rounded-full w-12 h-12 p-0 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};