import { describe, expect, it } from "vitest";

import { currentStreak, dailyBuckets, periodSeries, startOfWeek, totals, weekDays, weeklyBuckets, type TrainingEntry } from "../shared/insights";

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

  it("starts the week on Monday and ends it on Sunday, like Strava", () => {
    expect(startOfWeek("2026-11-04")).toBe("2026-11-02"); // quarta
    expect(startOfWeek("2026-11-02")).toBe("2026-11-02"); // segunda
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09"); // segunda seguinte
    const days = weekDays(entries, "2026-11-02");
    expect(days.map((day) => day.label)).toEqual(["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]);
    expect(days[1]).toMatchObject({ from: "2026-11-03", distanceMeters: 10000 });
    expect(days[2]).toMatchObject({ from: "2026-11-04", distanceMeters: 5000 });
    expect(days[6]).toMatchObject({ from: "2026-11-08", distanceMeters: 0 });
  });

  it("groups 90 days into Monday-to-Sunday weeks", () => {
    const weeks = weeklyBuckets(entries, "2026-11-04", 3);
    expect(weeks.at(-1)).toMatchObject({ from: "2026-11-02", to: "2026-11-04", distanceMeters: 15000 });
    expect(weeks.at(-2)).toMatchObject({ from: "2026-10-26", to: "2026-11-01", distanceMeters: 300 });
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
