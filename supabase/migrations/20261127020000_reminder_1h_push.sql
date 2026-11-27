-- Add 1-hour appointment reminder support ('reminder_1h') for Web Push & in-app notifications

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname
    INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'notifications'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reminder_1h', 'reminder_24h', 'reminder_3h', 'booking_confirmed', 'appointment_cancelled', 'general'));

-- Keep 24h, 3h, and 1h reminders synced automatically on appointment insert/update
CREATE OR REPLACE FUNCTION public.sync_appointment_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_name text;
  v_specialist_name text;
  v_formatted_time text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
  SELECT name INTO v_specialist_name FROM public.specialists WHERE id = NEW.specialist_id;
  v_formatted_time := to_char(NEW.start_time AT TIME ZONE 'Europe/Bucharest', 'DD.MM.YYYY "la" HH24:MI');

  IF NEW.status = 'cancelled' THEN
    DELETE FROM public.notifications
    WHERE appointment_id = NEW.id
      AND type IN ('reminder_1h', 'reminder_24h', 'reminder_3h')
      AND scheduled_for > now();

    INSERT INTO public.notifications (
      user_id, appointment_id, type, title, message, scheduled_for
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'appointment_cancelled',
      'Programare anulată',
      format('Programarea pentru %s din %s a fost anulată.', COALESCE(v_service_name, 'serviciu'), v_formatted_time),
      now()
    )
    ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO UPDATE
      SET title = EXCLUDED.title,
          message = EXCLUDED.message,
          scheduled_for = EXCLUDED.scheduled_for,
          is_read = false,
          read_at = null;

    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' THEN
    INSERT INTO public.notifications (
      user_id, appointment_id, type, title, message, scheduled_for
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'booking_confirmed',
      'Programare confirmată',
      format(
        'Te așteptăm pentru %s%s pe %s.',
        COALESCE(v_service_name, 'serviciul ales'),
        CASE WHEN v_specialist_name IS NOT NULL THEN ' cu ' || v_specialist_name ELSE '' END,
        v_formatted_time
      ),
      now()
    )
    ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO UPDATE
      SET title = EXCLUDED.title,
          message = EXCLUDED.message;

    IF NEW.start_time - interval '24 hours' > now() THEN
      INSERT INTO public.notifications (
        user_id, appointment_id, type, title, message, scheduled_for
      ) VALUES (
        NEW.user_id,
        NEW.id,
        'reminder_24h',
        'Reminder: Programare mâine (24h)',
        format(
          'Mai sunt 24 de ore până la programarea ta pentru %s%s (%s).',
          COALESCE(v_service_name, 'serviciu'),
          CASE WHEN v_specialist_name IS NOT NULL THEN ' cu ' || v_specialist_name ELSE '' END,
          v_formatted_time
        ),
        NEW.start_time - interval '24 hours'
      )
      ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO UPDATE
        SET title = EXCLUDED.title,
            message = EXCLUDED.message,
            scheduled_for = EXCLUDED.scheduled_for,
            push_sent = false;
    END IF;

    IF NEW.start_time - interval '3 hours' > now() THEN
      INSERT INTO public.notifications (
        user_id, appointment_id, type, title, message, scheduled_for
      ) VALUES (
        NEW.user_id,
        NEW.id,
        'reminder_3h',
        'Reminder: Programare în 3 ore',
        format(
          'Programarea ta pentru %s%s începe în 3 ore (%s).',
          COALESCE(v_service_name, 'serviciu'),
          CASE WHEN v_specialist_name IS NOT NULL THEN ' cu ' || v_specialist_name ELSE '' END,
          v_formatted_time
        ),
        NEW.start_time - interval '3 hours'
      )
      ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO UPDATE
        SET title = EXCLUDED.title,
            message = EXCLUDED.message,
            scheduled_for = EXCLUDED.scheduled_for,
            push_sent = false;
    END IF;

    IF NEW.start_time - interval '1 hour' > now() THEN
      INSERT INTO public.notifications (
        user_id, appointment_id, type, title, message, scheduled_for
      ) VALUES (
        NEW.user_id,
        NEW.id,
        'reminder_1h',
        'Reminder: Programare în 1 oră',
        format(
          'Programarea ta pentru %s%s începe într-o oră (%s).',
          COALESCE(v_service_name, 'serviciu'),
          CASE WHEN v_specialist_name IS NOT NULL THEN ' cu ' || v_specialist_name ELSE '' END,
          v_formatted_time
        ),
        NEW.start_time - interval '1 hour'
      )
      ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO UPDATE
        SET title = EXCLUDED.title,
            message = EXCLUDED.message,
            scheduled_for = EXCLUDED.scheduled_for,
            push_sent = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill 1-hour reminder notifications for already-confirmed upcoming appointments
INSERT INTO public.notifications (
  user_id, appointment_id, type, title, message, scheduled_for
)
SELECT
  a.user_id,
  a.id,
  'reminder_1h',
  'Reminder: Programare în 1 oră',
  format(
    'Programarea ta pentru %s%s începe într-o oră (%s).',
    COALESCE(s.name, 'serviciu'),
    CASE WHEN sp.name IS NOT NULL THEN ' cu ' || sp.name ELSE '' END,
    to_char(a.start_time AT TIME ZONE 'Europe/Bucharest', 'DD.MM.YYYY "la" HH24:MI')
  ),
  a.start_time - interval '1 hour'
FROM public.appointments a
LEFT JOIN public.services s ON s.id = a.service_id
LEFT JOIN public.specialists sp ON sp.id = a.specialist_id
WHERE a.user_id IS NOT NULL
  AND a.status = 'confirmed'
  AND a.start_time - interval '1 hour' > now()
ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO NOTHING;
