import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@barberpro.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          error: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secrets",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();

    const { data: dueNotifications, error: notifError } = await supabase
      .from("notifications")
      .select("id, user_id, title, message, type")
      .eq("push_sent", false)
      .lte("scheduled_for", nowIso)
      .in("type", ["reminder_24h", "reminder_3h", "booking_confirmed", "appointment_cancelled"])
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (notifError) throw notifError;
    if (!dueNotifications || dueNotifications.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userIds = [...new Set(dueNotifications.map((n) => n.user_id))];
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    if (subError) throw subError;

    const subsByUser = new Map<string, typeof subscriptions>();
    for (const sub of subscriptions || []) {
      const list = subsByUser.get(sub.user_id) || [];
      list.push(sub);
      subsByUser.set(sub.user_id, list);
    }

    let sentCount = 0;
    const staleSubscriptionIds: string[] = [];

    for (const notif of dueNotifications) {
      const userSubs = subsByUser.get(notif.user_id) || [];
      const payload = JSON.stringify({
        title: notif.title,
        body: notif.message,
        url: "/dashboard",
        tag: `notif-${notif.id}`,
      });

      for (const sub of userSubs) {
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
          sentCount++;
        } catch (pushErr: unknown) {
          const statusCode =
            typeof pushErr === "object" && pushErr !== null && "statusCode" in pushErr
              ? Number((pushErr as { statusCode: unknown }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            staleSubscriptionIds.push(sub.id);
          } else {
            console.error("Web push send failed:", pushErr);
          }
        }
      }

      await supabase
        .from("notifications")
        .update({ push_sent: true, sent_at: new Date().toISOString() })
        .eq("id", notif.id);
    }

    if (staleSubscriptionIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", staleSubscriptionIds);
    }

    return new Response(
      JSON.stringify({
        processed: dueNotifications.length,
        sent: sentCount,
        removedStale: staleSubscriptionIds.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-appointment-reminders error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
