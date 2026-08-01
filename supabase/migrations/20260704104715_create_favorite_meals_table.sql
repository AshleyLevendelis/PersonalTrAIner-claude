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
