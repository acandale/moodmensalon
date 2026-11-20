import { BellRing, BellOff, CheckCircle2, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface PushNotificationBannerProps {
  compact?: boolean;
}

export function PushNotificationBanner({ compact = false }: PushNotificationBannerProps) {
  const { language } = useLanguage();
  const isRo = language === "ro";
  const { toast } = useToast();

  const {
    isSupported,
    permission,
    isSubscribed,
    isBusy,
    needsIosInstall,
    enablePushNotifications,
    disablePushNotifications,
    sendTestPush,
  } = usePushNotifications();

  const handleEnable = async () => {
    const res = await enablePushNotifications();
    if (res.ok) {
      toast({
        title: isRo ? "Notificări activate" : "Notifications enabled",
        description: isRo
          ? "Vei primi notificări cu 24h și 3h înainte de fiecare programare."
          : "You will receive notifications 24h and 3h before each appointment.",
      });
    } else if (res.errorMessage) {
      toast({
        title: isRo ? "Nu s-au putut activa notificările" : "Could not enable notifications",
        description: res.errorMessage,
        variant: "destructive",
      });
    }
  };

  if (compact) {
    if (!isSupported || isSubscribed || permission === "denied") {
      return null;
    }

    return (
      <Card className="mb-6 border-purple/30 bg-purple/5">
        <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple/15 text-purple shrink-0">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isRo
                  ? "Activează notificările pe telefon (24h & 3h înainte)"
                  : "Enable phone push reminders (24h & 3h before)"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {needsIosInstall
                  ? isRo
                    ? "Pe iOS, adaugă aplicația pe ecranul principal pentru a primi notificări push."
                    : "On iOS, add the app to Home Screen to receive push notifications."
                  : isRo
                  ? "Primește alerte automate înainte de fiecare programare."
                  : "Receive automatic alerts before every appointment."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="hero"
            size="sm"
            disabled={isBusy}
            onClick={() => void handleEnable()}
            className="shrink-0"
          >
            {isRo ? "Activează notificările" : "Enable notifications"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5 text-purple" />
          {isRo ? "Notificări Push pe telefon" : "Phone Push Notifications"}
        </CardTitle>
        <CardDescription>
          {isRo
            ? "Primește remindere automate cu 24 de ore și 3 ore înainte de programări."
            : "Receive automatic reminders 24 hours and 3 hours before your appointments."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported ? (
          <p className="text-sm text-muted-foreground">
            {needsIosInstall
              ? isRo
                ? "Pe iPhone/iPad, apasă Share → Add to Home Screen pentru a activa notificările Push."
                : "On iPhone/iPad, tap Share → Add to Home Screen to enable Push notifications."
              : isRo
              ? "Acest browser nu suportă Web Push API."
              : "This browser does not support the Web Push API."}
          </p>
        ) : isSubscribed ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {isRo
                  ? "Notificările sunt active pe acest dispozitiv"
                  : "Notifications are active on this device"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void sendTestPush()}
              >
                {isRo ? "Trimite test" : "Send test"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => void disablePushNotifications()}
                className="text-destructive hover:text-destructive"
              >
                <BellOff className="h-4 w-4 mr-1" />
                {isRo ? "Dezactivează" : "Disable"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {permission === "denied"
                ? isRo
                  ? "Permisiunea este blocată din setările browserului."
                  : "Notification permission is blocked in browser settings."
                : isRo
                ? "Apasă butonul pentru a permite notificările pe acest dispozitiv."
                : "Click to allow notifications on this device."}
            </p>
            <Button
              type="button"
              variant="hero"
              disabled={isBusy || permission === "denied"}
              onClick={() => void handleEnable()}
            >
              <BellRing className="h-4 w-4 mr-2" />
              {isRo ? "Activează notificările" : "Enable notifications"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
