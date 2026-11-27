import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  parseISO,
  addDays,
  addWeeks,
  addMonths,
  subMonths,
  startOfDay,
  startOfWeek,
  endOfWeek,
  endOfYear,
  getDay,
} from "date-fns";
import { ro } from "date-fns/locale";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { TIME_OPTIONS_24H, capitalizeFirst } from "@/lib/time-format";

interface BlockedTime {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

interface BlockedSeries {
  key: string;
  startHHMM: string;
  endHHMM: string;
  reason: string | null;
  items: BlockedTime[];
  firstDate: Date;
  lastDate: Date;
}

interface BlockedTimesCalendarProps {
  specialistId: string;
}

function getBlockedSeriesKey(bt: Pick<BlockedTime, "start_time" | "end_time" | "reason">): string {
  const startHHMM = format(parseISO(bt.start_time), "HH:mm");
  const endHHMM = format(parseISO(bt.end_time), "HH:mm");
  const reason = (bt.reason || "").trim();
  return `${startHHMM}|${endHHMM}|${reason}`;
}

type BlockScope = "day" | "current_week" | "weeks" | "months" | "year";
type RepeatPattern = "daily" | "weekday";

const WEEKDAY_HEADERS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const WEEK_COUNT_OPTIONS = [1, 2, 3, 4, 6, 8, 12];
const MONTH_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 9, 12];

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function formatDurationRo(startHHMM: string, endHHMM: string): string {
  const diff = parseMinutes(endHHMM) - parseMinutes(startHHMM);
  if (diff <= 0) return "0 minute";
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(hours === 1 ? "1 oră" : `${hours} ore`);
  }
  if (mins > 0) {
    parts.push(`${mins} minute`);
  }
  return parts.join(" și ");
}

function computeTargetDates(
  selectedDay: Date,
  scope: BlockScope,
  weeksCount: number,
  monthsCount: number,
  repeatPattern: RepeatPattern
): Date[] {
  const anchor = startOfDay(selectedDay);

  if (scope === "day") {
    return [anchor];
  }

  if (scope === "current_week") {
    const weekEnd = startOfDay(endOfWeek(anchor, { weekStartsOn: 1 }));
    return eachDayOfInterval({ start: anchor, end: weekEnd });
  }

  let rangeEnd: Date;
  if (scope === "weeks") {
    rangeEnd = startOfDay(addDays(addWeeks(anchor, weeksCount), -1));
  } else if (scope === "months") {
    rangeEnd = startOfDay(addDays(addMonths(anchor, monthsCount), -1));
  } else {
    rangeEnd = startOfDay(endOfYear(anchor));
  }

  const allDays = eachDayOfInterval({ start: anchor, end: rangeEnd });
  if (repeatPattern === "weekday") {
    const targetWeekday = getDay(anchor);
    return allDays.filter((d) => getDay(d) === targetWeekday);
  }
  return allDays;
}

