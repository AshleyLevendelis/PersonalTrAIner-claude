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

**Probable cause, found in the code and stated as a lead rather than a fact**:
the app already forbids this at three places and misses it at a fourth. The
weekly-coverage fills (`exercise-plan.ts:3726`, `:3847`) and the
day-label pattern fill all exclude `tier1_compound` explicitly, the last with a
comment saying exactly why ("Filling with another main lift here silently
doubled a day's main-compound count"). The `refill` fallback (`:2473-2477`)
excludes primers and cardio and nothing else, so it can and does reach for a
second main lift when a day runs short of candidates. Needs confirming by
mutation before anyone acts on it.

This is the same recorded shape as the rest-floor bug: a constraint asserted at
three paths and missed at the fourth.

### 2. A deload week that is not lighter — 2,966 of 36,864 blocks (8.0%)

Every block carries a deload week, and in 8% of them the deload holds **the same
or more total working sets** as that block's own heaviest week (e.g. peak 34 →
deload 34). The median block does drop 17 sets, so the mechanism works; it has a
hole. Whether the deload is meant to cut sets or only load needs settling before
this is called a defect — but "the week labelled deload is not lighter in any
respect the plan shows" is worth an answer either way.

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
