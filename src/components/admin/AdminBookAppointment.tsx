import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, addWeeks, addMonths, addMinutes, parseISO } from "date-fns";
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
import { Loader2, ChevronsUpDown, Check, Repeat, AlertCircle, CheckCircle2 } from "lucide-react";

type RepeatMode = "none" | "daily" | "weekly" | "biweekly" | "monthly";

const REPEAT_OPTIONS: { value: RepeatMode; label: string }[] = [
  { value: "none", label: "Nu se repetă" },
  { value: "daily", label: "Zilnic" },
  { value: "weekly", label: "Săptămânal" },
  { value: "biweekly", label: "La 2 săptămâni" },
  { value: "monthly", label: "Lunar" },
];

const REPEAT_COUNT_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];

interface SpecialistWorkHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

interface SpecialistItem {
  id: string;
  name: string;
  title: string | null;
  booking_slot_mode?: string | null;
}

interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function findNearestSlot(slots: string[], targetTime: string): string | null {
  if (slots.length === 0) return null;
  const targetMins = parseMinutes(targetTime);
  let best = slots[0];
  let bestDiff = Math.abs(parseMinutes(slots[0]) - targetMins);
  for (let i = 1; i < slots.length; i++) {
    const diff = Math.abs(parseMinutes(slots[i]) - targetMins);
    if (diff < bestDiff) {
      best = slots[i];
      bestDiff = diff;
    }
  }
  return best;
}

function getOccurrenceDate(baseDate: Date, mode: RepeatMode, index: number): Date {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  if (index === 0 || mode === "none") return d;
  switch (mode) {
    case "daily":
      return addDays(d, index);
    case "weekly":
      return addWeeks(d, index);
    case "biweekly":
      return addWeeks(d, index * 2);
    case "monthly":
      return addMonths(d, index);
  }
}

interface AdminBookAppointmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSpecialistId?: string;
  defaultDate?: Date;
  defaultTime?: string;
}

