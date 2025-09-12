-- Ensure chat_rooms insert works for signed-in users
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create chat rooms" ON public.chat_rooms;
CREATE POLICY "Users can create chat rooms"
ON public.chat_rooms
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Optional: also allow selecting own newly created rows explicitly (already handled but safe)
DROP POLICY IF EXISTS "Users can view chat rooms they participate in" ON public.chat_rooms;
CREATE POLICY "Users can view chat rooms they participate in"
ON public.chat_rooms
FOR SELECT
TO authenticated
USING (public.is_user_in_chat(id) OR created_by = auth.uid());