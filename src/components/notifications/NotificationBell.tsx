import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ro as roLocale } from "date-fns/locale";
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  Copy,
  AlertTriangle,
  CalendarCheck,
  CalendarX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  AppNotification,
  NOTIFICATIONS_MIGRATION_SQL,
  useNotifications,
} from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { user, isAdmin } = useAuth();
  const { language } = useLanguage();
  const isRo = language === "ro";
  const { toast } = useToast();

  const {
    activeNotifications,
    scheduledReminders,
    unreadCount,
    tableMissing,
    markAsRead,
    markAllAsRead,
    isMarkingAll,
  } = useNotifications();

  const {
    isSupported,
    permission,
    isSubscribed,
    isBusy,
    enablePushNotifications,
    disablePushNotifications,
    dispatchDueLocalReminders,
  } = usePushNotifications();

  const [open, setOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Trigger device notification if a 24h or 3h reminder becomes due while app is open
  useEffect(() => {
    if (activeNotifications.length > 0 && isSubscribed) {
      void dispatchDueLocalReminders(activeNotifications);
    }
  }, [activeNotifications, isSubscribed, dispatchDueLocalReminders]);

  if (!user) return null;

  const handleEnablePush = async () => {
    const res = await enablePushNotifications();
    if (res.ok) {
      toast({
        title: isRo ? "Notificări Push activate" : "Push notifications enabled",
        description: isRo
          ? "Vei primi alerte cu 1 oră înainte de programare (plus 3h și 24h)."
          : "You will receive alerts 1 hour before appointments (plus 3h and 24h).",
      });
    } else if (res.errorMessage) {
      toast({
        title: isRo ? "Notificări indisponibile" : "Notifications unavailable",
        description: res.errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(NOTIFICATIONS_MIGRATION_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      toast({
        title: isRo ? "Copiere nereușită" : "Copy failed",
        variant: "destructive",
      });
    }
  };

  const getTypeIcon = (type: AppNotification["type"]) => {
    switch (type) {
      case "booking_confirmed":
        return <CalendarCheck className="h-4 w-4 text-emerald-400 shrink-0" />;
      case "appointment_cancelled":
        return <CalendarX className="h-4 w-4 text-red-400 shrink-0" />;
      case "reminder_1h":
      case "reminder_3h":
        return <Clock className="h-4 w-4 text-amber-400 shrink-0" />;
      case "reminder_24h":
      default:
        return <BellRing className="h-4 w-4 text-purple-light shrink-0" />;
    }
  };

  const renderNotificationCard = (item: AppNotification, isScheduled: boolean) => {
    const scheduledDate = parseISO(item.scheduled_for);
    const formattedTime = format(
      scheduledDate,
      "d MMM, HH:mm",
      { locale: roLocale }
    );

    return (
      <div
        key={item.id}
        className={cn(
          "rounded-lg border p-3 transition-colors",
          item.is_read
            ? "border-white/5 bg-white/[0.02] opacity-75"
            : "border-purple/30 bg-purple/10"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5">{getTypeIcon(item.type)}</div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white leading-tight">
                  {item.title}
                </p>
                {!item.is_read && !isScheduled && (
                  <span className="h-2 w-2 rounded-full bg-purple-light shrink-0" />
                )}
              </div>
              <p className="text-xs text-white/75 leading-relaxed">{item.message}</p>
              <p className="text-[11px] text-white/50 capitalize">
                {isScheduled
                  ? isRo
                    ? `Programat: ${formattedTime}`
                    : `Scheduled: ${formattedTime}`
                  : formattedTime}
              </p>
            </div>
          </div>

          {!item.is_read && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
              title={isRo ? "Marchează ca citit" : "Mark as read"}
              onClick={() => void markAsRead(item.id)}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={isRo ? "Notificări" : "Notifications"}
          className="relative p-2 rounded-lg bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition-colors outline-none"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-purple text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-navy tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-1.5rem)] sm:w-96 p-0 bg-navy border-white/15 text-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-purple-light" />
            <h3 className="font-semibold text-sm">
              {isRo ? "Notificări & Remindere" : "Notifications & Reminders"}
            </h3>
          </div>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isMarkingAll}
              onClick={() => void markAllAsRead()}
              className="h-7 px-2 text-xs text-purple-light hover:text-white hover:bg-white/10"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              {isRo ? "Marchează citite" : "Mark all read"}
            </Button>
          )}
        </div>

        {/* Push notification opt-in bar */}
        {isSupported && (
          <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white">
                {isSubscribed
                  ? isRo
                    ? "Push pe telefon activ (1h, 3h & 24h)"
                    : "Device push active (1h, 3h & 24h)"
                  : permission === "denied"
                  ? isRo
                    ? "Notificările browser sunt blocate"
                    : "Browser notifications blocked"
                  : isRo
                  ? "Primește remindere pe telefon"
                  : "Get phone push reminders"}
              </p>
              <p className="text-[11px] text-white/60 truncate">
                {isSubscribed
                  ? isRo
                    ? "Vei fi notificat automat înainte de programare"
                    : "Automatic alerts before appointments"
                  : isRo
                  ? "Alerte cu 1h, 3h și 24h înainte de tuns"
                  : "Alerts 1h, 3h & 24h before your booking"}
              </p>
            </div>
            {isSubscribed ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => void disablePushNotifications()}
                className="h-7 px-2.5 text-xs text-white/70 hover:text-white hover:bg-white/10 shrink-0"
              >
                <BellOff className="h-3.5 w-3.5 mr-1" />
                {isRo ? "Oprește" : "Disable"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="hero"
                size="sm"
                disabled={isBusy || permission === "denied"}
                onClick={() => void handleEnablePush()}
                className="h-7 px-3 text-xs shrink-0"
              >
                {isRo ? "Activează" : "Enable"}
              </Button>
            )}
          </div>
        )}

        {/* Admin SQL notice if notifications table is not yet created */}
        {isAdmin && tableMissing && (
          <div className="mx-3 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs space-y-2">
            <div className="flex items-start gap-2 text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {isRo
                  ? "Tabelele notifications & push_subscriptions nu sunt încă create în Supabase. Rulează SQL-ul în Supabase → SQL Editor:"
                  : "notifications & push_subscriptions tables are not created in Supabase yet. Run SQL in SQL Editor:"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopySql}
              className="h-7 text-xs bg-navy border-white/20 text-white hover:bg-white/10"
            >
              {copiedSql ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copiedSql ? (isRo ? "SQL copiat!" : "Copied!") : (isRo ? "Copiază SQL" : "Copy SQL")}
            </Button>
          </div>
        )}

        {/* Tabs: Active vs Scheduled 24h / 3h */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid grid-cols-2 w-full rounded-none bg-white/[0.03] border-b border-white/10 h-9 p-1">
            <TabsTrigger
              value="active"
              className="text-xs data-[state=active]:bg-purple data-[state=active]:text-white text-white/70"
            >
              {isRo ? "Recente" : "Recent"} ({activeNotifications.length})
            </TabsTrigger>
            <TabsTrigger
              value="scheduled"
              className="text-xs data-[state=active]:bg-purple data-[state=active]:text-white text-white/70"
            >
              {isRo ? "Programate" : "Scheduled"} ({scheduledReminders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="m-0">
            <ScrollArea className="max-h-80">
              <div className="p-3 space-y-2">
                {activeNotifications.length === 0 ? (
                  <p className="text-center text-xs text-white/50 py-8">
                    {isRo
                      ? "Nu ai notificări noi momentan."
                      : "You have no notifications yet."}
                  </p>
                ) : (
                  activeNotifications.map((item) => renderNotificationCard(item, false))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="scheduled" className="m-0">
            <ScrollArea className="max-h-80">
              <div className="p-3 space-y-2">
                {scheduledReminders.length === 0 ? (
                  <p className="text-center text-xs text-white/50 py-8">
                    {isRo
                      ? "Nu există remindere programate (1h / 3h / 24h înainte)."
                      : "No scheduled 1h / 3h / 24h reminders."}
                  </p>
                ) : (
                  scheduledReminders.map((item) => renderNotificationCard(item, true))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
