import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BarChart3, Calendar, CalendarOff, Clock, Scissors, Plus, Loader2, Star, Pencil, User, Settings, MessageSquare, FileText, Palmtree, KeyRound, Phone, MessageCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, parseISO } from "date-fns";
import { ro as roLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AdminBookAppointment } from "@/components/admin/AdminBookAppointment";
import { PushNotificationBanner } from "@/components/notifications/PushNotificationBanner";
import { SalonReview, useMyReviews } from "@/hooks/useReviews";
import { ReviewDialog, ReviewTargetAppointment } from "@/components/reviews/ReviewDialog";
import { StarRating } from "@/components/reviews/StarRating";

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  user_id?: string;
  service_id?: string | null;
  specialist_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  services: {
    name: string;
    duration_minutes: number;
    price: number;
  };
  specialists?: {
    name: string;
  } | null;
  profiles?: {
    full_name: string;
    phone?: string | null;
  };
}

function buildTelHref(phone: string): string | null {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (!cleaned || cleaned.replace(/\D/g, "").length < 4) return null;
  return `tel:${cleaned}`;
}

function buildWhatsAppHref(phone: string): string | null {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length < 7) return null;
  if (!hasPlus) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.length === 10 && digits.startsWith("0")) {
      digits = `40${digits.slice(1)}`;
    }
  }
  return `https://wa.me/${digits}`;
}

