import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  parseISO,
  addMonths,
  subMonths,
  addDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ro } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  Scissors,
  Calendar,
  CalendarOff,
  Palmtree,
  X,
  Settings,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { WorkHoursManager } from "@/components/admin/WorkHoursManager";
import { AdminBookAppointment } from "@/components/admin/AdminBookAppointment";
import { SalonSettingsManager } from "@/components/admin/SalonSettingsManager";
import { SpecialistsManager } from "@/components/admin/SpecialistsManager";
import { ReviewsManager } from "@/components/admin/ReviewsManager";
import { BlockedTimesCalendar } from "@/components/admin/BlockedTimesCalendar";
import { VacationsManager } from "@/components/admin/VacationsManager";
import { SpecialistSplitCalendar } from "@/components/admin/SpecialistSplitCalendar";
import { capitalizeFirst } from "@/lib/time-format";

interface ProfileInfo {
  full_name: string;
  email: string;
  phone: string;
}

interface AppointmentWithDetails {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  user_id: string | null;
  specialist_id: string | null;
  profiles: ProfileInfo | null;
  services: {
    name: string;
    duration_minutes: number;
    price: number;
  };
}

const SERVICE_COLORS: Record<string, string> = {
  "Premium Haircut": "bg-purple text-white",
  "Standard Haircut": "bg-navy text-white",
  "Beard Trim": "bg-purple-light text-white",
};

type ViewMode = "month" | "week" | "day";
type AdminTab = "appointments" | "settings" | "specialists" | "work-hours" | "blocked-times" | "vacations" | "reviews";

