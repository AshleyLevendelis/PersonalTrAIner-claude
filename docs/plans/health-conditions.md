# Health conditions folded into the injuries question (plan, NOT BUILT)

His ruling, 14 Nov 2026 (Sal and Margaret, decision 1): **"Fold into injuries"**. In his words: "we keep adding
questions and the onboarding keeps getting longer. When really I want to make it shorter." So no new question: the
existing "anything that bothers you when you train?" question gains five taps.

## What it does, as ruled
- Taps: high blood pressure, a heart condition, diabetes or pre-diabetes, blood thinners, pregnancy.
- A tap: shows the doctor line ("check with your GP before you start"), keeps max-effort testing and very hard sets out,
  uses effort words (Easy / Steady / Hard) rather than heart rates, and tells the coach.
- It never changes food (clinical nutrition is outside the CSCS delegation and the app's scope).

## Why it is not built yet: it needs a migration
- Injuries are joint codes (`fitness_profiles.injuries`), read by the injury filter. A condition is not a joint: stored
  there it would be shown as an unrecognised injury and filtered as nothing.
- `user_facts` cannot hold it: its `kind` and `constraint_kind` are fixed by database checks (`food_preference`,
  `exercise_preference`, `timing_rule`, `hard_constraint` with `availability` or `equipment`).
- So it needs a new column, `fitness_profiles.health_conditions text[]`. **Every migration needs his word** (CLAUDE.md).

## The build, once he says yes (about a day)
1. Migration `health_conditions text[] default '{}'`; written through the retry-without-the-column helper so the app
   works on both sides of it; read with `select('*')`.
2. Setup: the injuries card shows the five taps under a small "Health" heading; the slot keeps joints and conditions
   apart (`injuries` and a new `healthConditions` slot, one card). The summary shows both rows; Profile edits both.
3. The doctor line: the existing one (starting from nothing) is shown when any condition is ticked, worded for it.
4. The plan, CSCS (mine to decide, basis to BACKLOG): with any of the five, the calibration week never asks for a hard
   set (its top set stays at about RPE 7), no prescribed set above RPE 8, and conditioning is prescribed by effort word
   only. Anything specific to pregnancy (which exercises, from which week) is left to the GP line, never guessed: the
   app does not know the stage, and a CSCS does not prescribe for pregnancy without clearance.
5. The coach: the profile block lists the conditions with the rule "never advise on the condition itself; send it to
   their GP; effort words, not heart rates". Needs the `chat-gemini` deploy.
6. Checks: a gate on the slot, the stored profile and the plan's effort ceiling (a beginner and an intermediate, each
   with and without a condition, so the ceiling binds); a setup driver for the taps and the line.

## Already built (decision 2, the same day)
A question about training safely with a condition, medication or pregnancy is never parked in setup: the app says the
GP line now, notes his own words, and goes back to the question it was on (`setup-health-question.ts`,
`test:sal-margaret` §4, `verify:onboarding-turns` §30). The coach's prompt says the same; needs the `onboarding-chat`
deploy.
