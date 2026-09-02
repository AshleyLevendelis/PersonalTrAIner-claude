# Chest against back

*Plan before build, per CLAUDE.md — this changes set counts, which is volume
prescription. Written 2 Sep 2026, straight after Ashley's answer.*

## Where this came from

Third item taken from "The Coach's Decision Stack" (see `how-did-that-feel.md`
for the first and `two-minutes-on-the-big-lift.md` for the second, and for the
filter: only claims I would bet on independently of the document).

Volume drives hypertrophy — that part is as replicated as anything in the
field. The document's "at least 10 hard sets per muscle per week" is a line
drawn through a scatter rather than a cliff, and I said so when putting it to
Ashley. What made this worth acting on was not the threshold; it was that the
app had **never counted sets per muscle at all**, so nobody knew.

## What the measurement found

`scripts/report-training-dose.ts` over the 9,216-plan grid. Hard sets
(prescribed RPE top ≥ 7) per muscle group per week:

| group | mean | weeks under 10 |
|---|---|---|
| glutes | 17.9 | 17.5% |
| hamstrings | 16.5 | 19.8% |
| shoulders | 15.4 | 25.2% |
| core | 13.4 | 46.1% |
| back | 12.2 | 43.7% |
| quads | 11.8 | 40.1% |
| biceps | 11.1 | 50.9% |
| triceps | 10.6 | 47.0% |
| **chest** | **8.2** | **72.1%** |
| erectors | 6.3 | 82.9% |
| calves | 4.4 | 95.2% |

**Checked against a real week rather than trusted from the aggregate**, which
is what turned it from a suspicious number into a finding: an intermediate
full-gym bodybuilding week ran 14 chest sets against 22 back sets — the same
~2:3 the sweep showed, so the gap is real and not an artefact of the mapping.

**Why it happens.** `enforceWeeklyPatternBalance` balances PATTERNS — push
sets against pull sets — and does that correctly. But a push set splits across
chest, shoulders and triceps while a pull set concentrates on back and biceps,
and back picks up more again from warm-up pulls and lat-listing deadlifts. So
push:pull can sit perfectly inside its band while the muscles underneath are
lopsided.

## The decision

Four options: even out chest against back (recommended); adopt the document's
10-set floor outright; even out chest and raise calves; record it and change
nothing.

**She chose "even out chest against back."** Decision log: asked, answered.

## What was built

A second pass inside `enforceWeeklyPatternBalance`, after the push:pull loop,
aiming at a **1.25** band (tighter than push:pull's 1.5 — that band is
deliberately pull-biased for shoulder health, and there is no equivalent
reason for back to out-set chest; the "2:1 pull:push" version of that idea is
precisely what the document flags as invented).

Three moves, in preference order:
1. **Move a set from shoulders to chest.** Shoulders carry the biggest surplus
   of any group the same sessions train (15.3 against chest's 8.4).
2. Bump a chest accessory.
3. Trim a back accessory.

Same slot rules as the pass above it: accessory and isolation only, role
floors and ceilings respected, never inverting a day's main lift.

`muscleGroupsOf` now lives in `exercise-db.ts` and the report script imports
it, so the generator and the measurement cannot drift. **Erectors are their
own group, not `back`** — folding them in inflated back's count by about a
third.

## Two things the build got wrong, and how they were caught

**1. The "free transfer" was not free.** I assumed moving a set from a
shoulder slot to a chest slot left push:pull untouched. It does not: "trains
the shoulders" is a MUSCLE fact and the push:pull band is a PATTERN fact, and
they do not line up. Barbell Rows and Face Pulls train rear delts on a
`horizontal_pull`; every lateral raise is `isolation_shoulder`, counting
toward neither side. Donating from one of those while adding a chest push
swings the ratio by up to two sets instead of zero.

Measured: the unguarded version took weeks outside the push:pull band from
**42 to 114** — this pass making worse the very thing it sits beside. Every
candidate move is now costed through a `bandPenalty` helper that permits a
nudge only if it leaves push:pull no worse; the cost is back to **42**, i.e.
nothing. The gate is what found this.

**2. I asserted a baseline instead of measuring it.** The first version of
that check was written against a baseline of "79 weeks", a number I had not
run. The real figure is 42. Corrected, and recorded here because it is the
same error the gate exists to prevent — and because a threshold set from a
guessed baseline would have passed a genuine regression.

A third, smaller one: the gate's first `back:chest` thresholds were copied
from the report script (1.54 → 1.29) and failed immediately. The two measure
different statistics — the report takes a mean of per-week values over hard
sets only, the gate pools every set in every loading week. Two right answers
to two different questions; the mistake was assuming one could stand in for
the other. The gate now uses its own measured arms.

## Gate

`npm run test:muscle-balance`, four sections: the mapping itself; the
cooperation property (push:pull left no worse); slot discipline (no main lift
ever nudged); and that the number actually moved.

| mutation | result |
|---|---|
| the whole chest:back pass disabled | red — back:chest 2.00 |
| the push:pull guard removed (the bug above) | red — 318 of 648 weeks out of band |
| erectors folded back into `back` | red on the mapping |
| the pass allowed to nudge main lifts | red — 23 inversions |

The fourth mutation initially read as *survived*; it had not applied. A
mutation that does not apply is not a passing mutation test, and it was redone
by proper replacement rather than a regex.

## Measurement

Same sweep, pass inert vs pass live.

| | before | after |
|---|---|---|
| chest, mean hard sets/week | 7.9 | **8.6** |
| chest, weeks under 10 | 75.1% | **69.2%** |
| chest, median | 7 | **8** |
| back, mean hard sets/week | 12.2 | **11.1** |
| back, median | 11 | **10** |
| back:chest (pooled, gate's grid) | 2.00 | **1.72** |
| weeks worse than 1.5× | 471 | **372** |
| push:pull weeks out of band | 42 | **42** (unchanged) |

**The named residual.** It does not reach the 1.25 it aims at, and that is
recorded rather than hidden. Chest often has only one or two adjustable
accessory slots; once each sits at its role ceiling the only move left is
adding a whole chest EXERCISE, which this late in the pipeline needs the
periodization-aware rebuild the code deliberately does not do after
periodization has run. Closing the rest of that gap is a separate change, not
a budget.

`test:audit` **17,423 / 0**, unchanged.

**`test:quality`: 11.51 / 12, down from 11.54.** 0 of 9,216 plans below the
7.2 floor. The drop is small but it is real and it is not rounded away here:
time fit 1.93 → 1.92 and goal alignment 1.96 → 1.94 are the two dimensions
that moved, and both moved for the obvious reason — bumping a chest accessory
adds a set, a set costs minutes, and minutes are what time fit scores.

That is the price of the ruling, and it is worth Ashley knowing it rather than
discovering it: **evening chest against back costs about 0.03 of the plan
quality score.** Nothing fell below the floor and no gate went red, so it is
within tolerance, but it is a cost rather than a free win. The two earlier
changes today were free; this one is not.
