import {
  date,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing Manus OAuth and owner/coach identities.
 * Athlete email credentials and training data are stored in separate additive tables.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  profileName: varchar("profileName", { length: 120 }),
  avatarKey: varchar("avatarKey", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Password credentials and approval state for student accounts. */
export const athleteAccounts = mysqlTable(
  "athlete_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex("athlete_accounts_email_unique").on(table.normalizedEmail),
    userUnique: uniqueIndex("athlete_accounts_user_unique").on(table.userId),
  }),
);

/** Relationship between a coach and an approved athlete. */
export const coachAthletes = mysqlTable(
  "coach_athletes",
  {
    id: int("id").autoincrement().primaryKey(),
    coachId: int("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
    athleteId: int("athleteId").notNull().references(() => users.id, { onDelete: "cascade" }),
    approvedAt: timestamp("approvedAt").defaultNow().notNull(),
  },
  (table) => ({
    coachAthleteUnique: uniqueIndex("coach_athletes_pair_unique").on(table.coachId, table.athleteId),
  }),
);

export const workouts = mysqlTable("workouts", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 140 }).notNull(),
  objective: varchar("objective", { length: 200 }).notNull(),
  description: text("description"),
  level: varchar("level", { length: 32 }).default("Todos").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workoutSteps = mysqlTable("workout_steps", {
  id: int("id").autoincrement().primaryKey(),
  workoutId: int("workoutId").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  stepOrder: int("stepOrder").notNull(),
  kind: mysqlEnum("kind", ["warmup", "run", "recovery", "cooldown"]).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  durationSeconds: int("durationSeconds"),
  distanceMeters: int("distanceMeters"),
  targetPaceSecondsPerKm: int("targetPaceSecondsPerKm"),
  instruction: text("instruction"),
});

export const workoutAssignments = mysqlTable("workout_assignments", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
  athleteId: int("athleteId").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutId: int("workoutId").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  scheduledDate: date("scheduledDate", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["assigned", "completed", "skipped"]).default("assigned").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const activities = mysqlTable(
  "activities",
  {
    id: int("id").autoincrement().primaryKey(),
    athleteId: int("athleteId").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignmentId: int("assignmentId").references(() => workoutAssignments.id, { onDelete: "set null" }),
    source: mysqlEnum("source", ["manual", "strava"]).default("manual").notNull(),
    externalActivityId: varchar("externalActivityId", { length: 64 }),
    title: varchar("title", { length: 140 }).notNull(),
    distanceMeters: int("distanceMeters").notNull(),
    durationSeconds: int("durationSeconds").notNull(),
    averagePaceSecondsPerKm: int("averagePaceSecondsPerKm"),
    completedAt: timestamp("completedAt").defaultNow().notNull(),
    perceivedEffort: mysqlEnum("perceivedEffort", ["easy", "challenging", "intense"]),
    athleteNote: text("athleteNote"),
    shareWithCoach: int("shareWithCoach").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    assignmentUnique: uniqueIndex("activities_assignment_unique").on(table.assignmentId),
    externalActivityUnique: uniqueIndex("activities_source_external_unique").on(
      table.athleteId,
      table.source,
      table.externalActivityId,
    ),
  }),
);

export const activityReviews = mysqlTable("activity_reviews", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull().references(() => activities.id, { onDelete: "cascade" }),
  coachId: int("coachId").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: int("rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  activityUnique: uniqueIndex("activity_reviews_activity_unique").on(table.activityId),
}));

/** Encrypted Strava credentials for an approved athlete's own account only. */
export const stravaConnections = mysqlTable(
  "strava_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    stravaAthleteHash: varchar("stravaAthleteHash", { length: 64 }).notNull(),
    encryptedTokenEnvelope: text("encryptedTokenEnvelope").notNull(),
    scopes: varchar("scopes", { length: 255 }).notNull(),
    tokenExpiresAt: timestamp("tokenExpiresAt").notNull(),
    consentedAt: timestamp("consentedAt").notNull(),
    consentVersion: varchar("consentVersion", { length: 32 }).notNull(),
    connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("strava_connections_user_unique").on(table.userId),
    athleteUnique: uniqueIndex("strava_connections_athlete_hash_unique").on(table.stravaAthleteHash),
  }),
);

/** Short-lived single-use OAuth state bound to the initiating approved athlete. */
export const stravaOAuthStates = mysqlTable("strava_oauth_states", {
  stateHash: varchar("stateHash", { length: 64 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: mysqlEnum("platform", ["web", "native"]).notNull(),
  returnUri: varchar("returnUri", { length: 2048 }).notNull(),
  consentedAt: timestamp("consentedAt").notNull(),
  consentVersion: varchar("consentVersion", { length: 32 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
