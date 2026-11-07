-- Supabase exposes the public schema through its REST API. The app only talks to the database
-- through its own API (as the table owner, which bypasses RLS), so enable RLS with no policies
-- to deny every request made with Supabase's anon/authenticated keys.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "athlete_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_avatars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_athletes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workout_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workout_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "strava_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "strava_oauth_states" ENABLE ROW LEVEL SECURITY;
