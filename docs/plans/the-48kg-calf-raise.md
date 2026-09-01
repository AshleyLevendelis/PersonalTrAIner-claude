# The 48kg single-leg calf raise

**Status: investigation and proposal. Nothing built.** Load prescription, so
this waits for Ashley per CLAUDE.md. It is here rather than in the code
because the *shape* of the fix is clear and the *numbers* are hers.

## What the app is telling people right now

`Single-Leg Dumbbell Calf Raise` — "stand on one foot at the edge of a step,
dumbbell in the same-side hand". Measured across experience × body weight, at
RPE 7-8, 12-15 reps:

| | 60kg woman | 80kg man | 100kg man |
|---|---|---|---|
| beginner | 8kg | 18kg | 22kg |
| novice | 14kg | 30kg | 38kg |
| intermediate | 18kg | **36kg** | **44kg** |
| advanced | 26kg | **48kg** (clamped from 60) | **48kg** (clamped from 60) |

An intermediate 80kg man is being asked to balance on one foot at the edge of
a step holding **a 36kg dumbbell in one hand**. An advanced one is asked for
48kg — the heaviest dumbbell most gyms own — and the formula actually wanted
60kg. Grip and balance give out long before the calf does. This is not a
prescription anyone would follow; it is a number.

## Why it happens

`isolation_calf` is anchored at **0.65 × squat 1RM**, and that fraction is
calibrated for a *machine* calf raise, where the machine supplies all the
load. Applied to the single-leg version it **double-counts the trainee**: on
one foot, that leg is already carrying full bodyweight before the dumbbell
exists. For an 80kg man the leg is under ~80kg and the app then adds 36kg more
as if the first 80 weren't there.

The category is right about calves being strong; it is wrong about where the
load comes from on this one exercise.

## This is NOT the "one shared root" the backlog guessed

The backlog entry on the 7,340 clamp warnings said the calf raise was "likely
one shared root" with the others. **Measured, it isn't.** Every exercise that
reaches its implement ceiling anywhere in a 240-cell grid (4 experience × 5
bodies × 4 rep ranges × 3 RPEs):

| exercise | cells at ceiling | ceiling |
|---|---|---|
| **Single-Leg Dumbbell Calf Raise** | **56 / 240** | 48kg |
| Shrugs / Dumbbell Shrugs / Machine Shrug / Cable Shrug | 23 / 240 each | 50 / 100kg |
| Goblet Squats | 22 / 240 | 48kg |
| the four dumbbell/machine bench variants | 20 / 240 each | 50 / 100kg |
| Romanian Deadlifts | 20 / 240 | 50kg |
| Overhead Tricep Extension | 17 / 240 | 48kg |
| …23 more, all ≤ 12 / 240 | | |

Every one of the others clamps **only in the top corner** — a 120kg advanced
male — which is the honest "this lifter has run out of dumbbell" case the
ceiling was written for, and exactly what `CALF_MACHINE_CEILING_KG`'s own
comment says the 48kg clamp is *supposed* to mean. The calf raise clamps at
**more than twice the rate of anything else**, and reaches the cap for an
ordinary 80kg intermediate. It is one mis-modelled exercise, not a systemic
fault, and the rest of that 7,340 is the safety net doing its job.

## The three options

**A — anchor the added dumbbell to BODYWEIGHT, scaled by experience.**
*(recommended)* A lift whose load IS the trainee should be sized against the
trainee, not against a barbell squat. It is the same reasoning
`prescribeAddedLoad` already uses for weighted pull-ups and dips. One new
category, no change to the machine calf raise, no change to any other
exercise. Candidate numbers, at 6 / 10 / 16 / 22% of bodyweight rounded to a
2kg dumbbell notch:

| | 60kg woman | 70kg woman | 80kg man | 100kg man | 120kg man |
|---|---|---|---|---|---|
| beginner | 4kg | 4kg | 4kg | 6kg | 8kg |
| novice | 6kg | 8kg | 8kg | 10kg | 12kg |
| intermediate | 10kg | 12kg | 12kg | 16kg | 20kg |
| advanced | 14kg | 16kg | 18kg | 22kg | 26kg |

Nobody hits the 48kg implement ceiling any more, and every cell is a weight a
person can actually hold on one foot.

**B — halve the current number for the single-leg case.** Intermediate 80kg
man goes 36kg → 18kg, advanced 48kg → 24kg. Smaller change, lands close to A
at the middle of the table — but for a coincidental reason rather than a
stated one, and it still anchors a bodyweight lift to a barbell squat. The
120kg advanced case would still crowd the ceiling.

**C — make it a bodyweight movement that accepts added load.** The most
architecturally honest reading: it *is* a bodyweight exercise with a dumbbell
on top. But it changes the exercise's whole shape — no `suggested_load_kg`,
different rendering, different behaviour in swaps and coherence — for one
entry, and the added-load path is only wired for four exercises today.

**Recommendation: A**, and the question for Ashley is the table, not the
multiplier: *does 12kg for an ordinary intermediate and 18kg for an advanced
80kg lifter read right for one-legged calf raises off a step?* Same way the
kettlebell swing scale was settled.

## What A would need

- A `single_leg_bodyweight_calf` category in `categorize()`, matched on the
  entry being `isolation_calf` **and** `unilateral` — a property, not a name,
  so a future single-leg calf variant is covered by construction.
- Reference resolved from bodyweight × an experience fraction, not from a
  parent lift.
- `test:load-ceilings` / `test:ceiling-units`: the calf raise's clamp rate
  must go to **0 / 240**, and the machine calf raise must be **bit-identical**
  — proven by diff, not by "the gate is still green".
- `test:audit` re-run: expect 17,423 / 0 unchanged.
- Mutations: revert the category; anchor to squat again; drop the `unilateral`
  half of the match (which would drag the machine version down with it).

## Scale note

The backlog's "7,340 clamp warnings" is a count of *warnings logged during one
audit run*, which counts the same prescription once per week per profile. The
table above counts *distinct grid cells*, which is a different denominator.
The two numbers are not comparable, and the ranking is the part that matters.
