# When the bar cannot go up

*Plan before build, per CLAUDE.md — this is load prescription. Written
2 Sep 2026 from a read-only trace of every mechanism that can hold a barbell
main lift's weight flat across consecutive loading weeks, after the
frozen-exercise measurement left this as the largest unexplained residual.
Ashley's ruling on the batch: "Work on all of these 1 by 1. Don't stop until
finished."*

## The symptom

After the Russian Twist fix and the hypertrophy floor, `measure-frozen-exercises`
still found **Barbell Bench Press frozen in 796 of 9,216 plans (1,910 pairs)**,
with Barbell Rows (1,092), Barbell Squats (666), Trap Bar Deadlift (604) and
Deadlifts (208) behind it: a kg prescribed, unchanged between two consecutive
loading weeks in the same block, reps unchanged too. A main lift is supposed
to add weight every loading week. This is the residual most likely to be on
Ashley's own screen.

## What the trace found

Two facts make everything else bite:

- **A main lift's reps are constant inside a block.** The weekly +1 rep ramp
  applies only to reps-led work; for a tier-1 compound the only thing that can
  move reps week to week is the frozen-load rep bump.
- **Every plan in the sweep is unverified** (no known lifts, no calibration
  skip), so every loaded lift runs the "ceiling approach" ramp
  (`load-prescription.ts:1466-1477`): step +5kg a week, capped by the fresh
  standards estimate via `Math.min`. Reps and the RPE label repeat between
  consecutive weeks (the label rounds to whole numbers under the experience
  ceiling), so once the step reaches the ceiling, two weeks print the same kg.

