// Aggregates salon work hours from all active specialists.
// The salon is "open" on a day if at least one active specialist works that day.
// Start = earliest start across specialists; End = latest end across specialists.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WorkHour {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

export function useWorkHours() {
  return useQuery({
    queryKey: ["work-hours-aggregated"],
    queryFn: async (): Promise<WorkHour[]> => {
      const { data: specialists, error: sErr } = await supabase
        .from("specialists")
        .select("id")
        .eq("is_active", true);
      if (sErr) throw sErr;

      const ids = (specialists ?? []).map((s) => s.id);
      let rows: any[] = [];
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from("specialist_work_hours")
          .select("*")
          .in("specialist_id", ids);
        if (error) throw error;
        rows = data ?? [];
      }

      const result: WorkHour[] = [];
      for (let day = 0; day <= 6; day++) {
        const dayRows = rows.filter(
          (r) => r.day_of_week === day && r.is_working_day
        );
        if (dayRows.length === 0) {
          result.push({
            id: `agg-${day}`,
            day_of_week: day,
            start_time: "09:00:00",
            end_time: "18:00:00",
            is_working_day: false,
          });
        } else {
          const start = dayRows.map((r) => r.start_time).sort()[0];
          const end = dayRows.map((r) => r.end_time).sort().slice(-1)[0];
          result.push({
            id: `agg-${day}`,
            day_of_week: day,
            start_time: start,
            end_time: end,
            is_working_day: true,
          });
        }
      }
      return result;
    },
  });
}
