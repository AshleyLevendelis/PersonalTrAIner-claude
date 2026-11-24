-- HEART RATE FROM THE PHONE (his ruling 24 Nov 2026, "1 + 2, build it"; src/lib/health-heart.ts). Read only, from Apple
-- Health / Health Connect, which a watch or chest strap already writes to. Nothing is prescribed by it: effort stays
-- in words (his 14 Nov ruling); these numbers are shown and told to the coach, for information.
--   1. After a session: the average and highest heart rate over the session's own time. cardio_logs already has
--      avg_heart_rate (since August, never filled); it gains max_heart_rate. workout_sessions gains both.
--   2. Resting heart rate, one figure a day, for the trend on Home.
-- Every column is nullable and read with select('*'), so the app works the same before this runs.

ALTER TABLE cardio_logs ADD COLUMN IF NOT EXISTS max_heart_rate smallint;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS avg_heart_rate smallint;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS max_heart_rate smallint;

CREATE TABLE IF NOT EXISTS daily_resting_heart_rate (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date        date NOT NULL,
  bpm         smallint NOT NULL CHECK (bpm BETWEEN 25 AND 140),
  source      text NOT NULL CHECK (source IN ('healthkit', 'health_connect')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_resting_hr_profile_date ON daily_resting_heart_rate(profile_id, date);

-- Owner only, the same four policies as daily_steps (20260830120000_scope_every_table_to_its_owner.sql).
ALTER TABLE daily_resting_heart_rate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_select_daily_resting_heart_rate" ON daily_resting_heart_rate;
DROP POLICY IF EXISTS "owner_insert_daily_resting_heart_rate" ON daily_resting_heart_rate;
DROP POLICY IF EXISTS "owner_update_daily_resting_heart_rate" ON daily_resting_heart_rate;
DROP POLICY IF EXISTS "owner_delete_daily_resting_heart_rate" ON daily_resting_heart_rate;
CREATE POLICY "owner_select_daily_resting_heart_rate" ON daily_resting_heart_rate FOR SELECT
  TO anon, authenticated USING (owns_profile(profile_id));
CREATE POLICY "owner_insert_daily_resting_heart_rate" ON daily_resting_heart_rate FOR INSERT
  TO anon, authenticated WITH CHECK (owns_profile(profile_id));
CREATE POLICY "owner_update_daily_resting_heart_rate" ON daily_resting_heart_rate FOR UPDATE
  TO anon, authenticated USING (owns_profile(profile_id)) WITH CHECK (owns_profile(profile_id));
CREATE POLICY "owner_delete_daily_resting_heart_rate" ON daily_resting_heart_rate FOR DELETE
  TO anon, authenticated USING (owns_profile(profile_id));
