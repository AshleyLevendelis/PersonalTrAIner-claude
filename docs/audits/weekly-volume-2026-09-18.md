# How much work does a muscle actually get? — 18 Sep 2026

Measured before building anything, on Ashley's instruction, in response to a
relayed proposal to cap working sets per workout at 20-24 with an ask-first
warning.

**Run**: `npm run measure:volume`, 9,216 profiles (the same grid
`test:quality` sweeps, now shared rather than copied), 16 weeks each, 589,824
training days. Script: `scripts/measure-volume.ts`.

## How to read the numbers

Sets are counted with the app's own `weeklySetsByMuscle`, unchanged. It credits
one set to **every** muscle its exercise names as primary — a bench press counts
toward chest, shoulders *and* triceps — and excludes warm-ups. That is the
ordinary generous convention, and reusing it rather than writing a second
counter is deliberate: two counters is how two readings of one question end up
disagreeing about the same plan.

**The price is that these totals are not comparable with a textbook
sets-per-muscle figure.** They run higher. Nothing below is measured against an
outside constant; every threshold is read off this distribution.

The conditioning-free column changes the *input* to that same function (the
week with its finisher rows removed) rather than re-implementing it, so the two
columns can only ever differ by the rows taken out.

## What the proposal asked

**Would a 20-24 working-set-per-session cap ever fire? Yes, often.**

| | working sets in one session |
|---|---|
| median | 15 |
| 90th percentile | 27 |
| 99th percentile | 39 |
| max | 53 |

- over 20 working sets: **139,002 of 589,824 sessions (23.6%)**
- over 24: 83,362 (14.1%)
- over 30: 35,906 (6.1%)

So the guardrail would not be theatre. But firing is not the same as being
*wrong*: the sessions above the line are overwhelmingly long ones. Of the 678
profiles sitting at or above the 99th percentile for any muscle, **552 are 90+
minute sessions** and 367 are self-reported high recovery. A 90-minute advanced
session carrying 27 working sets is a session, not a defect.

Conditioning rounds change almost nothing here — only 41,952 of 589,824 days
carry a finisher row at all, which is why the two columns print identically.
That number is in the report so an identical pair reads as "rare", which is a
fact, rather than as "the column is broken", which it is not.

## Weekly sets per muscle, at each plan's peak week

| muscle | median | p90 | p99 | max |
|---|---|---|---|---|
| chest | 8 | 16 | 28 | 33 |
| back | 14 | 26 | 38 | 49 |
| erectors | 7 | 12 | 21 | 23 |
| shoulders | 17 | 33 | 52 | 73 |
| biceps | 10 | 19 | 29 | 42 |
| triceps | 11 | 19 | 28 | 33 |
| quads | 16 | 28 | 44 | 57 |
| hamstrings | 15 | 31 | 54 | 80 |
| glutes | 23 | 42 | 62 | 72 |
| calves | 4 | 8 | 18 | 26 |
| core | 19 | 43 | 69 | 91 |

A glutes median of 23 is the counting convention showing itself: every squat,
lunge, hinge and step-up credits glutes. **These are not numbers a ceiling can
be set from directly**, and that is the main reason this measurement had to
happen before any building.

## The three findings the measurement actually surfaced

None of them is the ceiling.

### 1. Two main lifts in one session — 2,477 of 9,216 profiles (26.9%)

**49,988 of 589,824 days carry more than one tier-1 compound.** The commonest
shape is the worst one:

```
wk1 Tuesday: Pull-Ups + Chin-Ups    full_gym | 30-45 | bodybuilding | intermediate
```

Pull-ups and chin-ups as two separate main lifts, in the same session, at five
or six sets each. On a bodyweight profile it appears as the same pair three days
a week; on a full-gym functional beginner it appears as **Deadlifts + Barbell
Squats, every week of the block**.

A qualified coach would not sign either. Two near-identical vertical pulls are
one exercise done twice, and a heavy squat and a heavy deadlift in one session
is a session a beginner cannot recover from — the whole point of one flagship
lift per day is that everything after it is accessory work.

