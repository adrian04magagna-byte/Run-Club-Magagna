CREATE TYPE "public"."account_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."activity_source" AS ENUM('manual', 'strava');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('assigned', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."oauth_platform" AS ENUM('web', 'native');--> statement-breakpoint
CREATE TYPE "public"."perceived_effort" AS ENUM('easy', 'challenging', 'intense');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."step_kind" AS ENUM('warmup', 'run', 'recovery', 'cooldown');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"athleteId" integer NOT NULL,
	"assignmentId" integer,
	"source" "activity_source" DEFAULT 'manual' NOT NULL,
	"externalActivityId" varchar(64),
	"title" varchar(140) NOT NULL,
	"distanceMeters" integer NOT NULL,
	"durationSeconds" integer NOT NULL,
	"averagePaceSecondsPerKm" integer,
	"completedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"perceivedEffort" "perceived_effort",
	"athleteNote" text,
	"shareWithCoach" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"activityId" integer NOT NULL,
	"coachId" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"normalizedEmail" varchar(320) NOT NULL,
	"passwordHash" varchar(512),
	"status" "account_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_athletes" (
	"id" serial PRIMARY KEY NOT NULL,
	"coachId" integer NOT NULL,
	"athleteId" integer NOT NULL,
	"approvedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_avatars" (
	"avatarKey" varchar(255) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strava_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"stravaAthleteHash" varchar(64) NOT NULL,
	"encryptedTokenEnvelope" text NOT NULL,
	"scopes" varchar(255) NOT NULL,
	"tokenExpiresAt" timestamp with time zone NOT NULL,
	"consentedAt" timestamp with time zone NOT NULL,
	"consentVersion" varchar(32) NOT NULL,
	"connectedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strava_oauth_states" (
	"stateHash" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"platform" "oauth_platform" NOT NULL,
	"returnUri" varchar(2048) NOT NULL,
	"consentedAt" timestamp with time zone NOT NULL,
	"consentVersion" varchar(32) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(96) NOT NULL,
	"name" text,
	"profileName" varchar(120),
	"avatarKey" varchar(255),
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "workout_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"coachId" integer NOT NULL,
	"athleteId" integer NOT NULL,
	"workoutId" integer NOT NULL,
	"scheduledDate" date NOT NULL,
	"status" "assignment_status" DEFAULT 'assigned' NOT NULL,
	"assignedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workout_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"workoutId" integer NOT NULL,
	"stepOrder" integer NOT NULL,
	"kind" "step_kind" NOT NULL,
	"label" varchar(120) NOT NULL,
	"durationSeconds" integer,
	"distanceMeters" integer,
	"targetPaceSecondsPerKm" integer,
	"instruction" text
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"coachId" integer NOT NULL,
	"title" varchar(140) NOT NULL,
	"objective" varchar(200) NOT NULL,
	"description" text,
	"level" varchar(32) DEFAULT 'Todos' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_athleteId_users_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assignmentId_workout_assignments_id_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."workout_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_reviews" ADD CONSTRAINT "activity_reviews_activityId_activities_id_fk" FOREIGN KEY ("activityId") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_reviews" ADD CONSTRAINT "activity_reviews_coachId_users_id_fk" FOREIGN KEY ("coachId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_accounts" ADD CONSTRAINT "athlete_accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_coachId_users_id_fk" FOREIGN KEY ("coachId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_athleteId_users_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_avatars" ADD CONSTRAINT "profile_avatars_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_connections" ADD CONSTRAINT "strava_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_oauth_states" ADD CONSTRAINT "strava_oauth_states_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_assignments" ADD CONSTRAINT "workout_assignments_coachId_users_id_fk" FOREIGN KEY ("coachId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_assignments" ADD CONSTRAINT "workout_assignments_athleteId_users_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_assignments" ADD CONSTRAINT "workout_assignments_workoutId_workouts_id_fk" FOREIGN KEY ("workoutId") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD CONSTRAINT "workout_steps_workoutId_workouts_id_fk" FOREIGN KEY ("workoutId") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_coachId_users_id_fk" FOREIGN KEY ("coachId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_assignment_unique" ON "activities" USING btree ("assignmentId");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_source_external_unique" ON "activities" USING btree ("athleteId","source","externalActivityId");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_reviews_activity_unique" ON "activity_reviews" USING btree ("activityId");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_accounts_email_unique" ON "athlete_accounts" USING btree ("normalizedEmail");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_accounts_user_unique" ON "athlete_accounts" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_athletes_pair_unique" ON "coach_athletes" USING btree ("coachId","athleteId");--> statement-breakpoint
CREATE UNIQUE INDEX "strava_connections_user_unique" ON "strava_connections" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "strava_connections_athlete_hash_unique" ON "strava_connections" USING btree ("stravaAthleteHash");