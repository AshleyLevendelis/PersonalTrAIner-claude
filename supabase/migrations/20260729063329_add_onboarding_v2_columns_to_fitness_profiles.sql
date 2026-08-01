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
END $$;