/*
  # Reminders: up to three a day, and the protein target for the evening nudge

  Ashley, 4 Nov 2026: "The app desperately needs push notifications ... remind
  them of an upcoming workouts or check in on them after a workout. Or to
  remind them to hit their protein goal or log a meal." Her ruling the same
  day, from three options: "Up to 3, spaced" — at most three notifications a
  day, at least three hours apart (over one a day and over no limit).
  docs/plans/the-coach-can-reach-you.md, "Three a day". Pushed only by
  `npm run db:push-both`, on her machine, with her typed confirmation.

  ## What this changes
    - coach_notifications_sent: the one-a-day rule UNIQUE (user_id, sent_on)
      becomes one-per-MOMENT-a-day, UNIQUE (user_id, sent_on, moment). The
      three-a-day cap and the three-hour gap are the function's to enforce;
      what the database still guarantees is that two overlapping runs cannot
      both send the same thing, because the function reserves the row BEFORE
      it sends.
    - coach_moment_facts.protein_target_g: today's protein target as Home last
      showed it, for the evening "behind on protein" nudge.

  ## Safe on both sides of it
  Before this lands, the function's second reservation of the day is refused
  by the old rule, so the phone hears once a day, as before — never once an
  hour. The app's facts write retries without protein_target_g on a missing
  column, so the streak and training days still go ahead.
*/

ALTER TABLE coach_notifications_sent DROP CONSTRAINT IF EXISTS coach_notifications_sent_user_id_sent_on_key;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_notifications_sent_one_moment_a_day'
  ) THEN
    ALTER TABLE coach_notifications_sent
      ADD CONSTRAINT coach_notifications_sent_one_moment_a_day UNIQUE (user_id, sent_on, moment);
  END IF;
END
$block$;

ALTER TABLE coach_moment_facts ADD COLUMN IF NOT EXISTS protein_target_g integer;
