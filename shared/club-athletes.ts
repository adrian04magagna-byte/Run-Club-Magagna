import { addDays, startOfWeek } from "./insights";

export type SummaryAssignment = { scheduledDate: string; status: string };
export type SummaryActivity = { date: string; distanceMeters: number; reviewed: boolean };

const ADHERENCE_WEEKS = 8;

/** What a coach needs at a glance about an athlete, from club sends and club-shared runs only. */
export function athleteSummary(assignments: SummaryAssignment[], activities: SummaryActivity[], today: string) {
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  const fourWeeksAgo = addDays(monday, -21);
  const adherenceFrom = addDays(monday, -7 * (ADHERENCE_WEEKS - 1));

  const week = assignments.filter((item) => item.scheduledDate >= monday && item.scheduledDate <= sunday && item.status !== "skipped");
  const overdue = assignments.filter((item) => item.status === "assigned" && item.scheduledDate < today).length;
  const due = assignments.filter((item) => item.scheduledDate >= adherenceFrom && item.scheduledDate < today && item.status !== "skipped");
  const dueDone = due.filter((item) => item.status === "completed").length;
  const lastRunDate = activities.reduce<string | null>((latest, run) => (!latest || run.date > latest ? run.date : latest), null);
  const sumMeters = (from: string, to: string) => activities
    .filter((run) => run.date >= from && run.date <= to)
    .reduce((sum, run) => sum + run.distanceMeters, 0);

  return {
    weekPlanned: week.length,
    weekDone: week.filter((item) => item.status === "completed").length,
    weekDistanceMeters: sumMeters(monday, sunday),
    last4WeeksDistanceMeters: sumMeters(fourWeeksAgo, today),
    overdue,
    toReview: activities.filter((run) => !run.reviewed).length,
    lastRunDate,
    daysSinceLastRun: lastRunDate ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastRunDate}T00:00:00Z`)) / 86_400_000) : null,
    adherencePercent: due.length ? Math.round((dueDone / due.length) * 100) : null,
  };
}

export type AthleteSummary = ReturnType<typeof athleteSummary>;
