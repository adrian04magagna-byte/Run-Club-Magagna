import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  activities,
  activityReviews,
  athleteAccounts,
  coachAthletes,
  users,
  workoutAssignments,
  workoutSteps,
  workouts,
} from "../../drizzle/schema";
import { adminProcedure, athleteProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
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
      .where(and(eq(athleteAccounts.userId, input.athleteId), eq(athleteAccounts.status, "pending")));
    if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido pendente não encontrado." });
    return { success: true };
  }),

  workouts: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const items = await db.select().from(workouts).where(eq(workouts.coachId, ctx.user.id)).orderBy(desc(workouts.createdAt));
    if (!items.length) return [];
    const steps = await db.select().from(workoutSteps).where(inArray(workoutSteps.workoutId, items.map((item) => item.id))).orderBy(workoutSteps.stepOrder);
    return items.map((workout) => ({ ...workout, steps: steps.filter((step) => step.workoutId === workout.id) }));
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
      }).$returningId();
      const id = inserted[0]?.id;
      if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o treino." });
      await tx.insert(workoutSteps).values(input.steps.map((step, index) => ({
        workoutId: id,
        stepOrder: index + 1,
        kind: step.kind,
        label: step.label,
        durationSeconds: step.durationSeconds ?? null,
        distanceMeters: step.distanceMeters ?? null,
        targetPaceSecondsPerKm: step.targetPaceSecondsPerKm ?? null,
        instruction: step.instruction || null,
      })));
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
      }).$returningId();
      const workoutId = inserted[0]?.id;
      if (!workoutId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o treino." });
      await tx.insert(workoutSteps).values(input.steps.map((step, index) => ({
        workoutId,
        stepOrder: index + 1,
        kind: step.kind,
        label: step.label,
        durationSeconds: step.durationSeconds ?? null,
        distanceMeters: step.distanceMeters ?? null,
        targetPaceSecondsPerKm: step.targetPaceSecondsPerKm ?? null,
        instruction: step.instruction || null,
      })));
      const assignment = await tx.insert(workoutAssignments).values({
        coachId: ctx.user.id,
        athleteId: input.athleteId,
        workoutId,
        scheduledDate: input.scheduledDate,
      }).$returningId();
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
    }).$returningId();
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
          shareWithCoach: 1,
        }).$returningId();
        if (assignmentId) {
          await tx.update(workoutAssignments).set({ status: "completed", completedAt })
            .where(eq(workoutAssignments.id, assignmentId));
        }
        return { activityId: inserted[0]?.id ?? null };
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (input.assignmentId && String(error).includes("Duplicate entry")) {
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
        eq(activities.shareWithCoach, 1),
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
        eq(activities.shareWithCoach, 1),
      )).limit(1);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Atividade não encontrada ou não compartilhada com você." });
    await db.insert(activityReviews).values({
      activityId: input.activityId,
      coachId: ctx.user.id,
      rating: input.rating,
      comment: input.comment,
    }).onDuplicateKeyUpdate({ set: { rating: input.rating, comment: input.comment, updatedAt: new Date() } });
    return { success: true };
  }),
});
