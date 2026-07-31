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
