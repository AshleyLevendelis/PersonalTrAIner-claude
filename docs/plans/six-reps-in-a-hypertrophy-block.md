# Six reps in a Hypertrophy block

*Plan before build, per CLAUDE.md — this is rep prescription on the main
lift. Written 2 Sep 2026, straight after Ashley's answer.*

## The decision, and how it was reached

Ashley's Full Program screen showed *Deadlifts 3×3-5* in weeks 5–6 under a
**Hypertrophy** heading promising *"moderate loads, higher volume"*.
Measured across all 9,216 quality-grid plans
(`scripts/report-rep-ranges-by-phase.ts`): a main lift sat at 3-5 inside a
Hypertrophy block in 662 plans (7.2%), from two deliberate sources — combat
style bases its main lifts at 3-5, and the fat-loss goal pulls main lifts two
reps heavier.

Put to her as one question with three options:

1. **Lift it to at least 6 reps** (recommended) — every main lift in a
   Hypertrophy block runs at least 6 reps; Strength and Power still go heavy.
2. Keep 3-5 and change the heading for those plans.
3. Floor fat loss only; keep combat's 3-5 as a style identity.

**She chose 1.** Decision log: asked, answered, not decided unprompted.

## What "at least 6" means, precisely

A floor on the **bottom** of the range: 3-5 → 6-8, 4-6 → 6-8, 5-7 → 6-8,
6-8 unchanged. The spread is preserved, which is exactly what `shiftReps`
already does with its `minReps` argument (`low = max(minReps, low + delta)`,
then `low + spread`).

**Correction to my own number.** The 662 plans quoted in the question
counted ranges whose TOP was below 6 (3-5, 4-5). Her rule also moves 4-6,
5-6 and 5-7, which are common (4-6 alone was 15.6% of hypertrophy main-lift
slots), so the plan count under her rule is larger. The BEFORE below is
re-measured under her rule before the change; the two counts are not
comparable and the report says so.

## Where it goes

One place decides the week's reps for every exercise:
`shiftReps(baseReps, repShift, expConfig.min_reps)` in the weekly loop of
`exercise-plan.ts`, with two siblings — the interval fallback and the
frozen-load rep bump — that must use the SAME floor, or the bump could hand
back a lower range than the one it is bumping (3-5 + 1 = 4-6, "different"
from 6-8, and it would replace it).

- `PhaseConfig` gains `main_lift_rep_floor?: number`; hypertrophy sets 6.
  Nothing else sets it, so Strength and Power are untouched by construction.
- The weekly loop computes one `repFloor = max(expConfig.min_reps,
  isMainCompound ? phaseConfig.main_lift_rep_floor ?? 0 : 0)` and passes it
  to all three `shiftReps` calls. `isMainCompound` is `mechanics_tier ===
  'tier1_compound'`, which `mapTier` maps 1:1 to the `tier_1_primary` slot
  the report counted.
- Load follows reps: `prescribeLoad` takes the rep range as an input and
  estimates lighter for more reps, so a 6-8 main lift is prescribed lighter
  than the 3-5 it replaces. That is the intended coupling — moderate loads,
  higher volume — not a side effect.

Out of scope, noted: swaps and gap-fill repair assign reps through
`assignSetsRepsFromConfig` and do not apply phase shifts at all today. That
is a pre-existing gap and a separate thread.

## Gate

`scripts/test-block-phases.ts` gains a section: across a sweep that includes
combat-style and fat-loss plans at every experience tier, every main-lift rep
range in every Hypertrophy week starts at 6 or more; AND Maximal Strength
weeks still contain main lifts below 6 (so the floor did not leak);
AND deload weeks of a Hypertrophy block respect it too. Mutations: remove the
floor from the config (red); apply the floor regardless of phase (the
strength check goes red).

## What the first measurement caught, and the second fix

The floor landed and every gate stayed green — and `test:quality`'s own
frozen-week tally rose from 5,787 to **6,298 plans**. The floor had frozen
the lifts it lifted. Mechanism: the week's reps were one combined shift
(phase shift + weekly ramp) applied to the base and clamped to the floor.
The moment the floor binds, the clamp swallows the ramp — a 4-6 pull-up
under the floor of 6 reads 6-8 in week 1, 4-6 + 1 = 5-7 clamped to 6-8 in
week 2, and 6-8 in week 3. The frozen-load rep bump re-derived its range the
same way and self-declined because "bumped" equalled "current".

