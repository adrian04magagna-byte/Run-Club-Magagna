CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`athleteId` int NOT NULL,
	`assignmentId` int,
	`source` enum('manual','strava') NOT NULL DEFAULT 'manual',
	`externalActivityId` varchar(64),
	`title` varchar(140) NOT NULL,
	`distanceMeters` int NOT NULL,
	`durationSeconds` int NOT NULL,
	`averagePaceSecondsPerKm` int,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`perceivedEffort` enum('easy','challenging','intense'),
	`athleteNote` text,
	`shareWithCoach` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activities_id` PRIMARY KEY(`id`),
	CONSTRAINT `activities_source_external_unique` UNIQUE(`athleteId`,`source`,`externalActivityId`)
);
--> statement-breakpoint
CREATE TABLE `activity_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`coachId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activity_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_reviews_activity_unique` UNIQUE(`activityId`)
);
--> statement-breakpoint
CREATE TABLE `athlete_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`normalizedEmail` varchar(320) NOT NULL,
	`passwordHash` varchar(512) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `athlete_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `athlete_accounts_email_unique` UNIQUE(`normalizedEmail`),
	CONSTRAINT `athlete_accounts_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `coach_athletes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coachId` int NOT NULL,
	`athleteId` int NOT NULL,
	`approvedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_athletes_id` PRIMARY KEY(`id`),
	CONSTRAINT `coach_athletes_pair_unique` UNIQUE(`coachId`,`athleteId`)
);
--> statement-breakpoint
CREATE TABLE `workout_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coachId` int NOT NULL,
	`athleteId` int NOT NULL,
	`workoutId` int NOT NULL,
	`scheduledDate` date NOT NULL,
	`status` enum('assigned','completed','skipped') NOT NULL DEFAULT 'assigned',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `workout_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workoutId` int NOT NULL,
	`stepOrder` int NOT NULL,
	`kind` enum('warmup','run','recovery','cooldown') NOT NULL,
	`label` varchar(120) NOT NULL,
	`durationSeconds` int,
	`distanceMeters` int,
	`targetPaceSecondsPerKm` int,
	`instruction` text,
	CONSTRAINT `workout_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coachId` int NOT NULL,
	`title` varchar(140) NOT NULL,
	`objective` varchar(200) NOT NULL,
	`description` text,
	`level` varchar(32) NOT NULL DEFAULT 'Todos',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_athleteId_users_id_fk` FOREIGN KEY (`athleteId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_assignmentId_workout_assignments_id_fk` FOREIGN KEY (`assignmentId`) REFERENCES `workout_assignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_reviews` ADD CONSTRAINT `activity_reviews_activityId_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_reviews` ADD CONSTRAINT `activity_reviews_coachId_users_id_fk` FOREIGN KEY (`coachId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `athlete_accounts` ADD CONSTRAINT `athlete_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coach_athletes` ADD CONSTRAINT `coach_athletes_coachId_users_id_fk` FOREIGN KEY (`coachId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coach_athletes` ADD CONSTRAINT `coach_athletes_athleteId_users_id_fk` FOREIGN KEY (`athleteId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_assignments` ADD CONSTRAINT `workout_assignments_coachId_users_id_fk` FOREIGN KEY (`coachId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_assignments` ADD CONSTRAINT `workout_assignments_athleteId_users_id_fk` FOREIGN KEY (`athleteId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_assignments` ADD CONSTRAINT `workout_assignments_workoutId_workouts_id_fk` FOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_steps` ADD CONSTRAINT `workout_steps_workoutId_workouts_id_fk` FOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workouts` ADD CONSTRAINT `workouts_coachId_users_id_fk` FOREIGN KEY (`coachId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;