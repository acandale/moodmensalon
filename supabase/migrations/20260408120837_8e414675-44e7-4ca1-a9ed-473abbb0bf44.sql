
-- Add specialist_id to blocked_times
ALTER TABLE public.blocked_times ADD COLUMN specialist_id uuid REFERENCES public.specialists(id) ON DELETE CASCADE;

-- Add specialist_id to blocked_days
ALTER TABLE public.blocked_days ADD COLUMN specialist_id uuid REFERENCES public.specialists(id) ON DELETE CASCADE;