**That precondition is correct.** Prescribing past the estimate for someone
who has never logged a set is inventing strength data, and the prescription
already carries the honest sentence for it (the `rampArrived` basis: *"This is
as far as the estimate goes… Log a set and the number can start moving
again."*). Coherence passes, plate rounding, known weights and block holds
were each traced and exonerated (`enforceLoadCoherence` structurally cannot
target a bilateral tier-1 compound; `enforceOneWeightPerPrescription` is an
order-independent within-week min; the 25% backstop is unreachable while the
ramp runs; `block_hold_note` is runtime-only and deliberate).

The proximate cause of **100%** of barbell-main frozen pairs is the rep bump
failing to take over. `bumpedReps = shiftReps(baseReps, repShift + bump,
repFloor)` (`exercise-plan.ts` bump block) is computed from the BASE range
plus the phase shift plus the bump, then clamped to the rep floor. In a
negative-shift phase the bump can at best restore the base range; when the
base low already sits on the experience floor it cannot move the string at
all; `bumpedReps === reps` then declines silently, and the streak — which
only advances on success — never grows, so the bump is stuck at its first
size forever.

| bucket (651 barbell-main frozen pairs in a stride-7 sample that reproduces the 796 within 2%) | share | what it is |
|---|---|---|
| Maximal Strength, beginner, 8-10 | 51.6% | floor 8: −3 + max bump 3 = 0 — no permitted bump moves the range |
| Maximal Strength, novice, 6-8 | 23.3% | same arithmetic at floor 6 |
| Hypertrophy, beginner, 11-13 | 16.3% | bump already at its cap of 3 after three pinned weeks — designed |
| Power, intermediate, 4-6 | 8.8% | bump stuck at 1–2; bump 3 WOULD move it, but the streak only advances on success |

Zero at advanced (the ramp never reaches a 120kg bench in 16 weeks); zero in
Adaptation or Metabolic blocks (positive shifts); zero for conditioning and
fat-loss goals.

## What is mechanical, and built here

1. **Escalate the bump within the week.** When the candidate bump leaves the
   range unchanged, try the next size up to `MAX_FROZEN_LOAD_REP_BUMP` and
   take the smallest that moves it. If none does, decline. Never advance the
   streak on a decline (the existing comment is right: it would silently skip
   a rep later). This recovers the Power bucket and changes nothing for
   beginner/novice strength, where no permitted bump can move the range. The
   cap keeps its meaning: at most three reps above the phase's own range.
2. **Split the two decline reasons.** A divergence-band decline is a real
   refusal ("the pin would look like a contaminated anchor"); a
   "no permitted bump can move the range" decline is the lever being
   mechanically absent. They are recorded differently so the measurement can
   name them.
3. **Make the measurement see the design.** `rampArrived` is already
   computed and hoisted in `prescribeLoad`; expose what holds the number as
   `hold` on `LoadPrescription` ('implement' | 'floor' | 'ceiling' | null,
   binding one first — see the build findings below for why it grew past a
   single flag), carry it onto the exercise as `load_hold` from the slot's
   NATURAL prescription, and have `measure-frozen-exercises` split the
   loaded class by `<hold>/<bump>`. **The scorer's `frozen_week` rule is
   not changed.** "Same bar, same reps is not a plan" was Ashley's ruling, and
   a labelled hold is still a hold on the screen; this is so the residual is
   named by cause rather than hidden.
4. **Gate.** `test:frozen-weeks` §7: over the sweep, a bump is never declined
   while a larger permitted bump would have moved the range (property, not a
   count); and the measurement's mirror check stays at 0 mismatches.
   Mutations: revert the escalation (red); advance the streak on a decline
   (the existing §3 ceiling check must stay green and the new check must go
   red, proving they are independent).

## What is a decision, and is not built here

The 75% that is beginner/novice Strength. Buying a rep there means the block
reads 6-8 → 7-9 → 8-10 → 9-11 (novice) or 8-10 → … → 11-13 (beginner) under
a "Maximal Strength" heading when the bar is capped. That is the same
trade-off already queued for Ashley on the beginner's third block, so it is
asked once, there, not twice.

BEFORE (what shipped this morning): plans with any frozen exercise 5,471
(59.4%), pairs 47,784; `loaded_kg_frozen` 31,842 pairs; Barbell Bench Press
1,910 pairs / 796 plans.

## What the build found that the trace had not

Writing gate §7(a) — "every held loaded pair carries a reason the generator
recorded" — turned up 72 pairs in the gate's own 36-plan grid that the
first-cut labels could not explain. Three things, none of them the
mechanism above:

1. **The hold flag was being lost on exactly the weeks that mattered.** When
   the bump buys a rep it re-prescribes the load through the forced path,
   and that prescription reports no hold of its own — so a bar pinned at the
   standards ceiling was labelled "held by nothing" on every week the bump
   succeeded. The hold is now captured from the slot's NATURAL prescription
   before the bump runs. (This is also why the first stride-8 measurement
   put most frozen Bench Press pairs in "other": a labelling defect in the
   measurement, not a fourth mechanism.)
2. **The improvised-implement cap and the equipment floor are holds too.**
   Backpack Row and Backpack Overhead Press sit at the strap limit, with the
   bump at its cap; Landmine Row sits on the 20kg bar. `LoadPrescription.hold`
   now reports 'implement' | 'floor' | 'ceiling' | null, binding one first.
3. **A second slot of the same lift copied the bump size but not the
   outcome**, so it said "bought" where the first slot said "capped". The
   outcome is memoised alongside the size.

And one genuine defect, named here and queued rather than fixed, because it
is its own mechanism and touches a rule Ashley set: **two per-lift rules
compound on a lift whose second slot is pinned at the bar floor.** The
one-target-per-lift rule overwrites the later slot's ramped or bought reps
with the earlier slot's; the one-weight rule then pulls the earlier slot's kg
down to the later slot's floor number; next week's ramp anchors on that
lowered number. Traced live on Landmine Row (novice, full-body): Monday's
natural 37.5kg shown as 20kg for the whole block. The root is upstream — the
later slot's natural kg is below the bar floor at all, a slot-keyed
unverified anchor on a rotated-in lift. Marked `load_hold: 'matched'` /
`rep_bump: 'matched'` so the sweep can size it.

Mutations against §7: escalation removed → 8 intermediate Power bench pairs
stuck and ceiling/range_fixed 8 → 23 (red); outcome never recorded → 12
unexplained (red); the one-weight pass stops marking what it lowered → 2
unexplained (red).

## Measurement

BEFORE (what shipped this morning): plans with any frozen exercise 5,471
(59.4%), pairs 47,784; `loaded_kg_frozen` 31,842 pairs; Barbell Bench Press
1,910 pairs / 796 plans.

AFTER — plans with any frozen exercise **5,471 → 5,467 (59.3%)**; frozen pairs **47,784 → 41,092 (−14%)** — the escalation bought reps on about 6,700 pairs the old bump had asked for at the wrong size. Every loaded pair now carries a cause: carries at their distance cap 12,393; implement cap with the bump at its cap 4,822 (designed); **ceiling with no permitted bump able to move the range 4,298 (the beginner/novice Strength floor — item 3's question)**; ceiling with the bump at its cap 1,164 (designed); band declines on flat-estimate accessories 1,581; the matched cascade 532 (461 rep-matched + 71 weight-matched); 341 held by a coherence clamp the bump never saw; 7 'bought' with unchanged reps and 6 ceiling pairs with no bump recorded — the last two are the only pairs still without a full account, 13 of 41,092. Barbell Bench Press 1,910 → 1,826 pairs (794 plans), now labelled: bar at the standards ceiling with the bump at its cap. The bodyweight class (15,942) is unchanged to the pair, as it should be — it is the beginner floor, queued. `test:audit` 17,423 / 0. `test:quality`: Overall average: 11.48 / 12 (11.48 before this change); Plans below the 7.2 floor: 0 / 9216; its own frozen-week tally 5467 plans (59.3%) — the same number the measurement reached independently.
