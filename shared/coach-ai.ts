// Shapes the coach AI asks Cohere for, and the checks that turn its answer into a workout the club
// accepts (same limits as the "Criar treino" form). The model guides; these functions decide.

export const STEP_KINDS = ["warmup", "run", "recovery", "cooldown"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export type AiStep = {
  kind: StepKind;
  label: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  targetPaceSecondsPerKm: number | null;
  instruction: string | null;
};

export type AiWorkout = { title: string; objective: string; description: string; steps: AiStep[] };
export type AiWeekDay = { date: string; rest: boolean; workout: AiWorkout | null };
export type AiReview = { rating: number; comment: string };

// Every field is required and "empty" is 0 or "" because the structured output cannot express null.
const stepSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...STEP_KINDS] },
    label: { type: "string" },
    durationMinutes: { type: "number" },
    distanceKm: { type: "number" },
    targetPace: { type: "string" },
    instruction: { type: "string" },
  },
  required: ["kind", "label", "durationMinutes", "distanceKm", "targetPace", "instruction"],
};

const workoutProperties = {
  title: { type: "string" },
  objective: { type: "string" },
  description: { type: "string" },
  steps: { type: "array", items: stepSchema },
};

export const WORKOUT_SCHEMA = { type: "object", properties: workoutProperties, required: ["title", "objective", "description", "steps"] };

export const WEEK_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: { weekday: { type: "string", enum: ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] }, rest: { type: "boolean" }, ...workoutProperties },
        required: ["weekday", "rest", "title", "objective", "description", "steps"],
      },
    },
  },
  required: ["summary", "days"],
};

export const REVIEW_SCHEMA = {
  type: "object",
  properties: { rating: { type: "integer" }, comment: { type: "string" } },
  required: ["rating", "comment"],
};

const KIND_LABELS: Record<StepKind, string> = { warmup: "Aquecimento", run: "Corrida", recovery: "Recuperação", cooldown: "Desaquecimento" };
const WEEKDAY_ORDER = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const positive = (value: unknown, max: number) => (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max ? value : null);

/** "5:30" → 330. Paces outside 2:30–12:00 /km are treated as no target. */
export function parsePaceText(value: unknown): number | null {
  const match = typeof value === "string" ? /(\d{1,2}):([0-5]\d)/.exec(value) : null;
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 150 && seconds <= 720 ? seconds : null;
}

export function normalizeStep(raw: unknown): AiStep | null {
  const step = (raw ?? {}) as Record<string, unknown>;
  const kind = STEP_KINDS.includes(step.kind as StepKind) ? (step.kind as StepKind) : "run";
  const minutes = positive(step.durationMinutes, 300);
  const km = positive(step.distanceKm, 100);
  if (!minutes && !km) return null;
  return {
    kind,
    label: text(step.label, 120) || KIND_LABELS[kind],
    durationSeconds: minutes ? Math.round(minutes * 60) : null,
    distanceMeters: km ? Math.round(km * 1000) : null,
    targetPaceSecondsPerKm: parsePaceText(step.targetPace),
    instruction: text(step.instruction, 1000) || null,
  };
}

/** Returns null when the answer has no usable step, so the caller can say the draft failed. */
export function normalizeWorkout(raw: unknown): AiWorkout | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const steps = (Array.isArray(value.steps) ? value.steps : []).map(normalizeStep).filter((step): step is AiStep => step !== null).slice(0, 12);
  if (!steps.length) return null;
  const title = text(value.title, 140);
  const objective = text(value.objective, 200);
  return {
    title: title.length >= 2 ? title : "Treino sugerido",
    objective: objective.length >= 2 ? objective : "Sugestão da IA para revisar",
    description: text(value.description, 2000),
    steps,
  };
}

/** Maps the model's weekdays onto the real dates of the week that starts on `monday`. */
export function normalizeWeek(raw: unknown, monday: string, addDays: (date: string, days: number) => string): { summary: string; days: AiWeekDay[] } {
  const value = (raw ?? {}) as Record<string, unknown>;
  const byWeekday = new Map<string, Record<string, unknown>>();
  for (const day of Array.isArray(value.days) ? value.days : []) {
    const weekday = text((day as Record<string, unknown>)?.weekday, 3).toUpperCase().replace("SÁB", "SAB");
    if (WEEKDAY_ORDER.includes(weekday) && !byWeekday.has(weekday)) byWeekday.set(weekday, day as Record<string, unknown>);
  }
  return {
    summary: text(value.summary, 600),
    days: WEEKDAY_ORDER.map((weekday, index) => {
      const day = byWeekday.get(weekday);
      const workout = day && !day.rest ? normalizeWorkout(day) : null;
      return { date: addDays(monday, index), rest: !workout, workout };
    }),
  };
}

export function normalizeReview(raw: unknown): AiReview | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const comment = text(value.comment, 2000);
  if (!comment) return null;
  const rating = typeof value.rating === "number" ? Math.min(5, Math.max(1, Math.round(value.rating))) : 4;
  return { rating, comment };
}
