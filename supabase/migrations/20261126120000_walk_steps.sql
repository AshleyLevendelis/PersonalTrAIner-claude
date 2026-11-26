-- A walk's own steps (his request 26 Nov 2026: "Start walk ... Congratulations, you completed 3,000 steps").
-- Counted live by the phone's step sensor and checked at the end against the phone's health store; the larger is
-- kept. Null on every cardio log that was not a counted walk. A day is far under a million steps.
ALTER TABLE cardio_logs ADD COLUMN IF NOT EXISTS steps integer;
ALTER TABLE cardio_logs DROP CONSTRAINT IF EXISTS cardio_logs_steps_range;
ALTER TABLE cardio_logs ADD CONSTRAINT cardio_logs_steps_range CHECK (steps IS NULL OR (steps >= 0 AND steps <= 200000));
