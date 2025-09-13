import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export const useNotifications = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Subscribe to new messages for the current user
    const channel = supabase
      .channel('user_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const messageData = payload.new;
          
          // Skip if it's the current user's message
          if (messageData.sender_id === user.id) return;

          // Check if the current user is a participant in this chat room
          const { data: isParticipant } = await supabase
            .from('chat_participants')
            .select('*')
            .eq('chat_room_id', messageData.chat_room_id)
            .eq('user_id', user.id)
            .single();

          if (!isParticipant) return;

          // Get sender's profile
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', messageData.sender_id)
            .single();

          if (!senderProfile) return;

          // Show browser notification if permission granted
          if (
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification(`New message from ${senderProfile.display_name}`, {
              body: messageData.content,
              icon: senderProfile.avatar_url || '/placeholder.svg',
              badge: '/placeholder.svg',
              tag: `chat-${messageData.chat_room_id}`,
              requireInteraction: true,
              silent: false,
            });
          }

          // Show toast notification if page is visible
          if (!document.hidden) {
            toast({
              title: `New message from ${senderProfile.display_name}`,
              description: messageData.content,
            });
          }
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast({
        title: "Notifications not supported",
        description: "Your browser doesn't support notifications",
        variant: "destructive",
      });
      return false;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      toast({
        title: "Notifications enabled",
        description: "You'll now receive notifications for new messages",
      });
      return true;
    } else {
      toast({
        title: "Notifications disabled",
        description: "You can enable them later in your browser settings",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    requestNotificationPermission,
  };
};