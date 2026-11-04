import { describe, expect, it } from "vitest";

import { normalizeReview, normalizeWeek, normalizeWorkout, parsePaceText } from "../shared/coach-ai";
import { addDays } from "../shared/insights";

describe("coach AI drafts", () => {
  it("turns the model's step fields into club units and drops empty steps", () => {
    const workout = normalizeWorkout({
      title: "Tiros curtos",
      objective: "Velocidade",
      description: "Semana boa, hora de estímulo.",
      steps: [
        { kind: "warmup", label: "Trote", durationMinutes: 10, distanceKm: 0, targetPace: "", instruction: "" },
        { kind: "run", label: "6x400 m", durationMinutes: 0, distanceKm: 2.4, targetPace: "4:50", instruction: "Recupere 1 min" },
        { kind: "recovery", label: "Nada", durationMinutes: 0, distanceKm: 0, targetPace: "", instruction: "" },
        { kind: "sprint", label: "", durationMinutes: 5, distanceKm: 0, targetPace: "0:30", instruction: "" },
      ],
    });
    expect(workout?.steps).toHaveLength(3);
    expect(workout?.steps[0]).toMatchObject({ kind: "warmup", durationSeconds: 600, distanceMeters: null, targetPaceSecondsPerKm: null });
    expect(workout?.steps[1]).toMatchObject({ distanceMeters: 2400, targetPaceSecondsPerKm: 290, instruction: "Recupere 1 min" });
    expect(workout?.steps[2]).toMatchObject({ kind: "run", label: "Corrida", targetPaceSecondsPerKm: null });
  });

  it("rejects a workout with no usable step", () => {
    expect(normalizeWorkout({ title: "x", steps: [] })).toBeNull();
    expect(normalizeWorkout("not json")).toBeNull();
  });

  it("only accepts paces between 2:30 and 12:00 per km", () => {
    expect(parsePaceText("5:30")).toBe(330);
    expect(parsePaceText("05:30 /km")).toBe(330);
    expect(parsePaceText("1:59")).toBeNull();
    expect(parsePaceText("livre")).toBeNull();
  });

  it("maps the week onto Monday to Sunday dates, with missing days as rest", () => {
    const step = { kind: "run", label: "Leve", durationMinutes: 30, distanceKm: 0, targetPace: "", instruction: "" };
    const week = normalizeWeek({
      summary: "Base",
      days: [
        { weekday: "TER", rest: false, title: "Leve", objective: "Base", description: "", steps: [step] },
        { weekday: "SÁB", rest: false, title: "Longão", objective: "Resistência", description: "", steps: [{ ...step, durationMinutes: 70 }] },
        { weekday: "DOM", rest: true, title: "Descanso", objective: "", description: "", steps: [] },
      ],
    }, "2026-11-02", addDays);
    expect(week.days.map((day) => day.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(week.days.map((day) => day.rest)).toEqual([true, false, true, true, true, false, true]);
    expect(week.days[5].workout?.steps[0].durationSeconds).toBe(4200);
  });

  it("keeps the review rating between 1 and 5", () => {
    expect(normalizeReview({ rating: 9, comment: "Boa!" })).toEqual({ rating: 5, comment: "Boa!" });
    expect(normalizeReview({ rating: 0, comment: "Ok" })?.rating).toBe(1);
    expect(normalizeReview({ rating: 4, comment: " " })).toBeNull();
  });
});
