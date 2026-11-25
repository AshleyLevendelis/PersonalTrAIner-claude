-- Cardio days a week (his ruling 24 Nov 2026, "A, build it"; src/lib/cardio-days.ts): how many cardio sessions of their
-- own he wants, 0-3. Null means never asked, which plans exactly as 0. Asked in setup only of someone who loves cardio;
-- editable on Profile. The app reads it with select('*') and drops it on a retry until this runs.
alter table public.fitness_profiles
  add column if not exists cardio_days_per_week smallint
  check (cardio_days_per_week is null or (cardio_days_per_week between 0 and 3));
