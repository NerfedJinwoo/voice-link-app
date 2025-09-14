import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ChatDashboard } from '@/components/ChatDashboard';
import { useNotifications } from '@/hooks/useNotifications';
import { registerServiceWorker, setupPushNotifications } from '@/utils/serviceWorker';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { requestNotificationPermission } = useNotifications();
  const { incomingCall, clearIncomingCall } = useIncomingCalls();
  const [activeCall, setActiveCall] = useState<null | {
    chatRoomId: string;
    callType: 'voice' | 'video';
    participants: string[];
  }>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (user) {
      // Request notification permission when user is authenticated
      if ('Notification' in window && Notification.permission === 'default') {
        requestNotificationPermission();
      }
    }
  }, [user, loading, navigate, requestNotificationPermission]);

  useEffect(() => {
    // Register service worker for persistent notifications
    registerServiceWorker();
  }, []);

  useEffect(() => {
    // Ensure push subscription is created when permission is granted
    if (user && 'Notification' in window && Notification.permission === 'granted') {
      setupPushNotifications();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xl text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  const acceptIncoming = () => {
    if (!incomingCall) return;
    setActiveCall({
      chatRoomId: incomingCall.chatRoomId,
      callType: incomingCall.callType,
      participants: incomingCall.participants,
    });
    clearIncomingCall();
  };

  const declineIncoming = () => {
    clearIncomingCall();
  };

  return (
    <>
      <ChatDashboard />
      {incomingCall && !activeCall && (
        <IncomingCallOverlay
          callerName={''}
          callType={incomingCall.callType}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}
      {activeCall && (
        <WebRTCCall
          chatRoomId={activeCall.chatRoomId}
          isIncoming
          callType={activeCall.callType}
          participants={activeCall.participants}
          onEndCall={() => setActiveCall(null)}
        />
      )}
    </>
  );
};

export default Index;
