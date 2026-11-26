export const TIME_OPTIONS_24H: string[] = Array.from({ length: (23 - 6) * 4 + 1 }, (_, idx) => {
  const totalMinutes = 6 * 60 + idx * 15;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

export function normalizeHHMM(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().slice(0, 5);
}

export function capitalizeFirst(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const ORDERED_WEEK_DAYS: { index: number; label: string }[] = [
  { index: 1, label: "Luni" },
  { index: 2, label: "Marți" },
  { index: 3, label: "Miercuri" },
  { index: 4, label: "Joi" },
  { index: 5, label: "Vineri" },
  { index: 6, label: "Sâmbătă" },
  { index: 0, label: "Duminică" },
];
