import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHours, format, parseISO } from "date-fns";
import { ro as roLocale } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

export type NotificationType =
  | "reminder_1h"
  | "reminder_24h"
  | "reminder_3h"
  | "booking_confirmed"
  | "appointment_cancelled"
  | "general";

export interface AppNotification {
  id: string;
  user_id: string;
  appointment_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  scheduled_for: string;
  sent_at: string | null;
  push_sent: boolean;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  isFallback?: boolean;
}

const LOCAL_READ_STORAGE_PREFIX = "barberpro_read_notifications_";

function getLocalReadIds(userId: string | undefined): Set<string> {
  if (!userId || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${LOCAL_READ_STORAGE_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocalReadIds(userId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${LOCAL_READ_STORAGE_PREFIX}${userId}`, JSON.stringify([...ids]));
  } catch {
    // ignore storage quota errors
  }
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; status?: number };
  const msg = (e.message || "").toLowerCase();
  return (
    e.code === "PGRST205" ||
    e.code === "42P01" ||
    e.status === 404 ||
    msg.includes("could not find the table") ||
    msg.includes("does not exist")
  );
}

export const NOTIFICATIONS_MIGRATION_SQL = `-- Run once in Supabase -> SQL Editor
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('reminder_1h', 'reminder_24h', 'reminder_3h', 'booking_confirmed', 'appointment_cancelled', 'general')),
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
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);

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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);

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

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`;

export function useNotifications() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isRo = language === "ro";
  const queryClient = useQueryClient();
  const [localReadVersion, setLocalReadVersion] = useState(0);

  const query = useQuery({
    queryKey: ["notifications", user?.id, language],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ items: AppNotification[]; tableMissing: boolean }> => {
      if (!user?.id) return { items: [], tableMissing: false };

      const { data: notifRows, error: notifError } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_for", { ascending: false })
        .limit(50);

      const { data: upcomingAppointments } = await supabase
        .from("appointments")
        .select(`
          id,
          start_time,
          status,
          created_at,
          services ( name ),
          specialists ( name )
        `)
        .eq("user_id", user.id)
        .in("status", ["confirmed", "cancelled"])
        .gte("start_time", addHours(new Date(), -24).toISOString())
        .order("start_time", { ascending: true });

      const buildRemindersForAppointments = () => {
        const list: Array<{
          appointment_id: string;
          type: NotificationType;
          title: string;
          message: string;
          scheduled_for: string;
          created_at: string;
        }> = [];

        const nowMs = Date.now();
        for (const apt of upcomingAppointments || []) {
          const start = parseISO(apt.start_time);
          const serviceName =
            (apt.services as { name?: string } | null)?.name || (isRo ? "serviciu" : "service");
          const specialistName =
            (apt.specialists as { name?: string } | null)?.name || null;
          const formattedDate = format(
            start,
            "d MMMM 'la' HH:mm",
            { locale: roLocale }
          );
          const withSpec = specialistName ? (isRo ? ` cu ${specialistName}` : ` with ${specialistName}`) : "";

          if (apt.status === "confirmed") {
            list.push({
              appointment_id: apt.id,
              type: "booking_confirmed",
              title: isRo ? "Programare confirmată" : "Appointment confirmed",
              message: isRo
                ? `Te așteptăm pentru ${serviceName}${withSpec} pe ${formattedDate}.`
                : `Confirmed for ${serviceName}${withSpec} on ${formattedDate}.`,
              scheduled_for: apt.created_at || new Date().toISOString(),
              created_at: apt.created_at || new Date().toISOString(),
            });

            const createdAtMs = apt.created_at ? parseISO(apt.created_at).getTime() : 0;

            const reminder24hDate = addHours(start, -24);
            if (
              start.getTime() > nowMs &&
              (reminder24hDate.getTime() > nowMs || reminder24hDate.getTime() > createdAtMs)
            ) {
              list.push({
                appointment_id: apt.id,
                type: "reminder_24h",
                title: isRo ? "Reminder: Programare mâine (24h)" : "Reminder: Appointment in 24h",
                message: isRo
                  ? `Mai sunt 24 de ore până la ${serviceName}${withSpec} (${formattedDate}).`
                  : `24 hours left until ${serviceName}${withSpec} (${formattedDate}).`,
                scheduled_for: reminder24hDate.toISOString(),
                created_at: apt.created_at || new Date().toISOString(),
              });
            }

            const reminder3hDate = addHours(start, -3);
            if (
              start.getTime() > nowMs &&
              (reminder3hDate.getTime() > nowMs || reminder3hDate.getTime() > createdAtMs)
            ) {
              list.push({
                appointment_id: apt.id,
                type: "reminder_3h",
                title: isRo ? "Reminder: Programare în 3 ore" : "Reminder: Appointment in 3h",
                message: isRo
                  ? `Programarea ta pentru ${serviceName}${withSpec} începe în 3 ore (${formattedDate}).`
                  : `Your appointment for ${serviceName}${withSpec} starts in 3 hours (${formattedDate}).`,
                scheduled_for: reminder3hDate.toISOString(),
                created_at: apt.created_at || new Date().toISOString(),
              });
            }

            const reminder1hDate = addHours(start, -1);
            if (
              start.getTime() > nowMs &&
              (reminder1hDate.getTime() > nowMs || reminder1hDate.getTime() > createdAtMs)
            ) {
              list.push({
                appointment_id: apt.id,
                type: "reminder_1h",
                title: isRo ? "Reminder: Programare în 1 oră" : "Reminder: Appointment in 1h",
                message: isRo
                  ? `Programarea ta pentru ${serviceName}${withSpec} începe într-o oră (${formattedDate}).`
                  : `Your appointment for ${serviceName}${withSpec} starts in 1 hour (${formattedDate}).`,
                scheduled_for: reminder1hDate.toISOString(),
                created_at: apt.created_at || new Date().toISOString(),
              });
            }
          }
        }
        return list;
      };

      if (notifError) {
        if (isMissingTableError(notifError)) {
          const derived = buildRemindersForAppointments();
          const readIds = getLocalReadIds(user.id);
          const items: AppNotification[] = derived.map((d) => {
            const id = `local-${d.appointment_id}-${d.type}`;
            return {
              id,
              user_id: user.id,
              appointment_id: d.appointment_id,
              type: d.type,
              title: d.title,
              message: d.message,
              scheduled_for: d.scheduled_for,
              sent_at: null,
              push_sent: false,
              is_read: readIds.has(id),
              read_at: null,
              created_at: d.created_at,
              isFallback: true,
            };
          });
          return { items, tableMissing: true };
        }
        throw notifError;
      }

      // Sync any upcoming confirmed appointment that doesn't yet have 24h / 3h rows in Supabase
      const existingRows = (notifRows || []) as AppNotification[];
      const existingKeys = new Set(
        existingRows
          .filter((r) => r.appointment_id)
          .map((r) => `${r.appointment_id}:${r.type}`)
      );

      const expected = buildRemindersForAppointments();
      const missingToInsert = expected.filter(
        (e) =>
          !existingKeys.has(`${e.appointment_id}:${e.type}`) &&
          (e.type === "booking_confirmed" || new Date(e.scheduled_for).getTime() > Date.now() - 3600_000)
      );

      if (missingToInsert.length > 0) {
        const { data: inserted, error: upsertError } = await supabase
          .from("notifications")
          .upsert(
            missingToInsert.map((m) => ({
              user_id: user.id,
              appointment_id: m.appointment_id,
              type: m.type,
              title: m.title,
              message: m.message,
              scheduled_for: m.scheduled_for,
            })),
            { onConflict: "appointment_id,type", ignoreDuplicates: true }
          )
          .select("*");

        if (!upsertError && inserted && inserted.length > 0) {
          return {
            items: [...(inserted as AppNotification[]), ...existingRows],
            tableMissing: false,
          };
        }

        if (upsertError) {
          // If DB CHECK constraint doesn't yet include reminder_1h, insert the rest & keep reminder_1h locally
          const non1h = missingToInsert.filter((m) => m.type !== "reminder_1h");
          const only1h = missingToInsert.filter((m) => m.type === "reminder_1h");

          let insertedFallback: AppNotification[] = [];
          if (non1h.length > 0) {
            const { data: retryData } = await supabase
              .from("notifications")
              .upsert(
                non1h.map((m) => ({
                  user_id: user.id,
                  appointment_id: m.appointment_id,
                  type: m.type,
                  title: m.title,
                  message: m.message,
                  scheduled_for: m.scheduled_for,
                })),
                { onConflict: "appointment_id,type", ignoreDuplicates: true }
              )
              .select("*");
            insertedFallback = (retryData as AppNotification[]) || [];
          }

          const readIds = getLocalReadIds(user.id);
          const local1hItems: AppNotification[] = only1h.map((d) => {
            const id = `local-${d.appointment_id}-${d.type}`;
            return {
              id,
              user_id: user.id,
              appointment_id: d.appointment_id,
              type: d.type,
              title: d.title,
              message: d.message,
              scheduled_for: d.scheduled_for,
              sent_at: null,
              push_sent: false,
              is_read: readIds.has(id),
              read_at: null,
              created_at: d.created_at,
              isFallback: true,
            };
          });

          return {
            items: [...local1hItems, ...insertedFallback, ...existingRows],
            tableMissing: false,
          };
        }
      }

      return { items: existingRows, tableMissing: false };
    },
  });

  // Subscribe to Realtime updates when table exists
  useEffect(() => {
    if (!user?.id || query.data?.tableMissing) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, query.data?.tableMissing, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user?.id) return;
      if (notificationId.startsWith("local-")) {
        const set = getLocalReadIds(user.id);
        set.add(notificationId);
        saveLocalReadIds(user.id, set);
        setLocalReadVersion((v) => v + 1);
        return;
      }
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const items = query.data?.items || [];
      if (query.data?.tableMissing) {
        const set = getLocalReadIds(user.id);
        for (const item of items) {
          if (new Date(item.scheduled_for).getTime() <= Date.now()) {
            set.add(item.id);
          }
        }
        saveLocalReadIds(user.id, set);
        setLocalReadVersion((v) => v + 1);
        return;
      }

      const fallbackItems = items.filter(
        (item) =>
          item.isFallback && new Date(item.scheduled_for).getTime() <= Date.now()
      );
      if (fallbackItems.length > 0) {
        const set = getLocalReadIds(user.id);
        for (const item of fallbackItems) {
          set.add(item.id);
        }
        saveLocalReadIds(user.id, set);
        setLocalReadVersion((v) => v + 1);
      }

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .lte("scheduled_for", new Date().toISOString());

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
  });

  const { activeNotifications, scheduledReminders, unreadCount } = useMemo(() => {
    const items = query.data?.items || [];
    const localRead = getLocalReadIds(user?.id);
    const nowMs = Date.now();

    const normalized = items.map((item) =>
      item.isFallback ? { ...item, is_read: localRead.has(item.id) } : item
    );

    const active = normalized
      .filter((n) => new Date(n.scheduled_for).getTime() <= nowMs)
      .sort((a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime());

    const scheduled = normalized
      .filter(
        (n) =>
          (n.type === "reminder_1h" ||
            n.type === "reminder_24h" ||
            n.type === "reminder_3h") &&
          new Date(n.scheduled_for).getTime() > nowMs
      )
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());

    return {
      activeNotifications: active,
      scheduledReminders: scheduled,
      unreadCount: active.filter((n) => !n.is_read).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.items, user?.id, localReadVersion]);

  return {
    activeNotifications,
    scheduledReminders,
    unreadCount,
    tableMissing: query.data?.tableMissing ?? false,
    isLoading: query.isLoading,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllAsRead: markAllAsReadMutation.mutateAsync,
    isMarkingAll: markAllAsReadMutation.isPending,
    refetch: query.refetch,
  };
}