export default function Dashboard() {
  const { user, profile, isLoading: authLoading, isAdmin, isSpecialist, specialistId, isPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const ro = language === "ro";
  const queryClient = useQueryClient();
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [allowClientTestBooking, setAllowClientTestBooking] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReviewTargetAppointment | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isPasswordRecovery) {
      navigate("/auth?mode=reset", { replace: true });
      return;
    }
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, isPasswordRecovery, navigate]);

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
          service_id,
          specialist_id,
          guest_name,
          guest_phone,
          services (
            name,
            duration_minutes,
            price
          ),
          specialists (
            name
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
        let profileMap = new Map<string, { full_name: string; phone: string | null }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, phone")
            .in("id", userIds);

          profileMap = new Map(
            profiles?.map(p => [p.id, { full_name: p.full_name, phone: p.phone || null }]) || []
          );
        }
        return data.map(a => {
          const matchedProfile = a.user_id ? profileMap.get(a.user_id) : undefined;
          return {
            ...a,
            profiles: {
              full_name: matchedProfile?.full_name || a.guest_name || "Unknown",
              phone: matchedProfile?.phone || a.guest_phone || null,
            },
          };
        }) as unknown as Appointment[];
      }

      return data as unknown as Appointment[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const { data: myReviewsData } = useMyReviews();
  const reviewsByAppointment = useMemo(() => {
    const map = new Map<string, SalonReview>();
    for (const r of myReviewsData?.reviews || []) {
      map.set(r.appointment_id, r);
    }
    return map;
  }, [myReviewsData?.reviews]);

  const currentNow = Math.max(nowTick, Date.now());
  const upcomingAppointments = appointments.filter(
    (apt) =>
      parseISO(apt.start_time).getTime() > currentNow &&
      apt.status === "confirmed"
  );

  const reviewableAppointments = useMemo(() => {
    if (isAdmin || isSpecialist) return [];
    const nowTs = Date.now();
    return [...appointments]
      .filter((apt) => apt.status !== "cancelled")
      .sort((a, b) => {
        const aPast = new Date(a.end_time).getTime() <= nowTs;
        const bPast = new Date(b.end_time).getTime() <= nowTs;
        if (aPast !== bPast) return aPast ? -1 : 1;
        return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
      })
      .slice(0, 6);
  }, [appointments, isAdmin, isSpecialist]);

  const openReviewModal = (
    apt: Appointment,
    existingReview?: SalonReview,
    initialRating?: number
  ) => {
    const start = parseISO(apt.start_time);
    const formattedDate = format(
      start,
      "d MMM yyyy • HH:mm",
      { locale: roLocale }
    );
    setReviewTarget({
      id: apt.id,
      serviceId: apt.service_id,
      specialistId: apt.specialist_id,
      serviceName: apt.services?.name || (ro ? "Serviciu" : "Service"),
      specialistName: apt.specialists?.name,
      dateLabel: formattedDate,
      existingReview: existingReview || null,
      initialRating,
    });
  };

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
  const nextClientPhone =
    nextAppointment?.profiles?.phone?.trim() ||
    nextAppointment?.guest_phone?.trim() ||
    null;
  const nextTelHref = nextClientPhone ? buildTelHref(nextClientPhone) : null;
  const nextWhatsAppHref = nextClientPhone ? buildWhatsAppHref(nextClientPhone) : null;

  const isClientOnly = !isAdmin && !isSpecialist;

  const isAppointmentInPast = (startTimeIso: string) =>
    parseISO(startTimeIso).getTime() <= Date.now();

  const showPastCancelError = () => {
    toast({
      title: t("dashboard.cannotCancelPast"),
      description: t("dashboard.cannotCancelPastDesc"),
      variant: "destructive",
    });
    setNowTick(Date.now());
    void refetch();
  };

  const requestCancelAppointment = (apt: Appointment) => {
    if (isClientOnly && isAppointmentInPast(apt.start_time)) {
      showPastCancelError();
      return;
    }
    setConfirmCancelId(apt.id);
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    const targetApt = appointments.find((a) => a.id === appointmentId);
    if (isClientOnly && targetApt && isAppointmentInPast(targetApt.start_time)) {
      showPastCancelError();
      return;
    }

    let updateQuery = supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId);

    if (isClientOnly && user?.id) {
      updateQuery = updateQuery
        .eq("user_id", user.id)
        .gt("start_time", new Date().toISOString());
    }

    const { data, error } = await updateQuery.select("id");

    if (error || !data || data.length === 0) {
      const errorMsg = (error?.message || "").toLowerCase();
      let isPastBlocked =
        errorMsg.includes("nu mai poate fi anulată") ||
        (isClientOnly && !!targetApt && isAppointmentInPast(targetApt.start_time));

      if (!isPastBlocked && isClientOnly) {
        const { data: latestApt } = await supabase
          .from("appointments")
          .select("start_time")
          .eq("id", appointmentId)
          .maybeSingle();
        if (latestApt?.start_time && isAppointmentInPast(latestApt.start_time)) {
          isPastBlocked = true;
        }
      }

      if (isPastBlocked) {
        showPastCancelError();
      } else {
        toast({
          title: t("dashboard.error"),
          description: t("dashboard.cancelFailed"),
          variant: "destructive",
        });
      }
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

        {(isAdmin || isSpecialist) && (
          <Card className="mb-6 border-purple/20 bg-card/90" variant="elevated">
            <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2">
              {isAdmin ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=appointments")}
                  >
                    <Calendar className="h-4 w-4 text-purple" />
                    {t("admin.appointments")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=specialists")}
                  >
                    <User className="h-4 w-4 text-purple" />
                    {ro ? "Specialiști" : "Specialists"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=work-hours")}
                  >
                    <Clock className="h-4 w-4 text-purple" />
                    {ro ? "Program Salon" : "Salon Schedule"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=blocked-times")}
                  >
                    <CalendarOff className="h-4 w-4 text-purple" />
                    {ro ? "Blocări timp" : "Blocked times"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=vacations")}
                  >
                    <Palmtree className="h-4 w-4 text-purple" />
                    {ro ? "Vacanțe" : "Vacations"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=reviews")}
                  >
                    <MessageSquare className="h-4 w-4 text-purple" />
                    {ro ? "Recenzii" : "Reviews"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=settings")}
                  >
                    <Settings className="h-4 w-4 text-purple" />
                    {t("admin.settings")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/client-history")}
                  >
                    <FileText className="h-4 w-4 text-purple" />
                    {ro ? "Fișa clientului" : "Client file"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=appointments")}
                  >
                    <Calendar className="h-4 w-4 text-purple" />
                    {t("admin.appointments")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=specialists")}
                  >
                    <Scissors className="h-4 w-4 text-purple" />
                    {t("admin.myConfig")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=blocked-times")}
                  >
                    <CalendarOff className="h-4 w-4 text-purple" />
                    {ro ? "Blocări timp" : "Blocked times"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=vacations")}
                  >
                    <Palmtree className="h-4 w-4 text-purple" />
                    {ro ? "Vacanțe" : "Vacations"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/admin?tab=reviews")}
                  >
                    <MessageSquare className="h-4 w-4 text-purple" />
                    {ro ? "Recenzii" : "Reviews"}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => setBookDialogOpen(true)}
                  >
                    <Calendar className="h-4 w-4" />
                    {ro ? "Adaugă programare" : "Add appointment"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate("/client-history")}
                  >
                    <FileText className="h-4 w-4 text-purple" />
                    {ro ? "Fișa clientului" : "Client file"}
                  </Button>
                </>
              )}
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
                          "EEEE, d MMMM",
                          { locale: roLocale }
                        )}
                      </p>
                      <p className="text-2xl font-bold">
                        {format(
                          parseISO(nextAppointment.start_time),
                          "HH:mm",
                          { locale: roLocale }
                        )}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/10">
                      <Scissors className="h-6 w-6 text-purple-light" />
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-5">
                    <p className="text-lg font-semibold">
                      {nextAppointment.services.name}
                    </p>
                    {(isAdmin || isSpecialist) && nextAppointment.profiles?.full_name && (
                      <p className="text-white/80 text-sm">{t("dashboard.client")}: {nextAppointment.profiles.full_name}</p>
                    )}
                    {(isAdmin || isSpecialist) && nextClientPhone && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Phone className="h-3.5 w-3.5 text-purple-light shrink-0" />
                        {nextTelHref ? (
                          <a
                            href={nextTelHref}
                            className="text-purple-light hover:text-white underline underline-offset-4 transition-colors font-medium tabular-nums"
                          >
                            {nextClientPhone}
                          </a>
                        ) : (
                          <span className="text-white/80 tabular-nums">{nextClientPhone}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-white/70 text-sm">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {nextAppointment.services.duration_minutes} min
                      </span>
                      <span>{Number(nextAppointment.services.price)} RON</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {(isAdmin || isSpecialist) && nextTelHref && (
                      <Button
                        asChild
                        size="sm"
                        className="bg-white text-navy hover:bg-white/90 font-medium"
                      >
                        <a href={nextTelHref}>
                          <Phone className="h-4 w-4" />
                          {ro ? "Sună" : "Call"}
                        </a>
                      </Button>
                    )}
                    {(isAdmin || isSpecialist) && nextWhatsAppHref && (
                      <Button
                        asChild
                        size="sm"
                        className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-medium border-0"
                      >
                        <a
                          href={nextWhatsAppHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="hero-outline"
                      size="sm"
                      onClick={() => requestCancelAppointment(nextAppointment)}
                    >
                      {t("dashboard.cancelAppointment")}
                    </Button>
                  </div>
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
              {isAdmin || isSpecialist ? (
                <div className="space-y-2.5">
                  <Button
                    variant="hero"
                    className="w-full justify-start"
                    disabled={!allowClientTestBooking}
                    onClick={() => navigate("/book")}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {t("dashboard.bookNew")} {ro ? "(în mod client!)" : "(client mode!)"}
                    </span>
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-1">
                    <Checkbox
                      checked={allowClientTestBooking}
                      onCheckedChange={(checked) => setAllowClientTestBooking(!!checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>
                      {ro
                        ? "Activează mod client (doar pentru test)"
                        : "Enable client mode (test only)"}
                    </span>
                  </label>
                </div>
              ) : (
                <Button
                  variant="hero"
                  className="w-full justify-start"
                  onClick={() => navigate("/book")}
                >
                  <Plus className="h-4 w-4" />
                  {t("dashboard.bookNew")}
                </Button>
              )}
              {!isAdmin && !isSpecialist && (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate("/my-appointments")}
                  >
                    <Star className="h-4 w-4 text-amber-400" />
                    {ro ? "Programările și recenziile mele" : "My appointments & reviews"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate("/account")}
                  >
                    <KeyRound className="h-4 w-4 text-purple" />
                    {ro ? "Contul meu / Schimbă parola" : "My account / Change password"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
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
                            {format(parseISO(apt.start_time), "HH:mm", { locale: roLocale })} -{" "}
                            {format(parseISO(apt.end_time), "HH:mm", { locale: roLocale })}
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
                              "d MMM, HH:mm",
                              { locale: roLocale }
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
                        onClick={() => requestCancelAppointment(apt)}
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

        {/* Client Reviews Section */}
        {!isAdmin && !isSpecialist && reviewableAppointments.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                  {ro ? "Evaluează programările tale" : "Rate your appointments"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ro
                    ? "Lasă o recenzie pentru programările tale și ajută alți clienți să descopere salonul."
                    : "Leave a review for your visits and help other clients discover the salon."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/my-appointments")}
              >
                {ro ? "Vezi toate" : "View all"}
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reviewableAppointments.map((apt) => {
                const existingReview = reviewsByAppointment.get(apt.id);
                const isPast = new Date(apt.end_time).getTime() <= Date.now();

                return (
                  <Card key={`rev-${apt.id}`} variant="default" className="flex flex-col justify-between">
                    <CardContent className="pt-6 flex-1 flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-semibold">{apt.services?.name}</p>
                            {apt.specialists?.name && (
                              <p className="text-xs text-muted-foreground">
                                {apt.specialists.name}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {isPast
                              ? ro
                                ? "Finalizat"
                                : "Completed"
                              : ro
                              ? "Confirmat"
                              : "Confirmed"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                          {format(
                            parseISO(apt.start_time),
                            "d MMM yyyy, HH:mm",
                            { locale: roLocale }
                          )}
                        </p>
                      </div>

                      {existingReview ? (
                        <div className="pt-3 border-t border-border space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <StarRating value={existingReview.rating} readOnly size="xs" />
                            <button
                              type="button"
                              onClick={() => openReviewModal(apt, existingReview)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-purple hover:underline"
                            >
                              <Pencil className="h-3 w-3" />
                              {ro ? "Editează recenzia" : "Edit review"}
                            </button>
                          </div>
                          {existingReview.comment && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              „{existingReview.comment}”
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-border space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              {ro ? "Alege nota:" : "Rate visit:"}
                            </span>
                            <StarRating
                              value={0}
                              size="sm"
                              onChange={(selectedStars) =>
                                openReviewModal(apt, undefined, selectedStars)
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => openReviewModal(apt)}
                          >
                            <Star className="h-4 w-4 mr-1.5 text-amber-400" />
                            {ro ? "Lasă o recenzie" : "Leave a review"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
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

      <ReviewDialog
        open={!!reviewTarget}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null);
        }}
        appointment={reviewTarget}
      />

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
