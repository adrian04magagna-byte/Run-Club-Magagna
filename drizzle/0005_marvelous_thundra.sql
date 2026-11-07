DROP INDEX "strava_connections_athlete_hash_unique";--> statement-breakpoint
CREATE INDEX "strava_connections_athlete_hash_idx" ON "strava_connections" USING btree ("stravaAthleteHash");