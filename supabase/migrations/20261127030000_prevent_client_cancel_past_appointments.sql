-- Prevent logged-in clients from cancelling past or already-started appointments at the database level
-- Admins and assigned specialists retain full management permissions.

DROP POLICY IF EXISTS "Users can update their own appointments" ON public.appointments;
CREATE POLICY "Users can update their own appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND start_time > now()
  )
  WITH CHECK (
    auth.uid() = user_id
    AND start_time > now()
    AND status = 'cancelled'
  );

CREATE OR REPLACE FUNCTION public.prevent_client_past_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_staff boolean := false;
BEGIN
  v_caller := auth.uid();

  -- Allow service role / internal migrations without an authenticated user context
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_caller, 'admin') OR EXISTS (
    SELECT 1
    FROM public.specialists s
    WHERE s.id = OLD.specialist_id
      AND s.user_id = v_caller
  ) THEN
    v_is_staff := true;
  END IF;

  IF NOT v_is_staff THEN
    IF OLD.start_time <= now() THEN
      RAISE EXCEPTION 'Această programare nu mai poate fi anulată';
    END IF;

    IF NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.specialist_id IS DISTINCT FROM OLD.specialist_id
      OR NEW.service_id IS DISTINCT FROM OLD.service_id THEN
      RAISE EXCEPTION 'Nu poți modifica detaliile programării';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_client_past_cancellation ON public.appointments;
CREATE TRIGGER trigger_prevent_client_past_cancellation
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_past_cancellation();
