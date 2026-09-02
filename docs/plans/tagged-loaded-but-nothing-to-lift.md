# Tagged loaded, but nothing to lift

*Plan before build, per CLAUDE.md: this changes which exercises progress by
reps, which is load prescription's next-door neighbour. Written 2 Sep 2026
from the loadless-progression trace and the measurement below. Ashley's
standing instruction for this batch: "Work through all of these 1 by 1.
Don't stop until all are fixed."*

## The symptom

`test:quality`'s frozen-week findings, last run: **Russian Twist on 120 of
the 216 lines it printed.** Pull-Ups (22), Backpack Row (21) and Chin-Ups
(20) made up most of the rest. A frozen week is the scorer's name for an
exercise whose load AND reps are identical from one week to the next inside
a block, so the only thing that changes on the screen is the RPE label.
"Same bar, same reps, 'now it's harder' is not a plan" was the review
finding that created the rule.

## The mechanism, traced

`exercise-plan.ts` decides per exercise per week whether to ramp the WEIGHT
or the REPS. The decision hinges on one flag:

```
const isBodyweight = !!dbEntry && !isPrimer && !isExternallyLoaded(dbEntry)
```

and `isExternallyLoaded` (`load-prescription.ts`) is an **equipment-tag
test** — does the entry list a barbell, dumbbell, kettlebell, cable machine,
medicine ball, weighted backpack, and so on. The comment directly above the
flag says what it was MEANT to be:

