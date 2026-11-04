// Pure dashboard math shared by the API (and its tests). Dates are local "YYYY-MM-DD" strings so
// days are bucketed in the runner's own timezone, never the server's.

export const INSIGHT_PERIODS = ["7d", "30d", "90d", "all"] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

export const PERIOD_DAYS: Record<Exclude<InsightPeriod, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export type TrainingEntry = {
  id: string;
  source: "club" | "strava";
  title: string;
  /** Local calendar day of the run. */
  date: string;
  /** Local start time as ISO-like text, when known. */
  startLocal: string | null;
  distanceMeters: number;
  movingSeconds: number;
  elevationMeters: number;
  averageHeartRate: number | null;
};

export type InsightTotals = {
  distanceMeters: number;
  movingSeconds: number;
  runs: number;
  activeDays: number;
  elevationMeters: number;
  averagePaceSecondsPerKm: number | null;
  longestMeters: number;
  bestPaceSecondsPerKm: number | null;
};

export type InsightBucket = { label: string; from: string; to: string; distanceMeters: number; runs: number };

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Monday of the calendar week that holds `date` (weeks run Monday to Sunday, like Strava). */
export function startOfWeek(date: string): string {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function paceSecondsPerKm(distanceMeters: number, movingSeconds: number): number | null {
  return distanceMeters >= 100 && movingSeconds > 0 ? Math.round((movingSeconds * 1000) / distanceMeters) : null;
}

export function totals(entries: TrainingEntry[]): InsightTotals {
  const distanceMeters = entries.reduce((sum, entry) => sum + entry.distanceMeters, 0);
  const movingSeconds = entries.reduce((sum, entry) => sum + entry.movingSeconds, 0);
  // Best pace only counts runs of at least 1 km, so a sprint or GPS glitch does not win.
  const paces = entries
    .filter((entry) => entry.distanceMeters >= 1000)
    .map((entry) => paceSecondsPerKm(entry.distanceMeters, entry.movingSeconds))
    .filter((pace): pace is number => pace !== null);
  return {
    distanceMeters,
    movingSeconds,
    runs: entries.length,
    activeDays: new Set(entries.map((entry) => entry.date)).size,
    elevationMeters: entries.reduce((sum, entry) => sum + entry.elevationMeters, 0),
    averagePaceSecondsPerKm: paceSecondsPerKm(distanceMeters, movingSeconds),
    longestMeters: entries.reduce((max, entry) => Math.max(max, entry.distanceMeters), 0),
    bestPaceSecondsPerKm: paces.length ? Math.min(...paces) : null,
  };
}

export function inRange(entries: TrainingEntry[], from: string, to: string) {
  return entries.filter((entry) => entry.date >= from && entry.date <= to);
}

function bucket(entries: TrainingEntry[], label: string, from: string, to: string): InsightBucket {
  const inside = inRange(entries, from, to);
  return { label, from, to, distanceMeters: inside.reduce((sum, entry) => sum + entry.distanceMeters, 0), runs: inside.length };
}

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function dailyBuckets(entries: TrainingEntry[], today: string, days: number): InsightBucket[] {
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(today, index - (days - 1));
    const weekday = new Date(`${day}T12:00:00.000Z`).getUTCDay();
    return bucket(entries, days <= 7 ? WEEKDAYS[weekday] : day.slice(8, 10), day, day);
  });
}

/** Monday-to-Sunday days of the week that starts on `monday`; days still ahead stay empty. */
export function weekDays(entries: TrainingEntry[], monday: string): InsightBucket[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    return bucket(entries, WEEKDAYS[(index + 1) % 7], day, day);
  });
}

/** Calendar weeks (Monday to Sunday) ending with the current one. */
export function weeklyBuckets(entries: TrainingEntry[], today: string, weeks: number): InsightBucket[] {
  const currentMonday = startOfWeek(today);
  return Array.from({ length: weeks }, (_, index) => {
    const from = addDays(currentMonday, -7 * (weeks - 1 - index));
    const sunday = addDays(from, 6);
    return bucket(entries, `${from.slice(8, 10)}/${from.slice(5, 7)}`, from, sunday < today ? sunday : today);
  });
}

export function monthlyBuckets(entries: TrainingEntry[], today: string, months: number): InsightBucket[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: months }, (_, index) => {
    const offset = months - 1 - index;
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const from = date.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return bucket(entries, MONTHS[date.getUTCMonth()], from, end < today ? end : today);
  });
}

/** Chart buckets sized so each period reads well: days for short spans, weeks or months for long ones. */
export function periodSeries(entries: TrainingEntry[], period: InsightPeriod, today: string): InsightBucket[] {
  if (period === "7d") return dailyBuckets(entries, today, 7);
  if (period === "30d") return dailyBuckets(entries, today, 30);
  if (period === "90d") return weeklyBuckets(entries, today, 13);
  const first = entries.reduce<string | null>((min, entry) => (min === null || entry.date < min ? entry.date : min), null);
  if (!first) return monthlyBuckets(entries, today, 6);
  const [fy, fm] = first.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const span = (ty - fy) * 12 + (tm - fm) + 1;
  return monthlyBuckets(entries, today, Math.min(24, Math.max(6, span)));
}

/** Consecutive days with at least one run, ending today (or yesterday, so a rest morning keeps it). */
export function currentStreak(entries: TrainingEntry[], today: string): number {
  const days = new Set(entries.map((entry) => entry.date));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
