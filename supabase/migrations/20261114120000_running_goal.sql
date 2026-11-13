-- A running goal (his 13 Nov 2026 strategy, slice 6; src/lib/running.ts): asked in setup (optional) or told to the coach.
-- running_race_date is told to the coach only (his ruling of 13 Nov 2026). running_base_minutes is what he says he runs
-- non-stop now. Before this runs, the app's insert retries without the columns and Profile says it is not switched on yet.
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS running_goal text;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS running_race_date date;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS running_base_minutes integer;
