-- ---------------------------------------------------------------------------
-- THE ROUTE OF A WALK, JOG OR RUN RECORDED ON THE WATCH (his request 28 Nov 2026: "While recording a jog run or walk the
-- watch should record your location and map out your journey"; his ruling "Save the route", over showing it once and
-- discarding it, and over hiding its two ends).
--
-- One row a recorded workout, matched to its cardio log by activity and start (the watch's own start, which the log
-- carries as started_at). `points` is the route as the watch sent it: [[ms, lat, lng], ...], five decimal places (about
-- a metre), a point kept only once he has moved about five metres from the last. Only he can read or delete it; it goes
-- with his account (ON DELETE CASCADE), and "Delete route" on the walk removes the row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_routes (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  activity text NOT NULL,
  started_at timestamptz NOT NULL,
  date date NOT NULL,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workout_routes_user_date ON workout_routes (user_id, date);

ALTER TABLE workout_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_workout_routes" ON workout_routes FOR SELECT
  TO anon, authenticated USING (owns_profile(user_id));
CREATE POLICY "owner_insert_workout_routes" ON workout_routes FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_update_workout_routes" ON workout_routes FOR UPDATE
  TO anon, authenticated USING (owns_profile(user_id)) WITH CHECK (owns_profile(user_id));
CREATE POLICY "owner_delete_workout_routes" ON workout_routes FOR DELETE
  TO anon, authenticated USING (owns_profile(user_id));
