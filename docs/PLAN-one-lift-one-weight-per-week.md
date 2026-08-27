# One lift, one weight, in a given week

## Context

`test:audit` has sat at **2 / 13,967** since the equipment-quality feature
merged, both `rotation_relative_load`. Ashley chose to ship around them with
the consequence stated; this is the fix.

The audit describes them as a rotation carrying too much weight. Traced, the
real defect is simpler and worse: **the same lift, in the same week, with
identical sets/reps/RPE, is prescribed two different weights.**

```
home_gym / advanced / 50kg female
  Lateral Raises, week 3   Monday 2kg   Wednesday 4kg    both 3x22-27 @ RPE 6-7

minimalist / intermediate / 50kg female
  Walking Lunges, week 7   Tuesday 6kg  Thursday 8kg     both 4x12-14 @ RPE 7-8
```

A user opening the app sees the same exercise, the same prescription, two
weights, and no way to know which is right. The audit only catches it when the
second instance happens to enter a slot that changed hands, which is why it
reads as a rotation problem — the two known failures are the visible corner of
it, not the whole shape.

**This is the exact bug that was already fixed for REPS and never for weight.**
`exercise-plan.ts:5472` says so in its own words:

> *"A lift can hold two slots in a week, and the streak is keyed by name, so
> without this the second slot incremented the streak a second time and came
> out one rep above the first — the same exercise, the same weight, '4-6' on
> Monday and '5-7' on Thursday."*

That was solved with `frozenBumpDecidedThisWeek`, a per-week memo. There is a
second one, `carryStepDecidedThisWeek`, for carry distance. The weight has
none, so the second slot re-derives independently and lands one increment out.

## The change

Add a third per-week memo beside the existing two in `src/lib/exercise-plan.ts`
(declared at the same scope as `frozenBumpDecidedThisWeek`, ~:5478):

- **Key on the prescription, not just the name** — `name | sets | reps |
  intensity`. Two slots of the same lift at *different* set/rep/RPE targets
  legitimately warrant different weights (heavier for lower reps); only
  identical work must agree. Both observed failures are identical work.
- **The lower weight wins.** Never prescribe more than the lift has earned
  elsewhere that week. This matches the file's existing one-way conventions —
  `Math.min(name-keyed, SLOT-keyed)` for the unverified previous week, and
  "promotion is a FLOOR, never a ceiling" from the main-lift round.
- **Re-prescribe rather than patch the number.** `load.display` and
  `load.per_set` derive from the weight; overwriting `starting_weight_kg`
  alone would leave the printed text disagreeing with the figure. Use the
  existing `forceStartingWeightKg` option, as the frozen-lift path at ~:5983
  already does.

Applied after `load` is finally settled (past both `prescribeLoad` sites and
the frozen-lift/rep-bump block) and before the exercise object is built at
~:6098.

## Verification

- `npm run test:audit` — **expect 0 / 13,967**, down from 2. Both
  `rotation_relative_load` failures are instances of this bug.
- A new check in `scripts/test-main-lift-rest.ts`-style form, or a new gate:
  sweep the mesocycle grid and assert **no lift appears twice in one week at
  the same sets/reps/intensity with different `suggested_load_kg`**. This is
  the invariant; the audit rule only sees the subset that coincides with a
  slot change. Must be seeded (`seededRngFromKey`) — the audit seeds per combo
  label and an unseeded sweep would be a coin flip.
- `npm run test:quality` and the load-adjacent gates (`test:load-suggestions`,
  `test:added-load`, `test:block-consistency`) to prove nothing else moved.
- Report the count of affected lift-weeks before and after, not just the audit
  delta — the two audit failures are a lower bound on the real number.

## Flagged, not fixed here

**The audit mislabels its own failing combination.** It reports
`home_gym / none / 45-60 / hybrid`, but `baseMesocycleProfile` sets
`session_duration_preference: '60-90'` — the `'45-60'` in the label is a
hardcoded string at the point the case is recorded. Two reproduction attempts
were spent on the wrong configuration because of it. Worth correcting so the
label names the profile actually used.
