
-- 1. Add specialist_id to services
ALTER TABLE public.services ADD COLUMN specialist_id uuid REFERENCES public.specialists(id) ON DELETE CASCADE;

-- 2. Migrate data from specialist_services
UPDATE public.services s
SET specialist_id = ss.specialist_id
FROM public.specialist_services ss
WHERE ss.service_id = s.id;

-- 3. Drop specialist_services table
DROP TABLE IF EXISTS public.specialist_services;

-- 4. Add RLS policies for specialists on services
CREATE POLICY "Specialists can manage own services"
ON public.services FOR ALL TO authenticated
USING (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
)
WITH CHECK (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
);

-- 5. Add RLS policies for specialists on specialist_work_hours
CREATE POLICY "Specialists can manage own work hours"
ON public.specialist_work_hours FOR ALL TO authenticated
USING (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
)
WITH CHECK (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
);

-- 6. Add RLS policies for specialists on blocked_times
CREATE POLICY "Specialists can manage own blocked times"
ON public.blocked_times FOR ALL TO authenticated
USING (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
)
WITH CHECK (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
);

-- 7. Add RLS policies for specialists on blocked_days
CREATE POLICY "Specialists can manage own blocked days"
ON public.blocked_days FOR ALL TO authenticated
USING (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
)
WITH CHECK (
  specialist_id IN (SELECT id FROM public.specialists WHERE user_id = auth.uid())
);
