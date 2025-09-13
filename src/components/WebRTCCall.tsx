import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface WebRTCCallProps {
  chatRoomId: string;
  isIncoming?: boolean;
  callType: 'voice' | 'video';
  onEndCall: () => void;
  participants: string[];
}

export const WebRTCCall: React.FC<WebRTCCallProps> = ({
  chatRoomId,
  isIncoming = false,
  callType,
  onEndCall,
  participants
}) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!user) return;

    initializeCall();
    setupSignaling();

    return () => {
      cleanup();
    };
  }, [user, chatRoomId]);

  const initializeCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connections for each participant
      participants.forEach(participantId => {
        if (participantId !== user?.id) {
          createPeerConnection(participantId, stream);
        }
      });

      setIsConnected(true);
    } catch (error) {
      console.error('Error accessing media devices:', error);
      toast({
        title: "Error",
        description: "Could not access camera/microphone",
        variant: "destructive",
      });
      onEndCall();
    }
  };

  const createPeerConnection = (participantId: string, stream: MediaStream) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local stream tracks
    stream.getTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => new Map(prev.set(participantId, remoteStream)));
      
      const videoElement = remoteVideosRef.current.get(participantId);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate,
            from: user?.id,
            to: participantId,
            chatRoomId
          }
        });
      }
    };

    peerConnectionsRef.current.set(participantId, peerConnection);
    return peerConnection;
  };

  const setupSignaling = () => {
    const channel = supabase.channel(`call-${chatRoomId}`)
      .on('broadcast', { event: 'offer' }, ({ payload }) => {
        if (payload.to === user?.id) {
          handleOffer(payload);
        }
      })
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (payload.to === user?.id) {
          handleAnswer(payload);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
        if (payload.to === user?.id) {
          handleIceCandidate(payload);
        }
      })
      .on('broadcast', { event: 'call-ended' }, ({ payload }) => {
        if (payload.chatRoomId === chatRoomId) {
          onEndCall();
        }
      })
      .subscribe();

    channelRef.current = channel;
  };

  const handleOffer = async (payload: any) => {
    const peerConnection = peerConnectionsRef.current.get(payload.from);
    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'answer',
      payload: {
        answer,
        from: user?.id,
        to: payload.from,
        chatRoomId
      }
    });
  };

  const handleAnswer = async (payload: any) => {
    const peerConnection = peerConnectionsRef.current.get(payload.from);
    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
  };

  const handleIceCandidate = async (payload: any) => {
    const peerConnection = peerConnectionsRef.current.get(payload.from);
    if (!peerConnection) return;

    await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
  };

  const startCall = async () => {
    for (const [participantId, peerConnection] of peerConnectionsRef.current) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'offer',
        payload: {
          offer,
          from: user?.id,
          to: participantId,
          chatRoomId
        }
      });
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const endCall = () => {
    // Notify other participants
    channelRef.current?.send({
      type: 'broadcast',
      event: 'call-ended',
      payload: {
        from: user?.id,
        chatRoomId
      }
    });

    cleanup();
    onEndCall();
  };

  const cleanup = () => {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    channelRef.current?.unsubscribe();
    setLocalStream(null);
    setRemoteStreams(new Map());
  };

  useEffect(() => {
    if (!isIncoming && isConnected) {
      startCall();
    }
  }, [isConnected, isIncoming]);

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Call header */}
      <div className="p-4 bg-card border-b">
        <h2 className="text-lg font-semibold text-center">
          {callType === 'video' ? 'Video Call' : 'Voice Call'}
        </h2>
        <p className="text-sm text-muted-foreground text-center">
          {participants.length} participants
        </p>
      </div>

      {/* Video container */}
      <div className="flex-1 relative bg-background">
        {callType === 'video' && (
          <>
            {/* Remote videos */}
            <div className="grid grid-cols-2 gap-2 h-full p-4">
              {Array.from(remoteStreams.entries()).map(([participantId, stream]) => (
                <div key={participantId} className="bg-muted rounded-lg overflow-hidden">
                  <video
                    ref={(el) => {
                      if (el) {
                        remoteVideosRef.current.set(participantId, el);
                        el.srcObject = stream;
                      }
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>

            {/* Local video (picture-in-picture) */}
            <div className="absolute top-4 right-4 w-32 h-24 bg-muted rounded-lg overflow-hidden border-2 border-primary">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          </>
        )}

        {callType === 'voice' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-32 h-32 bg-primary rounded-full flex items-center justify-center mb-4 mx-auto">
                <Phone className="w-16 h-16 text-primary-foreground" />
              </div>
              <p className="text-lg font-semibold">Voice Call</p>
              <p className="text-muted-foreground">Connected to {participants.length} participants</p>
            </div>
          </div>
        )}
      </div>

      {/* Call controls */}
      <div className="p-6 bg-card border-t">
        <div className="flex justify-center space-x-4">
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="lg"
            onClick={toggleMute}
            className="rounded-full w-14 h-14"
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>

          {callType === 'video' && (
            <Button
              variant={isVideoOff ? "destructive" : "secondary"}
              size="lg"
              onClick={toggleVideo}
              className="rounded-full w-14 h-14"
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
          )}

          <Button
            variant="destructive"
            size="lg"
            onClick={endCall}
            className="rounded-full w-14 h-14"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};