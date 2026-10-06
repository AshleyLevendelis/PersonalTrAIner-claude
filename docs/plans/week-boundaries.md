# Where one week ends and the next begins (PLAN, 6 Oct 2026 — nothing built)

Ashley, 6 Oct 2026: *"Make sure the app knows where one week ends and the other begins."*

It touches which week's weights, sessions and calibration the app shows, and it
changes what "this week" measures, so it is a plan first (CLAUDE.md, safety-adjacent
and "anything that changes what a metric measures"). One decision is hers, below.
Every claim is tagged: **MEASURED** (ran real code), **READ** (read the code, did not
run it), **LEAD** (a read-only trace reported it; not re-checked).

## What is wrong

The app has several different ideas of "a week", and they disagree.

1. **The plan week** ("Week 2 of 8", which weights and sessions apply):
   `getActiveMesocycleWeek` in `src/lib/calculations.ts` counts whole 24-hour
   blocks from the plan's creation TIMESTAMP. **MEASURED:** a plan made on a Thursday
   at 18:30 is in week 1 until the next Thursday at 18:30. That Thursday is week 1 at
   noon and week 2 at 23:30, so **the same calendar date has two answers depending on
   when you ask**. Callers ask at "now", at noon of the date, or once at the start of
   the day (the active-session stamp, which can lag "now" until midnight).
2. **The calendar week** (the Home strip, "N of M sessions done"): Monday to Sunday,
   `mondayOf` in `src/hooks/useTrainingWeek.ts`, classified against ONE plan week's
   days. **READ:** unless the plan was made on a Monday, every strip straddles two plan
   weeks, and the days belonging to the other plan week are shown with this week's
   session, not their own.
3. **Rolling 7-day windows** for meals (today + 6), weight, and log reads. Fine, but
   independent of both of the above.
4. **Date-string weeks** (phone-notification block and plan end dates), a third way.

**MEASURED, clocks changing:** a plan made at 23:30 in New York flips one hour early
(22:30) after the clocks go back, because the arithmetic is on raw milliseconds.

## What a person would see (READ, re-checked in code on 6 Oct)

- **A move is refused with the wrong reason.** `resolveMoveTarget` stops at the plan
  week's edge (`session-move.ts:~238, ~279`) and says "no free day left this week", even
  though the Monday-to-Sunday week the person is looking at has free days. Plan made on
  a Thursday: Wednesday's session cannot move to Thursday.
- **Home reads the schedule from week 1 forever.** `exercisePlan` is set from week 1's
  days (`App.tsx:1029` fills it, `:1102` sets it) and nothing refreshes it after a rebuild from a later
  week, so after a schedule change Home's strip, "Tomorrow" and streak days can show
  the old weekdays while the Exercise tab shows the new ones.
- **Today can be in neither week.** `dashboard-data.ts:~405-409` compares a date
  sampled at noon with a week sampled now; during the gap the pace and consistency
  figures read "0 so far".
- **LEAD (not re-checked):** the calibration anchor can be skipped or misattributed on
  the boundary day; the coach's context quotes a different week from the one its
  proposals use; Sunday's "tomorrow" preview reads last Monday's cell; on Monday the
  in-app opener never asks about a missed Sunday; Program browse passes no plan start
  so pre-plan days read "missed"; the weight average and block ranges use UTC dates
  against local ones.
- **Why no check ever saw it (READ):** the test clock sits at noon and the test plan is
  made at midnight on a non-boundary day, so the two sampling points always agree. No
  gate calls `getActiveMesocycleWeek` directly.

## The decision that is hers

**When does a new training week start?** It is what the app says and does, and the
training science does not pick a winner. Three honest options:

- **A. The day you started, every week (recommended).** Started on a Thursday: weeks
  run Thursday to Wednesday. Every week, including the first calibration week, holds a
  full set of sessions. The Home strip stays Monday to Sunday, shows each day's own
  session, and marks where the new training week starts. Fewest changes: it keeps the
  plan as it is and fixes the disagreements.
- **B. Always Monday.** Weeks run Monday to Sunday everywhere, one rule, nothing to
  explain. Cost: the first week is whatever is left of the week you started in, so a
  Friday start gets a week 1 with one session, which is thin for calibrating weights.
  (Or the plan could start the following Monday, which delays training by up to six days.)
- **C. Start day everywhere, including the strip.** Same as A, but the Home strip itself
  runs Thursday to Wednesday so "this week" means one thing on every screen. Cost: a
  week strip that does not start on a Monday.

CSCS review of the options (the five questions, answered): (1) A and C keep the
calibration week whole, B shortens it for most start days; (2) B takes away early
sessions or delays the start; (3) pattern coverage, overload and recovery are
unaffected by A and C, B can leave the first week without a full pattern set; (4) no
floor is redefined, but B moves every later week's start, so a "week 3" load lands
on different dates; (5) inside scope. This is reasoning, not measurement.

## The build, in stages (S1-S4 are right under every option, so they do not wait)

- **S1. One function, by DATE.** A date belongs to exactly one plan week whatever time
  it is asked: count local calendar days from the plan's start date, not milliseconds
  from a timestamp. The week changes at local midnight, never mid-day, and clocks
  changing cannot move it. Direct gate: every hour of a boundary day, DST, plans made
  at different times of day and on every weekday.
- **S2. Every consumer asks by date.** The active-session stamp, the coach's context,
  the move window and "this week" membership all call S1 with a DATE, so they cannot
  disagree. The Home and Exercise strips resolve each day through its own plan week.
- **S3. Home reads the live week's schedule**, not the week-1 snapshot.
- **S4. Local dates, not UTC,** for the weight average window and block date ranges.
- **S5. Depends on her answer.** A: a visible divider on the strip where the new
  training week starts, and the move message says when the next week starts. B: the
  plan's anchor becomes a Monday and week 1 follows one of the two rules above. C: the
  strip runs from the start day.
- **S6. Make the tests able to see it.** The harness plan is made at an ordinary time
  of day on a non-Monday, and a gate samples a boundary day at three times.

Gates and mutations as always: each new check mutation-tested, `test:bundle` and
`test:no-dead-code` re-run, the Home, Exercise and chat drivers re-run with screenshots
read, and a full sweep before any merge.

## Not read or not verified

`rebuildAgainstProfile` (whether a days-per-week rebuild changes the weekday set), the
reach-out loader, the generate-meals and macro-calibration functions, concurrent-activity
weekly windows. The lead list above is a trace's output and is re-measured before any
of it is fixed.
