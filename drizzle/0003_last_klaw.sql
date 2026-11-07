CREATE TABLE "strava_activity_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"stravaActivityId" varchar(32) NOT NULL,
	"startDate" timestamp with time zone NOT NULL,
	"summary" jsonb NOT NULL,
	"streams" jsonb,
	"savedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "strava_activity_records" ADD CONSTRAINT "strava_activity_records_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "strava_activity_records_user_activity_unique" ON "strava_activity_records" USING btree ("userId","stravaActivityId");--> statement-breakpoint
ALTER TABLE "strava_activity_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runclub_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON strava_activity_records TO runclub_api;
    GRANT USAGE, SELECT ON SEQUENCE strava_activity_records_id_seq TO runclub_api;
    DROP POLICY IF EXISTS runclub_api_all ON strava_activity_records;
    CREATE POLICY runclub_api_all ON strava_activity_records FOR ALL TO runclub_api USING (true) WITH CHECK (true);
  END IF;
END $$;
