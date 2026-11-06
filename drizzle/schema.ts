import {
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import type { StravaActivityStreams, StravaActivitySummary } from "../shared/strava";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const accountStatusEnum = pgEnum("account_status", ["pending", "approved", "rejected"]);
export const stepKindEnum = pgEnum("step_kind", ["warmup", "run", "recovery", "cooldown"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["assigned", "completed", "skipped"]);
export const activitySourceEnum = pgEnum("activity_source", ["manual", "strava"]);
export const perceivedEffortEnum = pgEnum("perceived_effort", ["easy", "challenging", "intense"]);
export const oauthPlatformEnum = pgEnum("oauth_platform", ["web", "native"]);

const updatedAt = () =>
  timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date());

/**
 * Every person in the club: the coach (role admin) and athletes.
 * openId is a stable internal id (`email_<uuid>` or `google_<sub>`).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 96 }).notNull().unique(),
  name: text("name"),
  profileName: varchar("profileName", { length: 120 }),
  avatarKey: varchar("avatarKey", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Sign-in credentials and approval state. Athletes start pending; the coach row is created
 * already approved. passwordHash is null for people who only sign in with Google.
 */
export const athleteAccounts = pgTable(
  "athlete_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 512 }),
    status: accountStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("athlete_accounts_email_unique").on(table.normalizedEmail),
    uniqueIndex("athlete_accounts_user_unique").on(table.userId),
  ],
);

/** Profile photos live in the database so the API needs no separate object storage. */
export const profileAvatars = pgTable("profile_avatars", {
  avatarKey: varchar("avatarKey", { length: 255 }).primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Relationship between a coach and an approved athlete. */
export const coachAthletes = pgTable(
  "coach_athletes",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
    athleteId: integer("athleteId").notNull().references(() => users.id, { onDelete: "cascade" }),
    approvedAt: timestamp("approvedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("coach_athletes_pair_unique").on(table.coachId, table.athleteId)],
);

export const workouts = pgTable("workouts", {
  id: serial("id").primaryKey(),
  coachId: integer("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 140 }).notNull(),
  objective: varchar("objective", { length: 200 }).notNull(),
  description: text("description"),
  level: varchar("level", { length: 32 }).default("Todos").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: updatedAt(),
});

export const workoutSteps = pgTable("workout_steps", {
  id: serial("id").primaryKey(),
  workoutId: integer("workoutId").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  stepOrder: integer("stepOrder").notNull(),
  kind: stepKindEnum("kind").notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  durationSeconds: integer("durationSeconds"),
  distanceMeters: integer("distanceMeters"),
  targetPaceSecondsPerKm: integer("targetPaceSecondsPerKm"),
  instruction: text("instruction"),
});

export const workoutAssignments = pgTable("workout_assignments", {
  id: serial("id").primaryKey(),
  coachId: integer("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
  athleteId: integer("athleteId").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutId: integer("workoutId").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  scheduledDate: date("scheduledDate", { mode: "string" }).notNull(),
  status: assignmentStatusEnum("status").default("assigned").notNull(),
  assignedAt: timestamp("assignedAt", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
});

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athleteId").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignmentId: integer("assignmentId").references(() => workoutAssignments.id, { onDelete: "set null" }),
    source: activitySourceEnum("source").default("manual").notNull(),
    externalActivityId: varchar("externalActivityId", { length: 64 }),
    title: varchar("title", { length: 140 }).notNull(),
    distanceMeters: integer("distanceMeters").notNull(),
    durationSeconds: integer("durationSeconds").notNull(),
    averagePaceSecondsPerKm: integer("averagePaceSecondsPerKm"),
    completedAt: timestamp("completedAt", { withTimezone: true }).defaultNow().notNull(),
    perceivedEffort: perceivedEffortEnum("perceivedEffort"),
    athleteNote: text("athleteNote"),
    shareWithCoach: boolean("shareWithCoach").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("activities_assignment_unique").on(table.assignmentId),
    uniqueIndex("activities_source_external_unique").on(
      table.athleteId,
      table.source,
      table.externalActivityId,
    ),
  ],
);

export const activityReviews = pgTable(
  "activity_reviews",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activityId").notNull().references(() => activities.id, { onDelete: "cascade" }),
    coachId: integer("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("activity_reviews_activity_unique").on(table.activityId)],
);

/** Encrypted Strava credentials for an approved athlete's own account only. */
export const stravaConnections = pgTable(
  "strava_connections",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    stravaAthleteHash: varchar("stravaAthleteHash", { length: 64 }).notNull(),
    encryptedTokenEnvelope: text("encryptedTokenEnvelope").notNull(),
    scopes: varchar("scopes", { length: 255 }).notNull(),
    tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }).notNull(),
    consentedAt: timestamp("consentedAt", { withTimezone: true }).notNull(),
    consentVersion: varchar("consentVersion", { length: 32 }).notNull(),
    historyConsentAt: timestamp("historyConsentAt", { withTimezone: true }),
    connectedAt: timestamp("connectedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("strava_connections_user_unique").on(table.userId),
    uniqueIndex("strava_connections_athlete_hash_unique").on(table.stravaAthleteHash),
  ],
);

/** Test copy of a member's Strava runs, saved with their consent and deleted on disconnect. */
export const stravaActivityRecords = pgTable(
  "strava_activity_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    stravaActivityId: varchar("stravaActivityId", { length: 32 }).notNull(),
    startDate: timestamp("startDate", { withTimezone: true }).notNull(),
    summary: jsonb("summary").$type<StravaActivitySummary>().notNull(),
    streams: jsonb("streams").$type<StravaActivityStreams>(),
    savedAt: timestamp("savedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("strava_activity_records_user_activity_unique").on(table.userId, table.stravaActivityId)],
);

/** Short-lived single-use OAuth state bound to the initiating approved athlete. */
export const stravaOAuthStates = pgTable("strava_oauth_states", {
  stateHash: varchar("stateHash", { length: 64 }).primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: oauthPlatformEnum("platform").notNull(),
  returnUri: varchar("returnUri", { length: 2048 }).notNull(),
  consentedAt: timestamp("consentedAt", { withTimezone: true }).notNull(),
  consentVersion: varchar("consentVersion", { length: 32 }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
