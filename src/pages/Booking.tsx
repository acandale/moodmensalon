import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addMinutes } from "date-fns";
import { ro } from "date-fns/locale";
import { Scissors, Clock, ArrowLeft, ArrowRight, Loader2, Check, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { generateBookingSlots, BookingSlotMode } from "@/lib/booking-slots";

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  description: string;
}

interface Specialist {
  id: string;
  name: string;
  title: string;
  is_active: boolean;
  booking_slot_mode: BookingSlotMode;
}

interface WorkHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

export default function BookingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const dateLocale = ro;
  const formatCapitalized = (date: Date, pattern: string) => {
    const formatted = format(date, pattern, { locale: dateLocale });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  // Steps: 1=specialist, 2=service, 3=date/time, 4=confirm
  const [step, setStep] = useState(1);
  const [selectedSpecialist, setSelectedSpecialist] = useState<Specialist | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const channel = supabase
      .channel('appointments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ["appointments-for-date"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Fetch all active specialists
  const { data: specialists = [] } = useQuery({
    queryKey: ["booking-specialists-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialists")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Specialist[];
    },
  });

  // Fetch services for the selected specialist
  const { data: services = [] } = useQuery({
    queryKey: ["booking-services-for-specialist", selectedSpecialist?.id],
    queryFn: async () => {
      if (!selectedSpecialist) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes, price")
        .eq("specialist_id", selectedSpecialist.id)
        .order("name");
      if (error) throw error;
      return data as Service[];
    },
    enabled: !!selectedSpecialist,
  });

  // Fetch specialist-specific work hours
  const { data: specialistWorkHours = [] } = useQuery({
    queryKey: ["specialist-work-hours-booking", selectedSpecialist?.id],
    queryFn: async () => {
      if (!selectedSpecialist) return [];
      const { data, error } = await supabase
        .from("specialist_work_hours")
        .select("*")
        .eq("specialist_id", selectedSpecialist.id);
      if (error) throw error;
      return data as WorkHour[];
    },
    enabled: !!selectedSpecialist,
  });

  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["appointments-for-date", selectedDate?.toISOString(), selectedSpecialist?.id],
    queryFn: async () => {
      if (!selectedDate) return [];
      const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
      let query = supabase.from("appointments").select("start_time, end_time").gte("start_time", startOfDay.toISOString()).lte("start_time", endOfDay.toISOString()).neq("status", "cancelled");
      if (selectedSpecialist) {
        query = query.eq("specialist_id", selectedSpecialist.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDate && !!selectedSpecialist,
  });

  const { data: blockedTimes = [] } = useQuery({
    queryKey: ["blocked-times", selectedDate?.toISOString(), selectedSpecialist?.id],
    queryFn: async () => {
      if (!selectedDate) return [];
      const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from("blocked_times").select("start_time, end_time").eq("specialist_id", selectedSpecialist?.id || "").gte("start_time", startOfDay.toISOString()).lte("start_time", endOfDay.toISOString());
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDate && !!selectedSpecialist,
  });

  const { data: blockedDays = [] } = useQuery({
    queryKey: ["blocked-days-booking", selectedSpecialist?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocked_days").select("start_date, end_date").eq("specialist_id", selectedSpecialist?.id || "").gte("end_date", format(new Date(), "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialist,
  });

  const generateTimeSlots = () => {
    if (!selectedDate || !selectedService || !selectedSpecialist) return [];
    const dayOfWeek = selectedDate.getDay();
    const workHour = specialistWorkHours.find((wh) => wh.day_of_week === dayOfWeek);
    if (!workHour || !workHour.is_working_day) return [];
    return generateBookingSlots({
      date: selectedDate,
      start: workHour.start_time,
      end: workHour.end_time,
      duration: selectedService.duration_minutes,
      mode: specialists.find(s => s.id === selectedSpecialist.id)?.booking_slot_mode,
      occupied: [...existingAppointments, ...blockedTimes],
    });
  };

  const timeSlots = generateTimeSlots();

  useEffect(() => {
    if (selectedTime && !timeSlots.includes(selectedTime)) setSelectedTime(null);
  }, [selectedTime, timeSlots]);

  const isDateDisabled = (date: Date) => {
    if (!selectedSpecialist) return true;
    const dayOfWeek = date.getDay();
    const workHour = specialistWorkHours.find((wh) => wh.day_of_week === dayOfWeek);
    if (!workHour || !workHour.is_working_day) return true;
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    const dateStr = format(date, "yyyy-MM-dd");
    return blockedDays.some((bd) => dateStr >= bd.start_date && dateStr <= bd.end_date);
  };

  const handleBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime || !timeSlots.includes(selectedTime) || !user || !selectedSpecialist) return;
    setIsBooking(true);
    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const startTime = new Date(selectedDate); startTime.setHours(hours, minutes, 0, 0);
      const endTime = addMinutes(startTime, selectedService.duration_minutes);
      const { error } = await supabase.from("appointments").insert({
        user_id: user.id,
        service_id: selectedService.id,
        specialist_id: selectedSpecialist.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "confirmed",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: t("booking.confirmed"), description: `${selectedService.name} - ${selectedSpecialist.name} - ${format(startTime, "d MMMM 'la' HH:mm", { locale: dateLocale })}` });
      navigate("/dashboard");
    } catch (error: any) {
      const isOverlap = error?.message?.includes("overlap");
      toast({
        title: t("booking.failed"),
        description: isOverlap ? t("booking.slotTaken") : t("booking.failedDesc"),
        variant: "destructive",
      });
      if (isOverlap) queryClient.invalidateQueries({ queryKey: ["appointments-for-date"] });
    } finally {
      setIsBooking(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  const totalSteps = 4;
  const stepLabels = [t("booking.specialist") || "Specialist", t("booking.service"), t("booking.dateTime"), t("booking.confirm")];

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-1 sm:gap-4 mb-8 px-2 max-w-full overflow-hidden">
          {stepLabels.map((label, i) => {
            const s = i + 1;
            return (
              <div key={s} className="flex items-center gap-1 sm:gap-2 min-w-0">
                <div className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-all shrink-0", step >= s ? "bg-purple text-white" : "bg-muted text-muted-foreground")}>
                  {step > s ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : s}
                </div>
                <span className={cn("text-sm hidden sm:block", step >= s ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
                {s < totalSteps && <div className={cn("w-4 sm:w-12 h-0.5 sm:mx-2 shrink", step > s ? "bg-purple" : "bg-muted")} />}
              </div>
            );
          })}
        </div>

        {/* Step 1: Select Specialist */}
        {step === 1 && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground">{t("booking.selectSpecialist") || "Alege specialistul"}</h1>
              <p className="text-muted-foreground">{t("booking.selectSpecialistDesc") || "Alege specialistul preferat"}</p>
            </div>
            {specialists.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Niciun specialist disponibil.</p>
            ) : (
              <div className="grid gap-4">
                {specialists.map((specialist) => (
                  <Card
                    key={specialist.id}
                    variant={selectedSpecialist?.id === specialist.id ? "elevated" : "default"}
                    className={cn("cursor-pointer transition-all", selectedSpecialist?.id === specialist.id && "ring-2 ring-purple")}
                    onClick={() => { setSelectedSpecialist(specialist); setSelectedService(null); setSelectedDate(undefined); setSelectedTime(null); }}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-purple/10 flex items-center justify-center text-purple font-bold text-lg">
                            {specialist.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">{specialist.name}</h3>
                            <p className="text-sm text-muted-foreground">{specialist.title || "Specialist"}</p>
                          </div>
                        </div>
                        {selectedSpecialist?.id === specialist.id && (
                          <div className="w-8 h-8 rounded-full bg-purple flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="h-4 w-4" />{t("booking.back")}</Button>
              <Button variant="hero" disabled={!selectedSpecialist} onClick={() => setStep(2)}>{t("booking.continue")}<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Step 2: Select Service */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground">{t("booking.selectService")}</h1>
              <p className="text-muted-foreground">{t("booking.selectServiceDesc")}</p>
            </div>
            {services.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Niciun serviciu disponibil pentru acest specialist.</p>
            ) : (
              <div className="grid gap-4">
                {services.map((service) => (
                  <Card key={service.id} variant={selectedService?.id === service.id ? "elevated" : "default"} className={cn("cursor-pointer transition-all", selectedService?.id === service.id && "ring-2 ring-purple")} onClick={() => { setSelectedService(service); setSelectedDate(undefined); setSelectedTime(null); }}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg bg-purple/10 text-purple"><Scissors className="h-6 w-6" /></div>
                          <div>
                            <h3 className="font-semibold text-lg">{service.name}</h3>
                            <p className="text-sm text-muted-foreground">{service.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-purple">{Number(service.price)} RON</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-4 w-4" />{service.duration_minutes} {t("services.min")}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" />{t("booking.back")}</Button>
              <Button variant="hero" disabled={!selectedService} onClick={() => setStep(3)}>{t("booking.continue")}<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Step 3: Select Date & Time */}
        {step === 3 && (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground">{t("booking.selectDateTime")}</h1>
              <p className="text-muted-foreground">{t("booking.selectDateTimeDesc")}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <Card variant="elevated">
                <CardHeader><CardTitle>{t("booking.selectDate")}</CardTitle></CardHeader>
                <CardContent>
                  <Calendar mode="single" selected={selectedDate} onSelect={(date) => { setSelectedDate(date); setSelectedTime(null); }} disabled={isDateDisabled} weekStartsOn={1} locale={dateLocale} className="rounded-md" />
                </CardContent>
              </Card>
              <Card variant="elevated">
                <CardHeader>
                  <CardTitle>{t("booking.selectTime")}</CardTitle>
                  <CardDescription>{selectedDate ? formatCapitalized(selectedDate, "EEEE, d MMMM") : t("booking.selectDateFirst")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDate ? (
                    timeSlots.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                        {timeSlots.map((time) => (
                          <Button key={time} variant={selectedTime === time ? "secondary" : "outline"} size="sm" onClick={() => setSelectedTime(time)} className={cn(selectedTime === time && "ring-2 ring-purple")}>
                            {format(new Date(`2000-01-01T${time}`), "HH:mm")}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">{t("booking.noSlots")}</p>
                    )
                  ) : (
                    <p className="text-center text-muted-foreground py-8">{t("booking.selectDateToSee")}</p>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" />{t("booking.back")}</Button>
              <Button variant="hero" disabled={!selectedDate || !selectedTime} onClick={() => setStep(4)}>{t("booking.continue")}<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && selectedService && selectedSpecialist && selectedDate && selectedTime && (
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground">{t("booking.confirmBooking")}</h1>
              <p className="text-muted-foreground">{t("booking.reviewDetails")}</p>
            </div>
            <Card variant="elevated">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="p-6 rounded-xl bg-gradient-to-br from-navy to-navy-light text-white">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-purple-light font-bold">
                        {selectedSpecialist.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold">{selectedSpecialist.name}</p>
                        <p className="text-white/60 text-sm">{selectedSpecialist.title || "Specialist"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mb-4 pt-3 border-t border-white/20">
                      <div className="p-3 rounded-lg bg-white/10"><Scissors className="h-6 w-6 text-purple-light" /></div>
                      <div>
                        <p className="font-bold text-xl">{selectedService.name}</p>
                        <p className="text-white/70">{selectedService.description}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
                      <div>
                        <p className="text-white/60 text-sm">{t("booking.date")}</p>
                        <p className="font-semibold">{formatCapitalized(selectedDate, "d MMMM yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-white/60 text-sm">{t("booking.time")}</p>
                        <p className="font-semibold">{format(new Date(`2000-01-01T${selectedTime}`), "HH:mm")}</p>
                      </div>
                      <div>
                        <p className="text-white/60 text-sm">{t("booking.duration")}</p>
                        <p className="font-semibold">{selectedService.duration_minutes} {t("services.min")}</p>
                      </div>
                      <div>
                        <p className="text-white/60 text-sm">{t("booking.price")}</p>
                        <p className="font-semibold text-purple-light text-xl">{Number(selectedService.price)} RON</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="hero" size="xl" className="w-full" onClick={handleBooking} disabled={isBooking}>
                    {isBooking ? (<><Loader2 className="h-5 w-5 animate-spin" />{t("booking.confirming")}</>) : (<><Check className="h-5 w-5" />{t("booking.confirmBtn")}</>)}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-center mt-6">
              <Button variant="ghost" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4" />{t("booking.back")}</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
