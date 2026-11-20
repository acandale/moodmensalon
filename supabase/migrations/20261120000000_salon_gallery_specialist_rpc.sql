-- Allow both admins and specialists to update salon gallery media via a narrowly scoped RPC
CREATE OR REPLACE FUNCTION public.save_salon_gallery_media(p_hero_image_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
    OR EXISTS (SELECT 1 FROM public.specialists WHERE user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to update salon gallery';
  END IF;

  SELECT id INTO v_settings_id FROM public.salon_settings LIMIT 1;
  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'No salon settings row found';
  END IF;

  UPDATE public.salon_settings
  SET hero_image_url = p_hero_image_url
  WHERE id = v_settings_id;
END;
$$;
