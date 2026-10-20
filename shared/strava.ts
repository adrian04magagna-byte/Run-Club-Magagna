export const RUN_CLUB_APP_SCHEME = "manus083805477929675";
export const STRAVA_REQUIRED_SCOPE = "activity:read";
export const STRAVA_CONSENT_VERSION = "2026-10";
export const STRAVA_CALLBACK_PATH = "/strava/callback";

export type StravaActivitySummary = {
  id: string;
  name: string;
  type: string;
  sportType: string;
  startDate: string;
  startDateLocal: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  elevationGainMeters: number;
  averageSpeedMps: number;
  maxSpeedMps: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageCadence: number | null;
  averageWatts: number | null;
  weightedAverageWatts: number | null;
  kilojoules: number | null;
  calories: number | null;
  averageTempC: number | null;
  sufferScore: number | null;
};

export type StravaSplitMetric = {
  split: number | null;
  distanceMeters: number | null;
  elapsedTimeSeconds: number | null;
  movingTimeSeconds: number | null;
  elevationDifferenceMeters: number | null;
  averageSpeedMps: number | null;
  averageHeartRate: number | null;
  averageCadence: number | null;
  averageWatts: number | null;
};

export type StravaActivityDetail = StravaActivitySummary & {
  averageGradePercent: number | null;
  maxGradePercent: number | null;
  splitsMetric: StravaSplitMetric[];
  bestEfforts: StravaSplitMetric[];
};

/** Per-sample numeric series returned on demand; GPS coordinates are deliberately omitted. */
export type StravaActivityStreams = Record<string, number[]>;

/** Evenly reduces a series to at most `maxPoints`, keeping the first and last samples (never truncates the end). */
export function downsampleSeries(values: number[], maxPoints: number): number[] {
  const n = values.length;
  if (maxPoints < 2 || n <= maxPoints) return values.slice();
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i += 1) out.push(values[Math.round((i * (n - 1)) / (maxPoints - 1))]);
  return out;
}

const STEP_CADENCE_SPORTS = new Set(["Run", "TrailRun", "VirtualRun"]);

/**
 * Strava reports running cadence per leg (revolutions/min); its own apps show steps/min, i.e. double.
 * Other sports (e.g. cycling) keep rpm as delivered.
 */
export function cadenceDisplay(sportType: string): { multiplier: number; unit: string } {
  return STEP_CADENCE_SPORTS.has(sportType) ? { multiplier: 2, unit: "passos/min" } : { multiplier: 1, unit: "rpm" };
}
