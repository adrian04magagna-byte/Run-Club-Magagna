import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import {
  activities,
  activityReviews,
  athleteAccounts,
  coachAthletes,
  stravaActivityRecords,
  stravaConnections,
  users,
  workoutAssignments,
  workoutSteps,
  workouts,
} from "../../drizzle/schema";
import { athleteSummary } from "../../shared/club-athletes";
import { addDays, paceSecondsPerKm, weeklyBuckets, type TrainingEntry } from "../../shared/insights";
import { getRunMap } from "../_core/stravaHistory";
import { getStravaConnectionStatus } from "../_core/stravaOAuth";
import { adminProcedure, athleteProcedure, router } from "../_core/trpc";
import { ALL_TIME_MAX_PAGES, stravaRunEntries } from "./insights";
import { getDb, isUniqueViolation } from "../db";
import { getProfileAvatarUrl } from "../storage/profile-avatars";

const stepInput = z.object({
  kind: z.enum(["warmup", "run", "recovery", "cooldown"]),
  label: z.string().trim().min(1).max(120),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  distanceMeters: z.number().int().positive().max(100_000).nullable().optional(),
  targetPaceSecondsPerKm: z.number().int().positive().max(3_600).nullable().optional(),
  instruction: z.string().trim().max(1000).nullable().optional(),
}).refine((step) => Boolean(step.durationSeconds || step.distanceMeters), {
  message: "Cada etapa precisa ter duração ou distância.",
});

const scheduledDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Informe uma data válida no formato AAAA-MM-DD.");

const workoutInputSchema = z.object({
  title: z.string().trim().min(2).max(140),
  objective: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  level: z.string().trim().min(2).max(32).default("Todos"),
  steps: z.array(stepInput).min(1).max(12),
});

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0];

function stepRows(workoutId: number, steps: z.infer<typeof workoutInputSchema>["steps"]) {
  return steps.map((step, index) => ({
    workoutId,
    stepOrder: index + 1,
    kind: step.kind,
    label: step.label,
    durationSeconds: step.durationSeconds ?? null,
    distanceMeters: step.distanceMeters ?? null,
    targetPaceSecondsPerKm: step.targetPaceSecondsPerKm ?? null,
    instruction: step.instruction || null,
  }));
}