export function AdminBookAppointment({
  open,
  onOpenChange,
  defaultSpecialistId,
  defaultDate,
  defaultTime,
}: AdminBookAppointmentProps) {
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
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("none");
  const [repeatCount, setRepeatCount] = useState<number>(4);
  const [occurrenceOverrides, setOccurrenceOverrides] = useState<Record<number, string>>({});
  const [defaultTimeNotice, setDefaultTimeNotice] = useState<string | null>(null);

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

  // Fetch appointments for the next 400 days to support single and recurring (weekly / biweekly / monthly) checks.
  const { data: existingAppointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: ["appointments-for-date", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfRange = new Date(startOfDay); endOfRange.setDate(endOfRange.getDate() + 430); endOfRange.setHours(23, 59, 59, 999);
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
      const endOfRange = new Date(startOfDay); endOfRange.setDate(endOfRange.getDate() + 430); endOfRange.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from("blocked_times").select("start_time, end_time")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfRange.toISOString())
        .eq("specialist_id", selectedSpecialistId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialistId && open,
  });

  // Auto-populate: logged-in specialist or clicked slot defaults
  useEffect(() => {
    if (!open) return;
    if (mySpecialistId) {
      setSelectedSpecialistId((s) => s || mySpecialistId);
    } else if (defaultSpecialistId) {
      setSelectedSpecialistId(defaultSpecialistId);
    }
    if (defaultDate) {
      setSelectedDate(defaultDate);
    }
    if (defaultTime) {
      setSelectedTime(defaultTime);
    }
  }, [open, mySpecialistId, defaultSpecialistId, defaultDate, defaultTime]);

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
    const workHour = (specialistWorkHours as SpecialistWorkHour[]).find(
      (wh) => wh.day_of_week === dayOfWeek
    );
    if (!workHour || !workHour.is_working_day) return [];
    return generateBookingSlots({
      date,
      start: workHour.start_time,
      end: workHour.end_time,
      duration: selectedService.duration_minutes,
      mode: (specialists as SpecialistItem[]).find((s) => s.id === selectedSpecialistId)?.booking_slot_mode === "dynamic" ? "dynamic" : "fixed",
      occupied: [...existingAppointments, ...blockedTimes],
    });
  };

  const timeSlots = generateTimeSlots();

  const currentSlotMode =
    (specialists as SpecialistItem[]).find((s) => s.id === selectedSpecialistId)?.booking_slot_mode === "dynamic"
      ? "dynamic"
      : "fixed";

  useEffect(() => {
    if (appointmentsLoading || blockedTimesLoading || specialistWorkHours.length === 0 || !selectedService || !selectedDate) {
      return;
    }
    if (selectedTime && !timeSlots.includes(selectedTime)) {
      const [selH, selM] = selectedTime.split(":").map(Number);
      const targetStart = new Date(selectedDate);
      targetStart.setHours(selH, selM, 0, 0);
      const targetEnd = addMinutes(targetStart, selectedService.duration_minutes);
      const overlaps = [...existingAppointments, ...blockedTimes].some((iv) => {
        const s = parseISO(iv.start_time);
        const e = parseISO(iv.end_time);
        return e > s && targetStart < e && targetEnd > s;
      });
      if (defaultTime && selectedTime === defaultTime) {
        setDefaultTimeNotice(
          overlaps
            ? `Ora ${selectedTime} este deja ocupată sau blocată în această zi.`
            : currentSlotMode === "dynamic"
            ? `Ora ${selectedTime} nu apare în grila Dinamică a specialistului pe această zi (orele se recalculează după pauze/programări). Pentru ore fixe din 15 în 15 min, schimbă modul specialistului la „Fix” în tab-ul Specialiști.`
            : `Ora ${selectedTime} nu este disponibilă în programul acestei zile.`
        );
      }
      setSelectedTime(null);
    }
  }, [
    selectedTime,
    timeSlots,
    appointmentsLoading,
    blockedTimesLoading,
    specialistWorkHours.length,
    selectedService,
    selectedDate,
    existingAppointments,
    blockedTimes,
    defaultTime,
    currentSlotMode,
  ]);

  const isDateDisabled = (date: Date) => {
    if (!selectedSpecialistId || !selectedService) return true;
    const dayOfWeek = date.getDay();
    const workHour = (specialistWorkHours as SpecialistWorkHour[]).find(
      (wh) => wh.day_of_week === dayOfWeek
    );
    if (!workHour || !workHour.is_working_day) return true;
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    const dateStr = format(date, "yyyy-MM-dd");
    if (blockedDays.some((bd) => dateStr >= bd.start_date && dateStr <= bd.end_date)) return true;
    return generateTimeSlots(date).length === 0;
  };

  useEffect(() => {
    setOccurrenceOverrides({});
  }, [selectedDate, selectedTime, selectedServiceId, selectedSpecialistId, repeatMode, repeatCount]);

  const recurringOccurrences = useMemo(() => {
    if (!selectedDate || !selectedTime || !selectedService || !selectedSpecialistId) return [];
    const count = repeatMode === "none" ? 1 : repeatCount;
    const slotMode =
      (specialists as SpecialistItem[]).find((s) => s.id === selectedSpecialistId)?.booking_slot_mode === "dynamic"
        ? "dynamic"
        : "fixed";
    const occupied = [...existingAppointments, ...blockedTimes];
    const usedDates = new Set<string>();

    const inspectDay = (
      d: Date
    ): {
      working: boolean;
      reason?: string;
      slots: string[];
    } => {
      const dayOfWeek = d.getDay();
      const workHour = (specialistWorkHours as SpecialistWorkHour[]).find(
        (wh) => wh.day_of_week === dayOfWeek
      );
      if (!workHour || !workHour.is_working_day) {
        return { working: false, reason: "Zi nelucrătoare", slots: [] };
      }
      const dateStr = format(d, "yyyy-MM-dd");
      if (blockedDays.some((bd) => dateStr >= bd.start_date && dateStr <= bd.end_date)) {
        return { working: false, reason: "Vacanță / zi liberă", slots: [] };
      }
      if (usedDates.has(dateStr)) {
        return { working: false, reason: "Zi deja programată în serie", slots: [] };
      }
      const slots = generateBookingSlots({
        date: d,
        start: workHour.start_time,
        end: workHour.end_time,
        duration: selectedService.duration_minutes,
        mode: slotMode,
        occupied,
      });
      if (slots.length === 0) {
        return { working: false, reason: "Toată ziua ocupată", slots: [] };
      }
      return { working: true, slots };
    };

    const results: Array<{
      index: number;
      date: Date;
      nominalDate: Date;
      availableSlots: string[];
      chosenTime: string | null;
      isExactTime: boolean;
      exactTimeReason?: "occupied" | "dynamic_shift";
      isSkipped: boolean;
      unavailableReason?: string;
      shiftedFromReason?: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const nominalDate = getOccurrenceDate(selectedDate, repeatMode, i);
      let targetDate = nominalDate;
      let dayInfo = inspectDay(nominalDate);
      let shiftedFromReason: string | undefined;

      if (i > 0 && !dayInfo.working) {
        const originalReason = dayInfo.reason;
        // Prefer a nearby working day where selectedTime is free; fallback to any working day with a free slot
        let fallbackMatch: { date: Date; info: ReturnType<typeof inspectDay> } | null = null;

        for (let offset = 1; offset <= 21; offset++) {
          const candidate = addDays(nominalDate, offset);
          const candidateInfo = inspectDay(candidate);
          if (candidateInfo.working) {
            if (candidateInfo.slots.includes(selectedTime)) {
              targetDate = candidate;
              dayInfo = candidateInfo;
              shiftedFromReason = originalReason;
              fallbackMatch = null;
              break;
            }
            if (!fallbackMatch) {
              fallbackMatch = { date: candidate, info: candidateInfo };
            }
          }
        }

        if (fallbackMatch) {
          targetDate = fallbackMatch.date;
          dayInfo = fallbackMatch.info;
          shiftedFromReason = originalReason;
        }
      }

      if (!dayInfo.working) {
        results.push({
          index: i,
          date: targetDate,
          nominalDate,
          availableSlots: [],
          chosenTime: null,
          isExactTime: false,
          isSkipped: true,
          unavailableReason: dayInfo.reason || "Indisponibil",
        });
        continue;
      }

      usedDates.add(format(targetDate, "yyyy-MM-dd"));
      const hasExactTime = dayInfo.slots.includes(selectedTime);
      let exactTimeReason: "occupied" | "dynamic_shift" | undefined;
      if (!hasExactTime) {
        const [selH, selM] = selectedTime.split(":").map(Number);
        const targetStart = new Date(targetDate);
        targetStart.setHours(selH, selM, 0, 0);
        const targetEnd = addMinutes(targetStart, selectedService.duration_minutes);
        const overlapsOccupied = occupied.some((iv) => {
          const s = parseISO(iv.start_time);
          const e = parseISO(iv.end_time);
          return e > s && targetStart < e && targetEnd > s;
        });
        exactTimeReason = overlapsOccupied ? "occupied" : "dynamic_shift";
      }

      const defaultTime = hasExactTime
        ? selectedTime
        : findNearestSlot(dayInfo.slots, selectedTime);

      const override = i === 0 ? undefined : occurrenceOverrides[i];
      const isSkipped = override === "skip" || !defaultTime;
      const chosenTime = isSkipped
        ? null
        : override && dayInfo.slots.includes(override)
        ? override
        : defaultTime;

      results.push({
        index: i,
        date: targetDate,
        nominalDate,
        availableSlots: dayInfo.slots,
        chosenTime,
        isExactTime: chosenTime === selectedTime,
        exactTimeReason,
        isSkipped,
        shiftedFromReason,
      });
    }

    return results;
  }, [
    selectedDate,
    selectedTime,
    selectedService,
    selectedSpecialistId,
    repeatMode,
    repeatCount,
    specialistWorkHours,
    blockedDays,
    specialists,
    existingAppointments,
    blockedTimes,
    occurrenceOverrides,
  ]);

  const availableOccurrences = useMemo(
    () => recurringOccurrences.filter((o) => !o.isSkipped && !!o.chosenTime),
    [recurringOccurrences]
  );

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
      if (!selectedService || !selectedDate || !selectedTime || !timeSlots.includes(selectedTime) || !hasClient || !selectedSpecialistId) {
        throw new Error("Missing fields");
      }

      const checkIntervalConflict = async (startTime: Date, endTime: Date): Promise<boolean> => {
        const startIso = startTime.toISOString();
        const endIso = endTime.toISOString();
        const dateStr = format(startTime, "yyyy-MM-dd");

        const [aptRes, btRes, bdRes] = await Promise.all([
          supabase
            .from("appointments")
            .select("id")
            .eq("specialist_id", selectedSpecialistId)
            .neq("status", "cancelled")
            .lt("start_time", endIso)
            .gt("end_time", startIso)
            .limit(1),
          supabase
            .from("blocked_times")
            .select("id")
            .eq("specialist_id", selectedSpecialistId)
            .lt("start_time", endIso)
            .gt("end_time", startIso)
            .limit(1),
          supabase
            .from("blocked_days")
            .select("id")
            .eq("specialist_id", selectedSpecialistId)
            .lte("start_date", dateStr)
            .gte("end_date", dateStr)
            .limit(1),
        ]);

        if (aptRes.error) throw aptRes.error;
        if (btRes.error) throw btRes.error;
        if (bdRes.error) throw bdRes.error;

        return (
          (aptRes.data && aptRes.data.length > 0) ||
          (btRes.data && btRes.data.length > 0) ||
          (bdRes.data && bdRes.data.length > 0)
        );
      };

      const [hours, minutes] = selectedTime.split(":").map(Number);

      if (repeatMode === "none") {
        const startTime = new Date(selectedDate);
        startTime.setHours(hours, minutes, 0, 0);
        const endTime = addMinutes(startTime, selectedService.duration_minutes);
        if (await checkIntervalConflict(startTime, endTime)) {
          throw new Error("overlap");
        }
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
        return { created: 1, skipped: 0 };
      }

      const toBook = availableOccurrences;
      if (toBook.length === 0) {
        throw new Error("NO_AVAILABLE_OCCURRENCES");
      }

      let created = 0;
      let skipped = recurringOccurrences.length - toBook.length;

      for (const occ of toBook) {
        if (!occ.chosenTime) continue;
        const [occHours, occMinutes] = occ.chosenTime.split(":").map(Number);
        const startTime = new Date(occ.date);
        startTime.setHours(occHours, occMinutes, 0, 0);
        const endTime = addMinutes(startTime, selectedService.duration_minutes);
        if (await checkIntervalConflict(startTime, endTime)) {
          skipped++;
          continue;
        }
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
        if (error) {
          if (error.message?.includes("overlap")) {
            skipped++;
            continue;
          }
          throw error;
        }
        created++;
      }

      if (created === 0) {
        throw new Error("overlap");
      }

      return { created, skipped };
    },
    onSuccess: (res) => {
      const clientLabel = isNewClient
        ? newClientName
        : clients.find((c) => c.id === selectedClientId)?.full_name;
      if (res.created > 1) {
        toast({
          title: `${res.created} programări create`,
          description:
            res.skipped > 0
              ? `Pentru ${clientLabel} (${res.skipped} date indisponibile au fost sărite).`
              : `Programări recurente create pentru ${clientLabel}.`,
        });
      } else {
        toast({
          title: "Programare creată",
          description: `Programare creată pentru ${clientLabel}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-for-date"] });
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      resetAndClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      const isOverlap = msg.includes("overlap");
      const noOcc = msg === "NO_AVAILABLE_OCCURRENCES";
      toast({
        title: "Programarea a eșuat",
        description: noOcc
          ? "Nicio dată din seria selectată nu are intervalul disponibil."
          : isOverlap
          ? "Acest interval este deja ocupat."
          : "Ceva nu a funcționat. Încearcă din nou.",
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
    setRepeatMode("none");
    setRepeatCount(4);
    setOccurrenceOverrides({});
    setDefaultTimeNotice(null);
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programare nouă</DialogTitle>
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
            <Select value={selectedSpecialistId} disabled={!!mySpecialistId} onValueChange={(v) => { setSelectedSpecialistId(v); setSelectedServiceId(""); setSelectedTime(null); setDefaultTimeNotice(null); }}>
              <SelectTrigger><SelectValue placeholder="Selectează specialist" /></SelectTrigger>
              <SelectContent>
                {(specialists as SpecialistItem[]).map((s) => (
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
                <Select value={selectedServiceId} onValueChange={(v) => { setSelectedServiceId(v); setSelectedTime(null); setDefaultTimeNotice(null); }}>
                  <SelectTrigger><SelectValue placeholder="Selectează un serviciu" /></SelectTrigger>
                  <SelectContent>
                    {(services as ServiceItem[]).map((s) => (
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
              <Calendar mode="single" selected={selectedDate} onSelect={(date) => { setSelectedDate(date); setSelectedTime(null); setDefaultTimeNotice(null); }} disabled={isDateDisabled} weekStartsOn={1} locale={ro} className={cn("rounded-md border pointer-events-auto")} />
            </div>
          )}

          {/* Time */}
          {selectedDate && selectedSpecialistId && (
            <div className="space-y-2">
              <label className="text-sm font-medium capitalize">Ora — {format(selectedDate, "EEEE, d MMMM", { locale: ro })}</label>
              {defaultTimeNotice && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{defaultTimeNotice}</span>
                </div>
              )}
              {timeSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                  {timeSlots.map((time) => (
                    <Button key={time} variant={selectedTime === time ? "secondary" : "outline"} size="sm" onClick={() => { setSelectedTime(time); setDefaultTimeNotice(null); }} className={cn(selectedTime === time && "ring-2 ring-purple")}>
                      {format(new Date(`2000-01-01T${time}`), "HH:mm")}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Niciun slot disponibil</p>
              )}
            </div>
          )}

          {/* Recurrence */}
          {selectedSpecialistId && selectedServiceId && (
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <Repeat className="h-4 w-4 text-purple" />
                Repetare programare
              </label>

              <div className="rounded-xl border divide-y overflow-hidden bg-card">
                {REPEAT_OPTIONS.map((option) => {
                  const isSelected = repeatMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRepeatMode(option.value)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-purple/10 font-medium text-foreground"
                          : "hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center border shrink-0 transition-colors",
                          isSelected
                            ? "bg-purple border-purple text-white"
                            : "border-muted-foreground/40 bg-transparent"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>

              {repeatMode !== "none" && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Număr de programări (inclusiv data aleasă)
                    </label>
                    <Select
                      value={String(repeatCount)}
                      onValueChange={(val) => setRepeatCount(Number(val))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REPEAT_COUNT_OPTIONS.map((cnt) => (
                          <SelectItem key={cnt} value={String(cnt)}>
                            {cnt} programări
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedDate && selectedTime && recurringOccurrences.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Previzualizare ({availableOccurrences.length}/{recurringOccurrences.length} programări vor fi create)
                        </span>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                        {recurringOccurrences.map((occ) => (
                          <div
                            key={`${occ.date.toISOString()}-${occ.index}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs py-1 border-b border-border/40 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <span className="capitalize font-medium text-foreground">
                                {format(occ.date, "EEE, d MMM yyyy", { locale: ro })}
                              </span>
                              {occ.shiftedFromReason && (
                                <p className="text-[11px] text-muted-foreground">
                                  Mutată din {format(occ.nominalDate, "d MMM", { locale: ro })} ({occ.shiftedFromReason.toLowerCase()})
                                </p>
                              )}
                              {!occ.isSkipped && !occ.isExactTime && occ.chosenTime && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                  {occ.exactTimeReason === "dynamic_shift"
                                    ? `Grilă dinamică (fără slot la ${selectedTime}) • propus ${occ.chosenTime}`
                                    : `${selectedTime} ocupat • propus ${occ.chosenTime}`}
                                </p>
                              )}
                            </div>

                            {occ.unavailableReason ? (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {occ.unavailableReason} (sărit)
                              </span>
                            ) : occ.index === 0 ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                {occ.chosenTime}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!occ.isSkipped && (
                                  <CheckCircle2
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0",
                                      occ.isExactTime
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-amber-500"
                                    )}
                                  />
                                )}
                                <Select
                                  value={occ.isSkipped ? "skip" : occ.chosenTime || "skip"}
                                  onValueChange={(val) =>
                                    setOccurrenceOverrides((prev) => ({
                                      ...prev,
                                      [occ.index]: val,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-7 w-[116px] text-xs px-2">
                                    <SelectValue>
                                      {occ.isSkipped ? "Sare peste" : occ.chosenTime}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent className="max-h-52">
                                    {occ.availableSlots.map((slot) => (
                                      <SelectItem key={slot} value={slot} className="text-xs">
                                        {slot}{slot === selectedTime ? " (ora aleasă)" : ""}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="skip" className="text-xs text-muted-foreground">
                                      Sare peste
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={resetAndClose}>Închide</Button>
            <Button
              onClick={() => bookMutation.mutate()}
              disabled={
                (isNewClient ? newClientName.trim().length < 2 : !selectedClientId) ||
                !selectedServiceId ||
                !selectedSpecialistId ||
                !selectedDate ||
                !selectedTime ||
                (repeatMode !== "none" && availableOccurrences.length === 0) ||
                bookMutation.isPending
              }
            >
              {bookMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : repeatMode !== "none" && availableOccurrences.length > 1 ? (
                `Programează (${availableOccurrences.length} ședințe)`
              ) : (
                "Programează"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
