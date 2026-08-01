/*
# Create fitness profiles and chat messages tables (single-tenant, no auth)

1. New Tables
  - `fitness_profiles`
    - `id` (uuid, primary key) - unique profile identifier
    - `age` (integer, not null) - user's age in years
    - `gender` (text, not null) - male or female
    - `height_cm` (numeric, not null) - height in centimeters
    - `weight_kg` (numeric, not null) - weight in kilograms
    - `activity_level` (text, not null) - sedentary/light/moderate/active/very_active
    - `fitness_goal` (text, not null) - lose_weight/maintain/build_muscle/improve_endurance
    - `training_days` (jsonb, not null) - array of day objects with availability
    - `preferred_time` (text, not null) - morning or evening
    - `bmr` (numeric) - calculated Basal Metabolic Rate
    - `tdee` (numeric) - calculated Total Daily Energy Expenditure
    - `calorie_target` (numeric) - daily calorie goal
    - `protein_g` (numeric) - daily protein target in grams
    - `carbs_g` (numeric) - daily carbs target in grams
    - `fat_g` (numeric) - daily fat target in grams
    - `created_at` (timestamptz) - when profile was created

  - `chat_messages`
    - `id` (uuid, primary key) - unique message identifier
    - `profile_id` (uuid, not null, FK) - references the fitness profile
    - `role` (text, not null) - user or assistant
    - `content` (text, not null) - message text
    - `created_at` (timestamptz) - when message was sent

2. Security
  - Enable RLS on both tables.
  - Allow anon + authenticated full CRUD (single-tenant, no sign-in required).
  - Data is intentionally shared/public since there is no authentication.

3. Indexes
  - Index on chat_messages.profile_id for fast lookups
  - Index on chat_messages.created_at for ordering
*/

CREATE TABLE IF NOT EXISTS fitness_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  age integer NOT NULL,
  gender text NOT NULL,
  height_cm numeric NOT NULL,
  weight_kg numeric NOT NULL,
  activity_level text NOT NULL,
  fitness_goal text NOT NULL,
  training_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_time text NOT NULL,
  bmr numeric,
  tdee numeric,
  calorie_target numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fitness_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_profiles" ON fitness_profiles;
