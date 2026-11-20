-- Notifications & Web Push Subscriptions for scheduled 24h and 3h appointment reminders
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('reminder_24h', 'reminder_3h', 'booking_confirmed', 'appointment_cancelled', 'general')),
  title text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  push_sent boolean NOT NULL DEFAULT false,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_scheduled
  ON public.notifications (user_id, scheduled_for DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_appointment_type_unique
  ON public.notifications (appointment_id, type)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'specialist'::app_role)
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Web Push Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger to keep 24h & 3h reminders synced automatically on appointment insert/update
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
      AND type IN ('reminder_24h', 'reminder_3h')
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_appointment_notifications ON public.appointments;
CREATE TRIGGER trigger_sync_appointment_notifications
  AFTER INSERT OR UPDATE OF start_time, status, service_id, specialist_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_notifications();
