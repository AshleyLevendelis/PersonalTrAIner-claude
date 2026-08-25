/*
# "I'm doing Muay Thai instead of weights today"

Ashley told the coach, in advance, that she was skipping her lifting day for
Muay Thai. The coach replied "I'll make sure today is marked as a rest day for
lifting so we stay on track" and did nothing — it could not have, because no
tool in chat-gemini touches a single day's status.

Worse than a no-op: classifyDay (useTrainingWeek.ts) ends
`dateStr < todayStr ? 'missed' : 'due'` with nothing in between, so a day she
announced in advance shows as MISSED the next morning, and the training she
actually did is recorded nowhere. That is the same shape as the pre-plan days
already fixed — the reward for engaging with the app is being told you failed.

Ashley's ruling was to swap the day AND record what replaced it, rather than
merely not counting it against her.

This column carries the first half. workout_sessions is already one row per
(profile_id, date) with a UNIQUE constraint on that pair — it IS the session
record for a date, so the fact belongs here rather than in a third table.
Presence means "the lifting for this day was deliberately swapped for that
activity"; absence means exactly what it means today, so no existing row
changes meaning and nothing needs backfilling.

The second half — what they did instead — goes to cardio_logs through the
shape cardio-log-store.ts already uses, which also makes the activity count
toward the streak, since streak.ts already reads that table. Deliberately NOT
duplicated here: one fact, one home.
*/

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS swapped_for_activity text;

/* Partial: the overwhelming majority of rows are ordinary sessions and would
   only bloat a full index. Reads are always "was this date swapped?", scoped
   to one profile. */
CREATE INDEX IF NOT EXISTS idx_workout_sessions_swapped
  ON workout_sessions(profile_id, date)
  WHERE swapped_for_activity IS NOT NULL;
