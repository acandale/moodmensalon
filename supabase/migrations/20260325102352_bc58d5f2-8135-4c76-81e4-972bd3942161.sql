
-- Update the overlap check function to be per-specialist
CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      AND status != 'cancelled'
      AND specialist_id = NEW.specialist_id
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'This time slot overlaps with an existing appointment';
  END IF;
  RETURN NEW;
END;
$function$;
