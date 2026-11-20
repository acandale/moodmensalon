
CREATE TABLE public.blocked_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.blocked_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view blocked days"
  ON public.blocked_days FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert blocked days"
  ON public.blocked_days FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update blocked days"
  ON public.blocked_days FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete blocked days"
  ON public.blocked_days FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));
