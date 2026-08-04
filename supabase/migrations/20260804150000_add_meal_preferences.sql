/*
# Meal-realism round, part 3 — persist onboarding's food-preference answers

Onboarding gains three new, skippable questions: favourite cuisines
(steering — nudges which cuisines generate-meals reaches for), disliked
foods (a hard filter — meal-generation.ts rejects any proposal containing
one), and breakfast style (steering — nudges the breakfast slot's prompt
guidance toward quick/cold vs. cooked). fitness_profiles never had columns
for any of these; this migration adds them. Existing profiles default to
empty/null ("no preference") and behave exactly as before this round.
*/

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS favorite_cuisines text[] NOT NULL DEFAULT '{}';
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS disliked_foods text[] NOT NULL DEFAULT '{}';
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS breakfast_style text;