**First attempt, tried and withdrawn.** Shift in two steps — the phase's
range first, then ramp and bump from it — so that ANY binding floor becomes
a minimum rather than a value. Measured: frozen plans fell to 4,138 (the
whole bodyweight class went to zero), but the pre-existing experience floor
now behaved the same way, and a beginner's "Maximal Strength" main lift
climbed 8-10 → 10-12 → 11-13 across the block: **17.5% of strength main
lifts outside that phase's own promise, from 0%.** That is the same kind of
mismatch Ashley had just objected to, produced in a block she was not asked
about. Withdrawn as a prescription trade-off that is hers, not mine.

**What shipped.** The main-lift floor is applied as a CONSTANT LIFT, measured
against the raw base and added to the shift before the ramp and the bump:
`floorLift = max(0, 6 − (baseLow + rep_shift))`. Under the floor, 3-5 runs
6-8 → 7-9 → 8-10 and the bump buys reps above that; with no floor set the
lift is 0 and every line is exactly what it was. The experience floor is
untouched: a beginner in a strength block still reads 8-10 flat, as before
today. Gate: `test:block-phases` §6 additionally pins that loadless main
lifts under the floor still change reps between week 1 and week 2 of a
hypertrophy block (beginners excluded on purpose; 67 pairs compared; the
clamp-only mutation goes red).

**Queued for Ashley, with both sides measured:** should the weekly +1 rep ramp
and the rep bump also climb above a beginner's floor of 8 in a Strength block?
Yes: frozen plans 5,787 → 4,138, and the bodyweight residual (Pull-Ups,
Chin-Ups, Glute Bridge, Push-Ups) disappears. Cost: a "Maximal Strength"
block for a beginner reads 8-10, 9-11, 10-12 — and up to 11-13 when the bar
is pinned.

## Measurement

BEFORE and AFTER under her rule from the report script, same grid, same
seeds.

| Hypertrophy block, main lift | before | after |
|---|---|---|
| slots starting below 6 | 28,615 of 74,133 (38.6%) | **0** |
| plans with at least one | **1,914 (20.8%)** | **0** |
| most common ranges | 6-8 25%, 4-6 16%, 8-10 15%, 3-5 10% | 6-8 57%, 8-10 15%, 6-7 9%, 7-9 7% |

Maximal Strength main lifts are identical before and after (4-6 24.1%,
3-5 20.0%): the floor did not leak. The 662 quoted in the question was the
count under the old "top below 6" rule; 1,914 is the count under hers.

Not covered by her ruling and deliberately not touched: secondary lifts at
5-6 inside Hypertrophy blocks (1.9% of secondary slots), and the Metabolic
Conditioning block's 7-9 main lifts (1,246 plans, 13.5%) — the next question.

`test:audit` 17,423 / 0 after the change (re-run after the second fix: 17,423 / 0). `test:block-phases` §6: 53 plans,
1,496 hypertrophy main-lift slots, 0 under six; strength still 340 of 564
below six. Mutations: floor deleted → 486 under; floor on every phase →
strength 0 below six. `test:quality` after both fixes: Overall average: 11.48 / 12 (was 11.47 after item 3, 11.45 before it); Plans below the 7.2 floor: 0 / 9216; its own frozen-week tally 5471 plans (59.4%), the same number the measurement above reached independently. Frozen exercises across the grid after both fixes: plans with any frozen exercise **5,787 → 5,471 (62.8% → 59.4%)** — down, not up, so the floor as shipped costs nothing on frozen weeks — frozen pairs 50,546 → 47,784; the bodyweight class 18,101 → 15,942 (Pull-Ups 3,372 → 2,199 and Chin-Ups 2,820 → 1,834, novices under the floor now ramping; what remains of it is the beginner floor), the loaded class 32,445 → 31,842 (Barbell Bench Press 2,314 → 1,910). For comparison, the withdrawn two-step variant measured 4,138 plans (44.9%) with the bodyweight class at 0 — that is the size of the queued beginner-floor question.
