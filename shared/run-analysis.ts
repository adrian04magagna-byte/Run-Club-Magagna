import { addDays, inRange, startOfWeek, totals, weeklyBuckets, type InsightBucket, type TrainingEntry } from "./insights";

export const MIN_ANALYSIS_RUNS = 8;
const WINDOW_WEEKS = 26;
const PREDICTION_WEEKS = 12;
const MIN_PAIRS = 8;
const MAX_POINTS = 80;
const MIN_PACE = 150;
const MAX_PACE = 1000;

export type CorrelationKey = "distance" | "climb" | "heartRate" | "recentLoad" | "rest";
export type Correlation = { key: CorrelationKey; r: number; n: number; points: { x: number; y: number; date: string }[] };
export type LoadStatus = "low" | "ok" | "high";
export type RunAnalysis = {
  runs: number;
  /** Last finished week against the four before it; the running week is shown but never compared. */
  load: { thisWeekKm: number; lastWeekKm: number; baselineWeeklyKm: number; ratio: number | null; status: LoadStatus | null };
  trend: { recentPace: number | null; previousPace: number | null; recentKm: number; previousKm: number; recentEfficiency: number | null; previousEfficiency: number | null };
  intensity: { basis: "heartRate" | "pace"; easy: number; moderate: number; hard: number };
  weeks: InsightBucket[];
  weeklyPace: { from: string; pace: number | null }[];
  correlations: Correlation[];
  predictions: { label: string; meters: number; seconds: number; trainedForIt: boolean }[];
};

type Run = TrainingEntry & { pace: number; km: number };

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const sumKm = (runs: Run[]) => runs.reduce((sum, run) => sum + run.km, 0);
const isBetween = (run: Run, from: string, to: string) => run.date >= from && run.date <= to;

