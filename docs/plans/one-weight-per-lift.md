# Three views of one weight, and a rule the code only half-kept

**Status:** built and measured. **Deviation flagged:** CLAUDE.md says
*"Dietary enforcement, injury filtering, and load prescription always get a
plan before a build, even when the fix looks obvious."* Both changes below
touch load prescription and were **built before this document existed** —
diagnosis, fix and measurement in one pass, this written afterwards. Recorded
here rather than quietly skipped. Neither change is on `main`; merging stays
Ashley's call, so nothing has reached a user yet.

Both are mechanical: each enforces a rule the code already states in its own
comments and fails to keep. Neither invents a behaviour, and neither can make
a prescription heavier.

---

## 1. The plan said 8kg; the screen and the coach said 7.5kg

### What was wrong

A prescribed weight is **three fields**, and different screens read different
ones:

| field | who reads it |
|---|---|
| `suggested_load_kg` | the audit, the load ceilings, the coach's numeric checks |
| `suggested_load` (`"~7.5kg per hand"`) | the Exercise tab, the program browse, the coach's prompt |
| `per_set_load` | the set grid you tick off during a session |

The rep-target load floor — *"a rep bought with a lighter weight reads as a
demotion"*, added earlier the same day — assigned `suggested_load_kg` **by
hand** and left the other two on the old figure.

So the plan held 8kg for a Backpack Curl while the tab and the coach both
said `~7.5kg`. Not a rounding difference: two different answers to *"what am I
lifting today?"*, on the same screen.

**Measured**, over the coach gate's 19,724-exercise sweep:

| | before | after |
|---|---|---|
| loaded exercises whose label disagrees with their number | 61 | 0 |
| ...and whose set breakdown disagrees | 61 | 0 |

42 floor applications produced those 61: the weekly rebuild's carry-forward
fallback (`load ? load.display : ex.suggested_load`) propagates a stale label
into later weeks.

### The fix

`rebuildLoadForExercise` already exists and already writes all three together
— it is what the coherence clamp uses. The floor now goes through it instead
of assigning the number.

**Options considered.** (a) Set all three by hand at the floor — rejected, a
fourth hand-rolled load update is exactly how this happened. (b) Shift a
per-set ramp up rather than flattening it — rejected: zero occurrences in the
sweep, so it would be an invented rule with nothing to validate it against.
(c) Skip the floor where the load is ramped — rejected as an un-exercised
guard, the shape this repo deletes. **Chosen: (the helper)**, with its doc
comment corrected — it claimed to *"pull an outlier DOWN … never to invent a
heavier number"*, which stopped being true the moment the floor called it.

---

## 2. The same lift, the same week, two different weights

### What was wrong

`weightDecidedThisWeek` states the rule in its own comment:

> ONE LIFT, ONE WEIGHT, IN A GIVEN WEEK … the LOWER one wins: never tell
> someone to lift more than the lift has earned elsewhere in the same week.

It is consulted **while each slot is being built**, so it can pull a later day
DOWN to an earlier one and has nothing to pull an earlier day down *with* —
that day's object is already finished. **When the heavier weight is prescribed
first, the rule silently does not apply.**

**Measured**, on the audit's own grid (1,536 lift-weeks):

```
Shoulder Press Machine, week 3, intermediate / 100kg / full_gym
  Monday    exIdx 2   3×11-13 @ RPE 6-7   45kg
  Wednesday exIdx 4   3×11-13 @ RPE 6-7   32.5kg
```

Five such cases, every one the same shape: heavier day first.
`test:week-load-consistency` §2 had been red on them.

### The fix

`enforceOneWeightPerPrescription(days)` runs over the **finished** week, so
day order stops mattering. It groups by the same key the memo uses
(`name|sets|reps|intensity`), takes the **minimum**, and rebuilds anything
above it through `rebuildLoadForExercise`. It runs **before**
`enforceLoadCoherence`, so the per-day safety ceilings still get the last word.

**Direction is the whole point.** Equalising upward would tell someone to lift
more than the lift earned on the other day. Every weight this pass moves,
moves down.

### What it changed

| | before | after |
|---|---|---|
| same lift, same sets/reps/RPE, two weights (per 1,536 lift-weeks) | 92 | 0 |
| ...of those, "explained by a per-day ceiling" | 87 | 0 |
| `test:audit` combinations / failures | 17,423 / 0 | 17,423 / 0 |
| deload weeks coming in heavier than the week before | 1 | 0 |

**The 87 need saying out loud.** `test:week-load-consistency` §3 ratcheted
that population at 96 and §2 exempted them as legitimate per-day safety
ceilings. They were not: equalising *before* the ceilings run removed all 87,
which means the ceiling never fired on them — the exemption was reading the
right shape for the wrong reason. **Prior numbers from that gate (202 → 96)
are not comparable to the new one.** §3's ratchet is now 0.

The deload row is a genuine fix, not a displacement: the pinned offender
`minimalist/full_body/intermediate Dumbbell Floor Press wk16: 18 → 20` stopped
reproducing because the lift held two weights in week 15 and the check
compared against one of them.

---

## 3. Mutations — each must turn a gate red

| mutation | result |
|---|---|
| floor assigns `suggested_load_kg` alone again | §4 red (123 disagreements) **and** `test:coach-plan-context` red |
| drop the `enforceOneWeightPerPrescription` call | §2 red, the five named cases return |
| `Math.min` → `Math.max` in the new pass | **survived every gate in the repo**, `test:audit`'s 17,423 combos included |

That third one is the finding worth keeping. §2 proves the two days *agree*;
it cannot see *which* of them moved, and the wrong answer there is the one
that asks for more weight than the lift earned. The function is now exported
so §5 can call it directly and pin the direction — that is the only reason it
is exported.

---

## 4. A third thing, found by the sweep

`ProgramBrowse.tsx` (the browse redesign, shipped in #12) rendered its
main-lift line as ``~${ex.suggested_load_kg}kg`` — a hand-rolled unit.
`loadingMode` prices anything dumbbell-capable **per hand**, measured at 47.8%
of prescriptions, so `~14kg` sat one tap above `~14kg per hand` and read as a
third of a lift that is two-thirds of it. This is the exact defect
`test:load-display` was written for; the gate was red on `main` and named the
file. Now uses the plan's own string.

---

## 5. Deploy

Client-side only. **No edge function, no migration.** Push to
`claude/coach-empty-text-fix-2c4bzv`; merging to `main` is Ashley's call.
