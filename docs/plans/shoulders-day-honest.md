# The shoulders day: an honest note, and an ease-off that keeps the day's purpose

Live test, 19 Oct 2026, findings 1 and 2 (`docs/audits/live-test-2026-10-19-findings.md`). Touches injury filtering,
so this plan comes before the build.

## What is wrong (confirmed by running the real code with Sam's profile)

1. Five overhead presses fit his kit (Dumbbell Shoulder Press, Arnold Press, Band Shoulder Press, Pike Push-Ups,
   Backpack Overhead Press). His Saturday has none because it is a plan made while his shoulder was flagged, never
   rebuilt when the flag came off.
2. The note under the day says "No overhead press fits your kit": it never checks kit. Any cause that is not a lasting
   flag on the profile falls through to that sentence. It also ignores leg work entirely ("so today is abs" over three
   leg movements), and it looks only at the profile's lasting injuries, never a running ease-off.
3. The knee ease-off (8 Oct) replaced each knee-loading exercise with the same movement pattern: Spanish Squat and a
   heavy kettlebell swing on a shoulders day.
4. The swing beat Romanian Deadlifts for a bodybuilder because a "keep four options per pattern" rule put it in the
   bodybuilding pool, where it then looks exactly like a bodybuilding exercise.
5. "Plank 3 × 34-49s" is a hold stored by the engine before 9 Oct; today's engine steps holds by 5 s, but nothing
   tidies a stored one.

## Her ruling, 20 Oct 2026 (asked: prescribing rehab is outside my delegation)

**"Work for that day instead."** A knee-loading exercise knocked out of a day that is not about legs is replaced by
that day's own kind of work; no knee-rehab move is added to a non-leg day. On leg day, knee-friendly leg moves still
replace the ones that hurt.

## The build

1. **The note tells the truth about the cause** (`day-gap-note.ts`), read from the profile the pool is built from
   (lasting injuries, running ease-offs, running kit change) and the lasting injuries:
   - a flag that removes every press: as now, naming it; a RUNNING ease-off is said as one ("while you're easing off
     your shoulder");
   - no flag, and the person's own pool truly has no press: "No overhead press fits your kit";
   - the pool HAS a press (Sam's case): "Today's plan has no overhead press, though one fits your kit now." On today's
     card the note carries an **Add one** button that opens the existing add-exercise sheet, so the gap can be closed
     in one tap, the add path's own rules (her 13 Sep "add it and say the session is longer") deciding the rest.
   - legs are named as legs ("so today is legs and abs").
   Wording is the app's voice and hers to change; these are written to match the existing sentence.
2. **The ease-off keeps a non-leg day's purpose** (`plan-adaptations.ts`, her ruling). When the slot being replaced is
   a leg pattern and the day's own work is not legs, the replacement is drawn from the day's own patterns (for
   Shoulders & Abs: a press, a raise, core), from the eased pool, never the same day twice, else the slot is dropped
   as today. Leg days unchanged.
3. **An automatic replacement prefers a real style match** (`mesocycle-edit.ts` `pickAutomaticReplacement`, my CSCS
   call): among on-style candidates, one actually tagged with the person's style ranks ahead of one only let in by the
   per-pattern floor. The swap list's own order (her 18 Sep ruling) is untouched.
4. **A stored hold reads in 5-second steps** (`mesocycle-shape.ts` `fromRow`): "34-49s" reads as "35-50s", the same
   snap the engine's backstop already applies. Read-only: nothing is written back.

NOT in this change: rebuilding Sam's stored plan (the Add button, a rebuild, or the next block does that); and the
stored label "Shoulders & Abs", which stays accurate once the day holds a press again.

## CSCS review

1. Training effect: a shoulders day keeps shoulder stimulus during a knee ease-off instead of turning into a second
   (knee-loading) leg session 48 hours after leg day. 2. What it takes away: the one light leg accessory on that day
   for the ease-off's length (legs are still trained on leg day, with knee-friendly moves). 3. Fundamentals: pattern
   coverage holds (legs on leg day), progression untouched, recovery improves for the sore knee. 4. No floor or ceiling
   is redefined. 5. In scope: it removes rehab-like prescription from non-leg days rather than adding any.

## Proof

`test:shoulders-day` (new): Sam's profile through the real pool, the note for each cause, the legs branch, the
ease-off on a Shoulders & Abs day adds no leg pattern and keeps a shoulder or core move, a leg day still gets a leg
replacement, the bodybuilder's hinge replacement is Romanian Deadlifts, and a stored "34-49s" reads "35-50s".
Mutation-tested. A browser driver for the note and its Add button on today's card. `test:day-length`'s pinned
"fits your kit" sentence is re-anchored to the property (said only when no press fits).
