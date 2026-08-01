/*
# Create daily tracking, nutrition targets, and workout session tables

This migration adds the performance-tracking layer connecting the biomechanically
optimized workout engine with the dynamic carb-cycling nutrition system.

## Design Principles
- Timezone-safe: date columns use PostgreSQL `date` type (YYYY-MM-DD)
- Compound indexing: (profile_id, date) unique constraints for fast reads
- Traceable calculations: BMR/TDEE/EEE stored for audit trail

1. New Tables
  - `daily_metrics` - daily weight/body-fat check-ins
  - `daily_nutrition_targets` - dynamic carb-cycling output with math audit trail
  - `workout_sessions` - date-specific training instances
  - `workout_exercises` - individual exercises within a session

2. Security
  - RLS enabled on all tables
  - anon + authenticated full CRUD (single-tenant, no sign-in)

3. Indexes
  - Compound unique on (profile_id, date) for metrics, nutrition, sessions
  - Index on workout_exercises(workout_session_id) for fast joins
*/

-- ============================================================================
-- TABLE: daily_metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  weight_kg numeric(5,2) NOT NULL,
  body_fat_percentage numeric(4,1),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_profile_date_metrics UNIQUE (profile_id, date)
);

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_daily_metrics" ON daily_metrics;
CREATE POLICY "anon_select_daily_metrics" ON daily_metrics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_daily_metrics" ON daily_metrics;
CREATE POLICY "anon_insert_daily_metrics" ON daily_metrics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_daily_metrics" ON daily_metrics;
CREATE POLICY "anon_update_daily_metrics" ON daily_metrics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_daily_metrics" ON daily_metrics;
CREATE POLICY "anon_delete_daily_metrics" ON daily_metrics FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- TABLE: daily_nutrition_targets
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_nutrition_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  workout_split varchar(50) NOT NULL DEFAULT 'REST',
  target_calories integer NOT NULL,
  target_protein_g integer NOT NULL,
  target_carbs_g integer NOT NULL,
  target_fats_g integer NOT NULL,
  calculated_bmr integer,
  estimated_eee integer,
  calculated_tdee integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_profile_date_nutrition UNIQUE (profile_id, date)
);

ALTER TABLE daily_nutrition_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_daily_nutrition_targets" ON daily_nutrition_targets;
CREATE POLICY "anon_select_daily_nutrition_targets" ON daily_nutrition_targets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_daily_nutrition_targets" ON daily_nutrition_targets;
CREATE POLICY "anon_insert_daily_nutrition_targets" ON daily_nutrition_targets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_daily_nutrition_targets" ON daily_nutrition_targets;
CREATE POLICY "anon_update_daily_nutrition_targets" ON daily_nutrition_targets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_daily_nutrition_targets" ON daily_nutrition_targets;
CREATE POLICY "anon_delete_daily_nutrition_targets" ON daily_nutrition_targets FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- TABLE: workout_sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  split_type varchar(50) NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 45,
  is_completed boolean NOT NULL DEFAULT false,
  nutrition_target_id uuid REFERENCES daily_nutrition_targets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_profile_date_session UNIQUE (profile_id, date)
);

ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workout_sessions" ON workout_sessions;
CREATE POLICY "anon_select_workout_sessions" ON workout_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_workout_sessions" ON workout_sessions;
CREATE POLICY "anon_insert_workout_sessions" ON workout_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_workout_sessions" ON workout_sessions;
CREATE POLICY "anon_update_workout_sessions" ON workout_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_workout_sessions" ON workout_sessions;
CREATE POLICY "anon_delete_workout_sessions" ON workout_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- TABLE: workout_exercises
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_id uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_name varchar(255) NOT NULL,
  tier integer NOT NULL,
  execution_order integer NOT NULL,
  sets integer NOT NULL,
  reps_scheme varchar(50) NOT NULL,
  rest_seconds integer NOT NULL,
  rpe_target integer,
  is_superset boolean NOT NULL DEFAULT false,
  superset_group_id varchar(50),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workout_exercises" ON workout_exercises;
CREATE POLICY "anon_select_workout_exercises" ON workout_exercises FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_workout_exercises" ON workout_exercises;
CREATE POLICY "anon_insert_workout_exercises" ON workout_exercises FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_workout_exercises" ON workout_exercises;
CREATE POLICY "anon_update_workout_exercises" ON workout_exercises FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_workout_exercises" ON workout_exercises;
CREATE POLICY "anon_delete_workout_exercises" ON workout_exercises FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_daily_metrics_profile_date ON daily_metrics(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_nutrition_profile_date ON daily_nutrition_targets(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_profile_date ON workout_sessions(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_session ON workout_exercises(workout_session_id);
