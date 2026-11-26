import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isBefore, isSameDay } from "date-fns";
import { ro } from "date-fns/locale";
import { Loader2, Plus, Trash2, Palmtree, CalendarRange, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { capitalizeFirst } from "@/lib/time-format";

interface BlockedDay {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

interface VacationsManagerProps {
  specialistId: string;
}

export function VacationsManager({ specialistId }: VacationsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [formData, setFormData] = useState<{
    startDate: Date | undefined;
    endDate: Date | undefined;
    reason: string;
  }>({ startDate: undefined, endDate: undefined, reason: "" });

  const { data: blockedDays = [], isLoading } = useQuery({
    queryKey: ["specialist-blocked-days", specialistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_days")
        .select("*")
        .eq("specialist_id", specialistId)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data as BlockedDay[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!formData.startDate || !formData.endDate) return;
      const { error } = await supabase.from("blocked_days").insert({
        start_date: format(formData.startDate, "yyyy-MM-dd"),
        end_date: format(formData.endDate, "yyyy-MM-dd"),
        reason: formData.reason || null,
        specialist_id: specialistId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Vacanță adăugată cu succes" });
      setDialogOpen(false);
      setFormData({ startDate: undefined, endDate: undefined, reason: "" });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-days", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-days-booking"] });
    },
    onError: () => {
      toast({ title: "Eroare la adăugare", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_days").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Vacanță eliminată" });
      queryClient.invalidateQueries({ queryKey: ["specialist-blocked-days", specialistId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-days-booking"] });
    },
    onError: () => {
      toast({ title: "Eroare la eliminare", variant: "destructive" });
    },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const upcoming = blockedDays.filter(
    (bd) => !isBefore(parseISO(bd.end_date), startOfToday) || isSameDay(parseISO(bd.end_date), startOfToday)
  );
  const past = blockedDays.filter(
    (bd) => isBefore(parseISO(bd.end_date), startOfToday) && !isSameDay(parseISO(bd.end_date), startOfToday)
  );

  const getDayCount = (start: string, end: string) => {
    const diff = Math.ceil((parseISO(end).getTime() - parseISO(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Zile libere și vacanțe</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-3 w-3" /> Adaugă vacanță
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adaugă zile libere</DialogTitle>
              <DialogDescription>Blochează o perioadă — nu vor fi posibile programări</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Data început</Label>
                  <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.startDate
                          ? capitalizeFirst(format(formData.startDate, "d MMM yyyy", { locale: ro }))
                          : "Alege data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        weekStartsOn={1}
                        locale={ro}
                        selected={formData.startDate}
                        disabled={(date) => date < startOfToday}
                        onSelect={(date) => {
                          if (!date) return;
                          setFormData((prev) => ({
                            ...prev,
                            startDate: date,
                            endDate: prev.endDate && prev.endDate < date ? date : prev.endDate || date,
                          }));
                          setStartPickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label>Data sfârșit</Label>
                  <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.endDate
                          ? capitalizeFirst(format(formData.endDate, "d MMM yyyy", { locale: ro }))
                          : "Alege data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        weekStartsOn={1}
                        locale={ro}
                        selected={formData.endDate}
                        disabled={(date) => date < (formData.startDate || startOfToday)}
                        onSelect={(date) => {
                          if (!date) return;
                          setFormData((prev) => ({ ...prev, endDate: date }));
                          setEndPickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Motiv (opțional)</Label>
                <Input
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="ex: Concediu, Zi liberă"
                />
              </div>

              <Button
                className="w-full"
                variant="hero"
                onClick={() => addMutation.mutate()}
                disabled={!formData.startDate || !formData.endDate || addMutation.isPending}
              >
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Blochează zilele"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {upcoming.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Viitoare / Active</Label>
          {upcoming.map((bd) => (
            <div key={bd.id} className="flex items-center justify-between p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="font-medium text-sm">
                    {format(parseISO(bd.start_date), "d MMM yyyy", { locale: ro })} – {format(parseISO(bd.end_date), "d MMM yyyy", { locale: ro })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getDayCount(bd.start_date, bd.end_date)} {getDayCount(bd.start_date, bd.end_date) > 1 ? "zile" : "zi"}
                    {bd.reason && ` • ${bd.reason}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => deleteMutation.mutate(bd.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Palmtree className="h-8 w-8 mx-auto mb-1 opacity-50" />
          <p className="text-sm">Nicio vacanță programată</p>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Trecute</Label>
          {past.map((bd) => (
            <div key={bd.id} className="flex items-center justify-between p-3 rounded-lg border opacity-60">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">
                    {format(parseISO(bd.start_date), "d MMM yyyy", { locale: ro })} – {format(parseISO(bd.end_date), "d MMM yyyy", { locale: ro })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getDayCount(bd.start_date, bd.end_date)} {getDayCount(bd.start_date, bd.end_date) > 1 ? "zile" : "zi"}
                    {bd.reason && ` • ${bd.reason}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => deleteMutation.mutate(bd.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
