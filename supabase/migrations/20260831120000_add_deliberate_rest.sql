/*
# "Rest day today"

The same defect as add_swapped_for_activity, one step earlier in the same
sentence. That migration covered "I'm doing Muay Thai instead" — lifting
swapped for a named activity. It did NOT cover the plainer answer: resting,
with nothing in its place.

Measured live, 31 Aug 2026. Ashley told the coach "Rest day today" on a
training day. It replied "I will mark today as a rest day for you" and could
not have: no tool in chat-gemini records a rest. classifyDay ends
`dateStr < todayStr ? 'missed' : 'due'`, so the day she declared shows as
MISSED the next morning — the app telling her off for a decision she made
deliberately and announced at the time.

The coach's own instructions already forbid that reply in as many words
("Do not say a day has been marked, moved, rescheduled, skipped or set to
rest unless you actually called a tool that does it"). The rule was there; it
had nothing to call. A rule with no tool behind it is a rule the model
routes around, so this adds the tool rather than restating the rule louder.

A SEPARATE COLUMN, not a sentinel in swapped_for_activity. That column's
whole meaning is "the lifting was swapped for THAT activity", and its glyph
reads "swapped for another activity" — writing the string 'Rest' into it
would put a non-activity in a field that names activities, and show a mark
that says work happened when none did. Two different facts, two columns.

Presence means "the trainee chose to rest this prescribed training day, and
said so". Absence means exactly what it means today, so no existing row
changes meaning and nothing needs backfilling.
*/

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS deliberate_rest boolean;

/* Partial, for the same reason the swap index is: nearly every row is an
   ordinary session, and the only read is "was this date rested?" for one
   profile. */
CREATE INDEX IF NOT EXISTS idx_workout_sessions_deliberate_rest
  ON workout_sessions(profile_id, date)
  WHERE deliberate_rest IS TRUE;
