# More reps, less weight — the ramp follows the estimate down

**Status: BUILT, 31 Aug 2026.** Ashley chose "the weight never drops". What shipped is narrower than that sentence, for reasons measured below and recorded here rather than quietly.

**Original status: PLAN ONLY.** CLAUDE.md: *"Dietary enforcement, injury
filtering, and load prescription always get a plan before a build, even when
the fix looks obvious."* This is load prescription. It needs Ashley's call.

## What a user sees

A real generated plan, `full_gym / push_pull_legs / novice`, Monday slot 3:

```
wk 9   Lateral Raises   12-17 reps  @ 6kg
wk10   Lateral Raises   13-18 reps  @ 4kg     <- more reps, a third less weight
wk11   Lateral Raises   15-20 reps  @ 4kg
```

Week 10 asks for more reps at two thirds of the weight. To anyone reading their
own plan that is a demotion, in the second week of a block, for no reason they
were given.

`test:frozen-weeks` §1 already forbids this — *"A rep bought must never cost
weight"* — and currently finds **11 cases across the 36 profile combinations**,
against a recorded HEAD baseline of 10. So the gate is holding a known defect
at a number rather than at zero, and we have added one.

## The cause, measured not assumed

`prescribeLoad`'s standards estimate is computed **per week, against that
week's rep target**. Higher reps mean a lower percentage of 1RM, so the
estimate legitimately falls as the block's reps climb. Measured directly for
this exercise and profile at its real intensity label (`RPE 7-8`):

| rep target | fresh estimate |
|---|---|
| 12-17 | 6kg |
| 13-18 | **4kg** |
| 15-20 | 4kg |

The ramp for an unverified lift is `estimate = Math.min(stepped, estimate)`
(`load-prescription.ts:1432`). `stepped` is last week's load plus one
increment; `estimate` is this week's fresh number. The `Math.min` is a
**ceiling only**. It can follow the estimate down without limit, and there is
no floor at what the lift showed last week.

So the weight is not really progressing at all — each week it is re-derived
from scratch and clipped, and the rep climb pulls the clip downward.

**A correction to my own first diagnosis:** I initially probed with `RPE 8`
and got 6kg for BOTH rep ranges, concluded the rep range did not explain it,
and started looking elsewhere. The real week uses `RPE 7-8`. I had guessed an
input instead of reading it off the generated week. Same error shape as the
calorie misdiagnosis: arithmetic on assumed inputs rather than the actual ones.

## Why the existing guards miss it

- The **±25% contamination backstop** (`exercise-plan.ts:~5972`) only runs when
  `forceStartingWeightKg` is set. The unverified ramp sets
  `unverifiedPreviousLoadingWeekKg` instead, on a different branch, and never
  reaches it.
- The **"buy a rep with the week"** rule already states *"Buying a rep must
  never cost weight"* — but it only fires when the weight DIDN'T move
  (`naturalKg === previousNaturalKg`). Here the weight moved, downward, so that
  path is never entered. The principle is already written down; it just isn't
  enforced on this branch.

## The proposed fix

One floor, at the same line as the ceiling: within a block, an unverified
lift's weight may not go DOWN while its reps go UP. When the fresh estimate
falls below last week's resolved load and the rep target has risen, hold last
week's weight — the reps are that week's progression.

Deloads keep dropping the weight (that is their job), and a new block still
re-derives freely. This is a floor inside a block, not a ratchet forever.

**The one thing worth Ashley's eye:** holding the weight while the reps climb
makes that week harder in two dimensions at once. On a 4-6kg lateral raise
that is nothing. On a heavy compound it is not nothing. Options:

1. **Floor it everywhere.** Simplest, one rule, no exercise-class carve-out.
2. **Floor it on isolation lifts only**, and let compounds keep following the
   estimate down. Safer on the heavy end, but leaves the same confusing display
   on the lifts where the numbers are biggest.
3. **Hold the weight AND hold the reps** — if the estimate says the weight
   should drop, neither moves that week. Nothing gets harder; nothing visibly
   goes backwards either. Fewer wins on the page.

Recommendation: **1**, because the rep climb inside a block is small (one to
three reps) and the alternative is the app appearing to demote people. But it
is a load decision and it is hers.

## Verification before it ships

- `test:frozen-weeks` §1 offender count must go **11 → 0**, and the baseline in
  the check's own text updated from 10 to 0 so it can never drift back up.
- Full `test:workout`, `test:audit`, `test:quality` sweeps re-run and the
  numbers recorded — a load floor moves prescriptions across every profile,
  so the plan-quality score must be re-measured, not assumed.
- Mutations that must turn the gate red: remove the floor; apply it on deload
  weeks; apply it across block boundaries.


---

## What actually shipped, and what the measurements changed

Ashley chose option 1, "floor it everywhere". Building it exactly that way
caused a regression, so what shipped is option 1 **narrowed to the defect**:
the weight is held only when the REP TARGET WENT UP. A drop with the reps flat
or falling is left alone. Every case the rule was chosen for is covered; the
cases that broke other things are not.

Four things had to be measured rather than reasoned about, and three of my
assumptions were wrong:

1. **The lift never used the ramp at all.** I put the floor inside
   `Math.min(stepped, estimate)` and the output did not move. Lateral Raises
   are reps-progressed — a 2kg dumbbell notch is 33% of a 6kg lift, so
   `loadStepUnaffordable` makes `rampLoad` false and every week is a fresh
   estimate. The floor had to go on the DISPLAYED number instead.
2. **The baseline was 0, not 54.** I compared the new audit against the
   committed `audit-report.txt` and read "54 failures → 7" as a large
   improvement. That committed report predates other fixes. Re-running the
   audit with the change stashed gave **0 failures**, so my change had
   introduced 7. Prior numbers stop being comparable; this one had already
   stopped.
3. **A leftover from attempt 1 was still live.** The ramp-side floor did
   nothing for isolation lifts but carries DO ramp, so it was silently
   flooring them — 6 `block_transition_jump` failures ("Trap Bar Carry week 9
   load 27.5kg jumps more than one step from week 7's 14kg"). Removing it
   returned every carry load to exactly its baseline value, verified by diff.
4. **The floored number leaked into the ramp anchors.** A held weight rolled
   into the slot history and was handed to whatever variation rotated in next
   — 4 `rotation_relative_load` failures. The anchors now take the PRE-floor
   number; only the display and the next week's floor take the held one.

Final: audit **0 failures / 13,967 combinations**, `test:frozen-weeks` §1
**0 offenders** (was 11, against a baseline that had been parked at 10), and
carry loads bit-identical to baseline.

## Two things this turned up that are NOT fixed

- **A deload can come in heavier than the week before it.** Two cases, found
  by a check added here, present identically with and without this change:
  `Seated Cable Row wk12: 40 -> 45` and `Dumbbell Floor Press wk16: 18 -> 20`.
  Pinned by NAME in the gate, not by a count, so fixing one while breaking
  another still fails.
- **`!isDeload` on the floor's read side was dead code** — the flags it reads
  are only ever set on non-deload weeks. Written, measured (mutating it
  changed nothing at all), removed.
