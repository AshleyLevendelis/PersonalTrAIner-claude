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
