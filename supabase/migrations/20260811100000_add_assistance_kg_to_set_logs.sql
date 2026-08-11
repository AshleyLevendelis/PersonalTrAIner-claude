-- Assistance logging (queue-clearing round). Prescription for an assistance-
-- loaded exercise (ExerciseEntry.assistance -- today, only Pull-Ups
-- (Assisted)) is currently open-loop: exercise-plan.ts predicts an
-- assistance_kg forward every week, but nothing logged in the gym ever
-- comes back to confirm it. This column is the foundation for closing that
-- loop -- purely additive, nullable, zero behavior change on its own.
-- Unlike weight_kg, 0 here is not ambiguous (it plainly means "no
-- assistance used," a valid state), so this does not need weight_kg's
-- malformed-zero-detection treatment; it can ride the same insert/sync path
-- as a plain extra column, not a parallel pipeline.
--
-- Write path (SetGrid.tsx logging UI, set-log-store.ts save/sync), and the
-- inverted progression read-back (less assistance over time = stronger, the
-- opposite of every other loaded exercise) are NOT built in this migration
-- -- see the round's decision log for why that's scoped as its own pass.

alter table exercise_set_logs
  add column if not exists assistance_kg numeric null;

comment on column exercise_set_logs.assistance_kg is
  'Machine/band assistance used for this set, in kg. NULL for every non-assistance exercise. Lower = stronger, the inverse of weight_kg.';
