-- The allergy card (his ruling 15 Nov 2026, "Allergy card, peanuts split"; docs/plans/allergy-card.md).
-- One row per allergy: {allergen, pen, traces, coeliac?, oats?}. The allergen switches on the meal filters (peanuts
-- apart from tree nuts); the pen is told to the coach; traces and coeliac change what is SAID, never a filter.
-- Before this runs, Profile's save says the setting is not switched on yet and every read treats it as none.
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS allergies jsonb NOT NULL DEFAULT '[]'::jsonb;
