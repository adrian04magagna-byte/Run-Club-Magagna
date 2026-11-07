import { describe, expect, it } from "vitest";

import { athleteSummary } from "../shared/club-athletes";

describe("athlete summary", () => {
  const today = "2026-11-06"; // a Friday; the week runs 2026-11-02 to 2026-11-08

  it("counts the week, late sends and adherence", () => {
    const summary = athleteSummary([
      { scheduledDate: "2026-11-03", status: "completed" },
      { scheduledDate: "2026-11-04", status: "assigned" },
      { scheduledDate: "2026-11-07", status: "assigned" },
      { scheduledDate: "2026-10-20", status: "completed" },
      { scheduledDate: "2026-11-05", status: "skipped" },
    ], [], today);
    expect(summary).toMatchObject({ weekPlanned: 3, weekDone: 1, overdue: 1, adherencePercent: 67 });
  });

  it("sums runs by period and finds what is left to review", () => {
    const summary = athleteSummary([], [
      { date: "2026-11-05", distanceMeters: 5000, reviewed: false },
      { date: "2026-11-02", distanceMeters: 3000, reviewed: true },
      { date: "2026-10-15", distanceMeters: 8000, reviewed: true },
      { date: "2026-09-01", distanceMeters: 9000, reviewed: true },
    ], today);
    expect(summary).toMatchObject({
      weekDistanceMeters: 8000,
      last4WeeksDistanceMeters: 16000,
      toReview: 1,
      lastRunDate: "2026-11-05",
      daysSinceLastRun: 1,
    });
  });

  it("has no adherence or last run for an athlete with no history", () => {
    expect(athleteSummary([], [], today)).toMatchObject({ adherencePercent: null, lastRunDate: null, daysSinceLastRun: null });
  });
});
