/*
# Create set_logs table for detailed workout set tracking

1. New Tables
   - `set_logs`
     - `id` (uuid, primary key, auto-generated)
     - `user_id` (text, not null) — identifies the user/profile session
     - `exercise_plan_id` (uuid, nullable, FK to exercise_plans) — links to the planned exercise
     - `exercise_name` (text, not null) — name of the exercise performed
     - `week_number` (integer, 1-4) — which mesocycle week this log belongs to
     - `day` (text, not null) — day of the week (Monday, Tuesday, etc.)
     - `set_number` (integer, not null) — which set (1, 2, 3, etc.)
     - `weight_kg` (numeric, default 0) — load used
     - `reps_completed` (integer, not null) — actual reps performed
     - `rpe` (numeric, nullable) — rate of perceived exertion (1-10 scale)
     - `completed_at` (timestamptz, default now()) — timestamp of completion

2. Indexes
   - Composite index on (user_id, week_number, day, exercise_name) for fast history lookups
   - Index on exercise_plan_id for FK joins

3. Security
   - RLS enabled with anon+authenticated CRUD (single-tenant, no auth screen)
   - Data is intentionally shared/public within the app session

4. Important Notes
   - This table coexists with the existing `workout_logs` table
   - set_logs is purpose-built for the mesocycle progression engine
   - The user_id column is a text field matching profile_id usage elsewhere
*/

CREATE TABLE IF NOT EXISTS set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  exercise_plan_id uuid REFERENCES exercise_plans(id) ON DELETE SET NULL,
  exercise_name text NOT NULL,
  week_number integer,
  day text NOT NULL,
  set_number integer NOT NULL,
  weight_kg numeric NOT NULL DEFAULT 0,
  reps_completed integer NOT NULL,
  rpe numeric,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_set_logs_user_week_day_exercise
  ON set_logs (user_id, week_number, day, exercise_name);

CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_plan_id
  ON set_logs (exercise_plan_id);

ALTER TABLE set_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_set_logs" ON set_logs;
CREATE POLICY "anon_select_set_logs" ON set_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_set_logs" ON set_logs;
CREATE POLICY "anon_insert_set_logs" ON set_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_set_logs" ON set_logs;
CREATE POLICY "anon_update_set_logs" ON set_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_set_logs" ON set_logs;
CREATE POLICY "anon_delete_set_logs" ON set_logs FOR DELETE
  TO anon, authenticated USING (true);
