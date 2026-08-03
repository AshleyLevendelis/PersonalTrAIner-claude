/*
# Vision-architecture patch round, fix 2 — separate injuries from exercise_exclusions

`fitness_profiles.exercise_exclusions` has, since it was added, been read
and written as BOTH of two entirely different vocabularies:

  - onboarding's body-part injury codes (`lower_back`, `knees`, `shoulders`,
    `neck`, `wrists`, `hips`, `ankles`, `elbows` — see INJURY_OPTIONS in
    OnboardingFlow.tsx), consumed by exercise-plan.ts's joint-based
    stageInjuryFilter via the INJURED_JOINTS map
  - ban_exercise's exact, full exercise display names (e.g. "Barbell Bench
    Press"), consumed by the exact-name exclusion filter in
    getConstrainedPool/generateExercisePlan

App.tsx read exercise_exclusions back as BOTH `profile.injuries` and
`exerciseExclusions` state, and wrote both vocabularies INTO the same
column at different points (onboarding wrote injury codes into it; every
ban_exercise call appended an exercise name to it). Every ban therefore
polluted the injury list with an exercise name that INJURED_JOINTS has no
entry for (harmlessly ignored by the joint filter, but permanently wrong
data — and the reverse holds too: injury codes sitting in the exclusion
list are inert filter entries that never match any real exercise name).

This migration adds a dedicated `injuries` column and backfills any
existing pollution by classifying each existing exercise_exclusions value:
a recognized injury code moves to `injuries`; everything else (assumed to
be a real exercise name, or already-correct) stays in `exercise_exclusions`
untouched. Ambiguous values are never guessed at — an unrecognized string
simply stays where it already was.
*/

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS injuries text[] NOT NULL DEFAULT '{}';

DO $$
DECLARE
  injury_codes CONSTANT text[] := ARRAY['lower_back','knees','shoulders','neck','wrists','hips','ankles','elbows'];
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, exercise_exclusions
    FROM fitness_profiles
    WHERE exercise_exclusions IS NOT NULL AND array_length(exercise_exclusions, 1) > 0
  LOOP
    UPDATE fitness_profiles
    SET
      injuries = COALESCE(
        (SELECT array_agg(v) FROM unnest(r.exercise_exclusions) AS v WHERE v = ANY(injury_codes)),
        '{}'
      ),
      exercise_exclusions = COALESCE(
        (SELECT array_agg(v) FROM unnest(r.exercise_exclusions) AS v WHERE NOT (v = ANY(injury_codes))),
        '{}'
      )
    WHERE id = r.id;
  END LOOP;
END $$;
