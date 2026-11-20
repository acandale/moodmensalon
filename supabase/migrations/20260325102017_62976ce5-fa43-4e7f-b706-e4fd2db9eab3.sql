
-- Create specialists table
CREATE TABLE public.specialists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

-- Anyone can view active specialists
CREATE POLICY "Anyone can view specialists" ON public.specialists FOR SELECT USING (true);
-- Admins can manage specialists
CREATE POLICY "Admins can manage specialists" ON public.specialists FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Create specialist_services junction table
CREATE TABLE public.specialist_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  specialist_id UUID NOT NULL REFERENCES public.specialists(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  UNIQUE(specialist_id, service_id)
);

ALTER TABLE public.specialist_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view specialist services" ON public.specialist_services FOR SELECT USING (true);
CREATE POLICY "Admins can manage specialist services" ON public.specialist_services FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Create specialist_work_hours table
CREATE TABLE public.specialist_work_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  specialist_id UUID NOT NULL REFERENCES public.specialists(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  is_working_day BOOLEAN DEFAULT true,
  UNIQUE(specialist_id, day_of_week)
);

ALTER TABLE public.specialist_work_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view specialist work hours" ON public.specialist_work_hours FOR SELECT USING (true);
CREATE POLICY "Admins can manage specialist work hours" ON public.specialist_work_hours FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Add specialist_id to appointments (nullable for backward compat)
ALTER TABLE public.appointments ADD COLUMN specialist_id UUID REFERENCES public.specialists(id);
