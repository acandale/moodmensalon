import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

interface WorkHour {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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
      toast({ title: "Work hours updated successfully" });
      setEditedHours({});
      queryClient.invalidateQueries({ queryKey: ["admin-work-hours"] });
    },
    onError: () => {
      toast({ title: "Failed to update work hours", variant: "destructive" });
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
        <CardTitle>Work Hours</CardTitle>
        <CardDescription>
          Set your regular working hours for each day of the week
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {DAYS_OF_WEEK.map((day, index) => {
            const isWorkingDay = getValue(index, "is_working_day") as boolean;
            
            return (
              <div
                key={day}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4 min-w-[140px]">
                  <Switch
                    checked={isWorkingDay}
                    onCheckedChange={(checked) =>
                      handleChange(index, "is_working_day", checked)
                    }
                  />
                  <Label className="font-medium">{day}</Label>
                </div>

                {isWorkingDay ? (
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Start</Label>
                      <Input
                        type="time"
                        value={getValue(index, "start_time") as string}
                        onChange={(e) =>
                          handleChange(index, "start_time", e.target.value)
                        }
                        className="mt-1"
                      />
                    </div>
                    <span className="text-muted-foreground mt-5">to</span>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">End</Label>
                      <Input
                        type="time"
                        value={getValue(index, "end_time") as string}
                        onChange={(e) =>
                          handleChange(index, "end_time", e.target.value)
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground italic">Closed</span>
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
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
