-- Allow specialists to update (e.g., cancel) appointments assigned to them
DROP POLICY IF EXISTS "Specialists can update own appointments" ON public.appointments;
CREATE POLICY "Specialists can update own appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
)
WITH CHECK (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
);
