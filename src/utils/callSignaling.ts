import { supabase } from '@/integrations/supabase/client';

let invitesChannel: ReturnType<typeof supabase.channel> | null = null;
let subscribed = false;

async function getInvitesChannel() {
  if (!invitesChannel) {
    invitesChannel = supabase.channel('call-invites');
  }
  if (!subscribed) {
    await invitesChannel.subscribe();
    subscribed = true;
  }
  return invitesChannel;
}

export type CallInvitePayload = {
  chatRoomId: string;
  callType: 'voice' | 'video';
  from: string; // user id
  participants: string[]; // all participants including caller
  timestamp?: string;
};

export async function sendCallInvite(recipients: string[], payload: CallInvitePayload) {
  const channel = await getInvitesChannel();

  try {
    for (const to of recipients) {
      await channel.send({
        type: 'broadcast',
        event: 'incoming-call',
        payload: { ...payload, to },
      });
    }
  } catch (e) {
    console.error('Failed to broadcast call invite', e);
  }

  // Fire push notifications via Edge Function (best effort)
  try {
    const title = payload.callType === 'video' ? 'Incoming video call' : 'Incoming voice call';
    const body = 'Tap to answer';
    await supabase.functions.invoke('send-push', {
      body: {
        user_ids: recipients,
        title,
        body,
        tag: `chat-${payload.chatRoomId}`,
      }
    });
  } catch (e) {
    console.warn('Failed to trigger push notification', e);
  }
}

export async function sendCallCancelled(recipients: string[], chatRoomId: string, from: string) {
  const channel = await getInvitesChannel();
  try {
    for (const to of recipients) {
      await channel.send({
        type: 'broadcast',
        event: 'call-cancelled',
        payload: { chatRoomId, from, to },
      });
    }
  } catch (e) {
    console.error('Failed to broadcast call cancellation', e);
  }
}
