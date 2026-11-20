ALTER TABLE public.appointments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS guest_phone text;

CREATE POLICY "Specialists can create appointments for their clients"
ON public.appointments FOR INSERT TO authenticated
WITH CHECK (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
);