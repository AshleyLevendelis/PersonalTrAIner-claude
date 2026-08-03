/*
# M0 Part 3 — Honest nutrition inputs on fitness_profiles

Onboarding now ASKS activity level (it was hardcoded 'moderate' in the
client — every TDEE in the system was built on a fabricated input; the
activity_level column itself already exists) and collects two new
meal-structure preferences:

- meals_per_day (2 | 3 | 4): drives slot ratios from M1
- include_snacks (boolean): whether a snack slot exists alongside meals
- cooking_time_preference ('quick' | 'moderate' | 'loves_cooking'):
  steers pool generation toward realistic prep effort

Defaults match the previous implicit behavior (3 meals + snack,
moderate cooking) so existing profiles keep working unchanged.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fitness_profiles' AND column_name = 'meals_per_day'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN meals_per_day integer NOT NULL DEFAULT 3
      CHECK (meals_per_day IN (2, 3, 4));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fitness_profiles' AND column_name = 'include_snacks'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN include_snacks boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fitness_profiles' AND column_name = 'cooking_time_preference'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN cooking_time_preference text NOT NULL DEFAULT 'moderate'
      CHECK (cooking_time_preference IN ('quick', 'moderate', 'loves_cooking'));
  END IF;
END $$;
