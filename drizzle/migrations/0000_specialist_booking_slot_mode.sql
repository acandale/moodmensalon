ALTER TABLE public.specialists ADD COLUMN booking_slot_mode text NOT NULL DEFAULT 'fixed' CHECK (booking_slot_mode IN ('fixed', 'dynamic'));
CREATE FUNCTION public.set_specialist_booking_slot_mode(p_specialist_id uuid, p_mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF p_mode NOT IN ('fixed', 'dynamic') OR p_mode IS NULL THEN RAISE EXCEPTION 'Invalid booking slot mode'; END IF;
 IF NOT (public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'specialist') AND EXISTS (SELECT 1 FROM public.specialists WHERE id = p_specialist_id AND user_id = auth.uid()))) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
 UPDATE public.specialists SET booking_slot_mode = p_mode WHERE id = p_specialist_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Specialist not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_specialist_booking_slot_mode(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_specialist_booking_slot_mode(uuid,text) TO authenticated, service_role;