CREATE POLICY "anon_select_profiles" ON fitness_profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_profiles" ON fitness_profiles;
CREATE POLICY "anon_insert_profiles" ON fitness_profiles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_profiles" ON fitness_profiles;
CREATE POLICY "anon_update_profiles" ON fitness_profiles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_profiles" ON fitness_profiles;
CREATE POLICY "anon_delete_profiles" ON fitness_profiles FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON chat_messages;
CREATE POLICY "anon_select_messages" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON chat_messages;
CREATE POLICY "anon_insert_messages" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON chat_messages;
CREATE POLICY "anon_update_messages" ON chat_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON chat_messages;
CREATE POLICY "anon_delete_messages" ON chat_messages FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_chat_messages_profile_id ON chat_messages(profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
/*
# Create meal_plans and exercise_plans tables (single-tenant, no auth)

1. New Tables
  - `meal_plans`
    - `id` (uuid, primary key) - unique meal entry identifier
    - `profile_id` (uuid, not null, FK) - references the fitness profile
    - `meal_slot` (text, not null) - meal category (Breakfast, Lunch, Dinner, Snack, Post-Workout)
    - `name` (text, not null) - food item name
    - `calories` (integer, not null) - calorie count
    - `protein` (integer, not null) - protein in grams
    - `carbs` (integer, not null) - carbs in grams
    - `fat` (integer, not null) - fat in grams
    - `substitution` (text) - suggested substitution
    - `created_at` (timestamptz) - when entry was created

  - `exercise_plans`
    - `id` (uuid, primary key) - unique exercise entry identifier
    - `profile_id` (uuid, not null, FK) - references the fitness profile
    - `day` (text, not null) - day of the week
    - `focus` (text, not null) - workout focus area
    - `name` (text, not null) - exercise name
    - `sets` (integer, not null) - number of sets
    - `reps` (text, not null) - rep range or duration
    - `rest` (text, not null) - rest period
    - `substitution` (text) - suggested substitution
    - `created_at` (timestamptz) - when entry was created

2. Security
  - Enable RLS on both tables.
  - Allow anon + authenticated full CRUD (single-tenant, no sign-in required).

3. Indexes
  - Index on meal_plans.profile_id for fast lookups
  - Index on exercise_plans.profile_id for fast lookups
*/

CREATE TABLE IF NOT EXISTS meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  meal_slot text NOT NULL,
  name text NOT NULL,
  calories integer NOT NULL,
  protein integer NOT NULL,
  carbs integer NOT NULL,
  fat integer NOT NULL,
  substitution text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_meal_plans" ON meal_plans;
CREATE POLICY "anon_select_meal_plans" ON meal_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_meal_plans" ON meal_plans;
CREATE POLICY "anon_insert_meal_plans" ON meal_plans FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_meal_plans" ON meal_plans;
CREATE POLICY "anon_update_meal_plans" ON meal_plans FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_meal_plans" ON meal_plans;
CREATE POLICY "anon_delete_meal_plans" ON meal_plans FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_meal_plans_profile_id ON meal_plans(profile_id);

CREATE TABLE IF NOT EXISTS exercise_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  day text NOT NULL,
  focus text NOT NULL,
  name text NOT NULL,
  sets integer NOT NULL,
  reps text NOT NULL,
  rest text NOT NULL,
  substitution text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exercise_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_exercise_plans" ON exercise_plans;
CREATE POLICY "anon_select_exercise_plans" ON exercise_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_exercise_plans" ON exercise_plans;
CREATE POLICY "anon_insert_exercise_plans" ON exercise_plans FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_exercise_plans" ON exercise_plans;
CREATE POLICY "anon_update_exercise_plans" ON exercise_plans FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_exercise_plans" ON exercise_plans;
CREATE POLICY "anon_delete_exercise_plans" ON exercise_plans FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_exercise_plans_profile_id ON exercise_plans(profile_id);
/*
# Add portion_size and prep columns to meal_plans table

1. Modified Tables
  - `meal_plans`
    - `portion_size` (text) - precise portion size (e.g., "150g", "6 oz")
    - `prep` (text) - brief preparation instructions

2. Notes
  - Both columns are nullable to remain backwards-compatible with existing rows.
  - No security changes needed — existing RLS policies cover all columns.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meal_plans' AND column_name = 'portion_size'
  ) THEN
    ALTER TABLE meal_plans ADD COLUMN portion_size text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meal_plans' AND column_name = 'prep'
  ) THEN
    ALTER TABLE meal_plans ADD COLUMN prep text;
  END IF;
END $$;
/*
# Create favorite_meals table

1. New Tables
  - `favorite_meals`
    - `id` (uuid, primary key)
    - `profile_id` (uuid, foreign key to fitness_profiles, not null)
    - `name` (text, not null) - the dish name
    - `meal_slot` (text) - which meal slot this food was used in
    - `calories` (integer)
    - `protein` (integer)
    - `carbs` (integer)
    - `fat` (integer)
    - `portion_size` (text) - portion details
    - `prep` (text) - preparation instructions
    - `times_used` (integer, default 1) - incremented on each reuse
    - `last_used_at` (timestamptz) - when this meal was last chosen
    - `created_at` (timestamptz)

2. Constraints
  - Unique constraint on (profile_id, name) so repeated use increments times_used

3. Security
  - Enable RLS on `favorite_meals`.
  - Allow anon + authenticated full CRUD (no auth in this app).

4. Notes
  - Favorites persist across plan resets (tied to profile_id, not a session).
  - The unique constraint prevents duplicates; frontend uses upsert logic.
*/

CREATE TABLE IF NOT EXISTS favorite_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  meal_slot text,
  calories integer,
  protein integer,
  carbs integer,
  fat integer,
  portion_size text,
  prep text,
  times_used integer NOT NULL DEFAULT 1,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, name)
);

CREATE INDEX IF NOT EXISTS idx_favorite_meals_profile_id ON favorite_meals(profile_id);
CREATE INDEX IF NOT EXISTS idx_favorite_meals_times_used ON favorite_meals(profile_id, times_used DESC);

