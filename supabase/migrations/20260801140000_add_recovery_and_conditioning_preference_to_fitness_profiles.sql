/*
# Add recovery_capacity and conditioning_preference to fitness_profiles

1. Modified Tables
   - `fitness_profiles`:
     - `recovery_capacity` (text, default 'moderate') — self-reported sleep/
       stress/job-demand capacity: 'low' | 'moderate' | 'high'. Scales weekly
       set volume in generateMesocycle() and, for 'low' with 5+ training days
       selected, trims one day back to rest in generateExercisePlan().
     - `conditioning_preference` (text, default 'tolerate') — how the
       trainee feels about cardio: 'love' | 'tolerate' | 'avoid'. Scales the
       weekly conditioning-session budget in assignConditioningNotes() via
       resolveConditioningFrequency() (src/lib/goal-policies.ts).

2. Notes
   - Defaults ('moderate', 'tolerate') match the neutral, no-op case for
     each field (multiplier of 1x-ish / the goal's base frequency
     unchanged), so existing profiles created before this migration keep
     generating plans exactly as they did before these two onboarding
     questions existed.
   - training_time_preference (added in
     20260709190815_add_training_preferences_to_fitness_profiles.sql) is
     retired from the app going forward — it duplicated preferred_time and
     nothing outside the chat coaching context actually needed the extra
     granularity (midday/night/varies vs. just morning/evening). The column
     itself is left in place, nullable, for backward compatibility; nothing
     new reads or writes it.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fitness_profiles'
      AND column_name = 'recovery_capacity'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN recovery_capacity text NOT NULL DEFAULT 'moderate';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fitness_profiles'
      AND column_name = 'conditioning_preference'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN conditioning_preference text NOT NULL DEFAULT 'tolerate';
  END IF;
END $$;
