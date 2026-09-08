/*
# "I'll do it tomorrow"

The third and last of the "she told the coach and the app forgot" columns,
after add_swapped_for_activity (I'm doing Muay Thai instead) and
add_deliberate_rest (rest day today). This one is the answer neither of those
covers: she is still doing the session, just not when the plan said.

Measured 8 Sep 2026 against classifyDay, Tuesday's Push & Press seen from
Wednesday morning:

  nothing recorded              -> missed       counts against her week: yes
  a session row with no marks   -> missed       counts against her week: yes
  as if she had said "rest day" -> rest_chosen  no
  as if she had said "Muay Thai"-> swapped      no

and Wednesday still resolved to its own Pull & Hinge, so the session she said
she would move appeared on no day at all. The coach has no tool for it either
— its own prompt says so in as many words ("INTENTIONS ARE NOT APPOINTMENTS.
Nothing in this app stores 'I'll train tomorrow morning' — there is no tool
for it and no screen that shows it"). A rule with nothing behind it is a rule
the model routes around, so this adds the fact rather than restating it.

ON THE ORIGIN ROW, and the target derived. workout_sessions is already one row
per (profile_id, date) with a UNIQUE constraint on the pair, so it IS the
record for a date. Storing the move at both ends would be two writers of one
fact, which is precisely how two screens come to disagree — this repo has now
found that shape four times, most recently the week strip drawing a swap
glyph while TodayPanel went on offering "Start workout" for the same day.

Presence means "the session prescribed for THIS date is being run on that date
instead". Absence means exactly what it means today, so no existing row
changes meaning and nothing needs backfilling.

WHERE A MOVE MAY LAND is enforced in code, not here, because it is a question
about the PLAN (which weekday has a session on it) and the plan does not live
in this table. Two rules, see docs/plans/ill-do-it-tomorrow.md: the target
weekday has nothing prescribed — Ashley's ruling, 8 Sep, chosen over letting a
day hold two sessions — and it falls in the same mesocycle week as the origin,
because the plan repeats weekly and a move into next week would put the same
session on the calendar twice at two different loads.
*/

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS moved_to_date date;

/* Partial, for the same reason the swap and rest indexes are: nearly every
   row is an ordinary session. Unlike those two, this index also serves a
   lookup BY the value — "was anything moved onto this date?" — so the column
   itself is in the index, not only the predicate. */
CREATE INDEX IF NOT EXISTS idx_workout_sessions_moved_to
  ON workout_sessions(profile_id, moved_to_date)
  WHERE moved_to_date IS NOT NULL;
