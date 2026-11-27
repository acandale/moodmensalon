import { useMemo } from "react";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from "date-fns";
import { ro } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  CalendarOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Palmtree,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { capitalizeFirst, normalizeHHMM } from "@/lib/time-format";

export interface SplitCalendarSpecialist {
  id: string;
  name: string;
  title?: string | null;
}

export interface SplitCalendarWorkHour {
  id?: string;
  specialist_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean | null;
}

export interface SplitCalendarBlockedTime {
  id: string;
  specialist_id: string | null;
  start_time: string;
  end_time: string;
  reason: string | null;
}

export interface SplitCalendarBlockedDay {
  id: string;
  specialist_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface SplitCalendarAppointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  user_id: string | null;
  specialist_id: string | null;
  profiles: {
    full_name: string;
    email: string;
    phone: string;
  } | null;
  services: {
    name: string;
    duration_minutes: number;
    price: number;
  };
}

interface SpecialistSplitCalendarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  specialists: SplitCalendarSpecialist[];
  selectedSpecialistId: string | null;
  onSelectSpecialistFilter?: (specialistId: string | null) => void;
  isAdmin: boolean;
  currentSpecialistId?: string | null;
  appointments: SplitCalendarAppointment[];
  weekAppointmentDates?: Date[];
  specialistWorkHours: SplitCalendarWorkHour[];
  salonWorkHours: SplitCalendarWorkHour[];
  blockedTimes: SplitCalendarBlockedTime[];
  blockedDays: SplitCalendarBlockedDay[];
  onSelectAppointment: (appointment: SplitCalendarAppointment) => void;
  onQuickBook: (params: { specialistId?: string; date: Date; time?: string }) => void;
  onOpenBlockedTimes?: (specialistId: string) => void;
}

const SLOT_HEIGHT = 22; // 22px per 15 min => 88px per hour
const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

const AVATAR_TONES = [
  "bg-purple/15 text-purple ring-purple/30",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/30",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30",
];

const CARD_PALETTES = [
  "bg-[#FEF9C3] border-[#FDE047] text-slate-900 dark:bg-amber-950/75 dark:border-amber-700/70 dark:text-amber-50",
  "bg-[#DCFCE7] border-[#86EFAC] text-slate-900 dark:bg-emerald-950/75 dark:border-emerald-700/70 dark:text-emerald-50",
  "bg-[#FFE4E2] border-[#FCA5A5] text-slate-900 dark:bg-rose-950/75 dark:border-rose-700/70 dark:text-rose-50",
  "bg-[#DBEAFE] border-[#93C5FD] text-slate-900 dark:bg-sky-950/75 dark:border-sky-700/70 dark:text-sky-50",
  "bg-[#F3E8FF] border-[#D8B4FE] text-slate-900 dark:bg-purple-950/75 dark:border-purple-700/70 dark:text-purple-50",
];

function getColorIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function toMinutes(hhmm: string): number {
  const [h, m] = normalizeHHMM(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface PositionedAppointment {
  appointment: SplitCalendarAppointment;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
}

function layoutColumnAppointments(items: SplitCalendarAppointment[]): PositionedAppointment[] {
  const sorted = [...items].sort(
    (a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
  );

  const parsed = sorted.map((apt) => {
    const start = parseISO(apt.start_time);
    const end = parseISO(apt.end_time);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const rawEnd = end.getHours() * 60 + end.getMinutes();
    const endMinutes = Math.max(startMinutes + 15, rawEnd);
    return { appointment: apt, startMinutes, endMinutes };
  });

  // Group into connected overlap clusters
  const result: PositionedAppointment[] = [];
  let cluster: typeof parsed = [];
  let clusterMaxEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((item) => {
      let laneIdx = laneEnds.findIndex((endMin) => endMin <= item.startMinutes);
      if (laneIdx === -1) {
        laneIdx = laneEnds.length;
        laneEnds.push(item.endMinutes);
      } else {
        laneEnds[laneIdx] = item.endMinutes;
      }
      return { ...item, lane: laneIdx };
    });
    const laneCount = Math.max(1, laneEnds.length);
    for (const item of assigned) {
      result.push({ ...item, laneCount });
    }
    cluster = [];
    clusterMaxEnd = -1;
  };

  for (const item of parsed) {
    if (cluster.length === 0 || item.startMinutes < clusterMaxEnd) {
      cluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMinutes);
    } else {
      flushCluster();
      cluster.push(item);
      clusterMaxEnd = item.endMinutes;
    }
  }
  flushCluster();

  return result;
}

export function SpecialistSplitCalendar({
  currentDate,
  onDateChange,
  specialists,
  selectedSpecialistId,
  onSelectSpecialistFilter,
  isAdmin,
  currentSpecialistId,
  appointments,
  weekAppointmentDates = [],
  specialistWorkHours,
  salonWorkHours,
  blockedTimes,
  blockedDays,
  onSelectAppointment,
  onQuickBook,
  onOpenBlockedTimes,
}: SpecialistSplitCalendarProps) {
  const canManageSpecialist = (specId: string) =>
    isAdmin || (!!currentSpecialistId && specId === currentSpecialistId);
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  );

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }),
    [weekStart]
  );

  const dateKey = format(currentDate, "yyyy-MM-dd");
  const dayOfWeek = currentDate.getDay();
  const isToday = isSameDay(currentDate, new Date());

  const dayAppointments = useMemo(
    () => appointments.filter((apt) => isSameDay(parseISO(apt.start_time), currentDate)),
    [appointments, currentDate]
  );

  // Visible columns: selected specialist or all active specialists
  const visibleSpecialists = useMemo(() => {
    const base = selectedSpecialistId
      ? specialists.filter((s) => s.id === selectedSpecialistId)
      : specialists;

    const knownIds = new Set(base.map((s) => s.id));
    const hasUnassigned = dayAppointments.some(
      (apt) => !apt.specialist_id || (!selectedSpecialistId && !knownIds.has(apt.specialist_id))
    );

    if (hasUnassigned && !selectedSpecialistId) {
      return [...base, { id: "__unassigned__", name: "Nealocat", title: null }];
    }
    return base;
  }, [specialists, selectedSpecialistId, dayAppointments]);

  const salonDayHour = useMemo(
    () => salonWorkHours.find((wh) => wh.day_of_week === dayOfWeek),
    [salonWorkHours, dayOfWeek]
  );

  // Compute schedule details per column
  const columnMeta = useMemo(() => {
    return visibleSpecialists.map((spec) => {
      const isUnassigned = spec.id === "__unassigned__";
      const vacation = !isUnassigned
        ? blockedDays.find(
            (bd) =>
              bd.specialist_id === spec.id &&
              dateKey >= bd.start_date &&
              dateKey <= bd.end_date
          )
        : undefined;

      const specWorkHour = !isUnassigned
        ? specialistWorkHours.find(
            (wh) => wh.specialist_id === spec.id && wh.day_of_week === dayOfWeek
          )
        : undefined;

      const effectiveWH = specWorkHour || salonDayHour;
      const isWorking =
        !isUnassigned &&
        !vacation &&
        !!effectiveWH?.is_working_day &&
        !!effectiveWH.start_time &&
        !!effectiveWH.end_time;

      const workStartStr = effectiveWH ? normalizeHHMM(effectiveWH.start_time) : "09:00";
      const workEndStr = effectiveWH ? normalizeHHMM(effectiveWH.end_time) : "19:00";

      const subtitle = isUnassigned
        ? "Fără specialist"
        : vacation
        ? "Vacanță"
        : isWorking
        ? `${workStartStr} - ${workEndStr}`
        : "Liber";

      const colAppointments = isUnassigned
        ? dayAppointments.filter(
            (apt) => !apt.specialist_id || !specialists.some((s) => s.id === apt.specialist_id)
          )
        : dayAppointments.filter((apt) => apt.specialist_id === spec.id);

      const colBlockedTimes = isUnassigned
        ? []
        : blockedTimes.filter((bt) => bt.specialist_id === spec.id);

      return {
        specialist: spec,
        isUnassigned,
        vacation,
        isWorking,
        workStartMinutes: isWorking ? toMinutes(workStartStr) : 0,
        workEndMinutes: isWorking ? toMinutes(workEndStr) : 0,
        subtitle,
        appointments: layoutColumnAppointments(colAppointments),
        blockedTimes: colBlockedTimes,
      };
    });
  }, [
    visibleSpecialists,
    blockedDays,
    dateKey,
    specialistWorkHours,
    dayOfWeek,
    salonDayHour,
    dayAppointments,
    specialists,
    blockedTimes,
  ]);

  // Calculate unified vertical hour range for all columns
  const { startHour, endHour } = useMemo(() => {
    let minMin = Infinity;
    let maxMin = -Infinity;

    for (const col of columnMeta) {
      if (col.isWorking) {
        minMin = Math.min(minMin, col.workStartMinutes);
        maxMin = Math.max(maxMin, col.workEndMinutes);
      }
      for (const item of col.appointments) {
        minMin = Math.min(minMin, item.startMinutes);
        maxMin = Math.max(maxMin, item.endMinutes);
      }
      for (const bt of col.blockedTimes) {
        const s = parseISO(bt.start_time);
        const e = parseISO(bt.end_time);
        minMin = Math.min(minMin, s.getHours() * 60 + s.getMinutes());
        maxMin = Math.max(maxMin, e.getHours() * 60 + e.getMinutes());
      }
    }

    if (!Number.isFinite(minMin) || !Number.isFinite(maxMin)) {
      return { startHour: 9, endHour: 20 };
    }

    const sHour = Math.max(6, Math.floor(minMin / 60));
    const eHour = Math.min(23, Math.max(sHour + 2, Math.ceil(maxMin / 60)));
    return { startHour: sHour, endHour: eHour };
  }, [columnMeta]);

  const slots = useMemo(() => {
    const list: { hour: number; minute: number; minutesFromMidnight: number }[] = [];
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        list.push({ hour: h, minute: m, minutesFromMidnight: h * 60 + m });
      }
    }
    return list;
  }, [startHour, endHour]);

  const startMinutesOfGrid = startHour * 60;
  const totalHeight = slots.length * SLOT_HEIGHT;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine =
    isToday && nowMinutes >= startMinutesOfGrid && nowMinutes <= endHour * 60;
  const nowTop = ((nowMinutes - startMinutesOfGrid) / 15) * SLOT_HEIGHT;

  return (
    <div className="relative space-y-4">
      {/* Top date selector & 7-day Monday-first week strip */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Săptămâna anterioară"
            onClick={() => onDateChange(addDays(currentDate, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 px-3 text-base sm:text-lg font-semibold gap-1.5"
              >
                <span>
                  {capitalizeFirst(format(currentDate, "EEE d MMM", { locale: ro }))}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(d) => d && onDateChange(d)}
                weekStartsOn={1}
                locale={ro}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Săptămâna următoare"
            onClick={() => onDateChange(addDays(currentDate, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 7-day Monday..Sunday strip */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, idx) => {
            const selected = isSameDay(day, currentDate);
            const dayIsToday = isSameDay(day, new Date());
            const hasAppointments = weekAppointmentDates.some((d) => isSameDay(d, day));

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDateChange(day)}
                className={cn(
                  "flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple",
                  "hover:bg-muted/70"
                )}
              >
                <span className="text-[11px] font-medium text-muted-foreground mb-1">
                  {WEEKDAY_INITIALS[idx]}
                </span>
                <span
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums transition-colors",
                    selected
                      ? "bg-purple text-white shadow-sm"
                      : dayIsToday
                      ? "ring-1 ring-purple text-purple"
                      : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                <span
                  className={cn(
                    "mt-1 h-0.5 w-4 rounded-full transition-opacity",
                    hasAppointments ? "bg-purple/60 opacity-100" : "opacity-0"
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Split Specialist Schedule Grid */}
      {columnMeta.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground">
          Nu există specialiști activi de afișat în calendar.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-fit">
              {/* Sticky Specialist Column Headers */}
              <div className="flex border-b border-border bg-card sticky top-0 z-20">
                <div className="w-14 sm:w-16 shrink-0 flex items-center justify-center text-[11px] font-medium text-muted-foreground py-3">
                  Oră
                </div>
                {columnMeta.map((col) => {
                  const avatarTone = AVATAR_TONES[getColorIndex(col.specialist.id, AVATAR_TONES.length)];
                  const isFocused = selectedSpecialistId === col.specialist.id;

                  return (
                    <div
                      key={col.specialist.id}
                      className="min-w-[175px] sm:min-w-[220px] flex-1 border-l border-border px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ring-1",
                            avatarTone
                          )}
                        >
                          {getInitials(col.specialist.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {col.specialist.name}
                          </p>
                          <p
                            className={cn(
                              "text-xs tabular-nums truncate",
                              col.vacation
                                ? "text-amber-600 dark:text-amber-400 font-medium"
                                : col.isWorking
                                ? "text-muted-foreground"
                                : "text-muted-foreground/70 italic"
                            )}
                          >
                            {col.subtitle}
                          </p>
                        </div>
                      </div>

                      {!col.isUnassigned && (canManageSpecialist(col.specialist.id) || !!onSelectSpecialistFilter) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label={`Opțiuni ${col.specialist.name}`}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canManageSpecialist(col.specialist.id) && (
                              <DropdownMenuItem
                                onClick={() =>
                                  onQuickBook({
                                    specialistId: col.specialist.id,
                                    date: currentDate,
                                  })
                                }
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Programează la {col.specialist.name}
                              </DropdownMenuItem>
                            )}
                            {onSelectSpecialistFilter && (
                              <DropdownMenuItem
                                onClick={() =>
                                  onSelectSpecialistFilter(isFocused ? null : col.specialist.id)
                                }
                              >
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                {isFocused
                                  ? "Arată toți specialiștii"
                                  : `Filtrează doar ${col.specialist.name}`}
                              </DropdownMenuItem>
                            )}
                            {canManageSpecialist(col.specialist.id) && onOpenBlockedTimes && (
                              <DropdownMenuItem
                                onClick={() => onOpenBlockedTimes(col.specialist.id)}
                              >
                                <CalendarOff className="h-4 w-4 mr-2" />
                                Blochează orar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Scrollable Time Grid Body */}
              <div className="flex relative" style={{ height: totalHeight }}>
                {/* Left Time Gutter */}
                <div className="w-14 sm:w-16 shrink-0 relative bg-card select-none">
                  {slots.map(({ hour, minute }, idx) => (
                    <div
                      key={`${hour}-${minute}`}
                      style={{ height: SLOT_HEIGHT }}
                      className="relative"
                    >
                      {minute === 0 && (
                        <span
                          className={cn(
                            "absolute right-2 text-xs text-muted-foreground tabular-nums leading-none",
                            idx === 0 ? "top-1" : "-top-2"
                          )}
                        >
                          {format(new Date(2000, 0, 1, hour, 0), "HH:mm")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Specialist Columns */}
                {columnMeta.map((col) => (
                  <div
                    key={col.specialist.id}
                    className="min-w-[175px] sm:min-w-[220px] flex-1 border-l border-border relative"
                  >
                    {/* Background 15-min slots */}
                    {slots.map(({ hour, minute, minutesFromMidnight }) => {
                      const isHourLine = minute === 0;
                      const isHalfHourLine = minute === 30;
                      const isWithinWorkHours =
                        col.isWorking &&
                        minutesFromMidnight >= col.workStartMinutes &&
                        minutesFromMidnight < col.workEndMinutes;
                      const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
                        2,
                        "0"
                      )}`;

                      const canQuickBookSlot =
                        isWithinWorkHours && !col.isUnassigned && canManageSpecialist(col.specialist.id);

                      return (
                        <div
                          key={timeStr}
                          style={{ height: SLOT_HEIGHT }}
                          onClick={() => {
                            if (canQuickBookSlot) {
                              onQuickBook({
                                specialistId: col.specialist.id,
                                date: currentDate,
                                time: timeStr,
                              });
                            }
                          }}
                          title={
                            canQuickBookSlot
                              ? `Adaugă programare pentru ${col.specialist.name} la ${timeStr}`
                              : undefined
                          }
                          className={cn(
                            "transition-colors group relative",
                            isHourLine && "border-t border-border/80",
                            isHalfHourLine && "border-t border-border/35",
                            !isWithinWorkHours
                              ? "bg-muted/45"
                              : canQuickBookSlot && "hover:bg-purple/5 cursor-pointer"
                          )}
                        >
                          {canQuickBookSlot && (
                            <span className="hidden group-hover:inline-block absolute right-1.5 top-0.5 text-[10px] font-medium text-purple/70 tabular-nums pointer-events-none">
                              + {timeStr}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Vacation Banner Overlay */}
                    {col.vacation && (
                      <div className="absolute inset-x-1.5 top-2 z-10 rounded-md border border-amber-300/70 bg-amber-50/90 dark:bg-amber-950/60 dark:border-amber-700/60 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Palmtree className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          Vacanță{col.vacation.reason ? `: ${col.vacation.reason}` : ""}
                        </span>
                      </div>
                    )}

                    {/* Blocked Times Overlay */}
                    {col.blockedTimes.map((bt) => {
                      const btStart = parseISO(bt.start_time);
                      const btEnd = parseISO(bt.end_time);
                      const btStartMin = Math.max(
                        startMinutesOfGrid,
                        btStart.getHours() * 60 + btStart.getMinutes()
                      );
                      const btEndMin = Math.min(
                        endHour * 60,
                        Math.max(btStartMin + 15, btEnd.getHours() * 60 + btEnd.getMinutes())
                      );
                      const top = ((btStartMin - startMinutesOfGrid) / 15) * SLOT_HEIGHT;
                      const height = Math.max(
                        SLOT_HEIGHT - 2,
                        ((btEndMin - btStartMin) / 15) * SLOT_HEIGHT - 2
                      );

                      return (
                        <div
                          key={bt.id}
                          style={{ top: top + 1, height }}
                          className="absolute inset-x-1 z-10 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive overflow-hidden pointer-events-none"
                        >
                          <div className="font-medium tabular-nums truncate">
                            {format(btStart, "HH:mm")} - {format(btEnd, "HH:mm")}
                          </div>
                          <div className="truncate opacity-85">
                            Blocat{bt.reason ? ` • ${bt.reason}` : ""}
                          </div>
                        </div>
                      );
                    })}

                    {/* Current Time Line */}
                    {showNowLine && (
                      <div
                        style={{ top: nowTop }}
                        className="absolute inset-x-0 z-10 border-t-2 border-purple pointer-events-none"
                      />
                    )}

                    {/* Appointments inside this Specialist's column */}
                    {col.appointments.map(({ appointment: apt, startMinutes, endMinutes, lane, laneCount }) => {
                      const clampedStart = Math.max(startMinutesOfGrid, startMinutes);
                      const clampedEnd = Math.min(endHour * 60, Math.max(clampedStart + 15, endMinutes));
                      const top = ((clampedStart - startMinutesOfGrid) / 15) * SLOT_HEIGHT + 1;
                      const height = Math.max(
                        38,
                        ((clampedEnd - clampedStart) / 15) * SLOT_HEIGHT - 2
                      );

                      const widthPct = 100 / laneCount;
                      const leftPct = lane * widthPct;
                      const palette =
                        CARD_PALETTES[
                          getColorIndex(apt.services?.name || apt.id, CARD_PALETTES.length)
                        ];
                      const clientName = apt.profiles?.full_name || "Client necunoscut";

                      return (
                        <button
                          key={apt.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAppointment(apt);
                          }}
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 3px)`,
                            width: `calc(${widthPct}% - 6px)`,
                          }}
                          className={cn(
                            "absolute z-10 rounded-md border px-2 py-1 text-left overflow-hidden shadow-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple",
                            palette,
                            apt.status === "cancelled" && "opacity-50 line-through"
                          )}
                        >
                          <div className="text-[11px] font-medium tabular-nums leading-tight opacity-80 truncate">
                            {format(parseISO(apt.start_time), "HH:mm")} -{" "}
                            {format(parseISO(apt.end_time), "HH:mm")}
                          </div>
                          <div className="text-xs sm:text-[13px] font-semibold leading-tight truncate mt-0.5">
                            {clientName}
                          </div>
                          {height >= 54 && (
                            <div className="text-[11px] leading-snug opacity-85 line-clamp-2 mt-0.5">
                              {apt.services?.name}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Floating Action Button */}
      <Button
        type="button"
        variant="hero"
        size="icon"
        aria-label="Programare nouă"
        onClick={() =>
          onQuickBook({
            specialistId:
              (!isAdmin && currentSpecialistId) || selectedSpecialistId || specialists[0]?.id,
            date: currentDate,
          })
        }
        className="fixed bottom-6 right-6 z-30 h-12 w-12 rounded-full shadow-lg"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