ALTER TABLE favorite_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_favorite_meals" ON favorite_meals;
CREATE POLICY "anon_select_favorite_meals" ON favorite_meals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_favorite_meals" ON favorite_meals;
CREATE POLICY "anon_insert_favorite_meals" ON favorite_meals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_favorite_meals" ON favorite_meals;
CREATE POLICY "anon_update_favorite_meals" ON favorite_meals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_favorite_meals" ON favorite_meals;
CREATE POLICY "anon_delete_favorite_meals" ON favorite_meals FOR DELETE
  TO anon, authenticated USING (true);
/*
# Add substitution macro columns to meal_plans

1. Modified Tables
  - `meal_plans`
    - `sub_calories` (integer, nullable) - calories for the substitution option
    - `sub_protein` (integer, nullable) - protein grams for the substitution option
    - `sub_carbs` (integer, nullable) - carbs grams for the substitution option
    - `sub_fat` (integer, nullable) - fat grams for the substitution option

2. Notes
  - These columns store pre-computed macros for each meal's substitution alternative.
  - When the user toggles a substitution in the UI, the correct macros are displayed immediately.
  - Nullable because existing rows and AI-replaced items may not have sub macros.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_calories') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_calories integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_protein') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_protein integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_carbs') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_carbs integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_fat') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_fat integer;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_portion_size') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_portion_size text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_prep') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_prep text;
  END IF;
END $$;
/*
# Create nutrition_cache table and add verified/ingredients fields to meal_plans

1. New Tables
  - `nutrition_cache`
    - `id` (uuid, primary key)
    - `ingredient_hash` (text, unique) - SHA-256 hash of sorted ingredient array for fast lookup
    - `ingredients` (jsonb) - the original ingredient string array
    - `calories` (integer) - verified calorie total from Edamam
    - `protein` (integer) - verified protein grams
    - `carbs` (integer) - verified carb grams
    - `fat` (integer) - verified fat grams
    - `created_at` (timestamptz)

2. Modified Tables
  - `meal_plans`
    - Added `ingredients` (jsonb, nullable) - array of ingredient strings for Edamam parsing
    - Added `is_verified` (boolean, default false) - whether macros were verified by Edamam

3. Security
  - RLS enabled on `nutrition_cache`
  - Anon + authenticated full CRUD (single-tenant, no auth app)

4. Notes
  - The ingredient_hash allows instant O(1) cache lookups
  - The cache prevents redundant Edamam API calls for identical ingredient sets
  - is_verified flag drives the UI verified badge
*/

-- Create nutrition_cache table
CREATE TABLE IF NOT EXISTS nutrition_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_hash text UNIQUE NOT NULL,
  ingredients jsonb NOT NULL,
  calories integer NOT NULL,
  protein integer NOT NULL,
  carbs integer NOT NULL,
  fat integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nutrition_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_nutrition_cache" ON nutrition_cache;
CREATE POLICY "anon_select_nutrition_cache" ON nutrition_cache FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_nutrition_cache" ON nutrition_cache;
CREATE POLICY "anon_insert_nutrition_cache" ON nutrition_cache FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_nutrition_cache" ON nutrition_cache;
CREATE POLICY "anon_update_nutrition_cache" ON nutrition_cache FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_nutrition_cache" ON nutrition_cache;
CREATE POLICY "anon_delete_nutrition_cache" ON nutrition_cache FOR DELETE
  TO anon, authenticated USING (true);

-- Add ingredients and is_verified columns to meal_plans
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'ingredients') THEN
    ALTER TABLE meal_plans ADD COLUMN ingredients jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'is_verified') THEN
    ALTER TABLE meal_plans ADD COLUMN is_verified boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_nutrition_cache_hash ON nutrition_cache (ingredient_hash);
