/*
# Add portion_size and prep columns to meal_plans table

1. Modified Tables
  - `meal_plans`
    - `portion_size` (text) - precise portion size (e.g., "150g", "6 oz")
    - `prep` (text) - brief preparation instructions

2. Notes
  - Both columns are nullable to remain backwards-compatible with existing rows.
  - No security changes needed — existing RLS policies cover all columns.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meal_plans' AND column_name = 'portion_size'
  ) THEN
    ALTER TABLE meal_plans ADD COLUMN portion_size text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meal_plans' AND column_name = 'prep'
  ) THEN
    ALTER TABLE meal_plans ADD COLUMN prep text;
  END IF;
END $$;
