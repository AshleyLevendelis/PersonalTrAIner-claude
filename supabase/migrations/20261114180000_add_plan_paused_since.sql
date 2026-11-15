-- A PLAN PAUSE (his ruling 14 Nov 2026, "Add a pause"): the local date the pause began, null while the plan runs.
-- Read with select('*') everywhere; the app's write strips the key on a missing-column error until this lands.
alter table public.fitness_profiles add column if not exists plan_paused_since date;