export default function AdminPage() {
  const { user, isAdmin, isSpecialist, specialistId, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();

  const tabParam = searchParams.get("tab");
  const initialTab: AdminTab =
    tabParam === "settings" ||
    tabParam === "specialists" ||
    tabParam === "work-hours" ||
    tabParam === "blocked-times" ||
    tabParam === "vacations" ||
    tabParam === "reviews"
      ? tabParam
      : "appointments";
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookDefaults, setBookDefaults] = useState<{
    specialistId?: string;
    date?: Date;
    time?: string;
  }>({});
  const [filterSpecialistId, setFilterSpecialistId] = useState<string | null>(null);
  const [selectedBlockSpecialistId, setSelectedBlockSpecialistId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || (!isAdmin && !isSpecialist))) {
      navigate("/dashboard");
    }
  }, [user, isAdmin, isSpecialist, authLoading, navigate]);

  // If specialist, default blocked-times/vacations tab to own specialist,
  // while keeping calendar split view open across all active specialists
  useEffect(() => {
    if (isSpecialist && specialistId) {
      setSelectedBlockSpecialistId(specialistId);
    }
  }, [isSpecialist, specialistId]);

  // Fetch specialists for filter dropdown & split columns
  const { data: specialists = [] } = useQuery({
    queryKey: ["admin-specialists-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialists")
        .select("id, name, title")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user && (isAdmin || isSpecialist),
  });

  useEffect(() => {
    if (!selectedBlockSpecialistId && specialists.length > 0) {
      setSelectedBlockSpecialistId(filterSpecialistId || specialists[0].id);
    }
  }, [specialists, filterSpecialistId, selectedBlockSpecialistId]);

  // Fetch all specialist work hours + salon fallback hours
  const { data: specialistWorkHours = [] } = useQuery({
    queryKey: ["admin-all-specialist-work-hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialist_work_hours")
        .select("*")
        .order("day_of_week", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user && (isAdmin || isSpecialist),
  });

  const { data: salonWorkHours = [] } = useQuery({
    queryKey: ["admin-salon-work-hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_hours")
        .select("*")
        .order("day_of_week", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user && (isAdmin || isSpecialist),
  });

  // Fetch blocked times for day view
  const dayDateKey = format(currentDate, "yyyy-MM-dd");
  const { data: dayBlockedTimes = [] } = useQuery({
    queryKey: ["admin-day-blocked-times", dayDateKey, filterSpecialistId],
    queryFn: async () => {
      const startDate = new Date(currentDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(currentDate);
      endDate.setHours(23, 59, 59, 999);

      let query = supabase
        .from("blocked_times")
        .select("*")
        .gte("start_time", startDate.toISOString())
        .lte("start_time", endDate.toISOString())
        .order("start_time", { ascending: true });

      if (filterSpecialistId) {
        query = query.eq("specialist_id", filterSpecialistId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user && (isAdmin || isSpecialist) && viewMode === "day",
  });

  // Fetch vacations (blocked_days) overlapping the selected date
  const { data: dayBlockedDays = [] } = useQuery({
    queryKey: ["admin-day-blocked-days", dayDateKey, filterSpecialistId],
    queryFn: async () => {
      let query = supabase
        .from("blocked_days")
        .select("*")
        .lte("start_date", dayDateKey)
        .gte("end_date", dayDateKey);

      if (filterSpecialistId) {
        query = query.eq("specialist_id", filterSpecialistId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user && (isAdmin || isSpecialist) && viewMode === "day",
  });

  // Fetch appointments (full week when in day split-view for instant strip switching & indicators)
  const queryRangeKey =
    viewMode === "month"
      ? format(currentDate, "yyyy-MM")
      : format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["admin-appointments", queryRangeKey, viewMode === "month" ? "month" : "week", filterSpecialistId],
    queryFn: async () => {
      let startDate: Date;
      let endDate: Date;

      if (viewMode === "month") {
        startDate = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        endDate = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      } else {
        startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
        endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
      }

      let query = supabase
        .from("appointments")
        .select(`
          id,
          start_time,
          end_time,
          status,
          notes,
          user_id,
          specialist_id,
          guest_name,
          guest_phone,
          services (
            name,
            duration_minutes,
            price
          )
        `)
        .gte("start_time", startDate.toISOString())
        .lte("start_time", endDate.toISOString())
        .order("start_time", { ascending: true });

      if (filterSpecialistId) {
        query = query.eq("specialist_id", filterSpecialistId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profiles for all appointments
      const userIds = [...new Set((data || []).map((apt) => apt.user_id).filter(Boolean))] as string[];

      let profilesMap = new Map<string, { full_name: string; email: string; phone: string }>();
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", userIds);

        profilesMap = new Map(
          profilesData?.map((p) => [p.id, { full_name: p.full_name, email: p.email, phone: p.phone }]) || []
        );
      }

      return (data || []).map((apt: any) => ({
        ...apt,
        profiles:
          (apt.user_id ? profilesMap.get(apt.user_id) : null) ||
          (apt.guest_name
            ? { full_name: apt.guest_name, email: "", phone: apt.guest_phone || "" }
            : null),
      })) as AppointmentWithDetails[];
    },
    enabled: !!user && (isAdmin || isSpecialist),
  });

  // Cancel appointment mutation
  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nu ai permisiunea să anulezi această programare.");
      }
    },
    onSuccess: () => {
      toast({ title: "Programare anulată" });
      setSelectedAppointment(null);
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-for-date"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Anularea a eșuat",
        description: error.message || "Nu s-a putut anula programarea.",
        variant: "destructive",
      });
    },
  });

  const getAppointmentsForDay = (date: Date) => {
    return appointments.filter((apt) =>
      isSameDay(parseISO(apt.start_time), date)
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-1">
        {["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"].map((day) => (
          <div
            key={day}
            className="p-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {days.map((day) => {
          const dayAppointments = getAppointmentsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[100px] p-2 border rounded-lg transition-colors cursor-pointer",
                isCurrentMonth ? "bg-card" : "bg-muted/30",
                isToday && "ring-2 ring-purple"
              )}
              onClick={() => {
                setCurrentDate(day);
                setViewMode("day");
              }}
            >
              <div
                className={cn(
                  "text-sm font-medium mb-1",
                  !isCurrentMonth && "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayAppointments.slice(0, 3).map((apt) => (
                  <div
                    key={apt.id}
                    className={cn(
                      "text-xs p-1 rounded truncate cursor-pointer",
                      SERVICE_COLORS[apt.services.name] || "bg-purple text-white",
                      apt.status === "cancelled" && "opacity-50 line-through"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAppointment(apt);
                    }}
                  >
                    {format(parseISO(apt.start_time), "HH:mm")} -{" "}
                    {apt.profiles?.full_name?.split(" ")[0] || "Necunoscut"}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{dayAppointments.length - 3} în plus
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const openQuickBook = (params?: { specialistId?: string; date?: Date; time?: string }) => {
    setBookDefaults(params || {});
    setBookDialogOpen(true);
  };

  const renderSplitDayView = () => {
    const weekAppointmentDates = appointments
      .filter((apt) => apt.status !== "cancelled")
      .map((apt) => parseISO(apt.start_time));

    return (
      <SpecialistSplitCalendar
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        specialists={specialists}
        selectedSpecialistId={filterSpecialistId}
        onSelectSpecialistFilter={setFilterSpecialistId}
        isAdmin={isAdmin}
        currentSpecialistId={specialistId}
        appointments={appointments}
        weekAppointmentDates={weekAppointmentDates}
        specialistWorkHours={specialistWorkHours}
        salonWorkHours={salonWorkHours}
        blockedTimes={dayBlockedTimes}
        blockedDays={dayBlockedDays}
        onSelectAppointment={(apt) => setSelectedAppointment(apt)}
        onQuickBook={(params) => openQuickBook(params)}
        onOpenBlockedTimes={(specId) => {
          setSelectedBlockSpecialistId(specId);
          setActiveTab("blocked-times");
        }}
      />
    );
  };

  if (authLoading || (isLoading && appointments.length === 0)) {
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
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {isSpecialist ? t("nav.specialistPanel") : t("admin.dashboard")}
            </h1>
            <p className="text-muted-foreground">{t("admin.manageDesc")}</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTab)}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t("admin.appointments")}
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="specialists" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Specialiști
                </TabsTrigger>
                <TabsTrigger value="work-hours" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Program Salon
                </TabsTrigger>
                <TabsTrigger value="blocked-times" className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4" />
                  Blocări timp
                </TabsTrigger>
                <TabsTrigger value="vacations" className="flex items-center gap-2">
                  <Palmtree className="h-4 w-4" />
                  Vacanțe
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {language === "ro" ? "Recenzii" : "Reviews"}
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {t("admin.settings")}
                </TabsTrigger>
              </>
            )}
            {isSpecialist && !isAdmin && (
              <>
                <TabsTrigger value="specialists" className="flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  {t("admin.myConfig")}
                </TabsTrigger>
                <TabsTrigger value="blocked-times" className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4" />
                  Blocări timp
                </TabsTrigger>
                <TabsTrigger value="vacations" className="flex items-center gap-2">
                  <Palmtree className="h-4 w-4" />
                  Vacanțe
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {language === "ro" ? "Recenzii" : "Reviews"}
                </TabsTrigger>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 ml-2"
              onClick={() => navigate("/client-history")}
            >
              <Calendar className="h-4 w-4" />
              {language === "ro" ? "Fișa clientului" : "Client file"}
            </Button>
          </TabsList>

          {/* Appointments Tab */}
          <TabsContent value="appointments">
            {/* Calendar Controls */}
            <Card variant="elevated" className="mb-6">
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    {(isAdmin || isSpecialist) && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() =>
                            openQuickBook({
                              date: currentDate,
                              specialistId: !isAdmin && specialistId ? specialistId : undefined,
                            })
                          }
                        >
                          <Calendar className="h-4 w-4" />
                          {t("admin.newAppointment")}
                        </Button>
                        <Select
                          value={filterSpecialistId || "all"}
                          onValueChange={(v) => setFilterSpecialistId(v === "all" ? null : v)}
                        >
                          <SelectTrigger className="w-[200px] h-9">
                            <SelectValue placeholder="Toți specialiștii" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toți specialiștii</SelectItem>
                            {specialists.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setCurrentDate(
                          viewMode === "month"
                            ? subMonths(currentDate, 1)
                            : addDays(currentDate, -1)
                        )
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="text-xl font-semibold min-w-[200px] text-center">
                      {viewMode === "month"
                        ? capitalizeFirst(format(currentDate, "MMMM yyyy", { locale: ro }))
                        : capitalizeFirst(format(currentDate, "EEEE, d MMMM yyyy", { locale: ro }))}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setCurrentDate(
                          viewMode === "month"
                            ? addMonths(currentDate, 1)
                            : addDays(currentDate, 1)
                        )
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === "day" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("day")}
                    >
                      {t("admin.day")}
                    </Button>
                    <Button
                      variant={viewMode === "month" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("month")}
                    >
                      {t("admin.month")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDate(new Date())}
                    >
                      {t("admin.today")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Calendar View */}
            {viewMode === "month" ? (
              <Card variant="elevated">
                <CardContent className="p-6">{renderMonthView()}</CardContent>
              </Card>
            ) : (
              renderSplitDayView()
            )}
          </TabsContent>

          {/* Specialists Tab */}
          <TabsContent value="specialists">
            <SpecialistsManager restrictToSpecialistId={isSpecialist ? specialistId : undefined} />
          </TabsContent>

          {/* Work Hours Tab - Salon Schedule */}
          <TabsContent value="work-hours">
            <WorkHoursManager />
          </TabsContent>

          {/* Blocked Times Tab */}
          <TabsContent value="blocked-times">
            <Card variant="elevated">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarOff className="h-5 w-5 text-purple" />
                    Blocări timp — Blocaj orar
                  </CardTitle>
                  <CardDescription>
                    Selectează o zi din calendar și blochează intervale orare (format 24h)
                  </CardDescription>
                </div>
                {isAdmin && specialists.length > 0 && (
                  <Select
                    value={selectedBlockSpecialistId || specialists[0].id}
                    onValueChange={setSelectedBlockSpecialistId}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Selectează specialist" />
                    </SelectTrigger>
                    <SelectContent>
                      {specialists.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardHeader>
              <CardContent>
                {(isSpecialist && !isAdmin ? specialistId : selectedBlockSpecialistId) ? (
                  <BlockedTimesCalendar
                    specialistId={(isSpecialist && !isAdmin ? specialistId : selectedBlockSpecialistId)!}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Niciun specialist selectat.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vacations Tab */}
          <TabsContent value="vacations">
            <Card variant="elevated">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Palmtree className="h-5 w-5 text-purple" />
                    Vacanțe și zile libere
                  </CardTitle>
                  <CardDescription>
                    Gestionează perioadele de concediu și zilele libere ale specialistului
                  </CardDescription>
                </div>
                {isAdmin && specialists.length > 0 && (
                  <Select
                    value={selectedBlockSpecialistId || specialists[0].id}
                    onValueChange={setSelectedBlockSpecialistId}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Selectează specialist" />
                    </SelectTrigger>
                    <SelectContent>
                      {specialists.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardHeader>
              <CardContent>
                {(isSpecialist && !isAdmin ? specialistId : selectedBlockSpecialistId) ? (
                  <VacationsManager
                    specialistId={(isSpecialist && !isAdmin ? specialistId : selectedBlockSpecialistId)!}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Niciun specialist selectat.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews">
            <ReviewsManager restrictToSpecialistId={isSpecialist && !isAdmin ? specialistId : undefined} />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <SalonSettingsManager />
          </TabsContent>
        </Tabs>

        {/* Appointment Detail Dialog */}
        {selectedAppointment && (
          <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("admin.appointmentDetails")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-purple/10 text-purple">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">{selectedAppointment.profiles?.full_name || t("admin.unknownClient")}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAppointment.profiles?.email || t("admin.noEmail")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAppointment.profiles?.phone || t("admin.noPhone")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-purple/10 text-purple">
                    <Scissors className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">{selectedAppointment.services.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAppointment.services.duration_minutes} {t("admin.minutes")} • {Number(selectedAppointment.services.price)} RON
                    </p>
                    {selectedAppointment.specialist_id && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Specialist: {specialists.find((s) => s.id === selectedAppointment.specialist_id)?.name || "—"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-purple/10 text-purple">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {capitalizeFirst(format(parseISO(selectedAppointment.start_time), "d MMMM yyyy", { locale: ro }))}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(selectedAppointment.start_time), "HH:mm")} -{" "}
                      {format(parseISO(selectedAppointment.end_time), "HH:mm")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <span
                    className={cn(
                      "text-sm px-3 py-1 rounded-full",
                      selectedAppointment.status === "confirmed"
                        ? "bg-green-100 text-green-700"
                        : selectedAppointment.status === "cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                    )}
                  >
                    {selectedAppointment.status === "confirmed"
                      ? "Confirmată"
                      : selectedAppointment.status === "cancelled"
                      ? "Anulată"
                      : selectedAppointment.status}
                  </span>

                  {selectedAppointment.status === "confirmed" &&
                    (isAdmin || selectedAppointment.specialist_id === specialistId) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancelMutation.mutate(selectedAppointment.id)}
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <X className="h-4 w-4" />
                            Anulează
                          </>
                        )}
                      </Button>
                    )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <AdminBookAppointment
          open={bookDialogOpen}
          onOpenChange={(open) => {
            setBookDialogOpen(open);
            if (!open) setBookDefaults({});
          }}
          defaultSpecialistId={bookDefaults.specialistId}
          defaultDate={bookDefaults.date}
          defaultTime={bookDefaults.time}
        />
      </main>
    </div>
  );
}
