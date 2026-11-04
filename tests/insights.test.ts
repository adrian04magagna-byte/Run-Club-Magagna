import { describe, expect, it } from "vitest";

import { currentStreak, dailyBuckets, periodSeries, totals, type TrainingEntry } from "../shared/insights";

const run = (date: string, km: number, minutes: number): TrainingEntry => ({
  id: `${date}-${km}`, source: "strava", title: "Corrida", date, startLocal: null,
  distanceMeters: km * 1000, movingSeconds: minutes * 60, elevationMeters: 10, averageHeartRate: null,
});

describe("dashboard math", () => {
  const entries = [run("2026-11-04", 5, 30), run("2026-11-03", 10, 55), run("2026-11-01", 0.3, 1), run("2026-10-20", 8, 48)];

  it("sums totals and ignores sub-kilometre runs for best pace", () => {
    const result = totals(entries.slice(0, 3));
    expect(result.distanceMeters).toBe(15300);
    expect(result.runs).toBe(3);
    expect(result.activeDays).toBe(3);
    expect(result.longestMeters).toBe(10000);
    expect(result.bestPaceSecondsPerKm).toBe(330);
  });

  it("buckets the last seven days with weekday labels", () => {
    const days = dailyBuckets(entries, "2026-11-04", 7);
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ label: "QUA", from: "2026-11-04", distanceMeters: 5000 });
    expect(days[5].distanceMeters).toBe(10000);
  });

  it("uses weeks for 90 days and months for the whole history", () => {
    expect(periodSeries(entries, "90d", "2026-11-04")).toHaveLength(13);
    const months = periodSeries(entries, "all", "2026-11-04");
    expect(months.at(-1)).toMatchObject({ label: "NOV", distanceMeters: 15300 });
    expect(months.at(-2)).toMatchObject({ label: "OUT", distanceMeters: 8000 });
  });

  it("counts the streak through yesterday", () => {
    expect(currentStreak(entries, "2026-11-04")).toBe(2);
    expect(currentStreak(entries, "2026-11-05")).toBe(2);
    expect(currentStreak(entries, "2026-11-07")).toBe(0);
  });
});
