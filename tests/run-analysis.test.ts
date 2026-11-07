import { describe, expect, it } from "vitest";

import { addDays, type TrainingEntry } from "../shared/insights";
import { analyzeRuns, diagnosticFacts, normalizeDiagnostic, pearson } from "../shared/run-analysis";

const today = "2026-11-07";
const run = (daysAgo: number, km: number, pace: number, heart: number | null = null, climb = 0): TrainingEntry => ({
  id: `run-${daysAgo}`, source: "strava", title: "Corrida em Canoas", date: addDays(today, -daysAgo), startLocal: null,
  distanceMeters: km * 1000, movingSeconds: km * pace, elevationMeters: climb, averageHeartRate: heart,
});

describe("run analysis", () => {
  it("computes Pearson's r and refuses a flat series", () => {
    expect(pearson([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }])).toBeCloseTo(1);
    expect(pearson([{ x: 1, y: 5 }, { x: 2, y: 4 }, { x: 3, y: 3 }])).toBeCloseTo(-1);
    expect(pearson([{ x: 1, y: 5 }, { x: 2, y: 5 }])).toBeNull();
  });

  it("waits for enough runs", () => {
    expect(analyzeRuns(Array.from({ length: 7 }, (_, index) => run(index, 5, 330)), today)).toBeNull();
  });

  it("finds that longer runs are slower and flags a sudden jump in load", () => {
    const entries = [
      ...Array.from({ length: 16 }, (_, index) => run(13 + index * 3, 4 + index, 300 + index * 5, 140 + index)),
      run(6, 30, 390, 160), run(7, 30, 390, 160),
    ];
    const analysis = analyzeRuns(entries, today)!;
    const distance = analysis.correlations.find((item) => item.key === "distance")!;
    expect(distance.r).toBeGreaterThan(0.8);
    expect(distance.n).toBe(18);
    expect(analysis.load.status).toBe("high");
    expect(analysis.intensity.basis).toBe("heartRate");
    expect(analysis.intensity.easy + analysis.intensity.moderate + analysis.intensity.hard).toBeCloseTo(1, 1);
    expect(analysis.predictions.map((item) => item.label)).toEqual(["5 km", "10 km", "Meia maratona", "Maratona"]);
  });

  it("compares the last finished Monday-to-Sunday week, not the running one", () => {
    // Today is Saturday: Monday was 5 days ago and last week ran from 12 to 6 days ago.
    const steady = Array.from({ length: 10 }, (_, index) => run(13 + index * 3, 10, 330));
    const { load } = analyzeRuns([...steady, run(3, 50, 330), run(8, 10, 330)], today)!;
    expect(load).toMatchObject({ thisWeekKm: 50, lastWeekKm: 10 });
    expect(load.baselineWeeklyKm).toBeCloseTo(25, 0);
    expect(load.status).toBe("low");
  });

  it("marks the race distances the recent training does not support", () => {
    const { predictions } = analyzeRuns(Array.from({ length: 10 }, (_, index) => run(index * 3, 8, 330)), today)!;
    expect(predictions.map((item) => item.trainedForIt)).toEqual([true, true, false, false]);
    const marathon = predictions.at(-1)!;
    expect(marathon.meters).toBe(42_195);
    expect(marathon.seconds).toBeGreaterThan(predictions[2].seconds * 2);
  });

  it("falls back to pace when there is no heart rate", () => {
    const analysis = analyzeRuns(Array.from({ length: 12 }, (_, index) => run(index * 3, 6, index % 3 ? 400 : 300)), today)!;
    expect(analysis.intensity.basis).toBe("pace");
    expect(analysis.correlations.some((item) => item.key === "heartRate")).toBe(false);
  });

  it("sends only aggregates to the AI", () => {
    const facts = diagnosticFacts(analyzeRuns(Array.from({ length: 12 }, (_, index) => run(index * 3, 6 + index, 330)), today)!);
    expect(facts).not.toContain("Canoas");
    expect(facts).not.toContain("2026-");
    JSON.parse(facts);
  });

  it("rejects an incomplete AI answer", () => {
    expect(normalizeDiagnostic({ headline: "", nextWeeks: ["x"] })).toBeNull();
    expect(normalizeDiagnostic({ headline: "Base boa", strengths: ["a", 1], attention: [], nextWeeks: ["b", "c", "d", "e"] }))
      .toEqual({ headline: "Base boa", strengths: ["a"], attention: [], nextWeeks: ["b", "c", "d"] });
  });
});