/** Pearson's r, or null when either side does not vary. */
export function pearson(pairs: { x: number; y: number }[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / n;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / n;
  let cross = 0;
  let squareX = 0;
  let squareY = 0;
  for (const { x, y } of pairs) {
    cross += (x - meanX) * (y - meanY);
    squareX += (x - meanX) ** 2;
    squareY += (y - meanY) ** 2;
  }
  if (!squareX || !squareY) return null;
  return cross / Math.sqrt(squareX * squareY);
}

function correlation(key: CorrelationKey, pairs: { x: number; y: number; date: string }[]): Correlation[] {
  if (pairs.length < MIN_PAIRS) return [];
  const r = pearson(pairs);
  if (r === null) return [];
  return [{ key, r: round(r), n: pairs.length, points: pairs.slice(-MAX_POINTS) }];
}

function correlations(runs: Run[], all: Run[]): Correlation[] {
  const firstMonday = startOfWeek(all[0]?.date ?? "2000-01-03");
  const previousWeekKm = (run: Run) => {
    const monday = addDays(startOfWeek(run.date), -7);
    return monday < firstMonday ? null : sumKm(all.filter((other) => isBetween(other, monday, addDays(monday, 6))));
  };
  const paired = (read: (run: Run, index: number) => number | null) => runs.flatMap((run, index) => {
    const x = read(run, index);
    return x === null ? [] : [{ x: round(x), y: run.pace, date: run.date }];
  });
  return [
    ...correlation("distance", paired((run) => run.km)),
    ...correlation("climb", paired((run) => (run.elevationMeters ? run.elevationMeters / run.km : null))),
    ...correlation("heartRate", paired((run) => run.averageHeartRate)),
    ...correlation("recentLoad", paired(previousWeekKm)),
    ...correlation("rest", paired((run, index) => (index ? Math.min(7, dayGap(runs[index - 1].date, run.date)) : null))),
  ].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

function intensity(runs: Run[]): RunAnalysis["intensity"] {
  const withHeart = runs.filter((run) => run.averageHeartRate);
  const useHeart = withHeart.length * 2 >= runs.length;
  const maxHeart = Math.max(0, ...withHeart.map((run) => run.averageHeartRate ?? 0));
  const fastest = [...runs].sort((a, b) => a.pace - b.pace).slice(0, 5);
  const reference = fastest.reduce((sum, run) => sum + run.pace, 0) / Math.max(1, fastest.length);
  const seconds = { easy: 0, moderate: 0, hard: 0 };
  for (const run of useHeart ? withHeart : runs) {
    const effort = useHeart ? (run.averageHeartRate ?? 0) / maxHeart : reference / run.pace;
    const zone = useHeart
      ? effort < 0.85 ? "easy" : effort < 0.93 ? "moderate" : "hard"
      : effort < 1 / 1.2 ? "easy" : effort < 1 / 1.1 ? "moderate" : "hard";
    seconds[zone] += run.movingSeconds;
  }
  const total = seconds.easy + seconds.moderate + seconds.hard || 1;
  return {
    basis: useHeart ? "heartRate" : "pace",
    easy: round(seconds.easy / total),
    moderate: round(seconds.moderate / total),
    hard: round(seconds.hard / total),
  };
}

function efficiency(runs: Run[]): number | null {
  const withHeart = runs.filter((run) => run.averageHeartRate);
  if (withHeart.length < 3) return null;
  const meters = withHeart.reduce((sum, run) => sum + run.distanceMeters, 0);
  const beats = withHeart.reduce((sum, run) => sum + ((run.averageHeartRate ?? 0) * run.movingSeconds) / 60, 0);
  return round(meters / beats);
}

const RACES = [
  { label: "5 km", meters: 5000 },
  { label: "10 km", meters: 10_000 },
  { label: "Meia maratona", meters: 21_097 },
  { label: "Maratona", meters: 42_195 },
];

function predictions(runs: Run[], today: string): RunAnalysis["predictions"] {
  const from = addDays(startOfWeek(today), -7 * PREDICTION_WEEKS);
  const efforts = runs.filter((run) => run.distanceMeters >= 3000 && run.date >= from);
  if (!efforts.length) return [];
  const longest = Math.max(...efforts.map((run) => run.distanceMeters));
  const projected = (meters: number) => Math.min(...efforts.map((run) => run.movingSeconds * (meters / run.distanceMeters) ** 1.06));
  return RACES.map(({ label, meters }) => ({ label, meters, seconds: Math.round(projected(meters)), trainedForIt: longest * 2 >= meters }));
}

/** Everything is computed here, from the runs alone, so the screen works without any AI. */
export function analyzeRuns(entries: TrainingEntry[], today: string): RunAnalysis | null {
  const all = entries
    .filter((entry) => entry.distanceMeters >= 1000 && entry.movingSeconds > 0 && entry.date <= today)
    .map((entry) => ({ ...entry, km: entry.distanceMeters / 1000, pace: (entry.movingSeconds * 1000) / entry.distanceMeters }))
    .filter((run) => run.pace >= MIN_PACE && run.pace <= MAX_PACE)
    .sort((a, b) => a.date.localeCompare(b.date));
  const monday = startOfWeek(today);
  const runs = all.filter((run) => run.date >= addDays(monday, -7 * WINDOW_WEEKS));
  if (runs.length < MIN_ANALYSIS_RUNS) return null;

  const thisWeekKm = sumKm(all.filter((run) => isBetween(run, monday, today)));
  const lastWeekKm = sumKm(all.filter((run) => isBetween(run, addDays(monday, -7), addDays(monday, -1))));
  const baselineWeeklyKm = sumKm(all.filter((run) => isBetween(run, addDays(monday, -35), addDays(monday, -8)))) / 4;
  const ratio = baselineWeeklyKm ? round(lastWeekKm / baselineWeeklyKm) : null;
  const recent = runs.filter((run) => isBetween(run, addDays(monday, -28), addDays(monday, -1)));
  const previous = runs.filter((run) => isBetween(run, addDays(monday, -56), addDays(monday, -29)));
  const weeks = weeklyBuckets(runs, today, 12);

  return {
    runs: runs.length,
    load: {
      thisWeekKm: round(thisWeekKm, 1),
      lastWeekKm: round(lastWeekKm, 1),
      baselineWeeklyKm: round(baselineWeeklyKm, 1),
      ratio,
      status: ratio === null ? null : ratio < 0.8 ? "low" : ratio <= 1.3 ? "ok" : "high",
    },
    trend: {
      recentPace: totals(recent).averagePaceSecondsPerKm,
      previousPace: totals(previous).averagePaceSecondsPerKm,
      recentKm: round(sumKm(recent), 1),
      previousKm: round(sumKm(previous), 1),
      recentEfficiency: efficiency(recent),
      previousEfficiency: efficiency(previous),
    },
    intensity: intensity(runs),
    weeks,
    weeklyPace: weeks.map((week) => ({ from: week.from, pace: totals(inRange(runs, week.from, week.to)).averagePaceSecondsPerKm })),
    correlations: correlations(runs, all),
    predictions: predictions(runs, today),
  };
}

export type RunDiagnostic = { headline: string; strengths: string[]; attention: string[]; nextWeeks: string[] };

export const DIAGNOSTIC_SCHEMA = {
  type: "object",
  required: ["headline", "strengths", "attention", "nextWeeks"],
  properties: {
    headline: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    attention: { type: "array", items: { type: "string" } },
    nextWeeks: { type: "array", items: { type: "string" } },
  },
} as const;

export function normalizeDiagnostic(value: unknown): RunDiagnostic | null {
  const source = (value ?? {}) as Record<string, unknown>;
  const list = (items: unknown) => (Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3).map((item) => item.trim().slice(0, 240)) : []);
  const headline = typeof source.headline === "string" ? source.headline.trim().slice(0, 200) : "";
  const result = { headline, strengths: list(source.strengths), attention: list(source.attention), nextWeeks: list(source.nextWeeks) };
  return headline && result.nextWeeks.length ? result : null;
}

/** Aggregates only: no name, no place and no single run leave the server. */
export function diagnosticFacts(analysis: RunAnalysis) {
  const { runs, load, trend, intensity: zones, weeks, correlations: found, predictions: times } = analysis;
  return JSON.stringify({
    corridas_6_meses: runs,
    km_por_semana_12_semanas: weeks.map((week) => round(week.distanceMeters / 1000, 1)),
    carga: { km_semana_atual_ate_hoje: load.thisWeekKm, km_semana_passada: load.lastWeekKm, media_semanal_4_semanas_anteriores: load.baselineWeeklyKm, razao: load.ratio },
    ritmo_seg_por_km: { ultimas_4_semanas: trend.recentPace, anteriores_4_semanas: trend.previousPace },
    metros_por_batimento: { ultimas_4_semanas: trend.recentEfficiency, anteriores_4_semanas: trend.previousEfficiency },
    tempo_por_intensidade: { base_do_calculo: zones.basis === "heartRate" ? "frequência cardíaca" : "ritmo", leve: zones.easy, moderado: zones.moderate, forte: zones.hard },
    correlacoes_com_o_ritmo: found.map(({ key, r, n }) => ({ fator: key, r, corridas: n })),
    tempos_estimados_seg: times.map(({ label, seconds, trainedForIt }) => ({ prova: label, segundos: seconds, treinos_longos_suficientes: trainedForIt })),
  });
}
