/*
# Add substitution macro columns to meal_plans

1. Modified Tables
  - `meal_plans`
    - `sub_calories` (integer, nullable) - calories for the substitution option
    - `sub_protein` (integer, nullable) - protein grams for the substitution option
    - `sub_carbs` (integer, nullable) - carbs grams for the substitution option
    - `sub_fat` (integer, nullable) - fat grams for the substitution option

2. Notes
  - These columns store pre-computed macros for each meal's substitution alternative.
  - When the user toggles a substitution in the UI, the correct macros are displayed immediately.
  - Nullable because existing rows and AI-replaced items may not have sub macros.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_calories') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_calories integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_protein') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_protein integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_carbs') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_carbs integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_fat') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_fat integer;
  END IF;
END $$;
