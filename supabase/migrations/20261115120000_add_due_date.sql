-- The due date, asked under the Pregnant tick (his ruling 15 Nov 2026, "Ask due date";
-- docs/plans/pregnancy-one-switch.md). Optional: null means no date given, and the app treats the pregnancy as past
-- 16 weeks, as before. From 28 weeks by this date the plan's effort is capped one notch lower and weights hold.
-- Before this runs, Profile's save says the setting is not switched on yet and the app's insert retries without it.
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS due_date date;
