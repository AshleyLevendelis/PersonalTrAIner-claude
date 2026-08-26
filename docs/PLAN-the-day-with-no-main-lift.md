# The day with no main lift

## Context

`npm run render:screens` put a bodyweight day on screen and it had no
**MAIN LIFT** label — primer, then five accessories. Checking whether that
was a labelling bug turned up something larger.

**96 of 256 days (37.5%) contain no tier-1 exercise at all**, and it is not
spread evenly:

| tier | days with no main lift |
|---|---|
| full_gym | 0 of 64 |
| home_gym | 0 of 64 |
| minimalist | **48 of 64** |
| bodyweight | **48 of 64** |

The cause is one number. **Only 8 of 145 catalogue entries are
`tier1_compound`, and 6 of the 8 require a barbell:**

```
hip_hinge        Deadlifts, Trap Bar Deadlift      barbell
horizontal_pull  Barbell Rows                      barbell
horizontal_push  Barbell Bench Press               barbell
knee_dominant    Barbell Squats                    barbell
vertical_push    Overhead Press                    barbell
vertical_pull    Pull-Ups, Chin-Ups                pull-up bar
```

So without a barbell the only reachable tier-1s are the two vertical pulls.
A home trainee's pull day has a main lift; every squat, press, hinge and
full-body day has none.

### Why this is behaviour, not decoration

`MAIN_LIFT_REST_FLOOR_SECONDS` keys on `mechanics_tier === 'tier1_compound'`.
On these days nothing is tier-1, so **nothing gets the 60-second floor**. The
round that shipped that floor was titled "the day's hardest lift keeps its
rest" and Ashley's ruling was *a full minute, every hard lift, bodyweight
included*. It protects a bodyweight trainee's pull-up day and leaves their leg
day alone, where the hardest movement is an Air Squat on accessory rest.

**Ashley's ruling: both, promotion first.** Promote now so the floor covers
every day; add real non-barbell tier-1 movements as a separate content round.

## Measured before designing

Bodyweight + minimalist × 4 goals × 3 durations, 1,536 days:

| | |
|---|---|
| days with no tier-1 | **1,088** |
| ...anchor already rests ≥60s (no change) | 388 |
| ...anchor **would be raised** | **700** |
| ...anchor sits **inside a superset** | **128** |

Added time on an affected day: **mean 62s, median 57s, max 160s.**

That last row is the number that matters most. The tier-1 floor cost about
**two seconds** per session. This costs about **a minute**, thirty times more,
because it applies to a lift getting accessory rest rather than one already
near the floor. Session length has to be re-measured against each trainee's
STATED MAXIMUM, not the midpoint — the midpoint has misled once already.

Most-promoted movements: Box Squat (Bodyweight) 320, Air Squat 240,
Dumbbell Floor Press 154, Goblet Squats 144, Loaded Backpack Walk 112.

## The three judgement calls the measurement forced

### 1. A superset member must never be promoted — 128 days

A promoted anchor gets a 60-second floor. A superset prints
*"alternate — no rest between"* directly underneath it. Doing both would have
the app contradict itself on screen, in the same card.

**Decision: the anchor is chosen from standalone groups only.** A day whose
hardest movement is paired keeps no main lift, exactly as today. This is the
conservative direction: it declines to promote rather than print a
contradiction.

### 2. A carry or an isometric hold can become the "main lift"

Loaded Backpack Walk (112) and Farmer Squat Hold (80) are among the promoted.
On a day whose focus is literally "Squat & Carry" the carry genuinely is the
hardest thing, so this is defensible — but it means the label sometimes sits
on a movement no coach would call a main lift.

**Decision: allow it, and flag it.** The rule is "the day's hardest
movement", and inventing exceptions per prescription type is how a simple
rule becomes an unreviewable one. Recorded for Ashley rather than silently
resolved.

### 3. Promotion must be a FLOOR, never a ceiling

A promoted anchor already resting ≥60s (388 days) must not be pulled DOWN to
60. Same one-way rule as the stated load ceilings: new information may raise
a floor, never lower a prescription.

## The build

