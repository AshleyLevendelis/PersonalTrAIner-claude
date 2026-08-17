/*
  # Let body metrics be genuinely absent

  ## Why

  age, gender, height_cm and weight_kg have been NOT NULL since the original
  fitness_profiles table. That constraint is the real reason refusing to give
  a weight traps a user in onboarding: there was nowhere to put "they didn't
  say". The client papered over it — `Number('')` produces 0 for the three
  numerics, and `data.gender ?? 'male'` invented an answer outright — so the
  columns stayed satisfied while the profile quietly held fabricated values.

  Downstream that surfaced as a confident 1502 kcal target with 0g protein:
  protein is proteinPerKg x bodyweight, so a zero weight honestly produces
  zero grams, while the calorie floor (1500 for male) caught the calories and
  made them look deliberate. The number that was obviously broken showed as
  broken; the number that was silently wrong showed as authoritative.

  These four values are needed for CALORIE AND PROTEIN TARGETS. They are not
  needed to hold an account or to receive a training plan. Making them
  nullable is what lets the app say "targets need a weight" instead of
  inventing one — an absence the UI can render honestly, and that a user can
  fill in later without redoing onboarding.

  ## Changes

  Drops NOT NULL from fitness_profiles.age, .gender, .height_cm, .weight_kg.

  ## Safety

  Widening only — no column is dropped, retyped, or backfilled, and every
  existing row already carries a value, so no current profile changes. Rows
  written before this migration that hold a FABRICATED value (0 age/height/
  weight, or a 'male' the user never gave) are NOT rewritten here: this
  migration cannot tell those apart from real answers, and guessing which to
  null out would be the same invention in reverse. They are addressed
  separately, where the app can ask.

  Reversible: re-adding NOT NULL requires every row to have a value, so a
  rollback needs those absences resolved first. That is a property of the
  data, not of this migration.
*/

ALTER TABLE fitness_profiles ALTER COLUMN age       DROP NOT NULL;
ALTER TABLE fitness_profiles ALTER COLUMN gender    DROP NOT NULL;
ALTER TABLE fitness_profiles ALTER COLUMN height_cm DROP NOT NULL;
ALTER TABLE fitness_profiles ALTER COLUMN weight_kg DROP NOT NULL;

COMMENT ON COLUMN fitness_profiles.age IS
  'Nullable: needed for calorie/protein targets, not for an account or a training plan. NULL means the user has not given it — never substitute a default.';
COMMENT ON COLUMN fitness_profiles.gender IS
  'Nullable: needed for calorie/protein targets, not for an account or a training plan. NULL means the user has not given it — never substitute a default.';
COMMENT ON COLUMN fitness_profiles.height_cm IS
  'Nullable: needed for calorie/protein targets, not for an account or a training plan. NULL means the user has not given it — never substitute a default.';
COMMENT ON COLUMN fitness_profiles.weight_kg IS
  'Nullable: needed for calorie/protein targets, not for an account or a training plan. NULL means the user has not given it — never substitute a default.';
