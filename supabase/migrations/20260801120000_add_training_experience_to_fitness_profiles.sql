/*
  # Add training experience to fitness profiles

  1. Changes
    - Adds `training_experience` to `fitness_profiles`, capturing how much
      structured training the user has behind them. This drives exercise
      selection (skill gating), working-set volume, rep floors, and how
      aggressively load is added week to week.

  2. Values
    - 'beginner'      — new to structured training, or returning after a long break
    - 'novice'        — 6+ months of fairly consistent training
    - 'intermediate'  — 2+ years, comfortable with the main lifts
    - 'advanced'      — years of training, progress comes slowly

  3. Notes
    - Existing rows default to 'novice'. This is deliberate: it is the least
      disruptive assumption for profiles created before this column existed.
      Defaulting to 'beginner' would abruptly strip volume and exercises from
      plans people are already running, and defaulting to 'advanced' would
      expose them to movements they may not be ready for. Users can correct
      it from their profile at any time.
    - Column is NOT NULL with a default so the app never has to handle an
      absent value at the database layer.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles'
      AND column_name = 'training_experience'
  ) THEN
    ALTER TABLE fitness_profiles
      ADD COLUMN training_experience text NOT NULL DEFAULT 'novice';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fitness_profiles_training_experience_check'
  ) THEN
    ALTER TABLE fitness_profiles
      ADD CONSTRAINT fitness_profiles_training_experience_check
      CHECK (training_experience IN ('beginner', 'novice', 'intermediate', 'advanced'));
  END IF;
END $$;
