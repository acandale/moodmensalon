-- Harden appointment overlap trigger to lock per specialist, allow cancellations,
-- and reject overlaps against both active appointments and specialist blocked_times.
CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent bookings for the same specialist within the transaction
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(NEW.specialist_id::text, 'global')));

  IF EXISTS (
    SELECT 1
    FROM public.appointments
    WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      AND status != 'cancelled'
      AND specialist_id IS NOT DISTINCT FROM NEW.specialist_id
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'This time slot overlaps with an existing appointment';
  END IF;

  IF NEW.specialist_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.blocked_times
    WHERE specialist_id = NEW.specialist_id
      AND end_time > start_time
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'This time slot overlaps with a blocked interval';
  END IF;

  RETURN NEW;
END;
$function$;
