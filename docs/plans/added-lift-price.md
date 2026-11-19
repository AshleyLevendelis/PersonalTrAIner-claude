# An added lift starts where the plan would have started it

Found by the Exercise walk of 18 Nov 2026 (finding E1). Measured and decided 19 Nov 2026, as a CSCS coach, under the
standing delegation. Load prescription, so this plan was written before the build.

## What is wrong

Adding Barbell Bench Press to a session prescribed about 55 kg for 3 x 10-12, "starting estimate from strength
standards". The same person's plan held bench that week at about 32.5 kg.

**Cause.** Both add routes (the Exercise screen's and the coach's) priced the incoming lift down the "new main lift"
branch of the swap pricing. That branch never looks at what he has logged on the lift, and takes the plan's light
start only when the week being written IS the testing week. In any other week the lift was priced at the whole
estimate. Every untested lift the plan itself prints starts at about half the estimate in the testing week and moves
one small step a loading week, so the added lift sat far above everything around it.

**Measured** (`measure:added-lift-price`, 36 seeded profiles, weeks 2 to 4, every loaded lift the plan already holds
added to another day; 1,218 cases):

| | median, added / plan's own | over 1.25x | over 1.5x | highest |
|---|---|---|---|---|
| before | 1.75x | 1,004 | 827 | 3.6x |
| after | 1.00x | 11 | 2 | 1.8x |

The 11 left are one notch of a small implement (a 10 kg pushdown beside 7.5) and the one-leg press, which the plan
itself holds down against the two-leg press. 14 cases come out one dumbbell notch under (2 kg beside 4 kg).

## The change

An added lift is priced exactly as a swapped-in accessory has been since 2 Nov 2026 (`swap-load-anchor.md`):

1. what he has logged on that lift wins;
2. otherwise, in a plan that has a testing week, the light starting price that plan gave every other untested lift;
3. otherwise (he typed his known lifts and skipped the testing week) the estimate, as before.

One function prices an addition (`priceAddedLift`), called by the screen, the coach's confirm and the check, so the
number on the card and the number written to the plan cannot be worked out two ways.

The card's own sentence changes with it, from "New lift, find your working weight this session" to the plan's own
"Loads start deliberately light, find the weight where the last rep feels like RPE 6, log it, and next week builds
from YOUR numbers", which is the instruction that goes with a light start.

## CSCS review (the five)

1. **Training effect.** An untested lift starts light and is set from the first logged session. That is standard
   practice, and it is the rule this plan already follows for every other untested lift. The first session's stimulus
   is lower than the estimate; the "Too easy" tap and the logged number bring it up from the next session.
2. **What it takes away.** The first session of an added lift is lighter than before, by the experience factor, for
   someone with no log on it. Someone who HAS lifted it now gets his own number, where before his log was ignored.
   Nothing else on the day moves.
3. **Fundamentals.** Coverage and volume are untouched (the sets and reps still come from the day's own peer).
   Progressive overload starts from the same base as the rest of the plan. Specificity unchanged.
4. **Does it redefine a floor or ceiling?** No. The kit ceilings, the per-side rule and the estimate read and mean the
   same; an addition now obeys the light start it used to skip.
5. **Scope.** Load prescription for healthy training only.

## Not done, named

- An addition for the whole block writes ONE price into every remaining week, the recovery week included, and does
  not climb week by week on the printed plan as a whole-block swap does (10 Nov). It was so before this change. With
  the light start the recovery week is no longer the heaviest for that lift, and today's card follows what he logs.
- A plan with no testing week still prices an addition at the whole estimate (as its own untested lifts are).

## Checks

- `test:exercise-add` section 11: over a seeded grid, an added lift the plan already holds is within 1.25x of the
  plan's own number in at least 97% of cases and never over 2x; the pricing function is the one both routes call; a
  plan without a testing week keeps the estimate. Mutation-tested.
- `measure:added-lift-price` prints the table above.
