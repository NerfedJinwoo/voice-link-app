-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('chat-files', 'chat-files', true),
  ('avatars', 'avatars', true);

-- Create friends table
CREATE TABLE public.friends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id != user2_id)
);

-- Enable RLS on friends table
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Create friend request table
CREATE TABLE public.friend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id),
  CHECK (sender_id != receiver_id)
);

-- Enable RLS on friend_requests table
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Create function to check if users are friends
CREATE OR REPLACE FUNCTION public.are_users_friends(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friends 
    WHERE (
      (user1_id = are_users_friends.user1_id AND user2_id = are_users_friends.user2_id) OR
      (user1_id = are_users_friends.user2_id AND user2_id = are_users_friends.user1_id)
    ) AND status = 'accepted'
  );
$$;

-- RLS policies for friends table
CREATE POLICY "Users can view their friendships" 
ON public.friends 
FOR SELECT 
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create friendships" 
ON public.friends 
FOR INSERT 
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update their friendships" 
ON public.friends 
FOR UPDATE 
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- RLS policies for friend_requests table
CREATE POLICY "Users can view their friend requests" 
ON public.friend_requests 
FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send friend requests" 
ON public.friend_requests 
FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their friend requests" 
ON public.friend_requests 
FOR UPDATE 
USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

-- Update messages RLS policy to require friendship
DROP POLICY "Users can send messages to their chat rooms" ON public.messages;
CREATE POLICY "Friends can send messages to their chat rooms" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id AND 
  EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_room_id = messages.chat_room_id 
    AND cp.user_id = auth.uid()
  ) AND
  -- For group chats, allow if user is participant
  (EXISTS (
    SELECT 1 FROM chat_rooms cr 
    WHERE cr.id = messages.chat_room_id AND cr.is_group = true
  ) OR
  -- For direct chats, require friendship
  EXISTS (
    SELECT 1 FROM chat_rooms cr 
    JOIN chat_participants cp1 ON cp1.chat_room_id = cr.id 
    JOIN chat_participants cp2 ON cp2.chat_room_id = cr.id 
    WHERE cr.id = messages.chat_room_id 
    AND cr.is_group = false
    AND cp1.user_id = auth.uid()
    AND cp2.user_id != auth.uid()
    AND public.are_users_friends(cp1.user_id, cp2.user_id)
  ))
);

-- Storage policies for chat files
CREATE POLICY "Users can upload files to chat-files bucket" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view files in chat-files bucket" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'chat-files');

CREATE POLICY "Users can update their files in chat-files bucket" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their files in chat-files bucket" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for avatars
CREATE POLICY "Users can upload their avatar" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'avatars');

CREATE POLICY "Users can update their avatar" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add triggers for updated_at
CREATE TRIGGER update_friends_updated_at
BEFORE UPDATE ON public.friends
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_friend_requests_updated_at
BEFORE UPDATE ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();