**Probable cause, stated here as a lead rather than a fact — AND THE LEAD WAS
WRONG. Corrected in place, same day.** I wrote that the `refill` fallback was
reaching for a second main lift when a day ran short of candidates, reasoning
from the one comment in the file that already mentioned the rule
(`ensurePatternPresent`, which excludes `tier1_compound` outright and says
why). I guarded the fallbacks and the gate's generated-plan section came
straight back holding the same `Pull-Ups + Chin-Ups`.

**What actually produces it**: `fillSlot` claims the track's own tier-1 slot,
and then `pickFromTier('tier1_compound', ...)` claims another — the ordinary
path every single day runs, not a fallback at all. Six paths could add a main
lift and only two of them checked.

Keeping the wrong version above matters more than tidying it away: **a
source-shaped check written from the same reasoning I used would have passed
and shipped the defect.** What caught it was a check that generates real plans
and looks at what is in them.

The shape is still the recorded one — a constraint asserted at some paths and
missed at others — but the paths were not the ones the reasoning picked.

### 2. A deload week that is not lighter — 2,966 of 36,864 blocks (8.0%)

**CORRECTED IN PLACE, 18 Sep 2026: the real figure is 252 (0.68%), and this
section's method was the reason it read twelve times too big.**

What follows was the original finding. It asked ONE question — does the total
set count fall? — of a mechanism with THREE levers. Reproducing its own named
offender showed a perfectly good deload: main lifts 15kg → 10kg, reps 15-17 →
13-15, tonnage 362 → 270. Its sets held because every row was already at the
two-set floor and there was nowhere further down to go. The caveat I wrote at
the time ("whether the deload is meant to cut sets or only load needs settling")
was the right instinct and I should have settled it before publishing a number.

The honest question is whether the deload is lighter in sets, **or** load, **or**
reps, against the last loading week of the same block. Asked that way: **252 of
36,864 blocks were lighter in nothing at all**, clustered almost perfectly on
bodyweight equipment with low recovery — three levers dead at once. Fixed the
same day (reps carry the reduction whenever there is no weight to shed, not only
when the bar is at its floor), gated by `test:deload-lighter`, and re-measured
at **0 of 36,864** with the sets and load columns unmoved.

*Original text, kept because the method is the lesson:* every block carries a
deload week, and in 8% of them the deload holds the same or more total working
sets as that block's own heaviest week (e.g. peak 34 → deload 34). The median
block does drop 17 sets, so the mechanism works; it has a hole.

### 3. Muscles getting nothing at all

Counted in the same run, because a ceiling aims pressure at whatever is left and
measuring only what a change buys is half a measurement.

| muscle | 0 sets in the peak week | under 5 sets |
|---|---|---|
| calves | 1,197 profiles | 4,295 |
| chest | 1,024 | 1,485 |
| triceps | 832 | 838 |
| shoulders | 800 | 81 |
| erectors | 120 | 2,337 |

Calves at zero for 1,197 profiles and under five for 4,295 (47%) is the biggest
single gap. Some of these will be legitimate — an equipment or injury
combination with no available movement — and that has to be separated out the
way pattern coverage already separates it, before any of it is called a defect.

## One correction to my own framing

The script's header originally said "volume ramps inside a block, so a week-1
reading understates every plan". **Measured, and that is wrong for most plans**:
week 1 carries the heaviest total set count for 6,709 of 9,216 profiles (73%).
Reading the peak is still right, but for a different reason — different muscles
peak in different weeks, so a per-muscle high-water mark exceeds any single week
read alone. Corrected in the script rather than quietly, because the claim was
an assertion and the run is what settled it.

## Recommendation

**Do not build the volume ceiling first.** It would fire on a quarter of
sessions, but the sessions it fires on are mostly long sessions doing a normal
amount of work, and the per-muscle numbers it would have to be calibrated
against are inflated by the counting convention. Building it now means picking a
threshold nothing justifies.

