-- What he enjoys besides walking, asked in setup on the pathway (his 13 Nov 2026 strategy, slice 3).
-- One walk a week becomes a swim or a ride (src/lib/pathway.ts). Empty means neither.
-- Before this runs, the app's insert retries without the column and Profile's row says it is not switched on yet.
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS enjoyed_activities text[] NOT NULL DEFAULT '{}';