### One definition of "the day's anchor"

`dayAnchorName(day)` in `session-derive.ts`, which already owns
`groupExercises` and already imports `exercise-db`. The engine
(`exercise-plan.ts`) imports nothing from it today and session-derive imports
nothing from the engine, so the dependency runs one way and adds no cycle.

Rule: highest `mechanics_tier` present (tier1 > tier2 > tier3), ties broken by
position in the day; primers, cardio and finishers excluded; superset members
excluded per §1. Returns `undefined` when the day already has a tier-1 — the
existing path handles those and promotion must not touch them.

### Rest floor

`mainLiftRestFloor(entry, policy)` takes one exercise and knows nothing about
its day, which is why promotion cannot simply be added inside it. It gains an
optional `promoted: boolean` and each call site that HAS day context passes
whether this exercise is the anchor.

The five sites were enumerated in the previous round and the lesson there was
"a constraint asserted at three paths and missed at the fourth". The same
applies: every path that LOWERS rest must re-assert the promoted floor, or the
squeeze puts it back under a minute.

### Label

`sectionLabelFor` already takes `isFirstMainLift`; the callers compute
`firstMainLiftGroupIndex` themselves — **duplicated in TodayPanel and
PeekPanel**, which is the exact shape that let the superset chrome drift.
Replaced by one shared helper both call.

## Verified

| check | result |
|---|---|
| `test:audit` | **0 / 13,967** |
| sessions past their STATED MAXIMUM | **0 / 0 / 0**, unchanged |
| sessions under the minimum | 5 / 18 / 6, **improved** from 6 / 21 / 7 |
| days with no tier-1 | 1,088 of 3,072 |
| ...that got a promoted anchor | **1,088 — all of them** |
| ...still resting under 60s | **0** |
| ...promoted inside a superset | **0** |
| anchors already above 60s, left alone | 49 (vs 31 landing exactly on 60) |

Session length is reported against the stated maximum, not the midpoint,
because the midpoint has misled once already. Under-minimum improving is the
expected direction: added rest lengthens the short sessions.

`test:main-lift-rest` gains sections 5 and 6 covering all four invariants.
`npm run render:screens` shows MAIN LIFT on a bodyweight leg day, on
Step-Down (Eccentric) — the Farmer Squat Hold above it is in the superset and
correctly passed over.

### THE FIFTH PATH, and the lesson repeating one round later

Wiring the four call sites was not the job. Measuring the OUTCOME found
**227 promoted anchors still under 60s**: `trimWeekRestForBudget` trims last
and floors anything not `isMain` at 30, so anchors were floored upstream and
walked straight back down.

The previous round's own note reads *"a constraint asserted at three paths,
missed at the fourth"*. Same constraint, one round later, fifth path. The
only reason it was caught is that the verification asked what the plans
actually contained rather than whether the edits compiled.

### A regression I claimed and had to retract

I reported that this change broke `test:injury-rebuild`'s "the two modes
genuinely differ" check. It did not.

**That gate does not seed its RNG.** Three runs of identical code gave 452,
452 and 436 rebuilt slots against a fixed 448 — passing twice, failing once,
with nothing changed. I compared one run against one run and concluded a
regression. Seeded (`injury-rebuild:fixed`), the answer is **436 / 448 both
with and without this change** — no effect, and the failure is genuinely
pre-existing, as previously flagged. The profile is `full_gym`, where every
day already has a tier-1, so promotion cannot fire there at all.

Seeding is included in this round because a coin-flip gate is worse than a
red one: it makes unrelated work look guilty. What it ASSERTS is untouched —
whether rebuild should out-slot substitute is still the open question.

## Not in this round

- **The catalogue round.** Adding real non-barbell tier-1 movements (pistol
  and shrimp squats, Nordic curls, single-leg hinges, dips, harder push
  progressions) is Ashley's "both" second half, and it changes what everyone
  is prescribed — it needs its own measurement pass.
- **Whether tier-2 and tier-3 should read differently.** Both render
  "Accessory" today; the engine distinguishes them and the screen does not.
  Noticed during this work, unrelated to it.
