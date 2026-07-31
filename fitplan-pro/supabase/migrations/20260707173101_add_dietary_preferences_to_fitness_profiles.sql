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
