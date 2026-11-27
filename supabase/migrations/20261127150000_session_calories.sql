-- CALORIES FOR A WEIGHTS SESSION, FROM THE WATCH (his request 27 Nov 2026: "even though my watch was on the weight
-- session ... it didn't log any calories burned", and his ruling "Yes, with the database step"). The watch counts the
-- session's calories; the phone had nowhere to keep them. Shown on the session summary, for information: like a walk's,
-- they never change the food target (his 25 Nov rule). Nullable and read with select('*'), so the app works before
-- this runs (src/lib/session-calories.ts keeps the figure on the phone until the column exists).
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS active_kcal integer
  CHECK (active_kcal IS NULL OR active_kcal BETWEEN 0 AND 5000);
