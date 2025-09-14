import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type IncomingCall = {
  chatRoomId: string;
  callType: 'voice' | 'video';
  from: string;
  to: string;
  participants: string[];
};

export const useIncomingCalls = () => {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('call-invites')
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        if (payload.to === user.id) {
          setIncomingCall({
            chatRoomId: payload.chatRoomId,
            callType: payload.callType,
            from: payload.from,
            to: payload.to,
            participants: payload.participants || [],
          });
        }
      })
      .on('broadcast', { event: 'call-cancelled' }, ({ payload }) => {
        if (payload.to === user.id && incomingCall?.chatRoomId === payload.chatRoomId) {
          setIncomingCall(null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { incomingCall, clearIncomingCall: () => setIncomingCall(null) };
};