/*
# Add dietary_preferences column to fitness_profiles

1. Modified Tables
   - `fitness_profiles`
     - Added `dietary_preferences` (text array, nullable, default empty array)
       Stores user dietary restrictions/preferences as an array of strings
       (e.g. ['vegetarian', 'gluten-free', 'nut-free'])

2. Important Notes
   - Column is nullable with a default of '{}' (empty array) for backwards compatibility
   - Existing rows will get an empty array automatically
   - No RLS changes needed as existing policies already cover this table
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'fitness_profiles'
    AND column_name = 'dietary_preferences'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN dietary_preferences text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
/*
# Add exercise_exclusions to fitness_profiles

1. Modified Tables
  - `fitness_profiles`
    - `exercise_exclusions` (text[], default empty array) - Stores exercise names the user has permanently banned from their plan generation.

2. Notes
  - This column enables the "Active Profile Learning" feedback loop where users can tell the chat assistant to never show specific exercises again.
  - The generation engine reads this list and permanently blacklists those movements from future weekly cycles.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fitness_profiles'
      AND column_name = 'exercise_exclusions'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN exercise_exclusions text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
/*
# Add scheduling fields and movement metadata

1. Modified Tables
  - `fitness_profiles`
    - `concurrent_activities` (jsonb) - Array of active sports/external demands with intensity weights and occurrence days
    - `weekly_schedule` (jsonb) - Map of days to workout_block_ids representing the user's variable training layout

  - `exercise_plans`
    - `movement_patterns` (text[]) - Array of dominant movement patterns (e.g., vertical_pull, horizontal_push, hip_hinge)
    - `fatigue_intensity` (real) - Fatigue intensity rating from 0.0 (recovery) to 1.0 (maximal CNS load)

2. Security
  - No policy changes needed (existing anon+authenticated CRUD policies cover new columns).

3. Important Notes
  - concurrent_activities stores structured data: [{name, intensity, days[], movement_demands[]}]
  - weekly_schedule maps day names to block IDs: {"Monday": "upper_pull", "Tuesday": null, ...}
  - movement_patterns on exercise_plans enables programmatic fatigue cross-referencing
  - fatigue_intensity enables the cascading recalibration pipeline to evaluate overlap safety
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'concurrent_activities'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN concurrent_activities jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'weekly_schedule'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN weekly_schedule jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_plans' AND column_name = 'movement_patterns'
  ) THEN
    ALTER TABLE exercise_plans ADD COLUMN movement_patterns text[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_plans' AND column_name = 'fatigue_intensity'
  ) THEN
    ALTER TABLE exercise_plans ADD COLUMN fatigue_intensity real DEFAULT 0.5;
  END IF;
END $$;
/*
# Add training preference fields to fitness_profiles

1. Modified Tables
  - `fitness_profiles`
    - `session_duration_preference` (text) - Preferred session length: '30-45', '45-60', '60-90', '90+'
    - `training_time_preference` (text) - Preferred time of day: 'morning', 'midday', 'evening', 'night', 'varies'
    - `workout_split_preference` (text) - Preferred split architecture: 'ppl', 'upper_lower', 'full_body', 'bro_split', 'ai_recommendation'

2. Security
  - No policy changes needed (existing anon+authenticated CRUD policies cover new columns).

3. Important Notes
  - All columns are nullable with sensible defaults for backwards compatibility with existing profiles.
  - session_duration_preference determines exercise count and superset density in the generated plan.
  - workout_split_preference overrides the AI's automatic split selection when set to anything other than 'ai_recommendation'.
  - training_time_preference replaces the old binary 'morning'/'evening' preferred_time field with richer options.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'session_duration_preference'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN session_duration_preference text DEFAULT '45-60';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'training_time_preference'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN training_time_preference text DEFAULT 'morning';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'workout_split_preference'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN workout_split_preference text DEFAULT 'ai_recommendation';
  END IF;
END $$;/*
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
/*
# Add macro_calculation_mode to fitness_profiles

1. Modified Tables
   - `fitness_profiles`
     - Added `macro_calculation_mode` (varchar(50), default 'STANDARD_STATIC')
       Stores the user's chosen macro calculation method:
       'STANDARD_STATIC' = Mifflin-St Jeor + static PAL multiplier, same macros every day
       'DYNAMIC_CSCS' = Dynamic CSCS performance method with training-day carb cycling

2. Important Notes
   - Default is STANDARD_STATIC for beginner accessibility.
   - Existing rows get STANDARD_STATIC automatically.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'macro_calculation_mode'
  ) THEN
    ALTER TABLE fitness_profiles
      ADD COLUMN macro_calculation_mode varchar(50) NOT NULL DEFAULT 'STANDARD_STATIC';
  END IF;
END $$;
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
/*
# Add is_bodyweight column to workout_logs

1. Modified Tables
  - `workout_logs`
    - Added `is_bodyweight` (boolean, default false) - indicates if the exercise was done with bodyweight only

2. Notes
  - When is_bodyweight is true, weight_kg should be 0
  - Used for display formatting (shows "BW" instead of "0kg")
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_logs' AND column_name = 'is_bodyweight'
  ) THEN
    ALTER TABLE workout_logs ADD COLUMN is_bodyweight boolean NOT NULL DEFAULT false;
  END IF;
END $$;
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
/*
# Add action_data column to chat_messages

1. Modified Tables
   - `chat_messages`
     - Added `action_data` (jsonb, nullable) — stores the PlanAction JSON object
       associated with assistant messages (food replacements, exercise swaps,
       schedule updates, volume adjustments, bans). Enables action badges to
       render correctly when chat history is reloaded.

2. Important Notes
   - Column is nullable because most messages (user messages and text-only
     assistant messages) will not have an associated action.
   - No index added since this column is not queried by value.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'action_data'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN action_data jsonb;
  END IF;
END $$;
/*
# Add 4-Week Mesocycle & Exercise Taxonomy Columns to exercise_plans

1. Modified Tables
   - `exercise_plans`:
     - `movement_pattern` (text) — Single dominant movement pattern per exercise
       (push, pull, hinge, squat, carry, rotation, isolation).
     - `tier` (text) — Exercise priority tier following NSCA/NASM periodization
       (tier_0_primer, tier_1_primary, tier_2_secondary, tier_3_isolation, tier_4_finisher).
     - `fatigue_cost` (text) — CNS/systemic fatigue cost rating
       (low, moderate, high).
     - `week_number` (integer, 1-4) — Which week of the 4-week mesocycle this
       exercise entry belongs to. Enables progressive overload across weeks.

2. Important Notes
   - All columns are nullable to maintain backward compatibility with existing rows.
   - An index on (profile_id, week_number, day) supports efficient per-week queries.
   - Existing data retains week_number = NULL (treated as week 1 by the app).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_plans' AND column_name = 'movement_pattern'
  ) THEN
    ALTER TABLE exercise_plans ADD COLUMN movement_pattern text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_plans' AND column_name = 'tier'
  ) THEN
    ALTER TABLE exercise_plans ADD COLUMN tier text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_plans' AND column_name = 'fatigue_cost'
  ) THEN
    ALTER TABLE exercise_plans ADD COLUMN fatigue_cost text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_plans' AND column_name = 'week_number'
  ) THEN
    ALTER TABLE exercise_plans ADD COLUMN week_number integer;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercise_plans_profile_week_day
  ON exercise_plans (profile_id, week_number, day);
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
/*
# Add onboarding v2 columns to fitness_profiles

1. Modified Tables
  - `fitness_profiles`
    - `equipment_access` (text, default 'full_gym') - User's available equipment: 'full_gym', 'home_gym', 'minimalist', 'bodyweight'
    - `training_style` (text, default 'hybrid') - Preferred training style: 'functional', 'bodybuilding', 'combat', 'hybrid'
    - `coaching_persona` (text, default 'supportive') - AI chat tone preference: 'drill_sergeant', 'analytical', 'supportive', 'hype'

2. Security
  - No policy changes needed (existing anon+authenticated CRUD policies cover new columns).

3. Important Notes
  - All columns are nullable with defaults for backwards compatibility with existing profiles.
  - equipment_access filters exercises from the exercise database based on available equipment.
  - training_style influences the AI exercise programming style and selection.
  - coaching_persona prepends a personality directive to the AI chat system prompt.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'equipment_access'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN equipment_access text DEFAULT 'full_gym';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'training_style'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN training_style text DEFAULT 'hybrid';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'coaching_persona'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN coaching_persona text DEFAULT 'supportive';
  END IF;
END $$;/*
# Add display_name column to fitness_profiles

1. Modified Tables
  - `fitness_profiles`
    - `display_name` (text, nullable) - The name/nickname the user wants the AI coach to call them. Used in chat greetings and personalized coaching responses.

2. Security
  - No policy changes needed (existing anon+authenticated CRUD policies cover new column).

3. Important Notes
  - Column is nullable but the onboarding UI enforces it as mandatory.
  - Used by the AI chat system prompt to address the user by name.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN display_name text;
  END IF;
END $$;