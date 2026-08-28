-- A step target the trainee set themselves.
--
-- The dashboard's steps ring needs a denominator, and steps-target.ts derives
-- one from the activity level already on file (6k/8k/10k/12k/14k across
-- sedentary..very_active). That is a reasonable default and it is the same
-- shape as the calorie target, which is also derived rather than asked for.
--
-- It is still a BAND, though, and a band cannot know that someone walks a dog
-- twice a day or works nights. This column is the override: when it is set,
-- the ring measures against it; when it is not, the derivation stands.
--
-- Nullable on purpose, and the distinction matters here more than usual:
--   null  -- never set one, use the derived band (the overwhelming majority)
--   value -- they chose this number, and the app must not quietly improve it
-- The same "absent is not zero" convention as max_dumbbell_kg above it. A 0
-- would be a target of no steps, which is a different and nonsensical claim.
alter table fitness_profiles
  add column if not exists daily_step_target integer null;
