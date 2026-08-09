/*
# Macro-accuracy round, Part 2 — user-adjustable macro split

Lets a user tune their protein-per-kg / fat-percentage split (carbs always
take the remainder) instead of the app's hardcoded 2.0 g/kg protein / 25%
fat default. macro_split_preset names one of the built-in presets, or
'custom' — in which case macro_protein_per_kg / macro_fat_percent hold the
user's own numbers. Existing profiles default to 'balanced' with the exact
values the app already hardcoded, so nothing changes for anyone who hasn't
touched the new control (see getProfileMacroSplit in macro-calculator.ts).
*/

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS macro_split_preset text NOT NULL DEFAULT 'balanced';
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS macro_protein_per_kg numeric;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS macro_fat_percent numeric;
