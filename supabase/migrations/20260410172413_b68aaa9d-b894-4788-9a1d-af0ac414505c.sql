CREATE POLICY "Specialists can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.specialists
    WHERE specialists.user_id = auth.uid()
  )
);