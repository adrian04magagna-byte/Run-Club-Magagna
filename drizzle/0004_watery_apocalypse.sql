CREATE TABLE `strava_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stravaAthleteHash` varchar(64) NOT NULL,
	`encryptedTokenEnvelope` text NOT NULL,
	`scopes` varchar(255) NOT NULL,
	`tokenExpiresAt` timestamp NOT NULL,
	`consentedAt` timestamp NOT NULL,
	`consentVersion` varchar(32) NOT NULL,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strava_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `strava_connections_user_unique` UNIQUE(`userId`),
	CONSTRAINT `strava_connections_athlete_hash_unique` UNIQUE(`stravaAthleteHash`)
);
--> statement-breakpoint
CREATE TABLE `strava_oauth_states` (
	`stateHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`platform` enum('web','native') NOT NULL,
	`returnUri` varchar(2048) NOT NULL,
	`consentedAt` timestamp NOT NULL,
	`consentVersion` varchar(32) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strava_oauth_states_stateHash` PRIMARY KEY(`stateHash`)
);
--> statement-breakpoint
ALTER TABLE `strava_connections` ADD CONSTRAINT `strava_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strava_oauth_states` ADD CONSTRAINT `strava_oauth_states_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;