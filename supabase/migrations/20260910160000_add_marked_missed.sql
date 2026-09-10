/*
# "I missed it"

The fourth "she told the app and the app forgot" column on workout_sessions,
after swapped_for_activity (I did Muay Thai instead), deliberate_rest (rest
day today) and moved_to_date (I'll do it tomorrow). This one is the answer
none of those covers: the session did not happen, nothing replaced it, and
she is not pretending it was a rest.

Until now "missed" was a GUESS. useTrainingWeek reads a day with nothing
recorded and a date in the past as missed, and the only thing the coach could
offer for such a day was "call yesterday a rest day" — which wrote
deliberate_rest and quietly rewrote a skipped session as a chosen one. The
week strip's own header refuses "the tidier calendar"; that chip drew it.

Ashley's ruling, 10 Sep 2026, asked what the week should show when someone
says they missed a session: it shows as missed and STAYS missed, with the
offer to move the work to a free day. Chosen over folding missed into rest
(the app could never tell a skipped week from a recovery week) and over
having the coach ask why before it counts (the most taps between a person and
a fact they already know).

ONE BOOLEAN, ON THE DAY'S ROW, like its three siblings. Presence means "the
person said this day's session did not happen". Absence means exactly what it
means today — the date judgement still applies — so no existing row changes
meaning and nothing needs backfilling. A marked-missed day reads 'missed' on
the day it is set, even if that day is today, and logged work still outranks
it (someone who marked Tuesday missed and then trained has earned the done).
*/

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS marked_missed boolean;

/* Partial, for the same reason the swap, rest and move indexes are: nearly
   every row is an ordinary session. */
CREATE INDEX IF NOT EXISTS idx_workout_sessions_marked_missed
  ON workout_sessions(profile_id)
  WHERE marked_missed IS TRUE;
