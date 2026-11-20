import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addMinutes } from "date-fns";
import { ro } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { generateBookingSlots } from "@/lib/booking-slots";
import { Loader2, ChevronsUpDown, Check } from "lucide-react";

interface AdminBookAppointmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminBookAppointment({ open, onOpenChange }: AdminBookAppointmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { specialistId: mySpecialistId } = useAuth();

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, phone").order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch all active specialists
  const { data: specialists = [] } = useQuery({
    queryKey: ["admin-specialists-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialists")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch services for the selected specialist
  const { data: services = [] } = useQuery({
    queryKey: ["admin-services-for-specialist", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes, price")
        .eq("specialist_id", selectedSpecialistId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialistId && open,
  });

  // Fetch specialist work hours
  const { data: specialistWorkHours = [] } = useQuery({
    queryKey: ["specialist-work-hours-admin", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const { data, error } = await supabase
        .from("specialist_work_hours")
        .select("*")
        .eq("specialist_id", selectedSpecialistId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialistId && open,
  });

  // Fetch blocked days
  const { data: blockedDays = [], isLoading: blockedDaysLoading } = useQuery({
    queryKey: ["blocked-days-booking", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const { data, error } = await supabase.from("blocked_days")
        .select("start_date, end_date")
        .eq("specialist_id", selectedSpecialistId)
        .gte("end_date", format(new Date(), "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialistId && open,
  });

  // Fetch appointments for the next 60 days so the first date with a free slot can be selected.
  const { data: existingAppointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: ["appointments-for-date", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfRange = new Date(startOfDay); endOfRange.setDate(endOfRange.getDate() + 60); endOfRange.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from("appointments").select("start_time, end_time")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfRange.toISOString())
        .neq("status", "cancelled")
        .eq("specialist_id", selectedSpecialistId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialistId && open,
  });

  // Fetch blocked times for the same range and selected specialist.
  const { data: blockedTimes = [], isLoading: blockedTimesLoading } = useQuery({
    queryKey: ["blocked-times", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfRange = new Date(startOfDay); endOfRange.setDate(endOfRange.getDate() + 60); endOfRange.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from("blocked_times").select("start_time, end_time")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfRange.toISOString())
        .eq("specialist_id", selectedSpecialistId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialistId && open,
  });

  // Auto-populate: logged-in specialist
  useEffect(() => {
    if (!open) return;
    if (mySpecialistId) setSelectedSpecialistId((s) => s || mySpecialistId);
  }, [open, mySpecialistId]);

  // Auto-select first available service
  useEffect(() => {
    if (open && services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(services[0].id);
    }
  }, [open, services, selectedServiceId]);

  const selectedService = services.find((s) => s.id === selectedServiceId);



  const generateTimeSlots = (date = selectedDate) => {
    if (!date || !selectedService || !selectedSpecialistId) return [];
    const dayOfWeek = date.getDay();
    const workHour = specialistWorkHours.find((wh: any) => wh.day_of_week === dayOfWeek);
    if (!workHour || !workHour.is_working_day) return [];
    return generateBookingSlots({
      date,
      start: workHour.start_time,
      end: workHour.end_time,
      duration: selectedService.duration_minutes,
      mode: specialists.find(s => s.id === selectedSpecialistId)?.booking_slot_mode === "dynamic" ? "dynamic" : "fixed",
      occupied: [...existingAppointments, ...blockedTimes],
    });
  };

  const timeSlots = generateTimeSlots();

  useEffect(() => {
    if (selectedTime && !timeSlots.includes(selectedTime)) setSelectedTime(null);
  }, [selectedTime, timeSlots]);

  const isDateDisabled = (date: Date) => {
    if (!selectedSpecialistId || !selectedService) return true;
    const dayOfWeek = date.getDay();
    const workHour = specialistWorkHours.find((wh: any) => wh.day_of_week === dayOfWeek);
    if (!workHour || !workHour.is_working_day) return true;
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    const dateStr = format(date, "yyyy-MM-dd");
    if (blockedDays.some((bd) => dateStr >= bd.start_date && dateStr <= bd.end_date)) return true;
    return generateTimeSlots(date).length === 0;
  };

  // Select the first day that has at least one free slot for this specialist and service.
  useEffect(() => {
    if (!open || !selectedSpecialistId || !selectedService || specialistWorkHours.length === 0) return;
    if (appointmentsLoading || blockedTimesLoading || blockedDaysLoading) return;
    if (selectedDate && !isDateDisabled(selectedDate)) return;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      if (!isDateDisabled(d)) {
        setSelectedDate(d);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDate, selectedSpecialistId, selectedService, specialistWorkHours, blockedDays, existingAppointments, blockedTimes, appointmentsLoading, blockedTimesLoading, blockedDaysLoading]);


  const bookMutation = useMutation({
    mutationFn: async () => {
      const hasClient = isNewClient ? newClientName.trim().length > 1 : !!selectedClientId;
      if (!selectedService || !selectedDate || !selectedTime || !timeSlots.includes(selectedTime) || !hasClient || !selectedSpecialistId) throw new Error("Missing fields");
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const startTime = new Date(selectedDate); startTime.setHours(hours, minutes, 0, 0);
      const endTime = addMinutes(startTime, selectedService.duration_minutes);
      const { error } = await supabase.from("appointments").insert({
        user_id: isNewClient ? null : selectedClientId,
        guest_name: isNewClient ? newClientName.trim() : null,
        guest_phone: isNewClient ? newClientPhone.trim() : null,
        service_id: selectedService.id,
        specialist_id: selectedSpecialistId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "confirmed",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Programare creată",
        description: `Programare creată pentru ${isNewClient ? newClientName : clients.find((c) => c.id === selectedClientId)?.full_name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-for-date"] });
      setSelectedTime(null);
      // Advance to the next available working day
      for (let i = 1; i < 60; i++) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        if (!isDateDisabled(d)) {
          setSelectedDate(d);
          break;
        }
      }
    },
    onError: (error: any) => {
      const isOverlap = error?.message?.includes("overlap");
      toast({
        title: "Programarea a eșuat",
        description: isOverlap ? "Acest interval este deja ocupat." : "Ceva nu a funcționat. Încearcă din nou.",
        variant: "destructive",
      });
      if (isOverlap) queryClient.invalidateQueries({ queryKey: ["appointments-for-date"] });
    },
  });

  const resetAndClose = () => {
    setSelectedClientId("");
    setSelectedSpecialistId("");
    setSelectedServiceId("");
    setSelectedDate(undefined);
    setSelectedTime(null);
    setClientSearchOpen(false);
    setIsNewClient(false);
    setNewClientName("");
    setNewClientPhone("");
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programare nouă (Admin)</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Client */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <div className="flex items-center gap-2">
              <Checkbox id="new-client" checked={isNewClient} onCheckedChange={(v) => { setIsNewClient(!!v); setSelectedClientId(""); }} />
              <label htmlFor="new-client" className="text-sm cursor-pointer">Client nou</label>
            </div>
            {isNewClient ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Nume complet" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} maxLength={100} />
                <Input placeholder="Telefon" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} maxLength={30} />
              </div>
            ) : (
            <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedClientId
                    ? (() => { const c = clients.find((c) => c.id === selectedClientId); return c ? `${c.full_name} — ${c.phone || c.email}` : "Selectează client"; })()
                    : "Caută după nume sau telefon..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Caută client..." />
                  <CommandList>
                    <CommandEmpty>Niciun client găsit.</CommandEmpty>
                    <CommandGroup>
                      {clients.map((c) => (
                        <CommandItem key={c.id} value={`${c.full_name} ${c.phone} ${c.email}`} onSelect={() => { setSelectedClientId(c.id); setClientSearchOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", selectedClientId === c.id ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span>{c.full_name}</span>
                            <span className="text-xs text-muted-foreground">{c.phone || c.email}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            )}
          </div>


          {/* Specialist */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Specialist</label>
            <Select value={selectedSpecialistId} disabled={!!mySpecialistId} onValueChange={(v) => { setSelectedSpecialistId(v); setSelectedServiceId(""); setSelectedTime(null); setSelectedDate(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Selectează specialist" /></SelectTrigger>
              <SelectContent>
                {specialists.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {s.title || "Specialist"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service */}
          {selectedSpecialistId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Serviciu</label>
              {services.length === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun serviciu disponibil pentru acest specialist.</p>
              ) : (
                <Select value={selectedServiceId} onValueChange={(v) => { setSelectedServiceId(v); setSelectedTime(null); setSelectedDate(undefined); }}>
                  <SelectTrigger><SelectValue placeholder="Selectează un serviciu" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {s.duration_minutes}min — {Number(s.price)} RON
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Date */}
          {selectedSpecialistId && selectedServiceId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Data</label>
              <Calendar mode="single" selected={selectedDate} onSelect={(date) => { setSelectedDate(date); setSelectedTime(null); }} disabled={isDateDisabled} locale={ro} className={cn("rounded-md border pointer-events-auto")} />
            </div>
          )}

          {/* Time */}
          {selectedDate && selectedSpecialistId && (
            <div className="space-y-2">
              <label className="text-sm font-medium capitalize">Ora — {format(selectedDate, "EEEE, d MMMM", { locale: ro })}</label>
              {timeSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                  {timeSlots.map((time) => (
                    <Button key={time} variant={selectedTime === time ? "secondary" : "outline"} size="sm" onClick={() => setSelectedTime(time)} className={cn(selectedTime === time && "ring-2 ring-purple")}>
                      {format(new Date(`2000-01-01T${time}`), "HH:mm")}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Niciun slot disponibil</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={resetAndClose}>Închide</Button>
            <Button onClick={() => bookMutation.mutate()} disabled={(isNewClient ? newClientName.trim().length < 2 : !selectedClientId) || !selectedServiceId || !selectedSpecialistId || !selectedDate || !selectedTime || bookMutation.isPending}>
              {bookMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Programează"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
