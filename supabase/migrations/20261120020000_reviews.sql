-- Client reviews tied to confirmed/completed appointments
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  specialist_id uuid REFERENCES public.specialists(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL DEFAULT '',
  salon_reply text,
  replied_at timestamptz,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_published_created
  ON public.reviews (is_published, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON public.reviews (user_id);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view published reviews" ON public.reviews;
CREATE POLICY "Anyone can view published reviews"
  ON public.reviews FOR SELECT
  USING (
    is_published = true
    OR auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  );

DROP POLICY IF EXISTS "Clients can create review for own appointment" ON public.reviews;
CREATE POLICY "Clients can create review for own appointment"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id = appointment_id
        AND a.user_id = auth.uid()
        AND a.status <> 'cancelled'
    )
  );

DROP POLICY IF EXISTS "Authors and staff can update reviews" ON public.reviews;
CREATE POLICY "Authors and staff can update reviews"
  ON public.reviews FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  );

DROP POLICY IF EXISTS "Authors and admins can delete reviews" ON public.reviews;
CREATE POLICY "Authors and admins can delete reviews"
  ON public.reviews FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP TRIGGER IF EXISTS update_reviews_updated_at ON public.reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
