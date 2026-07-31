/*
# Create cardio_logs table for conditioning and cardio activity tracking

1. New Tables
  - `cardio_logs`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references fitness_profiles with cascade delete)
    - `date` (date, default current date)
    - `activity_name` (text, not null) - fully open-ended, stores any user-typed activity
    - `duration_minutes` (integer, not null)
    - `intensity_rpe` (integer, 1-10 RPE scale)
    - `avg_heart_rate` (integer, optional)
    - `notes` (text, optional)
    - `completed_at` (timestamptz, default now())

2. Security
  - RLS enabled on `cardio_logs`
  - Full CRUD for anon + authenticated (single-tenant, no sign-in app)

3. Indexes
  - Composite index on (user_id, date) for daily lookups

4. Notes
  - activity_name is intentionally unconstrained text to allow any activity
  - intensity_rpe has a CHECK constraint ensuring values 1-10
*/

CREATE TABLE IF NOT EXISTS cardio_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  activity_name text NOT NULL,
  duration_minutes integer NOT NULL,
  intensity_rpe integer NOT NULL CHECK (intensity_rpe >= 1 AND intensity_rpe <= 10),
  avg_heart_rate integer,
  notes text,
  completed_at timestamptz DEFAULT now()
);

ALTER TABLE cardio_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cardio_logs" ON cardio_logs;
CREATE POLICY "anon_select_cardio_logs" ON cardio_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cardio_logs" ON cardio_logs;
CREATE POLICY "anon_insert_cardio_logs" ON cardio_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cardio_logs" ON cardio_logs;
CREATE POLICY "anon_update_cardio_logs" ON cardio_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cardio_logs" ON cardio_logs;
CREATE POLICY "anon_delete_cardio_logs" ON cardio_logs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cardio_logs_user_date ON cardio_logs(user_id, date);
