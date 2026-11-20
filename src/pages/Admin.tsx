import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  Scissors,
  Calendar,
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
  user_id: string;
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
type AdminTab = "appointments" | "settings" | "specialists" | "work-hours" | "reviews";

export default function AdminPage() {
  const { user, isAdmin, isSpecialist, specialistId, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();

  const tabParam = searchParams.get("tab");
  const initialTab: AdminTab =
    tabParam === "settings" || tabParam === "specialists" || tabParam === "work-hours" || tabParam === "reviews"
      ? tabParam
      : "appointments";
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [filterSpecialistId, setFilterSpecialistId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || (!isAdmin && !isSpecialist))) {
      navigate("/dashboard");
    }
  }, [user, isAdmin, isSpecialist, authLoading, navigate]);

  // If specialist, auto-set filter to own specialist
  useEffect(() => {
    if (isSpecialist && specialistId) {
      setFilterSpecialistId(specialistId);
    }
  }, [isSpecialist, specialistId]);

  // Fetch specialists for filter dropdown
  const { data: specialists = [] } = useQuery({
    queryKey: ["admin-specialists-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialists")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user && (isAdmin || isSpecialist),
  });

  // Fetch work hours for dynamic calendar range
  const { data: workHours = [] } = useQuery({
    queryKey: ["admin-work-hours-range", filterSpecialistId],
    queryFn: async () => {
      // If filtering by specialist, use specialist work hours
      if (filterSpecialistId) {
        const { data, error } = await supabase
          .from("specialist_work_hours")
          .select("*")
          .eq("specialist_id", filterSpecialistId)
          .order("day_of_week", { ascending: true });
        if (error) throw error;
        return data;
      }
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
  const { data: dayBlockedTimes = [] } = useQuery({
    queryKey: ["admin-day-blocked-times", currentDate.toISOString(), viewMode, filterSpecialistId],
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

  // Fetch appointments
  const { data: appointments = [], isLoading, isFetching } = useQuery({
    queryKey: ["admin-appointments", currentDate.toISOString(), viewMode, filterSpecialistId],
    queryFn: async () => {
      let startDate: Date;
      let endDate: Date;

      if (viewMode === "month") {
        startDate = startOfMonth(currentDate);
        endDate = endOfMonth(currentDate);
      } else if (viewMode === "week") {
        startDate = startOfWeek(currentDate);
        endDate = endOfWeek(currentDate);
      } else {
        startDate = new Date(currentDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(currentDate);
        endDate.setHours(23, 59, 59, 999);
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
      const userIds = [...new Set((data || []).map(apt => apt.user_id).filter(Boolean))] as string[];

      let profilesMap = new Map<string, { full_name: string; email: string; phone: string }>();
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", userIds);

        profilesMap = new Map(
          profilesData?.map(p => [p.id, { full_name: p.full_name, email: p.email, phone: p.phone }]) || []
        );
      }

      return (data || []).map((apt: any) => ({
        ...apt,
        profiles: (apt.user_id ? profilesMap.get(apt.user_id) : null)
          || (apt.guest_name ? { full_name: apt.guest_name, email: "", phone: apt.guest_phone || "" } : null)
      })) as AppointmentWithDetails[];
    },
    enabled: !!user && (isAdmin || isSpecialist),
  });

  // Cancel appointment mutation
  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Appointment cancelled" });
      setSelectedAppointment(null);
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
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
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
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
                "min-h-[100px] p-2 border rounded-lg transition-colors",
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
                    {apt.profiles?.full_name?.split(" ")[0] || "Unknown"}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{dayAppointments.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const SLOT_HEIGHT = 40;

  const renderDayView = () => {
    const dayAppointments = getAppointmentsForDay(currentDate);

    // Determine day range from work hours, with fallback 8-20
    const dayOfWeek = currentDate.getDay();
    const todayWorkHour = workHours.find((wh: any) => wh.day_of_week === dayOfWeek);
    let dayStartHour = 8;
    let dayEndHour = 20;
    if (todayWorkHour && todayWorkHour.is_working_day) {
      const [sh] = todayWorkHour.start_time.split(":").map(Number);
      const [eh, em] = todayWorkHour.end_time.split(":").map(Number);
      dayStartHour = sh;
      dayEndHour = em > 0 ? eh + 1 : eh;
    }

    const slots: { hour: number; minute: number }[] = [];
    for (let h = dayStartHour; h < dayEndHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        slots.push({ hour: h, minute: m });
      }
    }

    const getSlotIndex = (hour: number, minute: number) =>
      (hour - dayStartHour) * 4 + minute / 15;

    const isSlotBlocked = (hour: number, minute: number) => {
      const slotTime = new Date(currentDate);
      slotTime.setHours(hour, minute, 0, 0);
      return dayBlockedTimes.find((bt) => {
        const btStart = parseISO(bt.start_time);
        const btEnd = parseISO(bt.end_time);
        return slotTime >= btStart && slotTime < btEnd;
      });
    };

    return (
      <div className="relative">
        {/* Time slots background */}
        {slots.map(({ hour, minute }) => {
          const blocked = isSlotBlocked(hour, minute);
          const isHourMark = minute === 0;

          return (
            <div
              key={`${hour}-${minute}`}
              className="flex gap-4"
              style={{ height: SLOT_HEIGHT }}
            >
              <div className={cn(
                "w-20 text-sm text-muted-foreground text-right pr-2 shrink-0 flex items-start pt-1",
                !isHourMark && "text-xs opacity-60"
              )}>
                {format(new Date(2000, 0, 1, hour, minute), "h:mm a")}
              </div>
              <div className={cn(
                "flex-1 border-l-2 pl-4",
                isHourMark ? "border-muted-foreground/30" : "border-muted"
              )}>
                {blocked && (
                  <div className="bg-destructive/15 text-destructive text-xs p-1.5 rounded border border-destructive/20">
                    🚫 {blocked.reason || "Blocked"}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Appointments overlay */}
        {dayAppointments.map((apt) => {
          const start = parseISO(apt.start_time);
          const end = parseISO(apt.end_time);
          const startSlot = getSlotIndex(start.getHours(), start.getMinutes());
          const durationMinutes = (end.getTime() - start.getTime()) / 60000;
          const spanSlots = durationMinutes / 15;
          const leftOffset = 96;

          return (
            <div
              key={apt.id}
              className="absolute right-0"
              style={{
                top: startSlot * SLOT_HEIGHT + 2,
                height: spanSlots * SLOT_HEIGHT - 4,
                left: leftOffset,
              }}
            >
              <Card
                className={cn(
                  "h-full cursor-pointer overflow-hidden",
                  apt.status === "cancelled" && "opacity-50"
                )}
                onClick={() => setSelectedAppointment(apt)}
              >
                <CardContent className="p-2 h-full flex items-center">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-2 rounded-full self-stretch min-h-[20px]",
                          SERVICE_COLORS[apt.services.name] || "bg-purple"
                        )}
                      />
                      <div>
                        <p className="font-medium text-sm">{apt.profiles?.full_name || "Unknown Client"}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.services.name} • {format(start, "h:mm a")} - {format(end, "h:mm a")}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-xs px-2 py-1 rounded-full shrink-0",
                        apt.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : apt.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {apt.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
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
            {isSpecialist && (
              <>
                <TabsTrigger value="specialists" className="flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  {t("admin.myConfig")}
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {language === "ro" ? "Recenzii" : "Reviews"}
                </TabsTrigger>
                <Button
                  variant="default"
                  size="sm"
                  className="flex items-center gap-2 ml-2"
                  onClick={() => setBookDialogOpen(true)}
                >
                  <Calendar className="h-4 w-4" />
                  Adaugă programare
                </Button>
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
                    {isAdmin && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setBookDialogOpen(true)}
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
                            : viewMode === "week"
                            ? addDays(currentDate, -7)
                            : addDays(currentDate, -1)
                        )
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="text-xl font-semibold min-w-[200px] text-center">
                      {viewMode === "month"
                        ? format(currentDate, "MMMM yyyy")
                        : viewMode === "week"
                        ? `Week of ${format(startOfWeek(currentDate), "MMM d")}`
                        : format(currentDate, "EEEE, MMMM d, yyyy")}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setCurrentDate(
                          viewMode === "month"
                            ? addMonths(currentDate, 1)
                            : viewMode === "week"
                            ? addDays(currentDate, 7)
                            : addDays(currentDate, 1)
                        )
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === "month" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("month")}
                    >
                      {t("admin.month")}
                    </Button>
                    <Button
                      variant={viewMode === "day" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("day")}
                    >
                      {t("admin.day")}
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
            <Card variant="elevated">
              <CardContent className="p-6">
                {viewMode === "month" ? renderMonthView() : renderDayView()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Specialists Tab */}
          <TabsContent value="specialists">
            <SpecialistsManager restrictToSpecialistId={isSpecialist ? specialistId : undefined} />
          </TabsContent>

          {/* Work Hours Tab - Salon Schedule */}
          <TabsContent value="work-hours">
            <WorkHoursManager />
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
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-purple/10 text-purple">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {format(parseISO(selectedAppointment.start_time), "MMMM d, yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(selectedAppointment.start_time), "h:mm a")} -{" "}
                      {format(parseISO(selectedAppointment.end_time), "h:mm a")}
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
                    {selectedAppointment.status}
                  </span>

                  {selectedAppointment.status === "confirmed" && (
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
                          Cancel
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <AdminBookAppointment open={bookDialogOpen} onOpenChange={setBookDialogOpen} />
      </main>
    </div>
  );
}
