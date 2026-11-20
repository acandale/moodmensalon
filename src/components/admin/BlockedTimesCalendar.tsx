import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Clock } from "lucide-react";

interface BlockedTime {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

interface BlockedTimesCalendarProps {
  specialistId: string;
}

export function BlockedTimesCalendar({ specialistId }: BlockedTimesCalendarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [blockTimeDialog, setBlockTimeDialog] = useState(false);
  const [blockTimeData, setBlockTimeData] = useState({
    startTime: "",
    endTime: "",
    reason: "",
  });

  const { data: blockedTimes = [], isLoading } = useQuery({
    queryKey: ["specialist-blocked-times", specialistId, currentDate.toISOString()],
    queryFn: async () => {
      const startDate = startOfMonth(currentDate);
      const endDate = endOfMonth(currentDate);

      const { data, error } = await supabase
        .from("blocked_times")
        .select("*")
        .eq("specialist_id", specialistId)
        .gte("start_time", startDate.toISOString())
        .lte("start_time", endDate.toISOString())
        .order("start_time", { ascending: true });

      if (error) throw error;
      return data as BlockedTime[];
    },
  });

  const blockTimeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDay) return;
      
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
      toast({ title: "Timp blocat cu succes" });
      setBlockTimeDialog(false);
      setBlockTimeData({ startTime: "", endTime: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-times", specialistId] });
    },
    onError: () => {
      toast({ title: "Eroare la blocarea timpului", variant: "destructive" });
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
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-1">
        {["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"].map((day) => (
          <div key={day} className="p-1 text-center text-xs font-medium text-muted-foreground">
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
                "min-h-[60px] p-1 border rounded-lg transition-colors cursor-pointer hover:bg-muted/50 text-xs",
                isCurrentMonth ? "bg-card" : "bg-muted/30",
                isToday && "ring-2 ring-purple",
                isSelected && "bg-purple/10"
              )}
              onClick={() => setSelectedDay(day)}
            >
              <div className={cn("font-medium mb-0.5", !isCurrentMonth && "text-muted-foreground")}>
                {format(day, "d")}
              </div>
              {dayBlockedTimes.slice(0, 1).map((bt) => (
                <div key={bt.id} className="p-0.5 rounded bg-red-100 text-red-700 truncate text-[10px]">
                  {format(parseISO(bt.start_time), "HH:mm")}
                </div>
              ))}
              {dayBlockedTimes.length > 1 && (
                <div className="text-[10px] text-muted-foreground">+{dayBlockedTimes.length - 1}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const selectedDayBlockedTimes = selectedDay ? getBlockedTimesForDay(selectedDay) : [];

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
        <span className="text-sm font-medium">{format(currentDate, "MMMM yyyy")}</span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {renderCalendar()}

      {/* Selected day details */}
      {selectedDay ? (
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{format(selectedDay, "EEEE, d MMM")}</p>
            <Dialog open={blockTimeDialog} onOpenChange={setBlockTimeDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-3 w-3" /> Blochează
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Blochează timp</DialogTitle>
                  <DialogDescription>
                    Blochează un interval pentru {format(selectedDay, "d MMMM yyyy")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ora început</Label>
                      <Input type="time" value={blockTimeData.startTime} onChange={(e) => setBlockTimeData({ ...blockTimeData, startTime: e.target.value })} />
                    </div>
                    <div>
                      <Label>Ora sfârșit</Label>
                      <Input type="time" value={blockTimeData.endTime} onChange={(e) => setBlockTimeData({ ...blockTimeData, endTime: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Motiv (opțional)</Label>
                    <Input value={blockTimeData.reason} onChange={(e) => setBlockTimeData({ ...blockTimeData, reason: e.target.value })} placeholder="ex: Pauză de masă" />
                  </div>
                  <Button className="w-full" variant="hero" onClick={() => blockTimeMutation.mutate()} disabled={!blockTimeData.startTime || !blockTimeData.endTime || blockTimeMutation.isPending}>
                    {blockTimeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Blochează"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {selectedDayBlockedTimes.length > 0 ? (
            <div className="space-y-2">
              {selectedDayBlockedTimes.map((bt) => (
                <div key={bt.id} className="flex items-center justify-between p-2 rounded-lg border bg-red-50 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-red-600" />
                    <span className="font-medium">
                      {format(parseISO(bt.start_time), "HH:mm")} - {format(parseISO(bt.end_time), "HH:mm")}
                    </span>
                    {bt.reason && <span className="text-xs text-muted-foreground">• {bt.reason}</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => deleteMutation.mutate(bt.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Nicio blocare pentru această zi</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">Selectează o zi din calendar</p>
      )}
    </div>
  );
}
