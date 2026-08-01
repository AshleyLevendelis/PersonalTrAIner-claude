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
END $$;