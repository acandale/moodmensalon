import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { AppNotification } from "@/hooks/useNotifications";

const PUSH_PREF_PREFIX = "barberpro_push_enabled_";
const DELIVERED_PUSH_KEY = "barberpro_delivered_push_ids";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getDeliveredPushIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELIVERED_PUSH_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function markDeliveredPushId(id: string) {
  try {
    const ids = getDeliveredPushIds();
    ids.add(id);
    const trimmed = [...ids].slice(-100);
    localStorage.setItem(DELIVERED_PUSH_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

async function getOrRegisterPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
    }
    if (!reg.active) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 4000)),
      ]);
      reg = (await navigator.serviceWorker.getRegistration("/")) || reg;
    }
    return reg;
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isRo = language === "ro";

  const isSupported =
    typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
  const pushManagerSupported = isSupported && "PushManager" in window;

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isIosBrowser =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
    );

  // Sync current subscription state on mount / user change
  useEffect(() => {
    if (!isSupported || !user?.id) {
      setIsSubscribed(false);
      return;
    }

    setPermission(Notification.permission);

    const checkState = async () => {
      if (Notification.permission !== "granted") {
        setIsSubscribed(false);
        return;
      }

      const localPref = localStorage.getItem(`${PUSH_PREF_PREFIX}${user.id}`) === "true";
      const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
      const reg = await getOrRegisterPushServiceWorker();
      if (reg && "pushManager" in reg) {
        try {
          const existingSub = await reg.pushManager.getSubscription();
          if (existingSub) {
            let keyMatches = true;
            if (vapidPublicKey && existingSub.options?.applicationServerKey) {
              const expectedBytes = urlBase64ToUint8Array(vapidPublicKey);
              const existingBytes = new Uint8Array(existingSub.options.applicationServerKey);
              keyMatches =
                existingBytes.length === expectedBytes.length &&
                existingBytes.every((b, idx) => b === expectedBytes[idx]);
            }

            if (!keyMatches) {
              setIsSubscribed(false);
              return;
            }

            if (localPref) {
              const subJson = existingSub.toJSON();
              const p256dh = subJson.keys?.p256dh || "";
              const auth = subJson.keys?.auth || "";
              if (existingSub.endpoint && p256dh && auth) {
                await supabase.from("push_subscriptions").upsert(
                  {
                    user_id: user.id,
                    endpoint: existingSub.endpoint,
                    p256dh,
                    auth,
                    user_agent: navigator.userAgent.slice(0, 250),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "endpoint" }
                );
              }
            }

            setIsSubscribed(true);
            return;
          }
        } catch {
          // ignore
        }
      }
      setIsSubscribed(localPref);
    };

    void checkState();
  }, [isSupported, user?.id]);

  const showDeviceNotification = useCallback(
    async (title: string, body: string, tag = "barberpro-notification") => {
      if (!isSupported || Notification.permission !== "granted") return;
      const reg = await getOrRegisterPushServiceWorker();
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag,
          data: { url: "/dashboard" },
        });
      } else {
        new Notification(title, {
          body,
          icon: "/pwa-192x192.png",
          tag,
        });
      }
    },
    [isSupported]
  );

  const enablePushNotifications = useCallback(async (): Promise<{
    ok: boolean;
    errorMessage?: string;
  }> => {
    if (!user?.id) {
      return { ok: false, errorMessage: isRo ? "Autentifică-te mai întâi." : "Sign in first." };
    }
    if (!isSupported) {
      return {
        ok: false,
        errorMessage: isIosBrowser
          ? isRo
            ? "Pe iPhone/iPad, adaugă mai întâi aplicația pe ecranul principal (Share → Add to Home Screen) pentru a primi notificări."
            : "On iPhone/iPad, add the app to your Home Screen first to enable push notifications."
          : isRo
          ? "Browserul actual nu suportă notificări Web Push."
          : "This browser does not support Web Push notifications.",
      };
    }

    setIsBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== "granted") {
        return {
          ok: false,
          errorMessage:
            result === "denied"
              ? isRo
                ? "Notificările sunt blocate în setările browserului. Permite notificările din bara de adresă și încearcă din nou."
                : "Notifications are blocked in your browser settings."
              : isRo
              ? "Permisiunea nu a fost acordată."
              : "Permission was not granted.",
        };
      }

      const reg = await getOrRegisterPushServiceWorker();
      const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();

      if (reg && "pushManager" in reg && vapidPublicKey) {
        try {
          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          let subscription = await reg.pushManager.getSubscription();
          if (!subscription) {
            subscription = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          } else {
            // Re-subscribe if existing subscription used a different VAPID key
            const existingKey = subscription.options?.applicationServerKey;
            if (existingKey) {
              const existingBytes = new Uint8Array(existingKey);
              const matches =
                existingBytes.length === applicationServerKey.length &&
                existingBytes.every((b, idx) => b === applicationServerKey[idx]);
              if (!matches) {
                await subscription.unsubscribe();
                subscription = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey,
                });
              }
            }
          }

          const subJson = subscription.toJSON();
          const p256dh = subJson.keys?.p256dh || "";
          const auth = subJson.keys?.auth || "";

          if (subscription.endpoint && p256dh && auth) {
            const { error: upsertError } = await supabase.from("push_subscriptions").upsert(
              {
                user_id: user.id,
                endpoint: subscription.endpoint,
                p256dh,
                auth,
                user_agent: navigator.userAgent.slice(0, 250),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "endpoint" }
            );
            if (upsertError) {
              console.warn("Failed to persist push subscription:", upsertError.message);
            }
          }
        } catch (subErr) {
          console.warn("PushManager VAPID subscription skipped:", subErr);
        }
      }

      localStorage.setItem(`${PUSH_PREF_PREFIX}${user.id}`, "true");
      setIsSubscribed(true);

      await showDeviceNotification(
        isRo ? "Notificări activate!" : "Notifications enabled!",
        isRo
          ? "Vei primi remindere cu 1 oră înainte de fiecare programare (plus 24h și 3h)."
          : "You will receive reminders 1h before each appointment (plus 24h and 3h).",
        "push-enabled"
      );

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        errorMessage:
          err instanceof Error
            ? err.message
            : isRo
            ? "Deschide aplicația într-un tab separat sau instalează PWA pentru a activa notificările."
            : "Open the app in a standalone tab or install PWA to enable notifications.",
      };
    } finally {
      setIsBusy(false);
    }
  }, [user?.id, isSupported, isIosBrowser, isRo, showDeviceNotification]);

  const disablePushNotifications = useCallback(async () => {
    if (!user?.id) return;
    setIsBusy(true);
    try {
      const reg = await getOrRegisterPushServiceWorker();
      if (reg && "pushManager" in reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
        }
      }
      localStorage.removeItem(`${PUSH_PREF_PREFIX}${user.id}`);
      setIsSubscribed(false);
    } finally {
      setIsBusy(false);
    }
  }, [user?.id]);

  const sendTestPush = useCallback(async (): Promise<{ mode: "server" | "local" }> => {
    try {
      const { data, error } = await supabase.functions.invoke("send-appointment-reminders", {
        body: { testPush: true },
      });
      if (!error && data && typeof data === "object" && "sent" in data && Number((data as { sent: number }).sent) > 0) {
        return { mode: "server" };
      }
    } catch {
      // Fallback to local service worker notification if Edge Function isn't reachable
    }

    await showDeviceNotification(
      isRo ? "Reminder test programare" : "Test appointment reminder",
      isRo
        ? "Notificările pe acest dispozitiv funcționează! Vei primi alerte cu 1 oră înainte de programare."
        : "Notifications on this device are working! You will receive alerts 1 hour before your appointment.",
      `test-${Date.now()}`
    );
    return { mode: "local" };
  }, [isRo, showDeviceNotification]);

  const dispatchDueLocalReminders = useCallback(
    async (activeNotifications: AppNotification[]) => {
      if (!isSubscribed || permission !== "granted") return;
      const delivered = getDeliveredPushIds();

      for (const notif of activeNotifications) {
        if (notif.push_sent || notif.is_read) continue;
        if (
          notif.type !== "reminder_1h" &&
          notif.type !== "reminder_24h" &&
          notif.type !== "reminder_3h"
        ) {
          continue;
        }
        if (delivered.has(notif.id)) continue;

        markDeliveredPushId(notif.id);
        await showDeviceNotification(notif.title, notif.message, `notif-${notif.id}`);

        if (!notif.isFallback) {
          await supabase
            .from("notifications")
            .update({ push_sent: true, sent_at: new Date().toISOString() })
            .eq("id", notif.id);
        }
      }
    },
    [isSubscribed, permission, showDeviceNotification]
  );

  return {
    isSupported,
    pushManagerSupported,
    permission,
    isSubscribed,
    isBusy,
    needsIosInstall: isIosBrowser,
    enablePushNotifications,
    disablePushNotifications,
    sendTestPush,
    dispatchDueLocalReminders,
  };
}
