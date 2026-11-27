import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface DueNotification {
  id: string;
  user_id: string;
  appointment_id: string | null;
  type: string;
  title: string;
  message: string;
  appointments?: { status: string | null } | null;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface UpcomingAppointmentRow {
  id: string;
  user_id: string | null;
  start_time: string;
  status: string | null;
  services?: { name: string } | null;
  specialists?: { name: string } | null;
}

const REMINDER_TYPES = new Set([
  "reminder_1h",
  "reminder_3h",
  "reminder_24h",
]);

function formatBucharestTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("ro-RO", {
      timeZone: "Europe/Bucharest",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

async function sendToSubscriptions(
  subs: PushSubscriptionRow[],
  payload: string,
  staleIds: string[]
): Promise<number> {
  let delivered = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload
      );
      delivered++;
    } catch (pushErr: unknown) {
      const statusCode =
        typeof pushErr === "object" &&
        pushErr !== null &&
        "statusCode" in pushErr
          ? Number((pushErr as { statusCode: unknown }).statusCode)
          : 0;

      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(sub.id);
      } else {
        console.error("Web push send failed:", pushErr);
      }
    }
  }
  return delivered;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@barberpro.app";
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          error: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secrets",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    let body: { testPush?: boolean } = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) || {};
      } catch {
        body = {};
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const staleSubscriptionIds: string[] = [];

    // Authenticated user-triggered VAPID test push
    if (body.testPush === true) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !anonKey) {
        return new Response(
          JSON.stringify({ error: "Authentication required for test push" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await authClient.auth.getUser();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: userSubs, error: userSubErr } = await supabase
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .eq("user_id", user.id);

      if (userSubErr) throw userSubErr;

      const subs = (userSubs || []) as PushSubscriptionRow[];
      const payload = JSON.stringify({
        title: "MOOD MEN SALON — Test Reminder",
        body: "Notificările Web Push funcționează! Vei primi reminder cu 1 oră înainte de programare.",
        url: "/dashboard",
        tag: `test-${Date.now()}`,
      });

      const sent = await sendToSubscriptions(subs, payload, staleSubscriptionIds);

      if (staleSubscriptionIds.length > 0) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .in("id", staleSubscriptionIds);
      }

      return new Response(
        JSON.stringify({
          test: true,
          subscriptions: subs.length,
          sent,
          removedStale: staleSubscriptionIds.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional cron secret guard when configured in Edge Function secrets
    if (cronSecret) {
      const headerSecret = req.headers.get("x-cron-secret");
      const authHeader = req.headers.get("Authorization") || "";
      if (
        headerSecret !== cronSecret &&
        authHeader !== `Bearer ${cronSecret}` &&
        authHeader !== `Bearer ${serviceRoleKey}`
      ) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const oneHourWindowIso = new Date(now.getTime() + 65 * 60 * 1000).toISOString();

    const { data: dueNotifications, error: notifError } = await supabase
      .from("notifications")
      .select(
        "id, user_id, appointment_id, type, title, message, appointments(status)"
      )
      .eq("push_sent", false)
      .lte("scheduled_for", nowIso)
      .in("type", [
        "reminder_1h",
        "reminder_3h",
        "reminder_24h",
        "booking_confirmed",
        "appointment_cancelled",
      ])
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (notifError) throw notifError;

    const notifications = (dueNotifications || []) as DueNotification[];
    const handled1hAppointmentIds = new Set<string>(
      notifications
        .filter((n) => n.type === "reminder_1h" && n.appointment_id)
        .map((n) => n.appointment_id as string)
    );

    // Fallback scan: catch confirmed appointments starting within ~1 hour that don't yet have a sent reminder_1h
    const { data: upcomingOneHourApts } = await supabase
      .from("appointments")
      .select("id, user_id, start_time, status, services(name), specialists(name)")
      .eq("status", "confirmed")
      .not("user_id", "is", null)
      .gt("start_time", nowIso)
      .lte("start_time", oneHourWindowIso)
      .limit(100);

    const candidate1hApts = ((upcomingOneHourApts || []) as UpcomingAppointmentRow[]).filter(
      (apt) => apt.user_id && !handled1hAppointmentIds.has(apt.id)
    );

    let fallback1hApts: UpcomingAppointmentRow[] = [];
    if (candidate1hApts.length > 0) {
      const { data: existing1hRows } = await supabase
        .from("notifications")
        .select("appointment_id")
        .eq("type", "reminder_1h")
        .in(
          "appointment_id",
          candidate1hApts.map((a) => a.id)
        );

      const existing1hSet = new Set(
        (existing1hRows || [])
          .map((r: { appointment_id: string | null }) => r.appointment_id)
          .filter(Boolean) as string[]
      );

      fallback1hApts = candidate1hApts.filter((a) => !existing1hSet.has(a.id));
    }

    const userIds = [
      ...new Set([
        ...notifications.map((n) => n.user_id),
        ...fallback1hApts.map((a) => a.user_id as string),
      ]),
    ];

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, sent: 0, skipped: 0, fallback1h: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    if (subError) throw subError;

    const subsByUser = new Map<string, PushSubscriptionRow[]>();
    for (const sub of (subscriptions || []) as PushSubscriptionRow[]) {
      const list = subsByUser.get(sub.user_id) || [];
      list.push(sub);
      subsByUser.set(sub.user_id, list);
    }

    let sentCount = 0;
    let skippedCount = 0;
    let fallback1hSent = 0;

    for (const notif of notifications) {
      const isReminder = REMINDER_TYPES.has(notif.type);
      if (
        isReminder &&
        notif.appointments &&
        notif.appointments.status !== "confirmed"
      ) {
        skippedCount++;
        await supabase
          .from("notifications")
          .update({ push_sent: true, sent_at: new Date().toISOString() })
          .eq("id", notif.id);
        continue;
      }

      const userSubs = subsByUser.get(notif.user_id) || [];
      const payload = JSON.stringify({
        title: notif.title,
        body: notif.message,
        url: "/dashboard",
        tag: `notif-${notif.id}`,
      });

      sentCount += await sendToSubscriptions(
        userSubs,
        payload,
        staleSubscriptionIds
      );

      await supabase
        .from("notifications")
        .update({ push_sent: true, sent_at: new Date().toISOString() })
        .eq("id", notif.id);
    }

    for (const apt of fallback1hApts) {
      const userId = apt.user_id as string;
      const serviceName = apt.services?.name || "serviciu";
      const specialistName = apt.specialists?.name;
      const withSpec = specialistName ? ` cu ${specialistName}` : "";
      const formattedTime = formatBucharestTime(apt.start_time);

      const title = "Reminder: Programare în 1 oră";
      const message = `Programarea ta pentru ${serviceName}${withSpec} începe într-o oră (${formattedTime}).`;

      const userSubs = subsByUser.get(userId) || [];
      const payload = JSON.stringify({
        title,
        body: message,
        url: "/dashboard",
        tag: `reminder-1h-${apt.id}`,
      });

      const delivered = await sendToSubscriptions(
        userSubs,
        payload,
        staleSubscriptionIds
      );
      sentCount += delivered;
      fallback1hSent++;

      // Record reminder_1h as sent (no-op if DB constraint hasn't been migrated yet)
      await supabase.from("notifications").upsert(
        {
          user_id: userId,
          appointment_id: apt.id,
          type: "reminder_1h",
          title,
          message,
          scheduled_for: new Date(
            new Date(apt.start_time).getTime() - 60 * 60 * 1000
          ).toISOString(),
          push_sent: true,
          sent_at: new Date().toISOString(),
        },
        { onConflict: "appointment_id,type", ignoreDuplicates: true }
      );
    }

    if (staleSubscriptionIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", staleSubscriptionIds);
    }

    return new Response(
      JSON.stringify({
        processed: notifications.length,
        fallback1h: fallback1hSent,
        sent: sentCount,
        skipped: skippedCount,
        removedStale: staleSubscriptionIds.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-appointment-reminders error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
