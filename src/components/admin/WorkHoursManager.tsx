import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { ORDERED_WEEK_DAYS, TIME_OPTIONS_24H, normalizeHHMM } from "@/lib/time-format";

interface WorkHour {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

export function WorkHoursManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editedHours, setEditedHours] = useState<Record<number, Partial<WorkHour>>>({});

  const { data: workHours = [], isLoading } = useQuery({
    queryKey: ["admin-work-hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_hours")
        .select("*")
        .order("day_of_week", { ascending: true });
      if (error) throw error;
      return data as WorkHour[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: { id: string; data: Partial<WorkHour> }[]) => {
      for (const update of updates) {
        const { error } = await supabase
          .from("work_hours")
          .update({
            start_time: update.data.start_time,
            end_time: update.data.end_time,
            is_working_day: update.data.is_working_day,
          })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Programul salonului a fost actualizat" });
      setEditedHours({});
      queryClient.invalidateQueries({ queryKey: ["admin-work-hours"] });
    },
    onError: () => {
      toast({ title: "Nu s-a putut actualiza programul", variant: "destructive" });
    },
  });

  const handleChange = (dayOfWeek: number, field: keyof WorkHour, value: string | boolean) => {
    setEditedHours((prev) => ({
      ...prev,
      [dayOfWeek]: {
        ...prev[dayOfWeek],
        [field]: value,
      },
    }));
  };

  const getWorkHourForDay = (dayOfWeek: number): WorkHour | undefined => {
    return workHours.find((wh) => wh.day_of_week === dayOfWeek);
  };

  const getValue = (dayOfWeek: number, field: keyof WorkHour) => {
    const edited = editedHours[dayOfWeek]?.[field];
    if (edited !== undefined) return edited;
    const workHour = getWorkHourForDay(dayOfWeek);
    return workHour?.[field] ?? "";
  };

  const handleSave = () => {
    const updates = Object.entries(editedHours)
      .map(([dayOfWeek, changes]) => {
        const workHour = getWorkHourForDay(Number(dayOfWeek));
        if (!workHour) return null;
        return {
          id: workHour.id,
          data: {
            start_time: (changes.start_time as string) ?? workHour.start_time,
            end_time: (changes.end_time as string) ?? workHour.end_time,
            is_working_day: (changes.is_working_day as boolean) ?? workHour.is_working_day,
          },
        };
      })
      .filter(Boolean) as { id: string; data: Partial<WorkHour> }[];

    if (updates.length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges = Object.keys(editedHours).length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Program Salon</CardTitle>
        <CardDescription>
          Setează programul obișnuit de lucru pentru fiecare zi a săptămânii (format 24h)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {ORDERED_WEEK_DAYS.map(({ index, label }) => {
            const isWorkingDay = getValue(index, "is_working_day") as boolean;
            const startVal = normalizeHHMM(getValue(index, "start_time") as string);
            const endVal = normalizeHHMM(getValue(index, "end_time") as string);
            const startOptions = startVal && !TIME_OPTIONS_24H.includes(startVal)
              ? [startVal, ...TIME_OPTIONS_24H]
              : TIME_OPTIONS_24H;
            const endOptions = endVal && !TIME_OPTIONS_24H.includes(endVal)
              ? [endVal, ...TIME_OPTIONS_24H]
              : TIME_OPTIONS_24H;

            return (
              <div
                key={label}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4 min-w-[140px]">
                  <Switch
                    checked={isWorkingDay}
                    onCheckedChange={(checked) =>
                      handleChange(index, "is_working_day", checked)
                    }
                  />
                  <Label className="font-medium">{label}</Label>
                </div>

                {isWorkingDay ? (
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Început</Label>
                      <Select
                        value={startVal}
                        onValueChange={(value) => handleChange(index, "start_time", value)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="09:00" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {startOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <span className="text-muted-foreground mt-5">–</span>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Sfârșit</Label>
                      <Select
                        value={endVal}
                        onValueChange={(value) => handleChange(index, "end_time", value)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="18:00" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {endOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground italic">Închis</span>
                )}
              </div>
            );
          })}
        </div>

        {hasChanges && (
          <div className="mt-6 flex justify-end">
            <Button
              variant="hero"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvează modificările
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
