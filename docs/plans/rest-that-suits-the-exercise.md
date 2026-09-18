# Rest that suits the exercise

## What she reported

Ashley, from the gym floor, 17 Sep 2026: *"The rest breaks between the lat
pulldown seem very short 30s, check that is correct."*

## Measured, 18 Sep 2026 — it is real, and it is not a bug

Generated a full mesocycle for five profiles and read week 2 off the plan the
screen would draw. On the profile closest to hers (hybrid, intermediate,
45-60 minutes):

| tier | n | min | median | max |
|---|---|---|---|---|
| main lift | 4 | 60s | 120s | 120s |
| second-tier compound (the lat pulldown's class) | 6 | **30s** | 45s | 60s |
| isolation | 15 | 0s | 30s | 45s |

18 of that week's 29 exercises rest 30 seconds or less. At 30-45 minutes it is
17 of 23 and the second-tier median is the floor itself. At 60-90 minutes only
8 of 36 are that short. On a fat-loss profile the lat pulldown itself came out
at **41s** and a seated cable row at **30s**.

So the cause is the TIME BUDGET, not a defect: the session does not fit, and
the generator pays for the overrun by taking rest off everything except the
main lift, down to a hardcoded floor of 30 seconds.

**Nothing is wrong with the arithmetic. What is wrong is which way the trade
was made.** The style's own table prescribes 75s for a hybrid second-tier
compound. Thirty seconds is not a short rest for a lat pulldown at 8-12 reps —
it is a different exercise, and the rep target printed beside it stops being
reachable.

### The two places that hold the 30

- `stageTimeCap` Phase 2, at generation time: a blanket `-15s` with
  `Math.max(30, mainLiftRestFloor(...))`.
- `trimWeekRestForBudget`, per block, later: `const floor = isMain ? mainFloor : 30`.

They are independent, so the cuts STACK — 75 → 60 → 45 → 30 across passes.
Two copies of one rule, which this file's own comments have already recorded
going wrong twice ("a constraint asserted at three paths, missed at the
fourth").

## Her ruling, 18 Sep 2026, from four options

**Protect the rest, do less.** Every exercise keeps a rest that suits it, and
the app drops an accessory exercise or a set to make the session fit. She
rejected keeping everything at short rests (today's behaviour), a middle floor
of one minute, and leaving the plan alone while telling her to train longer.

Her words for why, in the option she picked: *30 seconds on a lat pulldown
isn't a short rest, it's a different exercise, and you can't hit the reps it's
asking for.*

## The build

### 1. One floor function, not two constants

```
restFloorFor(tier, prescribedSeconds, mainFloorSeconds)
  main lift   -> mainFloorSeconds          (unchanged; the goal's own floor)
  cardio      -> exempt                    (unchanged; trimming an interval
                                            changes what it is)
  otherwise   -> min(prescribedSeconds, TIER_FLOOR[tier])
```

with `TIER_FLOOR` = second-tier compound **60s**, isolation **45s**, primer
**20s**.

**The `min` is the half that matters.** A floor must never RAISE a rest. Combat
style deliberately prescribes 60s/45s for its second-tier and isolation work,
and bodybuilding prescribes 60s for isolation; taking the floor as an absolute
would quietly re-write those styles' own density. What the floor does is stop
the TRIMMER going below what the style asked for.

Both call sites take it. They speak different tier vocabularies
(`mechanics_tier` vs `ExerciseTier`), so the function takes the normalized one
and the generation-time site maps through the existing `mapTier`.

### 2. Nothing else to build

Phases 3, 4 and 5 of `stageTimeCap` already drop isolation sets, then whole
accessory exercises, then sets across the board with the main lift last, and
`sizeBlockToRestBudget` already re-runs that same order per block. Raising the
floor simply moves the work onto machinery that exists and is already ordered
the way her ruling wants. **This is a change to one rule, not a new pass.**

## What could go wrong, and how each is checked

1. **Sessions run over.** If rest cannot absorb the overrun and the later
   phases hit their own floors (three exercises, two sets), the day is over
   budget. `session-length` and `session-shortfall` hold this, and the
   shortfall is supposed to SAY why — re-read that sentence and make sure it
   names the real reason after this change.
2. **Plan quality drops.** Fewer exercises per session is exactly what she
   asked for, but `quality` holds a 7.2/12 floor over 9,216 profiles, and
   `cardio-share-score` and `audit` all read structure. Full re-measure, and
   the numbers reported before and after on the same sample.
3. **A style's own short rest gets raised.** Guarded by the `min`, and gated
   directly: combat's 45s isolation must come out of generation still 45s.
4. **Only one of the two sites gets the new rule.** The whole reason for one
   function. Gated by calling `restFloorFor` from the test, and by a mutation
   that reverts each site separately.

## Verification

- `test:main-lift-rest`, `test:session-length`, `test:session-shortfall`,
  `test:cardio-share-score`, `test:block-phases`, `test:frozen-weeks`, plus a
  new `test:rest-floors` with its mutations reported.
- `test:audit` (~2 min) and `test:quality` (~22 min) re-measured, with the
  before and after numbers side by side.
- A real phone-sized screen: the lat pulldown's rest read off the card.
- BACKLOG + CLAUDE.md for the ruling; this document for the measurement.
