-- ---------------------------------------------------------------------------
-- MY WORKOUTS (his request 25 Nov 2026, step 2 of "your own workout"; his ruling "Both"): a workout he builds ahead
-- ("add squat, add bench press, add deadlift, rest ...") and saves by name, to start on any day, and optionally put
-- on one or more days, where it shows with a Start.
--
-- One row a saved workout. `items` is the list as he built it (each exercise's sets, reps, an optional weight and his
-- rest; each cardio's activity and minutes), read by own-workout-plans.ts. `on_dates` are the days he put it on.
-- `deleted` is a tombstone, so a workout removed on one phone is removed on the others rather than copied back.
-- The phone keeps its own copy first (a gym with no signal), so this table is where phones meet, not the only store.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS own_workouts (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  on_dates date[] NOT NULL DEFAULT '{}',
  deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_own_workouts_user ON own_workouts (user_id);

ALTER TABLE own_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_own_workouts" ON own_workouts FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_own_workouts" ON own_workouts FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_update_own_workouts" ON own_workouts FOR UPDATE
  TO anon, authenticated USING (owns_profile(user_id)) WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_own_workouts" ON own_workouts FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));
