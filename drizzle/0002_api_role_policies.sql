-- Production connects as a dedicated login role (runclub_api), created outside migrations so its
-- password never lands in migration history. Grant it the app tables and let RLS allow only it.
-- Skipped where the role does not exist (local PGlite, tests).
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runclub_api') THEN
    GRANT USAGE ON SCHEMA public TO runclub_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO runclub_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO runclub_api;
    FOREACH t IN ARRAY ARRAY['users','athlete_accounts','profile_avatars','coach_athletes','workouts','workout_steps','workout_assignments','activities','activity_reviews','strava_connections','strava_oauth_states'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS runclub_api_all ON %I', t);
      EXECUTE format('CREATE POLICY runclub_api_all ON %I FOR ALL TO runclub_api USING (true) WITH CHECK (true)', t);
    END LOOP;
  END IF;
END $$;
