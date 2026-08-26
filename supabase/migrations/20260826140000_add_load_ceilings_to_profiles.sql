-- What the trainee can ACTUALLY load, as opposed to what the app guessed.
--
-- Onboarding asks one equipment question -- four boxes -- and the only
-- weights a user can ever state are squat/bench/deadlift. Everything else is
-- inferred from strength standards and then clamped by tables the app
-- invented: a weighted backpack against a strap/posture guess
-- (IMPROVISED_IMPLEMENT_CEILING_KG, 8/12/20/25kg by experience), and a home
-- trainee's dumbbells against a COMMERCIAL GYM RACK (50kg per hand). The
-- code already admits the second one is wrong and defers it.
--
-- Three columns because loadingMode already classifies every exercise, and a
-- home trainee only ever owns three kinds: dumbbells, a kettlebell/single
-- implement, and something improvised. Barbell users are already asked their
-- working lifts; a cable stack means a gym. Neither is asked here.
--
-- Nullable on purpose: absent means "not asked yet", which is different from
-- both "declined" and "zero".
alter table fitness_profiles
  add column if not exists max_dumbbell_kg numeric null,
  add column if not exists max_single_implement_kg numeric null,
  add column if not exists max_improvised_kg numeric null;

-- DECLINING IS A VALUE, NOT AN ABSENCE, and this column exists because the
-- body-metrics round proved the distinction the hard way: age/height/weight
-- were all "optional", but optional only ever meant "the plan can be built
-- without it" -- the conversation still held the user until each was
-- CONFIRMED, so someone who would not give a weight could answer everything
-- else and never reach Generate.
--
-- A trainee who says "I don't know what my dumbbells weigh" must be able to
-- say it once and never be asked again. Without this flag, "null" would mean
-- both "not asked" and "refused", and the prompt would return forever.
alter table fitness_profiles
  add column if not exists load_ceilings_declined boolean not null default false;

comment on column fitness_profiles.max_dumbbell_kg is
  'Heaviest dumbbell PAIR the trainee owns, per hand, in kg. Clamps loading downward only -- never raises a load above the table ceiling, which is also a safety backstop.';
comment on column fitness_profiles.max_improvised_kg is
  'What the backpack actually holds, in kg. Lowers IMPROVISED_IMPLEMENT_CEILING_KG, never raises it past the strap/posture limit.';
comment on column fitness_profiles.load_ceilings_declined is
  'The trainee was asked and chose not to say. Distinct from null, which means not yet asked.';
