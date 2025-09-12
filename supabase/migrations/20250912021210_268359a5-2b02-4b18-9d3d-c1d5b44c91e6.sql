-- Fix RLS recursion and allow adding participants when creating chats

-- Ensure RLS is enabled
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- Create helper functions to avoid recursive policy references
CREATE OR REPLACE FUNCTION public.is_user_in_chat(room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants cp
    WHERE cp.chat_room_id = room_id
      AND cp.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_created_by(room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.id = room_id
      AND cr.created_by = auth.uid()
  );
$$;

-- Update chat_participants policies
DROP POLICY IF EXISTS "Users can view participants in their chat rooms" ON public.chat_participants;
CREATE POLICY "Users can view participants in their chat rooms"
ON public.chat_participants
FOR SELECT
TO authenticated
USING (public.is_user_in_chat(chat_room_id));

DROP POLICY IF EXISTS "Users can join chat rooms" ON public.chat_participants;
CREATE POLICY "Users can add participants to their rooms"
ON public.chat_participants
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  OR public.is_user_in_chat(chat_room_id)
  OR public.is_room_created_by(chat_room_id)
);

-- Update chat_rooms policy to use the helper function
DROP POLICY IF EXISTS "Users can view chat rooms they participate in" ON public.chat_rooms;
CREATE POLICY "Users can view chat rooms they participate in"
ON public.chat_rooms
FOR SELECT
TO authenticated
USING (public.is_user_in_chat(id));