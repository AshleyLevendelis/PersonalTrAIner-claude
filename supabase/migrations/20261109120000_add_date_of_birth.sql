-- The date of birth picked in setup or on Profile (Ashley, 9 Nov 2026, option 1: "keep the birthday so the age goes
-- up on its own"). The app works out today's age from it each time it opens (body-units.ts currentAge); the `age`
-- column stays as the age given, for anyone who typed an age instead of picking a date. Null when not given, which is
-- every profile made before this. The bound only refuses a typo (before 1900); the app's own 13 to 100 limit, and no
-- date in the future, are enforced where the date is picked (a check reading today's date is left out of the database).
ALTER TABLE public.fitness_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date NULL
  CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01');
