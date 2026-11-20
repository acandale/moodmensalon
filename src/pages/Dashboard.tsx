import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Calendar, Clock, Scissors, Plus, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isFuture, isToday, parseISO } from "date-fns";
import { enUS, ro as roLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AdminBookAppointment } from "@/components/admin/AdminBookAppointment";
import { SalonGalleryCarousel } from "@/components/SalonGalleryCarousel";
import { PushNotificationBanner } from "@/components/notifications/PushNotificationBanner";

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  user_id?: string;
  guest_name?: string | null;
  guest_phone?: string | null;
  services: {
    name: string;
    duration_minutes: number;
    price: number;
  };
  profiles?: {
    full_name: string;
  };
}

export default function Dashboard() {
  const { user, profile, isLoading: authLoading, isAdmin, isSpecialist, specialistId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const ro = language === "ro";
  const dateLocale = ro ? roLocale : enUS;
  const queryClient = useQueryClient();
  const [bookDialogOpen, setBookDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const { data: appointments = [], isLoading: appointmentsLoading, refetch } = useQuery({
    queryKey: ["my-appointments", user?.id, isAdmin, isSpecialist, specialistId],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from("appointments")
        .select(`
          id,
          start_time,
          end_time,
          status,
          user_id,
          guest_name,
          guest_phone,
          services (
            name,
            duration_minutes,
            price
          )
        `)
        .order("start_time", { ascending: true });

      if (isSpecialist && !isAdmin) {
        if (!specialistId) return [];
        query = query.eq("specialist_id", specialistId);
      } else if (!isAdmin) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      if ((isAdmin || isSpecialist) && data.length > 0) {
        const userIds = [...new Set(data.map(a => a.user_id).filter(Boolean))] as string[];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        return data.map(a => ({
          ...a,
          profiles: { full_name: (a.user_id ? profileMap.get(a.user_id) : null) || a.guest_name || "Unknown" },
        })) as Appointment[];
      }

      return data as Appointment[];
    },
    enabled: !!user,
  });


  const upcomingAppointments = appointments.filter(
    (apt) => isFuture(parseISO(apt.start_time)) && apt.status === "confirmed"
  );

  const todayAppointments = isAdmin
    ? appointments.filter(
        (apt) => isToday(parseISO(apt.start_time)) && apt.status === "confirmed"
      )
    : [];

  const todayTotalRevenue = todayAppointments.reduce(
    (sum, apt) => sum + Number(apt.services?.price ?? 0),
    0
  );

  const nextAppointment = upcomingAppointments[0];

  const handleCancelAppointment = async (appointmentId: string) => {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId);

    if (error) {
      toast({
        title: t("dashboard.error"),
        description: t("dashboard.cancelFailed"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("dashboard.cancelled"),
        description: t("dashboard.cancelledDesc"),
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  if (authLoading || appointmentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        {isAdmin && (
          <Card className="mb-6 border-purple/30 bg-purple/5" variant="elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple" />
                {t("dashboard.adminSummary.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("dashboard.adminSummary.confirmedLabel")}
                  </p>
                  <p className="text-3xl font-bold tabular-nums text-foreground">
                    {todayAppointments.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("dashboard.adminSummary.revenueLabel")}
                  </p>
                  <p className="text-3xl font-bold tabular-nums text-purple">
                    {t("dashboard.adminSummary.totalValue", {
                      amount: String(Math.round(todayTotalRevenue)),
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            {t("dashboard.welcome")} {profile?.full_name?.split(" ")[0] || "there"}!
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("dashboard.manage")}
          </p>
        </div>

        {isAdmin && (
          <Card className="mb-6 border-purple/30 bg-purple/5">
            <CardContent className="py-4 flex items-center justify-between">
              <p className="text-sm font-medium text-purple">
                {t("dashboard.adminAccess")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/admin")}
              >
                {t("dashboard.goAdmin")}
              </Button>
            </CardContent>
          </Card>
        )}

        {!isAdmin && !isSpecialist && <PushNotificationBanner compact />}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Next Appointment Card */}
          <Card variant="elevated" className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple" />
                {t("dashboard.nextAppointment")}
              </CardTitle>
              {isAdmin && (
                <CardDescription>
                  {t("dashboard.nextAllClients")}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {nextAppointment ? (
                <div className="p-6 rounded-xl bg-gradient-to-br from-navy to-navy-light text-white">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-purple-light text-sm font-medium mb-1 capitalize">
                        {format(
                          parseISO(nextAppointment.start_time),
                          ro ? "EEEE, d MMMM" : "EEEE, MMMM d",
                          { locale: dateLocale }
                        )}
                      </p>
                      <p className="text-2xl font-bold">
                        {format(
                          parseISO(nextAppointment.start_time),
                          ro ? "HH:mm" : "h:mm a",
                          { locale: dateLocale }
                        )}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/10">
                      <Scissors className="h-6 w-6 text-purple-light" />
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <p className="text-lg font-semibold">
                      {nextAppointment.services.name}
                    </p>
                    {(isAdmin || isSpecialist) && nextAppointment.profiles?.full_name && (
                      <p className="text-white/80 text-sm">{t("dashboard.client")}: {nextAppointment.profiles.full_name}</p>
                    )}
                    <div className="flex items-center gap-4 text-white/70 text-sm">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {nextAppointment.services.duration_minutes} min
                      </span>
                      <span>{Number(nextAppointment.services.price)} RON</span>
                    </div>
                  </div>

                  <Button
                    variant="hero-outline"
                    size="sm"
                    onClick={() => setConfirmCancelId(nextAppointment.id)}
                  >
                    {t("dashboard.cancelAppointment")}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Calendar className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground mb-4">
                    {t("dashboard.noUpcoming")}
                  </p>
                  {!isSpecialist && (
                    <Button variant="hero" onClick={() => navigate("/book")}>
                      <Plus className="h-4 w-4" />
                      {t("dashboard.bookNow")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>{t("dashboard.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="hero"
                className="w-full justify-start"
                onClick={() => (isSpecialist && !isAdmin ? setBookDialogOpen(true) : navigate("/book"))}
              >
                <Plus className="h-4 w-4" />
                {t("dashboard.bookNew")}
              </Button>
              {isSpecialist && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => navigate("/admin")}
                >
                  <Scissors className="h-4 w-4" />
                  {t("nav.specialistPanel")}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Salon Gallery Carousel */}
        <div className="mt-6">
          <SalonGalleryCarousel
            canManage={isAdmin || isSpecialist}
            onManageClick={() => navigate(isAdmin ? "/admin?tab=settings" : "/admin?tab=specialists")}
          />
        </div>

        {/* All Appointments */}
        {isAdmin ? (
          todayAppointments.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">{t("dashboard.todayAppointments")}</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayAppointments.map((apt) => (
                  <Card key={apt.id} variant="default">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold">{apt.services.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(apt.start_time), ro ? "HH:mm" : "h:mm a", { locale: dateLocale })} -{" "}
                            {format(parseISO(apt.end_time), ro ? "HH:mm" : "h:mm a", { locale: dateLocale })}
                          </p>
                          {apt.profiles?.full_name && (
                            <p className="text-xs text-purple mt-1">{t("dashboard.client")}: {apt.profiles.full_name}</p>
                          )}
                        </div>
                        <span className="text-sm font-medium text-purple">
                          {Number(apt.services.price)} RON
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmCancelId(apt.id)}
                      >
                        {t("dashboard.cancel")}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        ) : (
          upcomingAppointments.length > 1 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">{t("dashboard.allUpcoming")}</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingAppointments.slice(1).map((apt) => (
                  <Card key={apt.id} variant="default">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold">{apt.services.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {format(
                              parseISO(apt.start_time),
                              ro ? "d MMM, HH:mm" : "MMM d, h:mm a",
                              { locale: dateLocale }
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-purple">
                          {Number(apt.services.price)} RON
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmCancelId(apt.id)}
                      >
                        {t("dashboard.cancel")}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        )}
      </main>

      {isSpecialist && (
        <AdminBookAppointment
          open={bookDialogOpen}
          onOpenChange={(open) => {
            setBookDialogOpen(open);
            if (!open) refetch();
          }}
        />
      )}

      <AlertDialog open={!!confirmCancelId} onOpenChange={(o) => !o && setConfirmCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ro ? "Anulați programarea?" : "Cancel appointment?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {ro ? "Această acțiune nu poate fi anulată." : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ro ? "Nu" : "No"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmCancelId) handleCancelAppointment(confirmCancelId);
                setConfirmCancelId(null);
              }}
            >
              {ro ? "Da, anulează" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