export function BlockedTimesCalendar({ specialistId }: BlockedTimesCalendarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [blockTimeDialog, setBlockTimeDialog] = useState(false);
  const [blockTimeData, setBlockTimeData] = useState({
    startTime: "09:00",
    endTime: "10:00",
    reason: "",
  });
  const [blockScope, setBlockScope] = useState<BlockScope>("day");
  const [weeksCount, setWeeksCount] = useState<number>(2);
  const [monthsCount, setMonthsCount] = useState<number>(1);
  const [repeatPattern, setRepeatPattern] = useState<RepeatPattern>("daily");
  const [seriesToDelete, setSeriesToDelete] = useState<{
    series: BlockedSeries;
    fromDate: Date | null;
  } | null>(null);

  const { data: blockedTimes = [], isLoading } = useQuery({
    queryKey: ["specialist-blocked-times", specialistId, format(currentDate, "yyyy-MM")],
    queryFn: async () => {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from("blocked_times")
        .select("*")
        .eq("specialist_id", specialistId)
        .gte("start_time", rangeStart.toISOString())
        .lte("start_time", rangeEnd.toISOString())
        .order("start_time", { ascending: true });

      if (error) throw error;
      return data as BlockedTime[];
    },
  });

  const { data: allSpecialistBlockedTimes = [] } = useQuery({
    queryKey: ["specialist-blocked-times-all", specialistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_times")
        .select("id, start_time, end_time, reason")
        .eq("specialist_id", specialistId)
        .order("start_time", { ascending: true });

      if (error) throw error;
      return data as BlockedTime[];
    },
  });

  const { seriesByKey, recurringSeriesList } = useMemo(() => {
    const map = new Map<string, BlockedSeries>();
    for (const bt of allSpecialistBlockedTimes) {
      const startDate = parseISO(bt.start_time);
      const startHHMM = format(startDate, "HH:mm");
      const endHHMM = format(parseISO(bt.end_time), "HH:mm");
      const reason = bt.reason?.trim() || null;
      const key = `${startHHMM}|${endHHMM}|${reason || ""}`;

      const existing = map.get(key);
      if (existing) {
        existing.items.push(bt);
        if (startDate < existing.firstDate) existing.firstDate = startDate;
        if (startDate > existing.lastDate) existing.lastDate = startDate;
      } else {
        map.set(key, {
          key,
          startHHMM,
          endHHMM,
          reason,
          items: [bt],
          firstDate: startDate,
          lastDate: startDate,
        });
      }
    }
    const list = [...map.values()].filter((s) => s.items.length > 1);
    return { seriesByKey: map, recurringSeriesList: list };
  }, [allSpecialistBlockedTimes]);

  const targetDates = useMemo(() => {
    if (!selectedDay) return [];
    return computeTargetDates(selectedDay, blockScope, weeksCount, monthsCount, repeatPattern);
  }, [selectedDay, blockScope, weeksCount, monthsCount, repeatPattern]);

  const blockTimeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDay) return { inserted: 0, skipped: 0 };
      if (!blockTimeData.startTime || !blockTimeData.endTime || blockTimeData.endTime <= blockTimeData.startTime) {
        throw new Error("INVALID_RANGE");
      }

      const datesToBlock = computeTargetDates(
        selectedDay,
        blockScope,
        weeksCount,
        monthsCount,
        repeatPattern
      );
      if (datesToBlock.length === 0) {
        return { inserted: 0, skipped: 0 };
      }

      const candidateRows = datesToBlock.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const start = new Date(`${dateStr}T${blockTimeData.startTime}`);
        const end = new Date(`${dateStr}T${blockTimeData.endTime}`);
        return {
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          reason: blockTimeData.reason.trim() || null,
          specialist_id: specialistId,
        };
      });

      const minStart = startOfDay(datesToBlock[0]).toISOString();
      const maxStart = addDays(startOfDay(datesToBlock[datesToBlock.length - 1]), 1).toISOString();

      const { data: existingRows, error: existingErr } = await supabase
        .from("blocked_times")
        .select("start_time, end_time")
        .eq("specialist_id", specialistId)
        .gte("start_time", minStart)
        .lt("start_time", maxStart);

      if (existingErr) throw existingErr;

      const existingKeys = new Set(
        (existingRows || []).map(
          (row) =>
            `${new Date(row.start_time).toISOString()}|${new Date(row.end_time).toISOString()}`
        )
      );

      const rowsToInsert = candidateRows.filter(
        (row) => !existingKeys.has(`${row.start_time}|${row.end_time}`)
      );

      const skipped = candidateRows.length - rowsToInsert.length;

      const CHUNK_SIZE = 100;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("blocked_times").insert(chunk);
        if (error) throw error;
      }

      return { inserted: rowsToInsert.length, skipped };
    },
    onSuccess: (res) => {
      if (res && res.inserted === 0 && res.skipped > 0) {
        toast({
          title: "Interval deja blocat",
          description: `Toate cele ${res.skipped} zile selectate aveau deja acest interval blocat.`,
        });
      } else if (res && res.inserted > 1) {
        toast({
          title: `Orar blocat pentru ${res.inserted} zile`,
          description:
            res.skipped > 0
              ? `${res.skipped} zile aveau deja același interval blocat.`
              : undefined,
        });
      } else {
        toast({ title: "Orar blocat cu succes" });
      }
      setBlockTimeDialog(false);
      setBlockTimeData({ startTime: "09:00", endTime: "10:00", reason: "" });
      setBlockScope("day");
      setRepeatPattern("daily");
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times-all", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
      queryClient.invalidateQueries({ queryKey: ["admin-day-blocked-times"] });
    },
    onError: (err) => {
      const isRange = err instanceof Error && err.message === "INVALID_RANGE";
      toast({
        title: isRange ? "Interval orar invalid" : "Eroare la blocarea orarului",
        description: isRange ? "Ora de sfârșit trebuie să fie după ora de început." : undefined,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_times").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Blocaj eliminat" });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times-all", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
      queryClient.invalidateQueries({ queryKey: ["admin-day-blocked-times"] });
    },
    onError: () => {
      toast({ title: "Eroare la eliminare", variant: "destructive" });
    },
  });

  const deleteSeriesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const CHUNK_SIZE = 50;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from("blocked_times")
          .delete()
          .eq("specialist_id", specialistId)
          .in("id", chunk);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast({
        title: `Blocaj recursiv șters (${count} ${count === 1 ? "zi" : "zile"})`,
      });
      setSeriesToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times-all", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
      queryClient.invalidateQueries({ queryKey: ["admin-day-blocked-times"] });
    },
    onError: () => {
      toast({ title: "Eroare la ștergerea seriei", variant: "destructive" });
    },
  });

  const getBlockedTimesForDay = (date: Date) => {
    return blockedTimes.filter((bt) => isSameDay(parseISO(bt.start_time), date));
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((day) => (
          <div key={day} className="p-1.5 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const dayBlockedTimes = getBlockedTimesForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDay && isSameDay(day, selectedDay);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[64px] p-1.5 border rounded-lg transition-colors cursor-pointer hover:bg-muted/50 text-xs",
                isCurrentMonth ? "bg-card" : "bg-muted/30",
                isToday && "ring-2 ring-purple",
                isSelected && "bg-purple/10 border-purple"
              )}
              onClick={() => setSelectedDay(day)}
            >
              <div className={cn("font-medium mb-0.5", !isCurrentMonth && "text-muted-foreground")}>
                {format(day, "d")}
              </div>
              {dayBlockedTimes.slice(0, 1).map((bt) => (
                <div key={bt.id} className="p-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 truncate text-[10px]">
                  {format(parseISO(bt.start_time), "HH:mm")}–{format(parseISO(bt.end_time), "HH:mm")}
                </div>
              ))}
              {dayBlockedTimes.length > 1 && (
                <div className="text-[10px] text-muted-foreground">+{dayBlockedTimes.length - 1} în plus</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const selectedDayBlockedTimes = selectedDay ? getBlockedTimesForDay(selectedDay) : [];
  const endTimeOptions = TIME_OPTIONS_24H.filter((t) => t > blockTimeData.startTime);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">
          {capitalizeFirst(format(currentDate, "MMMM yyyy", { locale: ro }))}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {renderCalendar()}

      {/* Selected day details — Blocaj orar */}
      {selectedDay ? (
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Blocaj orar</p>
              <p className="font-medium text-sm">
                {capitalizeFirst(format(selectedDay, "EEEE, d MMMM yyyy", { locale: ro }))}
              </p>
            </div>
            <Dialog open={blockTimeDialog} onOpenChange={setBlockTimeDialog}>
              <DialogTrigger asChild>
                <Button variant="default" size="sm">
                  <Plus className="h-3.5 w-3.5" /> Blochează orar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Blocaj orar</DialogTitle>
                  <DialogDescription>
                    Blochează un interval orar pentru{" "}
                    {capitalizeFirst(format(selectedDay, "EEEE, d MMMM yyyy", { locale: ro }))}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Ora început</Label>
                      <Select
                        value={blockTimeData.startTime}
                        onValueChange={(value) => {
                          const nextEnd =
                            blockTimeData.endTime <= value
                              ? TIME_OPTIONS_24H.find((t) => t > value) || "23:00"
                              : blockTimeData.endTime;
                          setBlockTimeData({ ...blockTimeData, startTime: value, endTime: nextEnd });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Alege ora" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {TIME_OPTIONS_24H.slice(0, -1).map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ora sfârșit</Label>
                      <Select
                        value={blockTimeData.endTime}
                        onValueChange={(value) =>
                          setBlockTimeData({ ...blockTimeData, endTime: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Alege ora" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {endTimeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Calculated duration */}
                  <div className="flex items-center justify-between rounded-lg border border-purple/30 bg-purple/10 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 text-purple shrink-0" />
                      Timp blocat:
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatDurationRo(blockTimeData.startTime, blockTimeData.endTime)}
                    </span>
                  </div>

                  {/* Recurrence options */}
                  <div className="space-y-2.5">
                    <Label className="flex items-center gap-1.5">
                      <Repeat className="h-3.5 w-3.5 text-purple" />
                      Perioadă blocare pe calendar
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={blockScope === "day" ? "default" : "outline"}
                        className="justify-start text-xs h-9"
                        onClick={() => setBlockScope("day")}
                      >
                        Blochează ziua curentă
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={blockScope === "current_week" ? "default" : "outline"}
                        className="justify-start text-xs h-9"
                        onClick={() => setBlockScope("current_week")}
                      >
                        Săptămâna curentă
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={blockScope === "weeks" ? "default" : "outline"}
                        className="justify-start text-xs h-9"
                        onClick={() => setBlockScope("weeks")}
                      >
                        Săptămâni (recursiv)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={blockScope === "months" ? "default" : "outline"}
                        className="justify-start text-xs h-9"
                        onClick={() => setBlockScope("months")}
                      >
                        Lunar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={blockScope === "year" ? "default" : "outline"}
                        className="col-span-2 justify-center text-xs h-9"
                        onClick={() => setBlockScope("year")}
                      >
                        Permanent pe anul curent ({format(selectedDay, "yyyy")})
                      </Button>
                    </div>

                    {blockScope === "weeks" && (
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs text-muted-foreground">Câte săptămâni blochezi</Label>
                        <Select
                          value={String(weeksCount)}
                          onValueChange={(val) => setWeeksCount(Number(val))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WEEK_COUNT_OPTIONS.map((w) => (
                              <SelectItem key={w} value={String(w)}>
                                {w === 1 ? "1 săptămână" : `${w} săptămâni`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {blockScope === "months" && (
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs text-muted-foreground">Câte luni blochezi</Label>
                        <Select
                          value={String(monthsCount)}
                          onValueChange={(val) => setMonthsCount(Number(val))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTH_COUNT_OPTIONS.map((m) => (
                              <SelectItem key={m} value={String(m)}>
                                {m === 1 ? "1 lună" : `${m} luni`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(blockScope === "weeks" || blockScope === "months" || blockScope === "year") && (
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs text-muted-foreground">Frecvență</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={repeatPattern === "daily" ? "secondary" : "outline"}
                            className="text-xs h-8"
                            onClick={() => setRepeatPattern("daily")}
                          >
                            În fiecare zi
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={repeatPattern === "weekday" ? "secondary" : "outline"}
                            className="text-xs h-8"
                            onClick={() => setRepeatPattern("weekday")}
                          >
                            Doar în fiecare {format(selectedDay, "EEEE", { locale: ro })}
                          </Button>
                        </div>
                      </div>
                    )}

                    {targetDates.length > 0 && (
                      <div className="flex items-start gap-2 rounded-lg bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                        <CalendarRange className="h-3.5 w-3.5 text-purple mt-0.5 shrink-0" />
                        <span>
                          {targetDates.length === 1 ? (
                            <>
                              Se va bloca doar ziua de{" "}
                              <strong className="text-foreground">
                                {capitalizeFirst(format(targetDates[0], "EEEE, d MMM yyyy", { locale: ro }))}
                              </strong>
                              .
                            </>
                          ) : (
                            <>
                              Se va bloca intervalul pe calendar pentru{" "}
                              <strong className="text-foreground">{targetDates.length} zile</strong> (
                              {format(targetDates[0], "d MMM", { locale: ro })} –{" "}
                              {format(targetDates[targetDates.length - 1], "d MMM yyyy", { locale: ro })}
                              {repeatPattern === "weekday" &&
                              (blockScope === "weeks" || blockScope === "months" || blockScope === "year")
                                ? `, în fiecare ${format(selectedDay, "EEEE", { locale: ro })}`
                                : ""}
                              ).
                            </>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Motiv (opțional)</Label>
                    <Input
                      value={blockTimeData.reason}
                      onChange={(e) => setBlockTimeData({ ...blockTimeData, reason: e.target.value })}
                      placeholder="ex: Pauză de masă"
                    />
                  </div>
                  <Button
                    className="w-full"
                    variant="hero"
                    onClick={() => blockTimeMutation.mutate()}
                    disabled={!blockTimeData.startTime || !blockTimeData.endTime || blockTimeMutation.isPending}
                  >
                    {blockTimeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : targetDates.length > 1 ? (
                      `Salvează blocaj orar (${targetDates.length} zile)`
                    ) : (
                      "Salvează blocaj orar"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {selectedDayBlockedTimes.length > 0 ? (
            <div className="space-y-2">
              {selectedDayBlockedTimes.map((bt) => {
                const matchedSeries = seriesByKey.get(getBlockedSeriesKey(bt));
                const seriesCount = matchedSeries?.items.length ?? 1;

                return (
                  <div
                    key={bt.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-red-50 dark:bg-red-950/30 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
                      <span className="font-medium tabular-nums">
                        {format(parseISO(bt.start_time), "HH:mm")} – {format(parseISO(bt.end_time), "HH:mm")}
                      </span>
                      {bt.reason && (
                        <span className="text-xs text-muted-foreground truncate">• {bt.reason}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {matchedSeries && seriesCount > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60"
                          title="Șterge toată seria recursivă"
                          onClick={() =>
                            setSeriesToDelete({
                              series: matchedSeries,
                              fromDate: selectedDay,
                            })
                          }
                        >
                          <Repeat className="h-3 w-3 mr-1" />
                          Șterge seria ({seriesCount})
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 dark:text-red-400"
                        title="Șterge doar această zi"
                        onClick={() => deleteMutation.mutate(bt.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nicio blocare orară pentru această zi
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          Selectează o zi din calendar
        </p>
      )}

      {/* Active recurring blocked series — 1-click management */}
      {recurringSeriesList.length > 0 && (
        <div className="space-y-2.5 pt-3 border-t">
          <div className="flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-purple" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Blocaje recursive active ({recurringSeriesList.length})
            </p>
          </div>
          <div className="space-y-2">
            {recurringSeriesList.map((series) => (
              <div
                key={series.key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/30 text-sm"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium tabular-nums">
                      {series.startHHMM} – {series.endHHMM}
                    </span>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple/15 text-purple">
                      {series.items.length} zile
                    </span>
                    {series.reason && (
                      <span className="text-xs text-muted-foreground">• {series.reason}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(series.firstDate, "d MMM yyyy", { locale: ro })} –{" "}
                    {format(series.lastDate, "d MMM yyyy", { locale: ro })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                  onClick={() =>
                    setSeriesToDelete({
                      series,
                      fromDate: null,
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Șterge tot ({series.items.length})
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm bulk delete dialog */}
      <AlertDialog
        open={!!seriesToDelete}
        onOpenChange={(open) => {
          if (!open && !deleteSeriesMutation.isPending) {
            setSeriesToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ștergi blocajul recursiv?</AlertDialogTitle>
            <AlertDialogDescription>
              {seriesToDelete && (
                <>
                  Intervalul{" "}
                  <strong className="text-foreground">
                    {seriesToDelete.series.startHHMM} – {seriesToDelete.series.endHHMM}
                  </strong>
                  {seriesToDelete.series.reason ? ` (${seriesToDelete.series.reason})` : ""} este
                  blocat în{" "}
                  <strong className="text-foreground">
                    {seriesToDelete.series.items.length} zile
                  </strong>{" "}
                  ({format(seriesToDelete.series.firstDate, "d MMM", { locale: ro })} –{" "}
                  {format(seriesToDelete.series.lastDate, "d MMM yyyy", { locale: ro })}).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleteSeriesMutation.isPending}>
              Renunță
            </AlertDialogCancel>
            {seriesToDelete?.fromDate &&
              (() => {
                const fromBoundary = startOfDay(seriesToDelete.fromDate).getTime();
                const fromIds = seriesToDelete.series.items
                  .filter((item) => parseISO(item.start_time).getTime() >= fromBoundary)
                  .map((item) => item.id);
                if (fromIds.length > 0 && fromIds.length < seriesToDelete.series.items.length) {
                  return (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleteSeriesMutation.isPending}
                      onClick={() => deleteSeriesMutation.mutate(fromIds)}
                    >
                      Doar de la {format(seriesToDelete.fromDate, "d MMM", { locale: ro })} ({fromIds.length} zile)
                    </Button>
                  );
                }
                return null;
              })()}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSeriesMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!seriesToDelete) return;
                deleteSeriesMutation.mutate(seriesToDelete.series.items.map((item) => item.id));
              }}
            >
              {deleteSeriesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : null}
              Șterge toate ({seriesToDelete?.series.items.length ?? 0} zile)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
