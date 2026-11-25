/*
  # What is coming up, sent ahead for the coach's reminders (25 Nov 2026)

  Ashley's brief: the coach is "still not proactive enough". Its reminders were written from almost nothing, so the
  best they could say was "are you ready for your session today?". Home now sends yesterday's, today's and tomorrow's
  session briefs (name, main lift and weight, heavy legs or not, hard classes that day) and one pattern (a stuck lift,
  "too hard" piling up, protein short) ahead, keyed by date (src/lib/days-ahead.ts).

  One nullable jsonb column on the existing table. Safe on both sides of it: the app drops the key and retries when
  the column is missing (moment-facts.ts LATER_COLUMNS), and the server reads with select=* and treats it as absent.
  Row-level security is the table's own, unchanged. Pushed only by `npm run db:push-both`, on his machine.
*/
ALTER TABLE coach_moment_facts ADD COLUMN IF NOT EXISTS days_ahead jsonb;
