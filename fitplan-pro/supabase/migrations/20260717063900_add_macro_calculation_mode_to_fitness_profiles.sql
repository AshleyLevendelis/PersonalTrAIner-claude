/*
# Add macro_calculation_mode to fitness_profiles

1. Modified Tables
   - `fitness_profiles`
     - Added `macro_calculation_mode` (varchar(50), default 'STANDARD_STATIC')
       Stores the user's chosen macro calculation method:
       'STANDARD_STATIC' = Mifflin-St Jeor + static PAL multiplier, same macros every day
       'DYNAMIC_CSCS' = Dynamic CSCS performance method with training-day carb cycling

2. Important Notes
   - Default is STANDARD_STATIC for beginner accessibility.
   - Existing rows get STANDARD_STATIC automatically.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'macro_calculation_mode'
  ) THEN
    ALTER TABLE fitness_profiles
      ADD COLUMN macro_calculation_mode varchar(50) NOT NULL DEFAULT 'STANDARD_STATIC';
  END IF;
END $$;
