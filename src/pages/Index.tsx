import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ChatDashboard } from '@/components/ChatDashboard';
import { useNotifications } from '@/hooks/useNotifications';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { requestNotificationPermission } = useNotifications();

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

  return <ChatDashboard />;
};

export default Index;
