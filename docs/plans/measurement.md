# Measurement: keeping the facts (strategy slice 1, 13 Nov 2026)

His strategy of 13 Nov 2026 (`Coach, Nutrition, Training & Adaptability — Product Strategy`), slice 1: "Retention at
weeks 1, 4 and 12, sessions completed, days logged, and the response to each coach moment. Small. Everything after this
is judged by it." No live users yet, so no dashboard: make sure the facts are KEPT, and that one function can read them.

## What is already kept (measured 13 Nov 2026)

- **Sessions completed**: `workout_sessions` (finished_at), `cardio_logs`, `exercise_set_logs`. Never deleted by the app
  except the developer wipe `clearAllSetLogs`; a cardio Undo deletes the row it just wrote (an undone log is not a log).
- **Days logged**: the same tables plus `meal_events` (voided, never deleted), `daily_metrics`, `water_logs`,
  `daily_steps`. A day is "logged" when any of them has a row for it.
- **Retention**: derivable from the above: a person is retained in week N when anything is logged in week N of their
  time with the app (from the profile's `created_at`).

## What is NOT kept today, and is the gap

- **Each coach moment sent, and whether it was answered.** The in-app moments are chat rows with a reminder marker,
  and the phone's are chat rows written by the server plus `coach_notifications_sent`. Both are lost: "Clear chat"
  deletes every `chat_messages` row, and the server deletes its `coach_notifications_sent` row when no phone took the
  push. And nothing records an ANSWER at all.

## What is built

1. A table `coach_moment_log` (migration `20261113120000_coach_moment_log.sql`, NOT run): one row per unprompted coach
   message, `moment`, `surface` ('chat' | 'phone'), `sent_at`, `chat_message_id`, `answered_at`, `answer`
   ('replied' | 'tapped'). Not a child of `chat_messages`, so Clear chat leaves it. Same four RLS policies as every
   user table.
2. `src/lib/moment-log.ts`: `recordMomentSent` and `markMomentAnswered`. Both are best-effort and never block the
   chat: before the migration the table is missing and each call logs one warning and does nothing.
   - Sent: written where the chat writes its unprompted row (the hello, events, moments); the server writes its own
     for each phone push that a phone took (needs the `coach-reach-out` deploy).
   - Answered: the next thing he sends (typed, said or a chip) answers the newest unanswered moment of the last 12
     hours; a tap on a reminder's shortcut answers it as 'tapped'. Ignored = never answered, read later.
3. `src/lib/engagement.ts`: one pure reader. Per week of his time with the app: sessions completed, days logged,
   moments sent, moments answered; and retained at weeks 1, 4 and 12. Slice 2's "ignored three times running" reads
   the same rows.

## Not built

- A dashboard (no live users). A script that reads production (select-only, needs his machine).
- Backfilling the log from old chat rows.