> No externally loaded weight to ramp (true bodyweight movement, **or one
> prescribeLoad can't categorize**) — progress these via reps regardless of
> the goal's progressionEmphasis, since there's no weight for that setting to
> apply to.

The comment names two cases. The code tests one. An exercise that is tagged
loaded but that `categorize()` gives no load anchor — deliberately, for core
work: *"trunk rotation is not predicted by any barbell lift, and inventing a
fraction would be the same guess in a new place"* — falls between them:

| step | what happens to Russian Twist (`equipment: ['medicine ball']`, `movement_pattern: 'core'`) |
|---|---|
| `isExternallyLoaded` | **true** — medicine ball is in `LOADED_EQUIPMENT` |
| `isBodyweight` | therefore **false** |
| `categorize` | `case 'core': return null` — no anchor, on purpose |
| `prescribeLoad` | returns `starting_weight_kg: null`, display "Choose by feel" |
| `rampLoadCandidate` | `!isBodyweight && (emphasis === 'load' ‖ …)` — true under a load-emphasis goal, but there is no kg to step |
| `rampReps` | `(isBodyweight ‖ loadStepUnaffordable ‖ (reps/maintain emphasis && !main)) && !isCarry` — **false** under a load-emphasis goal |
| frozen-load rep bump | requires `naturalKg != null` — **never fires**, there is no kg |

So under the two goals whose `progressionEmphasis` is `'load'` (hypertrophy
and fat loss), Russian Twist has **no lever at all**: no weight to add, and
excluded from the rep ramp because its equipment tag says it is a weight
exercise. Under `'reps'` and `'maintain'` goals it ramps normally, which is
why it is frozen in some plans and not others.

## Blast radius of the fix

Enumerated from the catalogue, not guessed: exercises whose equipment tag
says loaded but whose `categorize()` is null.

| exercise | pattern | tier | note |
|---|---|---|---|
| **Russian Twist** | core | isolation | the symptom |
| **Cable Woodchops** | core | isolation | same shape, same fix |
| Eccentric Wrist Extension | activation | primer | primers are already excluded by `!isPrimer`; unchanged |
| Forearm Pronation-Supination | activation | primer | unchanged |
| Medicine Ball Slams | activation | primer | unchanged |

Two exercises change behaviour. Forty-one other exercises have no load
anchor, and every one of them is tagged bodyweight, so they already take the
rep ramp today and are untouched.

## The change

One expression, making the code match its own comment:

```
const isBodyweight = !!dbEntry && !isPrimer && (!isExternallyLoaded(dbEntry) || category == null)
```

`category` is already computed a few lines above (`const category = dbEntry
? categorize(dbEntry) : null`). `isBodyweight` has exactly three readers,
all in this decision: the flag itself, `rampLoadCandidate` (now false for
these two — nothing lost, they never had a kg to ramp) and `rampReps` (now
true — the rep ramp applies, +1 rep per week inside the block, deload backs
off, exactly as Plank, Dead Bug and Side Plank already behave). No copy, no
notes, no load fields read it.

**No new progression scheme.** This is the lever that already exists for
loadless work, applied to two exercises that were falling through it.

## What this deliberately does not fix

Measured in the same sweep so the residual is named, not a budget:

- **Pull-Ups / Chin-Ups** freeze inside strength and power blocks when the
  experience `min_reps` clamp swallows the rep ramp (a beginner's floor of 8
  under a −3 phase shift returns the same range every week). They are
  eligible for the ramp; the ramp produces no change. A different lever
  (tempo, added load) is a prescription decision — Ashley's, and out of scope
  for a "fix the exclusion" change.
- **Backpack Row** sits at the improvised-implement ceiling; the frozen-load
  rep bump then self-declines when the pinned weight breaches the divergence
  band. That is the safety band working as designed on an implement that
  cannot hold more; reported, not changed.

## Measurement

Same 9,216-plan grid `test:quality` uses; same `frozen_week` rule, mirrored
and cross-checked against `scorePlan` on every 101st plan (mismatches must be
0 or the report describes a rule the gate does not apply).
`scripts/measure-frozen-exercises.ts`.

**BEFORE** (9,216 plans, mirror 0 mismatches on 92 cross-checked):

| | plans | frozen pairs |
|---|---|---|
| any frozen exercise | **6,283 (68.2%)** | 83,056 |
| tagged loaded, no load anchor (Russian Twist 21,362 · Cable Woodchops 11,148) | 1,763 (19.1%) | 32,510 (**39.1%** of all frozen pairs) |
| bodyweight, reps did not move (Pull-Ups 3,372 · Chin-Ups 2,820 · Glute Bridge 1,263 · …) | 2,888 (31.3%) | 18,101 (21.8%) |
| loaded, kg and reps both frozen (Loaded Backpack Walk 9,557 · Backpack Row 4,636 · Barbell Bench Press 2,314 · …) | 4,990 (54.1%) | 32,445 (39.1%) |

By goal, the tagged-loaded cause appears in 38% of hypertrophy plans and 38%
of fat-loss plans and in **0%** of conditioning and functional plans — exactly
the load-emphasis split the mechanism predicts.

The gate's own 36-plan grid (`test-frozen-weeks` §5): 329 of 5,555
transitions frozen (5.9%) — a hair under its 6.0% bar, which is how this
hid. §6 on the unfixed code: 404 of 404 such transitions frozen.

**AFTER** (same grid, same seeds, mirror 0 mismatches on 92 cross-checked):

| | plans | frozen pairs |
|---|---|---|
| any frozen exercise | **5,787 (62.8%)**, was 6,283 | **50,546**, was 83,056 (−39.1%) |
| tagged loaded, no load anchor | **0**, was 1,763 | **0**, was 32,510 |
| bodyweight, reps did not move | 2,888 — unchanged to the pair | 18,101 — unchanged |
| loaded, kg and reps both frozen | 4,990 — unchanged to the pair | 32,445 — unchanged |

The two untouched classes being identical to the pair is the proof the
change reached exactly the two exercises it named and nothing else. Russian
Twist and Cable Woodchops no longer appear in the frozen list at all. The
gate's 36-plan grid: 329 → 159 of 5,555 (5.9% → 2.9%), loaded non-carry (95)
and carries (38) unchanged. `test:audit` 17,423 / 0 after the change; `test:quality` 11.47 / 12 (was
11.45), 0 below the 7.2 floor, its own frozen-week tally 5,787 plans —
the same number as above, reached independently.

**Scale note.** "Plans with a frozen exercise" is a different measure from
the gate's "frozen transitions" (a plan counts once however many pairs it
holds); the two are not comparable to each other, and neither is comparable
to the backlog's older *61.7%*, which predates several fixes and a wider
catalogue. The remaining 62.8% is now entirely the two residual causes named
above, both of which are prescription decisions.

## Gate

`scripts/test-frozen-weeks.ts` gains a section that derives the affected set
FROM THE CATALOGUE (`isExternallyLoaded && categorize == null && not a
primer`) rather than naming Russian Twist, so a future exercise with the same
shape is covered the day it is added, and asserts none of them is ever frozen
in a non-deload pair under any goal. The measured-improvement thresholds in
§5 are re-based to the new numbers with the scale change called out.
Mutations: revert the one expression (must go red); change `||` to `&&`
(must go red).

Then `test:audit` (expect 17,423 / 0 failures) and `test:quality` (expect
≥ 11.45 overall with 0 below the 7.2 floor) re-run, because this changes
prescriptions.
