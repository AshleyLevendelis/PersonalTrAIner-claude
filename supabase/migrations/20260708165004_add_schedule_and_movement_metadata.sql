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
