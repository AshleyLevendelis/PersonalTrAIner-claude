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
