import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, MessageSquare } from 'lucide-react';

interface IncomingCallOverlayProps {
  callerName: string;
  callerAvatar?: string;
  callType: 'voice' | 'video';
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallOverlay: React.FC<IncomingCallOverlayProps> = ({
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
}) => {
  return (
    <div className="fixed inset-0 z-[60] bg-primary text-primary-foreground flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Avatar className="w-24 h-24 ring-2 ring-primary-foreground/40">
          {callerAvatar ? (
            <AvatarImage src={callerAvatar} alt={callerName} />
          ) : (
            <AvatarFallback className="text-2xl">
              {callerName?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="text-center">
          <h2 className="text-2xl font-semibold">{callerName}</h2>
          <p className="text-primary-foreground/80 capitalize">
            {callType} call
          </p>
        </div>
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-8">
        <Button
          onClick={onDecline}
          variant="destructive"
          className="rounded-full w-14 h-14"
        >
          <PhoneOff className="w-6 h-6" />
        </Button>
        <Button
          onClick={onAccept}
          className="rounded-full w-16 h-16 shadow-lg"
        >
          <Phone className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
};

export default IncomingCallOverlay;
