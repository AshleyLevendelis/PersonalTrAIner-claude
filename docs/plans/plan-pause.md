# Plan pause (his ruling 14 Nov 2026, "Add a pause")

## What he chose
From Priya's live test (#15, "PRODUCT DECISION FOR ME: add a pause, or not"): **add a pause**, on Profile and by asking
the coach. While paused: no session is due, nothing is missed, no workout reminder or cheerful nudge; meals carry on;
on resume the "coming back after a break" easing applies. A red flag ("Park it, go quiet") offers it.

## Where it acts (traced 14 Nov 2026)
One stored fact, `plan_paused_since` (a local date, null when not paused), read at four places:
1. **The day classifier** (`useTrainingWeek.ts` classifyDay): a planned date on or after the pause, up to today, is
   `paused`, never `due` or `missed`, and does not count in the week's "N of M". Home strip, Exercise strip and today
   card, the coach's missed-yesterday, the week tally and weeks-on-plan all read these cells, so one place covers them.
   A paused week has no sessions planned, so weeks-on-plan skips it rather than counting it off plan.
2. **Today's session** (`sessionForDate` callers that say what is on today): today reads "Plan paused" with Resume,
   never a session to start. Logging still works (a walk, a set) and is kept.
3. **The phone's reminders** (`_shared/reach-out.ts`): while paused, nothing unprompted (the same early return as the
   red-flag quiet), including the comeback and "door open" messages, which a pause longer than three days would fire.
4. **The chat's unprompted messages** (`pickUnprompted`): the same.
No plan row is rewritten: the plan's weeks keep their dates, so a long pause shows the plan further on when he resumes.
The layoff easing needs nothing: it reads only the last logged session.

## Resume
"Resume" on Profile, on the paused card, and by asking the coach. Resuming clears the date. If the pause ran 12 weeks
or more, the existing restart offer applies (his ruling B, 8 Oct).

## The database step (his word)
Migration: `fitness_profiles.plan_paused_since date null`. Reads use `select('*')`; the write strips the key on a
missing-column error and says "Pausing isn't switched on yet" until the migration runs.

## The coach
`propose_plan_pause` / `propose_plan_resume`, cards with Apply and Not now (his "Text + small buttons always"). The
coach is told the plan is paused and never asks about sessions during it.

## CSCS review
1. Training effect: none while paused; resume uses the existing detraining bands (10-20 days repeat, 3-6 weeks ~90%,
   6-12 weeks ~80%, 12+ weeks offer a restart). 2. Takes away: nothing stored; the plan waits. 3. Fundamentals
   survive: progression resumes from the last logged session. 4. No floor or ceiling redefined. 5. In scope.

## Checks
`test:plan-pause` (classifier, tally, reminders both sides, chat, resume), `verify:plan-pause` at 390px (Profile
pause, today's card, strip, resume).
