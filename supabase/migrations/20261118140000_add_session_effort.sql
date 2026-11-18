-- How hard the session was, 1 to 10 (his ruling 18 Nov 2026, "Build the 1-10"): one tap on the session summary.
-- Nullable: most sessions before this have none, and skipping the question is allowed. Until this lands the app saves
-- the feel word alone and the number waits (session-feel.ts recordSessionEffort).
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS effort smallint;

ALTER TABLE workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_effort_range;
ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_effort_range CHECK (effort IS NULL OR (effort >= 1 AND effort <= 10));