The two-main-lifts defect is a real, common, coach-visible fault with a probable
one-line cause. That first.

---

# What the fix changed — measured, 18 Sep 2026

Run as a genuine before/after: the "before" is a separate git worktree at the
pre-fix commit, the "after" is the working tree, same script and same 9,216
combinations. No env switch in shipped code. The before half reproduced this
document's original figures exactly (49,988 two-main days, 2,477 profiles),
which is what makes the pair comparable.

## What it bought

| | before | after |
|---|---|---|
| days carrying two main lifts | 49,988 of 589,824 | **0** |
| profiles affected | 2,477 of 9,216 (26.9%) | **0** |
| dropped side-delt slots (day-coverage grid) | 12 of 540 days | **0** |

## What it cost

**Session length: nothing.** Exercises per session is identical on every
statistic — median 6, p90 10, p99 12, max 15. The freed slot is taken by a
tier-2 or tier-3 movement rather than left empty, which was the open question
and the main risk.

**Movement coverage: nothing.** Push, pull, hinge and squat all sit at 0 weeks
uncovered on both sides, as does the movement-prep slot. This was the bigger
risk — a second main lift can be the only thing covering a pattern — and the
weekly-balance backfill, which already excludes tier-1, absorbs it.

**Working sets: a small, expected fall at the top.** Median, p90, p99 and max
are unchanged; sessions over 20 working sets go 139,002 → 137,980 (23.57% →
23.39%). Removing a five-set duplicate from ~50,000 days and replacing it with a
three-to-four-set accessory is exactly this size.

**Weekly sets per muscle: down where the duplicate was doing the work.** Biceps
p99 29 → 25 and max 42 → 32 (the chin-up duplicate). Core p99 69 → 64, max 91 →
80. Quads max 57 → 56. Shoulders and glutes essentially flat.

**AND ONE REAL COST, named rather than buried.** Profiles whose chest gets under
five sets in their peak week rise **1,485 → 1,653** (+168), and erectors under
five rise 2,337 → 2,390 (+53). The duplicate main lift was contributing those
sets. The count at *zero* chest sets does not move (1,024 either way), so nobody
loses chest work entirely — a thin week gets slightly thinner for about 1.8% of
profiles. That is the correct trade (the second bench-pattern main lift should
not have been there) but it is a cost, and it points at the same gap section 4
already names: nothing in the app notices a muscle running thin. Calves move
the other way, slightly better (0 sets: 1,197 → 1,188).

## Plan quality, scored across the same 9,216 profiles

Two runs: the pre-fix worktree (which carries this morning's carry-placement fix
but not this one) and the post-fix tree. Both against the same scorer.

**Overall 11.60 / 12 either way. 0 plans below the 7.2 floor either way.
Structure 2.00 either way.** The fix is score-neutral at the top line.

Underneath, it moves four rules and the trade is worth stating:

| rule | before | after |
|---|---|---|
| push:pull imbalance | 579 | **431** |
| recovery volume not reduced | 724 | **625** |
| fat-loss structure reduced | 33 | **11** |
| worse implement than available | 1,312 | **1,476** |
| load incoherent | 398 | 425 |
| time fit | 338 | 349 |

Three clear wins and one clear loss. **Worse-implement rises by 164 profiles
(+1.8%)**: with the duplicate main lift gone, the freed slot is sometimes filled
by a movement the app judges a poorer implement choice than something else
available. That is almost certainly the same ~1.8% of profiles whose chest week
thins — a lesser accessory in place of a second barbell press.

It is a real regression in one selection sub-rule, set against three
improvements, an unchanged overall score, and 49,988 days that no longer
prescribe two main lifts. Worth its own look, not worth blocking this.

**And it closes the other debt**: `core_before_main` appears nowhere in either
run's rule table. The carry-placement fix earlier today took it from 148 to 0,
which was measured but never confirmed on a full sweep until now.
