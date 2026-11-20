import { addMinutes, format, parseISO } from "date-fns";

export type BookingSlotMode = "fixed" | "dynamic";
interface Interval { start_time: string; end_time: string }
interface SlotOptions {
  date: Date;
  start: string;
  end: string;
  duration: number;
  mode?: BookingSlotMode;
  occupied: Interval[];
  now?: Date;
}

export function generateBookingSlots({ date, start, end, duration, mode = "fixed", occupied, now = new Date() }: SlotOptions): string[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const at = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const result = new Date(date);
    result.setHours(h, m, 0, 0);
    return result;
  };
  const opening = at(start);
  const closing = at(end);
  const busy = occupied.map(i => ({ start: parseISO(i.start_time), end: parseISO(i.end_time) }))
    .filter(i => i.end > opening && i.start < closing && i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const slots: string[] = [];
  if (mode === "dynamic") {
    // Pack each free interval from its beginning, restarting after appointments/breaks.
    const fill = (from: Date, to: Date) => {
      for (let t = from; addMinutes(t, duration) <= to; t = addMinutes(t, duration)) {
        if (t >= now) slots.push(format(t, "HH:mm"));
      }
    };
    let cursor = opening;
    for (const interval of busy) {
      fill(cursor, interval.start < closing ? interval.start : closing);
      if (interval.end > cursor) cursor = interval.end;
    }
    fill(cursor, closing);
  } else {
    for (let t = opening; addMinutes(t, duration) <= closing; t = addMinutes(t, 15)) {
      const finish = addMinutes(t, duration);
      if (t >= now && !busy.some(i => t < i.end && finish > i.start)) slots.push(format(t, "HH:mm"));
    }
  }
  return slots;
}