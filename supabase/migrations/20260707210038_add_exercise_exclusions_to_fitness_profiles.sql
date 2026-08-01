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
