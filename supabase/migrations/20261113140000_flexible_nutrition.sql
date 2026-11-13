-- His 13 Nov 2026 strategy, slice 4 (docs/plans/flexible-nutrition.md): two Food settings on Profile.
-- meal_variety: how much he is happy to repeat meals ('variety', the default and today's rules; 'some'; 'same').
-- show_numbers: false is the starter tier (no calories or macros on Nutrition and Home).
-- Before this runs, each switch says it is not switched on yet and the app reads the defaults.
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS meal_variety text NOT NULL DEFAULT 'variety'
  CHECK (meal_variety IN ('variety', 'some', 'same'));
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS show_numbers boolean NOT NULL DEFAULT true;
