/*
# Add is_bodyweight column to workout_logs

1. Modified Tables
  - `workout_logs`
    - Added `is_bodyweight` (boolean, default false) - indicates if the exercise was done with bodyweight only

2. Notes
  - When is_bodyweight is true, weight_kg should be 0
  - Used for display formatting (shows "BW" instead of "0kg")
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_logs' AND column_name = 'is_bodyweight'
  ) THEN
    ALTER TABLE workout_logs ADD COLUMN is_bodyweight boolean NOT NULL DEFAULT false;
  END IF;
END $$;
