/*
# How the session felt

From Ashley's research document ("The Coach's Decision Stack") and the
assessment of it, 2 Sep 2026. Its strongest adherence finding is that AFFECT
DURING EXERCISE — whether the session felt good or awful while it was
happening — predicts whether someone comes back, more reliably than any
programming variable. Two thirds of people drop out inside the first month,
and this app has no way to tell someone who is quietly hating it from someone
who is fine: it judges only by attendance and by what was lifted, both of
which move AFTER the person has already started leaving.

Ashley's ruling on the shape, 2 Sep 2026: asked whether this should be a
one-tap control on the session summary, she chose to have the coach ask in
CHAT instead — "the app is centered around the chat." So there is no new
button; there is a column, and a tool the coach can call.

TWO COLUMNS, for the reason record_fact keeps a verbatim note alongside its
structured field. `felt` is the bucket anything downstream can count. But
"brutal but good" and "just miserable" are the same bucket and not the same
sentence, and the second half is what makes the coach's next reply worth
reading. A four-way enum alone would throw that away — which is the specific
thing the chat-not-a-button ruling was choosing against.

Absent means NEVER ASKED. Not "fine", not "declined" — absent. Nothing is
backfilled, no existing row changes meaning, and the coach's own context line
keys on the absence, so a row written before this migration simply never
prompts a question about a session nobody can remember.
*/

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS felt text,
  ADD COLUMN IF NOT EXISTS felt_note text;

/* The four buckets, asserted in the database rather than only in TypeScript:
   the edge function writes this column too, and a coach that invented a fifth
   value would put a word in a field the app then has to guess at. NULL stays
   legal — it is what "never asked" is. */
ALTER TABLE workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_felt_check;
ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_felt_check
  CHECK (felt IS NULL OR felt IN ('easy', 'good', 'hard', 'rough'));

/* Partial, for the same reason the deliberate_rest index is: nearly every row
   has no answer, and the only reads are "which finished session still has no
   answer" and "how did the last few feel" for one profile. */
CREATE INDEX IF NOT EXISTS idx_workout_sessions_felt
  ON workout_sessions(profile_id, date)
  WHERE felt IS NOT NULL;
