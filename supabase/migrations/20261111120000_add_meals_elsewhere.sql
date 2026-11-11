-- Meals somebody else cooks for him (Ashley, 11 Nov 2026, "Set days + optional menu": breakfast and lunch at work,
-- Monday to Friday). One json object on the profile: each meal ('breakfast', 'lunch', 'dinner', 'snack') maps to the
-- weekdays it is cooked for him, Monday = 1 ... Sunday = 7, e.g. {"breakfast":[1,2,3,4,5],"lunch":[1,2,3,4,5]}.
-- '{}' means nothing is, which is every profile made before this. The app reads it defensively
-- (meals-elsewhere.ts readMealsElsewhere) and works on both sides of this migration: before it, the setting says it
-- cannot be saved yet and no day changes.
ALTER TABLE public.fitness_profiles
  ADD COLUMN IF NOT EXISTS meals_elsewhere jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(meals_elsewhere) = 'object');
