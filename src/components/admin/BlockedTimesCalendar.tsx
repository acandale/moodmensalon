import { useState } from "react";
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
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ro } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Clock } from "lucide-react";
import { TIME_OPTIONS_24H, capitalizeFirst } from "@/lib/time-format";

interface BlockedTime {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

interface BlockedTimesCalendarProps {
  specialistId: string;
}

const WEEKDAY_HEADERS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

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

  const blockTimeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDay) return;
      if (!blockTimeData.startTime || !blockTimeData.endTime || blockTimeData.endTime <= blockTimeData.startTime) {
        throw new Error("INVALID_RANGE");
      }

      const dateStr = format(selectedDay, "yyyy-MM-dd");
      const startTime = new Date(`${dateStr}T${blockTimeData.startTime}`);
      const endTime = new Date(`${dateStr}T${blockTimeData.endTime}`);

      const { error } = await supabase.from("blocked_times").insert({
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        reason: blockTimeData.reason || null,
        specialist_id: specialistId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Orar blocat cu succes" });
      setBlockTimeDialog(false);
      setBlockTimeData({ startTime: "09:00", endTime: "10:00", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
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
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
    },
    onError: () => {
      toast({ title: "Eroare la eliminare", variant: "destructive" });
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
              <DialogContent>
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
              {selectedDayBlockedTimes.map((bt) => (
                <div
                  key={bt.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-red-50 dark:bg-red-950/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="font-medium tabular-nums">
                      {format(parseISO(bt.start_time), "HH:mm")} – {format(parseISO(bt.end_time), "HH:mm")}
                    </span>
                    {bt.reason && <span className="text-xs text-muted-foreground">• {bt.reason}</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600 dark:text-red-400"
                    onClick={() => deleteMutation.mutate(bt.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
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
    </div>
  );
}
