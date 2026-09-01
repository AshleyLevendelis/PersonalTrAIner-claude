/*
# Add start_preference to fitness_profiles

1. Modified Tables
   - `fitness_profiles`:
     - `start_preference` (text, nullable) — 'move_more' | 'train'. What a
       new-and-currently-inactive trainee said they actually want when their
       GOAL did not already settle it. Read only by isStartingOut()
       (src/lib/starting-out.ts).

2. Why it exists
   The walking prescription used to be chosen by `training_experience =
   'beginner' AND activity_level = 'sedentary'` and nothing else. Measured
   2 Sep 2026: someone who answered "full gym", "muscle growth — build size
   & strength" and "beginner" got sixteen weeks of walking and no exercises,
   because they also ticked the activity question's "Sedentary — desk job,
   little movement outside training". That question is about their JOB, for
   computing TDEE; its own description presupposes they train. It was
   overriding two answers that stated intent.
   Goal now decides. Muscle growth and functional strength go straight to
   training. Fat loss and conditioning are compatible with either, so those
   trainees are asked outright, and this column stores the answer.

3. Notes
   - NULLABLE ON PURPOSE, and the null case is deliberately conservative:
     an existing beginner+sedentary profile with a fat-loss or conditioning
     goal has never been asked this question, so it keeps the walking plan
     it already has rather than being silently handed loaded sessions on its
     next rebuild. Only an explicit 'train' moves someone off walks. A
     backfilled default would have made that choice for them.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles'
      AND column_name = 'start_preference'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN start_preference text;
  END IF;
END $$;
