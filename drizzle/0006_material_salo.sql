ALTER TABLE "strava_activity_records" ADD COLUMN "places" jsonb;--> statement-breakpoint
ALTER TABLE "strava_connections" ADD COLUMN "mapConsentAt" timestamp with time zone;