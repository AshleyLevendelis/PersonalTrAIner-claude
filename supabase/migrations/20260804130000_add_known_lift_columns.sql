/*
# Vision-architecture patch round, fix 6 — persist onboarding's known-lift answers

Onboarding already asks "do you know your working weights?" and, if so,
collects known_squat_kg/known_bench_kg/known_deadlift_kg and sets
skip_calibration_week — and exercise-plan.ts's mesocycle generator already
reads all four off UserProfile to seed week 1 from the reported numbers
instead of running a calibration week (see KnownWorkingWeights in
exercise-plan.ts, and the field docs on UserProfile in types.ts).

But fitness_profiles never had columns for them: App.tsx's onboarding
INSERT dropped the four fields on the floor, and restoreSession never read
them back. So the answers influenced only the very first mesocycle
generated in the same browser session, then vanished — a reload replayed
onboarding's default (no known lifts, calibration week 1) forever after.

This migration adds the missing columns; App.tsx's insert/restore paths
write and read them alongside every other onboarding field.
*/

ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS known_squat_kg numeric;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS known_bench_kg numeric;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS known_deadlift_kg numeric;
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS skip_calibration_week boolean NOT NULL DEFAULT false;
