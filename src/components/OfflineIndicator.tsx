import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useEffect, useState } from 'react';

export const OfflineIndicator = () => {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium transition-all ${
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-yellow-500 text-yellow-950'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4" />
          Back online - syncing data...
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          You're offline - using cached data
        </>
      )}
    </div>
  );
};
