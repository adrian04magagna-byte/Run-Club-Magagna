import { describe, expect, it } from "vitest";

import { cadenceDisplay, downsampleSeries } from "../shared/strava";

describe("Strava stream helpers", () => {
  it("keeps short series untouched and returns a copy", () => {
    const values = [1, 2, 3];
    const out = downsampleSeries(values, 300);
    expect(out).toEqual(values);
    expect(out).not.toBe(values);
  });

  it("covers the whole activity instead of truncating the end", () => {
    const values = Array.from({ length: 1000 }, (_, index) => index);
    const out = downsampleSeries(values, 300);
    expect(out).toHaveLength(300);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(999);
    expect(out.every((value, index) => index === 0 || value > out[index - 1])).toBe(true);
  });

  it("handles degenerate limits without throwing", () => {
    expect(downsampleSeries([5, 6, 7], 1)).toEqual([5, 6, 7]);
    expect(downsampleSeries([], 300)).toEqual([]);
  });

  it("doubles running cadence (per leg) to steps per minute and keeps rpm for other sports", () => {
    for (const sport of ["Run", "TrailRun", "VirtualRun"]) expect(cadenceDisplay(sport)).toEqual({ multiplier: 2, unit: "passos/min" });
    expect(cadenceDisplay("Ride")).toEqual({ multiplier: 1, unit: "rpm" });
    expect(cadenceDisplay("")).toEqual({ multiplier: 1, unit: "rpm" });
  });
});