async function requireOwnedWorkout(db: Tx | Awaited<ReturnType<typeof requireDb>>, coachId: number, workoutId: number) {
  const rows = await db.select().from(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.coachId, coachId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Treino não encontrado." });
  return rows[0];
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
  return db;
}

async function requireAthleteLink(coachId: number, athleteId: number) {
  const db = await requireDb();
  const link = await db.select({ id: coachAthletes.id }).from(coachAthletes)
    .where(and(eq(coachAthletes.coachId, coachId), eq(coachAthletes.athleteId, athleteId))).limit(1);
  if (!link.length) throw new TRPCError({ code: "FORBIDDEN", message: "Esse aluno não pertence à sua lista aprovada." });
  return db;
}

type Db = Awaited<ReturnType<typeof requireDb>>;

/**
 * The coach's own place in the athlete list: their student profile when one shares their Strava
 * login, otherwise the coach account itself.
 */
async function ownAthleteId(db: Db, coachId: number) {
  const [own] = await db.select({ hash: stravaConnections.stravaAthleteHash }).from(stravaConnections)
    .where(eq(stravaConnections.userId, coachId)).limit(1);
  if (!own) return coachId;
  const [student] = await db.select({ id: users.id }).from(stravaConnections)
    .innerJoin(users, eq(stravaConnections.userId, users.id))
    .innerJoin(athleteAccounts, eq(athleteAccounts.userId, users.id))
    .where(and(eq(stravaConnections.stravaAthleteHash, own.hash), eq(users.role, "user"), eq(athleteAccounts.status, "approved")))
    .limit(1);
  return student?.id ?? coachId;
}

/** Strava runs read live. Callers check the coach may see them: their own, or a member who shared. */
async function liveStravaRuns(userId: number) {
  if (!(await getStravaConnectionStatus(userId)).connected) return { entries: [] as TrainingEntry[], status: "off" as const };
  try {
    return { entries: (await stravaRunEntries(userId, 0, ALL_TIME_MAX_PAGES)).entries, status: "ok" as const };
  } catch {
    return { entries: [] as TrainingEntry[], status: "failed" as const };
  }
}

/** Saved runs of members who shared with coaches. The list avoids Strava's few reads per 15 minutes. */
async function sharedSavedRuns(db: Db, athleteIds: number[]) {
  if (!athleteIds.length) return [];
  const rows = await db.select({ athleteId: stravaActivityRecords.userId, startDate: stravaActivityRecords.startDate, summary: stravaActivityRecords.summary })
    .from(stravaActivityRecords)
    .innerJoin(stravaConnections, eq(stravaConnections.userId, stravaActivityRecords.userId))
    .where(and(inArray(stravaActivityRecords.userId, athleteIds), isNotNull(stravaConnections.coachShareAt)));
  return rows.map(({ athleteId, startDate, summary }) => ({
    athleteId,
    date: (summary.startDateLocal || startDate.toISOString()).slice(0, 10),
    distanceMeters: Math.round(summary.distanceMeters),
    reviewed: true,
  }));
}

/** Approved athletes of the whole club, whoever follows them, plus the requesting coach when given. */
async function approvedAthletes(db: Db, athleteId?: number, ownId?: number) {
  const rows = await db.select({
    userId: users.id,
    name: users.name,
    profileName: users.profileName,
    avatarKey: users.avatarKey,
    email: users.email,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  })
    .from(users)
    .leftJoin(athleteAccounts, eq(athleteAccounts.userId, users.id))
    .where(and(
      or(and(eq(athleteAccounts.status, "approved"), eq(users.role, "user")), ownId ? eq(users.id, ownId) : undefined),
      athleteId ? eq(users.id, athleteId) : undefined,
    ))
    .orderBy(users.name);
  return Promise.all(rows.map(async ({ profileName, avatarKey, ...athlete }) => ({
    ...athlete,
    name: profileName || athlete.name,
    avatarUrl: await getProfileAvatarUrl(athlete.userId, avatarKey),
  })));
}

/** Who follows each athlete, the requesting coach first. */
async function followersOf(db: Db, athleteIds: number[], coachId: number) {
  const rows = athleteIds.length ? await db.select({
    athleteId: coachAthletes.athleteId,
    coachId: coachAthletes.coachId,
    name: users.name,
    profileName: users.profileName,
    since: coachAthletes.approvedAt,
  })
    .from(coachAthletes)
    .innerJoin(users, eq(coachAthletes.coachId, users.id))
    .where(inArray(coachAthletes.athleteId, athleteIds))
    .orderBy(coachAthletes.approvedAt) : [];
  const byAthlete = new Map<number, { id: number; name: string; isMe: boolean; since: Date }[]>();
  for (const row of rows) {
    const list = byAthlete.get(row.athleteId) ?? [];
    list.push({ id: row.coachId, name: row.profileName || row.name || "Treinador", isMe: row.coachId === coachId, since: row.since });
    byAthlete.set(row.athleteId, list.sort((a, b) => Number(b.isMe) - Number(a.isMe)));
  }
  return byAthlete;
}

/** Runs the athlete shared with the club. Strava stays private to the athlete. */
async function sharedRuns(db: Db, athleteIds: number[]) {
  if (!athleteIds.length) return [];
  return db.select({ activity: activities, review: activityReviews, reviewerName: users.name, reviewerProfileName: users.profileName })
    .from(activities)
    .leftJoin(activityReviews, eq(activityReviews.activityId, activities.id))
    .leftJoin(users, eq(users.id, activityReviews.coachId))
    .where(and(inArray(activities.athleteId, athleteIds), eq(activities.source, "manual"), eq(activities.shareWithCoach, true)))
    .orderBy(desc(activities.completedAt));
}

const runDate = (completedAt: Date) => completedAt.toISOString().slice(0, 10);

export const clubRouter = router({
  pendingAthletes: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db.select({
      userId: users.id,
      name: users.name,
      profileName: users.profileName,
      email: athleteAccounts.normalizedEmail,
      requestedAt: athleteAccounts.createdAt,
    })
      .from(athleteAccounts)
      .innerJoin(users, eq(athleteAccounts.userId, users.id))
      .where(eq(athleteAccounts.status, "pending"))
      .orderBy(athleteAccounts.createdAt);
    return rows.map(({ profileName, ...athlete }) => ({ ...athlete, name: profileName || athlete.name }));
  }),

  athletes: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select({
      userId: users.id,
      name: users.name,
      profileName: users.profileName,
      avatarKey: users.avatarKey,
      email: users.email,
      approvedAt: coachAthletes.approvedAt,
    })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.athleteId, users.id))
      .where(eq(coachAthletes.coachId, ctx.user.id))
      .orderBy(users.name);
    return Promise.all(rows.map(async ({ profileName, avatarKey, ...athlete }) => ({
      ...athlete,
      name: profileName || athlete.name,
      avatarUrl: await getProfileAvatarUrl(athlete.userId, avatarKey),
    })));
  }),

  /** Everyone in the club with their week at a glance, so any coach can see any athlete. */
  clubAthletes: adminProcedure.input(z.object({ today: scheduledDateInput })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const ownId = await ownAthleteId(db, ctx.user.id);
    const athletes = await approvedAthletes(db, undefined, ownId);
    const ids = athletes.map((athlete) => athlete.userId);
    const [followers, runs, own, saved, sends] = await Promise.all([
      followersOf(db, ids, ctx.user.id),
      sharedRuns(db, ids),
      liveStravaRuns(ctx.user.id),
      sharedSavedRuns(db, ids.filter((id) => id !== ownId)),
      ids.length ? db.select({ athleteId: workoutAssignments.athleteId, scheduledDate: workoutAssignments.scheduledDate, status: workoutAssignments.status })
        .from(workoutAssignments)
        .where(and(
          inArray(workoutAssignments.athleteId, ids),
          or(gte(workoutAssignments.scheduledDate, addDays(input.today, -56)), eq(workoutAssignments.status, "assigned")),
        )) : [],
    ]);
    return athletes.map(({ createdAt, lastSignedIn, ...athlete }) => {
      const coaches = followers.get(athlete.userId) ?? [];
      return {
        ...athlete,
        isMe: athlete.userId === ownId,
        isCoachAccount: athlete.userId === ctx.user.id,
        coaches: coaches.map(({ id, name, isMe }) => ({ id, name, isMe })),
        followedByMe: coaches.some((coach) => coach.isMe),
        summary: athleteSummary(
          sends.filter((send) => send.athleteId === athlete.userId),
          [
            ...runs.filter((run) => run.activity.athleteId === athlete.userId).map((run) => ({
              date: runDate(run.activity.completedAt),
              distanceMeters: run.activity.distanceMeters,
              reviewed: Boolean(run.review),
            })),
            ...(athlete.userId === ownId ? own.entries.map(({ date, distanceMeters }) => ({ date, distanceMeters, reviewed: true })) : []),
            ...saved.filter((run) => run.athleteId === athlete.userId),
          ],
          input.today,
        ),
      };
    });
  }),

  /** One athlete in full: who follows them, every send, every shared run and how it is going. */
  athleteDetail: adminProcedure.input(z.object({ athleteId: z.number().int().positive(), today: scheduledDateInput })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const ownId = await ownAthleteId(db, ctx.user.id);
    const athlete = (await approvedAthletes(db, input.athleteId, ownId))[0];
    if (!athlete) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });
    const isMe = athlete.userId === ownId;
    const [connection] = await db.select({ coachShareAt: stravaConnections.coachShareAt }).from(stravaConnections)
      .where(eq(stravaConnections.userId, athlete.userId)).limit(1);
    const canSeeStrava = isMe || Boolean(connection?.coachShareAt);
    const [followers, runs, own, sends] = await Promise.all([
      followersOf(db, [athlete.userId], ctx.user.id),
      sharedRuns(db, [athlete.userId]),
      canSeeStrava
        ? liveStravaRuns(isMe ? ctx.user.id : athlete.userId)
        : { entries: [] as TrainingEntry[], status: connection ? "private" as const : "off" as const },
      db.select({
        id: workoutAssignments.id,
        scheduledDate: workoutAssignments.scheduledDate,
        status: workoutAssignments.status,
        completedAt: workoutAssignments.completedAt,
        coachId: workoutAssignments.coachId,
        title: workouts.title,
        objective: workouts.objective,
        coachName: users.name,
        coachProfileName: users.profileName,
      })
        .from(workoutAssignments)
        .innerJoin(workouts, eq(workouts.id, workoutAssignments.workoutId))
        .innerJoin(users, eq(users.id, workoutAssignments.coachId))
        .where(eq(workoutAssignments.athleteId, athlete.userId))
        .orderBy(desc(workoutAssignments.scheduledDate)),
    ]);
    const entries: TrainingEntry[] = runs.map(({ activity }) => ({
      id: String(activity.id),
      source: "club",
      title: activity.title,
      date: runDate(activity.completedAt),
      startLocal: null,
      distanceMeters: activity.distanceMeters,
      movingSeconds: activity.durationSeconds,
      elevationMeters: 0,
      averageHeartRate: null,
    }));
    const allEntries = [...entries, ...own.entries];
    const distanceMeters = allEntries.reduce((sum, entry) => sum + entry.distanceMeters, 0);
    const durationSeconds = allEntries.reduce((sum, entry) => sum + entry.movingSeconds, 0);
    const ratings = runs.flatMap(({ review }) => (review ? [review.rating] : []));
    const effortCount = (effort: "easy" | "challenging" | "intense") => runs.filter(({ activity }) => activity.perceivedEffort === effort).length;
    const coaches = followers.get(athlete.userId) ?? [];
    return {
      athlete: { ...athlete, isMe, isCoachAccount: athlete.userId === ctx.user.id, coaches, followedByMe: coaches.some((coach) => coach.isMe) },
      summary: athleteSummary(
        sends,
        [
          ...entries.map((entry, index) => ({ date: entry.date, distanceMeters: entry.distanceMeters, reviewed: Boolean(runs[index].review) })),
          ...own.entries.map(({ date, distanceMeters }) => ({ date, distanceMeters, reviewed: true })),
        ],
        input.today,
      ),
      totals: {
        runs: allEntries.length,
        distanceMeters,
        durationSeconds,
        paceSecondsPerKm: paceSecondsPerKm(distanceMeters, durationSeconds),
        longestRunMeters: Math.max(0, ...allEntries.map((entry) => entry.distanceMeters)),
        averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
        efforts: { easy: effortCount("easy"), challenging: effortCount("challenging"), intense: effortCount("intense") },
      },
      weeks: weeklyBuckets(allEntries, input.today, 8),
      strava: { status: own.status, runs: own.entries },
      places: canSeeStrava ? (await getRunMap(athlete.userId)).places : [],
      assignments: sends.map(({ coachName, coachProfileName, ...send }) => ({
        ...send,
        coachName: coachProfileName || coachName || "Treinador",
        mine: send.coachId === ctx.user.id,
      })),
      activities: runs.map(({ activity, review, reviewerName, reviewerProfileName }) => ({
        activity,
        review: review ? { ...review, coachName: reviewerProfileName || reviewerName || "Treinador", mine: review.coachId === ctx.user.id } : null,
      })),
    };
  }),

  followAthlete: adminProcedure.input(z.object({ athleteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    if (!(await approvedAthletes(db, input.athleteId)).length) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });
    await db.insert(coachAthletes).values({ coachId: ctx.user.id, athleteId: input.athleteId }).onConflictDoNothing();
    return { success: true };
  }),

  /** Stops following; the coach's sends stay on the athlete's agenda and the history is kept. */
  unfollowAthlete: adminProcedure.input(z.object({ athleteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.delete(coachAthletes).where(and(eq(coachAthletes.coachId, ctx.user.id), eq(coachAthletes.athleteId, input.athleteId)));
    return { success: true };
  }),

  approveAthlete: adminProcedure.input(z.object({ athleteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.transaction(async (tx) => {
      const accounts = await tx.select({ userId: athleteAccounts.userId, status: athleteAccounts.status })
        .from(athleteAccounts).where(eq(athleteAccounts.userId, input.athleteId)).limit(1);
      const account = accounts[0];
      if (!account || account.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "Pedido pendente não encontrado." });
      await tx.update(athleteAccounts).set({ status: "approved" }).where(eq(athleteAccounts.userId, input.athleteId));
      await tx.insert(coachAthletes).values({ coachId: ctx.user.id, athleteId: input.athleteId });
    });
    return { success: true };
  }),

  rejectAthlete: adminProcedure.input(z.object({ athleteId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const result = await db.update(athleteAccounts).set({ status: "rejected" })
      .where(and(eq(athleteAccounts.userId, input.athleteId), eq(athleteAccounts.status, "pending")))
      .returning({ userId: athleteAccounts.userId });
    if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido pendente não encontrado." });
    return { success: true };
  }),

  workouts: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const items = await db.select().from(workouts).where(eq(workouts.coachId, ctx.user.id)).orderBy(desc(workouts.updatedAt));
    if (!items.length) return [];
    const ids = items.map((item) => item.id);
    const steps = await db.select().from(workoutSteps).where(inArray(workoutSteps.workoutId, ids)).orderBy(workoutSteps.stepOrder);
    const uses = await db.select({ workoutId: workoutAssignments.workoutId, status: workoutAssignments.status }).from(workoutAssignments).where(inArray(workoutAssignments.workoutId, ids));
    return items.map((workout) => ({
      ...workout,
      steps: steps.filter((step) => step.workoutId === workout.id),
      pendingCount: uses.filter((use) => use.workoutId === workout.id && use.status === "assigned").length,
      completedCount: uses.filter((use) => use.workoutId === workout.id && use.status === "completed").length,
    }));
  }),

  /** Rewrites a library workout and its steps; pending assignments of it show the new version. */
  updateWorkout: adminProcedure.input(workoutInputSchema.extend({ workoutId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.transaction(async (tx) => {
      await requireOwnedWorkout(tx, ctx.user.id, input.workoutId);
      await tx.update(workouts).set({
        title: input.title,
        objective: input.objective,
        description: input.description || null,
        level: input.level,
        updatedAt: new Date(),
      }).where(eq(workouts.id, input.workoutId));
      await tx.delete(workoutSteps).where(eq(workoutSteps.workoutId, input.workoutId));
      await tx.insert(workoutSteps).values(stepRows(input.workoutId, input.steps));
    });
    return { workoutId: input.workoutId };
  }),

  duplicateWorkout: adminProcedure.input(z.object({ workoutId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const workoutId = await db.transaction(async (tx) => {
      const original = await requireOwnedWorkout(tx, ctx.user.id, input.workoutId);
      const steps = await tx.select().from(workoutSteps).where(eq(workoutSteps.workoutId, original.id)).orderBy(workoutSteps.stepOrder);
      const inserted = await tx.insert(workouts).values({
        coachId: ctx.user.id,
        title: `${original.title} (cópia)`.slice(0, 140),
        objective: original.objective,
        description: original.description,
        level: original.level,
      }).returning({ id: workouts.id });
      const id = inserted[0]!.id;
      if (steps.length) await tx.insert(workoutSteps).values(steps.map(({ id: _id, workoutId: _workoutId, ...step }) => ({ ...step, workoutId: id })));
      return id;
    });
    return { workoutId };
  }),

  /** Deletes a library workout with its pending sends; runs the athletes already logged stay in their history. */
  deleteWorkout: adminProcedure.input(z.object({ workoutId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireOwnedWorkout(db, ctx.user.id, input.workoutId);
    await db.delete(workouts).where(and(eq(workouts.id, input.workoutId), eq(workouts.coachId, ctx.user.id)));
    return { success: true };
  }),

  /** The coach's sends, for the plan calendar. */
  coachAssignments: adminProcedure.input(z.object({ from: scheduledDateInput, to: scheduledDateInput })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const rows = await db.select({
      id: workoutAssignments.id,
      scheduledDate: workoutAssignments.scheduledDate,
      status: workoutAssignments.status,
      workoutId: workouts.id,
      title: workouts.title,
      objective: workouts.objective,
      athleteId: users.id,
      athleteName: users.name,
      athleteProfileName: users.profileName,
      athleteEmail: users.email,
      athleteAvatarKey: users.avatarKey,
    })
      .from(workoutAssignments)
      .innerJoin(workouts, eq(workouts.id, workoutAssignments.workoutId))
      .innerJoin(users, eq(users.id, workoutAssignments.athleteId))
      .where(and(eq(workoutAssignments.coachId, ctx.user.id), gte(workoutAssignments.scheduledDate, input.from), lte(workoutAssignments.scheduledDate, input.to)))
      .orderBy(workoutAssignments.scheduledDate, workoutAssignments.id);
    return Promise.all(rows.map(async ({ athleteProfileName, athleteAvatarKey, ...row }) => ({
      ...row,
      athleteName: athleteProfileName || row.athleteName || row.athleteEmail || "Aluno",
      athleteAvatarUrl: await getProfileAvatarUrl(row.athleteId, athleteAvatarKey),
    })));
  }),

  rescheduleAssignment: adminProcedure.input(z.object({ assignmentId: z.number().int().positive(), scheduledDate: scheduledDateInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const updated = await db.update(workoutAssignments).set({ scheduledDate: input.scheduledDate })
      .where(and(eq(workoutAssignments.id, input.assignmentId), eq(workoutAssignments.coachId, ctx.user.id), eq(workoutAssignments.status, "assigned")))
      .returning({ id: workoutAssignments.id });
    if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "Só dá para remarcar treinos que o aluno ainda não fez." });
    return { success: true };
  }),

  removeAssignment: adminProcedure.input(z.object({ assignmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const removed = await db.delete(workoutAssignments)
      .where(and(eq(workoutAssignments.id, input.assignmentId), eq(workoutAssignments.coachId, ctx.user.id), eq(workoutAssignments.status, "assigned")))
      .returning({ id: workoutAssignments.id });
    if (!removed.length) throw new TRPCError({ code: "NOT_FOUND", message: "Só dá para remover treinos que o aluno ainda não fez." });
    return { success: true };
  }),

  createWorkout: adminProcedure.input(workoutInputSchema).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const workoutId = await db.transaction(async (tx) => {
      const inserted = await tx.insert(workouts).values({
        coachId: ctx.user.id,
        title: input.title,
        objective: input.objective,
        description: input.description || null,
        level: input.level,
      }).returning({ id: workouts.id });
      const id = inserted[0]?.id;
      if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o treino." });
      await tx.insert(workoutSteps).values(stepRows(id, input.steps));
      return id;
    });
    return { workoutId };
  }),

  createAndAssignWorkout: adminProcedure.input(workoutInputSchema.extend({
    athleteId: z.number().int().positive(),
    scheduledDate: scheduledDateInput,
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const link = await tx.select({ id: coachAthletes.id }).from(coachAthletes)
        .where(and(eq(coachAthletes.coachId, ctx.user.id), eq(coachAthletes.athleteId, input.athleteId))).limit(1);
      if (!link.length) throw new TRPCError({ code: "FORBIDDEN", message: "Esse aluno não pertence à sua lista aprovada." });

      const inserted = await tx.insert(workouts).values({
        coachId: ctx.user.id,
        title: input.title,
        objective: input.objective,
        description: input.description || null,
        level: input.level,
      }).returning({ id: workouts.id });
      const workoutId = inserted[0]?.id;
      if (!workoutId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o treino." });
      await tx.insert(workoutSteps).values(stepRows(workoutId, input.steps));
      const assignment = await tx.insert(workoutAssignments).values({
        coachId: ctx.user.id,
        athleteId: input.athleteId,
        workoutId,
        scheduledDate: input.scheduledDate,
      }).returning({ id: workoutAssignments.id });
      const assignmentId = assignment[0]?.id;
      if (!assignmentId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível atribuir o treino." });
      return { workoutId, assignmentId };
    });
    return result;
  }),

  assignWorkout: adminProcedure.input(z.object({
    athleteId: z.number().int().positive(),
    workoutId: z.number().int().positive(),
    scheduledDate: scheduledDateInput,
  })).mutation(async ({ ctx, input }) => {
    const db = await requireAthleteLink(ctx.user.id, input.athleteId);
    const ownedWorkout = await db.select({ id: workouts.id }).from(workouts)
      .where(and(eq(workouts.id, input.workoutId), eq(workouts.coachId, ctx.user.id))).limit(1);
    if (!ownedWorkout.length) throw new TRPCError({ code: "NOT_FOUND", message: "Treino não encontrado." });
    const inserted = await db.insert(workoutAssignments).values({
      coachId: ctx.user.id,
      athleteId: input.athleteId,
      workoutId: input.workoutId,
      scheduledDate: input.scheduledDate,
    }).returning({ id: workoutAssignments.id });
    return { assignmentId: inserted[0]?.id ?? null };
  }),

  myAssignments: athleteProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select({
      id: workoutAssignments.id,
      scheduledDate: workoutAssignments.scheduledDate,
      status: workoutAssignments.status,
      workoutId: workouts.id,
      title: workouts.title,
      objective: workouts.objective,
      description: workouts.description,
    })
      .from(workoutAssignments)
      .innerJoin(workouts, eq(workoutAssignments.workoutId, workouts.id))
      .where(eq(workoutAssignments.athleteId, ctx.user.id))
      .orderBy(workoutAssignments.scheduledDate);
    if (!rows.length) return [];
    const steps = await db.select().from(workoutSteps)
      .where(inArray(workoutSteps.workoutId, [...new Set(rows.map((row) => row.workoutId))]))
      .orderBy(workoutSteps.stepOrder);
    return rows.map((row) => ({ ...row, steps: steps.filter((step) => step.workoutId === row.workoutId) }));
  }),

  myActivities: athleteProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select().from(activities).where(eq(activities.athleteId, ctx.user.id)).orderBy(desc(activities.completedAt));
    if (!rows.length) return [];
    const reviews = await db.select().from(activityReviews)
      .where(inArray(activityReviews.activityId, rows.map((activity) => activity.id)));
    return rows.map((activity) => ({ ...activity, review: reviews.find((review) => review.activityId === activity.id) ?? null }));
  }),

  submitActivity: athleteProcedure.input(z.object({
    assignmentId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(140),
    distanceMeters: z.number().int().positive().max(100_000),
    durationSeconds: z.number().int().positive().max(86_400),
    activityDate: scheduledDateInput.optional(),
    perceivedEffort: z.enum(["easy", "challenging", "intense"]),
    athleteNote: z.string().trim().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const distance = input.distanceMeters;
    const duration = input.durationSeconds;
    const pace = distance > 0 ? Math.round((duration * 1000) / distance) : null;
    const completedAt = input.activityDate ? new Date(`${input.activityDate}T12:00:00.000Z`) : new Date();
    try {
      return await db.transaction(async (tx) => {
        let assignmentId: number | null = null;
        if (input.assignmentId) {
          const assignment = await tx.select({ id: workoutAssignments.id, status: workoutAssignments.status })
            .from(workoutAssignments)
            .where(and(eq(workoutAssignments.id, input.assignmentId), eq(workoutAssignments.athleteId, ctx.user.id)))
            .limit(1);
          if (!assignment.length || assignment[0].status !== "assigned") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Treino atribuído não encontrado ou já concluído." });
          }
          assignmentId = assignment[0].id;
        }
        const inserted = await tx.insert(activities).values({
          athleteId: ctx.user.id,
          assignmentId,
          source: "manual",
          title: input.title,
          distanceMeters: distance,
          durationSeconds: duration,
          averagePaceSecondsPerKm: pace,
          completedAt,
          perceivedEffort: input.perceivedEffort,
          athleteNote: input.athleteNote || null,
          shareWithCoach: true,
        }).returning({ id: activities.id });
        if (assignmentId) {
          await tx.update(workoutAssignments).set({ status: "completed", completedAt })
            .where(eq(workoutAssignments.id, assignmentId));
        }
        return { activityId: inserted[0]?.id ?? null };
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (input.assignmentId && isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "Este treino já foi registrado." });
      }
      throw error;
    }
  }),

  coachActivityFeed: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select({
      activity: activities,
      athleteName: users.name,
      athleteProfileName: users.profileName,
      athleteId: users.id,
      athleteAvatarKey: users.avatarKey,
      athleteEmail: users.email,
      review: activityReviews,
    })
      .from(coachAthletes)
      .innerJoin(activities, eq(activities.athleteId, coachAthletes.athleteId))
      .innerJoin(users, eq(users.id, coachAthletes.athleteId))
      .leftJoin(activityReviews, eq(activityReviews.activityId, activities.id))
      .where(and(
        eq(coachAthletes.coachId, ctx.user.id),
        // Strava-imported activities remain private to the athlete even if a legacy row is present.
        eq(activities.source, "manual"),
        eq(activities.shareWithCoach, true),
      ))
      .orderBy(desc(activities.completedAt));
    return Promise.all(rows.map(async ({ athleteProfileName, athleteAvatarKey, athleteId, ...row }) => ({
      ...row,
      athleteName: athleteProfileName || row.athleteName,
      athleteAvatarUrl: await getProfileAvatarUrl(athleteId, athleteAvatarKey),
    })));
  }),

  reviewActivity: adminProcedure.input(z.object({
    activityId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const rows = await db.select({ id: activities.id })
      .from(activities)
      .innerJoin(coachAthletes, eq(coachAthletes.athleteId, activities.athleteId))
      .where(and(
        eq(activities.id, input.activityId),
        eq(coachAthletes.coachId, ctx.user.id),
        eq(activities.source, "manual"),
        eq(activities.shareWithCoach, true),
      )).limit(1);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Atividade não encontrada ou não compartilhada com você." });
    await db.insert(activityReviews).values({
      activityId: input.activityId,
      coachId: ctx.user.id,
      rating: input.rating,
      comment: input.comment,
    }).onConflictDoUpdate({
      target: activityReviews.activityId,
      set: { rating: input.rating, comment: input.comment, updatedAt: new Date() },
    });
    return { success: true };
  }),
});
