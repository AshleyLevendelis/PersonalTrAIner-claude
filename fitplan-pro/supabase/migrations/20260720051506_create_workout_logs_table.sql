/*
# Create workout_logs table for set-level performance tracking

This migration adds a `workout_logs` table to capture individual set performance
data (weight, reps) for each exercise in a user's workout sessions.

1. New Tables
  - `workout_logs`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references fitness_profiles with cascade delete)
    - `date` (date, default current date)
    - `exercise_name` (text, not null)
    - `set_number` (integer, not null)
    - `weight_kg` (numeric(6,2), not null)
    - `reps_completed` (integer, not null)
    - `completed_at` (timestamptz, default now())

2. Security
  - RLS enabled on `workout_logs`
  - Full CRUD for anon + authenticated (single-tenant, no sign-in app)

3. Indexes
  - Composite index on (user_id, date) for daily lookups
  - Composite index on (user_id, exercise_name) for exercise history queries
  - Unique constraint on (user_id, date, exercise_name, set_number) to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  exercise_name text NOT NULL,
  set_number integer NOT NULL,
  weight_kg numeric(6,2) NOT NULL DEFAULT 0,
  reps_completed integer NOT NULL DEFAULT 0,
  completed_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_date_exercise_set UNIQUE (user_id, date, exercise_name, set_number)
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workout_logs" ON workout_logs;
CREATE POLICY "anon_select_workout_logs" ON workout_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_workout_logs" ON workout_logs;
CREATE POLICY "anon_insert_workout_logs" ON workout_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_workout_logs" ON workout_logs;
CREATE POLICY "anon_update_workout_logs" ON workout_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_workout_logs" ON workout_logs;
CREATE POLICY "anon_delete_workout_logs" ON workout_logs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON workout_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_exercise ON workout_logs(user_id, exercise_name);
