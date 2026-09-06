# The 48kg single-leg calf raise

**Status: BUILT, 6 Sep 2026 — option A, on Ashley's ruling.** The
investigation below is kept as written; the ruling and what was built follow
it at the end of this document.

## What the app is telling people right now

`Single-Leg Dumbbell Calf Raise` — "stand on one foot at the edge of a step,
dumbbell in the same-side hand". Measured across experience × body weight, at
RPE 7-8, 12-15 reps:

| | 60kg woman | 80kg man | 100kg man |
|---|---|---|---|
| beginner | 8kg | 18kg | 22kg |
| novice | 14kg | 30kg | 38kg |
| intermediate | 18kg | **36kg** | **44kg** |
| advanced | 26kg | **48kg** (clamped from 60) | **48kg** (clamped from 60) |

An intermediate 80kg man is being asked to balance on one foot at the edge of
a step holding **a 36kg dumbbell in one hand**. An advanced one is asked for
48kg — the heaviest dumbbell most gyms own — and the formula actually wanted
60kg. Grip and balance give out long before the calf does. This is not a
prescription anyone would follow; it is a number.

## Why it happens

`isolation_calf` is anchored at **0.65 × squat 1RM**, and that fraction is
calibrated for a *machine* calf raise, where the machine supplies all the
load. Applied to the single-leg version it **double-counts the trainee**: on
one foot, that leg is already carrying full bodyweight before the dumbbell
exists. For an 80kg man the leg is under ~80kg and the app then adds 36kg more
as if the first 80 weren't there.

The category is right about calves being strong; it is wrong about where the
load comes from on this one exercise.

## This is NOT the "one shared root" the backlog guessed

The backlog entry on the 7,340 clamp warnings said the calf raise was "likely
one shared root" with the others. **Measured, it isn't.** Every exercise that
reaches its implement ceiling anywhere in a 240-cell grid (4 experience × 5
bodies × 4 rep ranges × 3 RPEs):

| exercise | cells at ceiling | ceiling |
|---|---|---|
| **Single-Leg Dumbbell Calf Raise** | **56 / 240** | 48kg |
| Shrugs / Dumbbell Shrugs / Machine Shrug / Cable Shrug | 23 / 240 each | 50 / 100kg |
| Goblet Squats | 22 / 240 | 48kg |
| the four dumbbell/machine bench variants | 20 / 240 each | 50 / 100kg |
| Romanian Deadlifts | 20 / 240 | 50kg |
| Overhead Tricep Extension | 17 / 240 | 48kg |
| …23 more, all ≤ 12 / 240 | | |

Every one of the others clamps **only in the top corner** — a 120kg advanced
male — which is the honest "this lifter has run out of dumbbell" case the
ceiling was written for, and exactly what `CALF_MACHINE_CEILING_KG`'s own
comment says the 48kg clamp is *supposed* to mean. The calf raise clamps at
**more than twice the rate of anything else**, and reaches the cap for an
ordinary 80kg intermediate. It is one mis-modelled exercise, not a systemic
fault, and the rest of that 7,340 is the safety net doing its job.

## The three options

**A — anchor the added dumbbell to BODYWEIGHT, scaled by experience.**
*(recommended)* A lift whose load IS the trainee should be sized against the
trainee, not against a barbell squat. It is the same reasoning
`prescribeAddedLoad` already uses for weighted pull-ups and dips. One new
category, no change to the machine calf raise, no change to any other
exercise. Candidate numbers, at 6 / 10 / 16 / 22% of bodyweight rounded to a
2kg dumbbell notch:

| | 60kg woman | 70kg woman | 80kg man | 100kg man | 120kg man |
|---|---|---|---|---|---|
| beginner | 4kg | 4kg | 4kg | 6kg | 8kg |
| novice | 6kg | 8kg | 8kg | 10kg | 12kg |
| intermediate | 10kg | 12kg | 12kg | 16kg | 20kg |
| advanced | 14kg | 16kg | 18kg | 22kg | 26kg |

Nobody hits the 48kg implement ceiling any more, and every cell is a weight a
person can actually hold on one foot.

**B — halve the current number for the single-leg case.** Intermediate 80kg
man goes 36kg → 18kg, advanced 48kg → 24kg. Smaller change, lands close to A
at the middle of the table — but for a coincidental reason rather than a
stated one, and it still anchors a bodyweight lift to a barbell squat. The
120kg advanced case would still crowd the ceiling.

**C — make it a bodyweight movement that accepts added load.** The most
architecturally honest reading: it *is* a bodyweight exercise with a dumbbell
on top. But it changes the exercise's whole shape — no `suggested_load_kg`,
different rendering, different behaviour in swaps and coherence — for one
entry, and the added-load path is only wired for four exercises today.

**Recommendation: A**, and the question for Ashley is the table, not the
multiplier: *does 12kg for an ordinary intermediate and 18kg for an advanced
80kg lifter read right for one-legged calf raises off a step?* Same way the
kettlebell swing scale was settled.

## What A would need

- A `single_leg_bodyweight_calf` category in `categorize()`, matched on the
  entry being `isolation_calf` **and** `unilateral` — a property, not a name,
  so a future single-leg calf variant is covered by construction.
- Reference resolved from bodyweight × an experience fraction, not from a
  parent lift.
- `test:load-ceilings` / `test:ceiling-units`: the calf raise's clamp rate
  must go to **0 / 240**, and the machine calf raise must be **bit-identical**
  — proven by diff, not by "the gate is still green".
- `test:audit` re-run: expect 17,423 / 0 unchanged.
- Mutations: revert the category; anchor to squat again; drop the `unilateral`
  half of the match (which would drag the machine version down with it).

## Confirmed again on a second, larger corpus

Re-measured on the plan-quality sweep (9,216 profiles × 16 weeks, a different
grid from both the audit and the table above): **88,046 clamp warnings, and
100% of them are this one exercise.** No other entry in the catalogue reaches
its implement ceiling anywhere in that corpus.

That is a stronger result than the 240-cell table, and stronger than the
audit's own figure (7,340 warnings across 24 exercises), because the quality
grid's body weights sit in the ordinary range rather than reaching 120kg —
so the honest top-corner clamps never fire, and only the structural one
remains. Three corpora, three denominators, same conclusion, and the
conclusion gets cleaner as the sample gets more ordinary.

The gate itself passes throughout: **11.45 / 12 overall, 0 plans below the 7.2
floor.** A prescription nobody can perform is not something a quality score
measures — it scores structure, progression, time fit and selection, not
whether 48kg in one hand on a step is a real instruction. Worth saying,
because "the quality gate is green" is exactly the reassurance that would
bury this.

## Scale note

The backlog's "7,340 clamp warnings" is a count of *warnings logged during one
audit run*, which counts the same prescription once per week per profile. The
table above counts *distinct grid cells*, which is a different denominator.
The two numbers are not comparable, and the ranking is the part that matters.

## Ashley's ruling, 6 Sep 2026: **A**

Asked in the conversation, one question, four options, with the weights the
app would actually show rather than the multiplier. The single-leg dumbbell
calf raise is now priced off the person's own bodyweight; the number is what
goes in one hand while standing on one foot. She chose the recommendation:

| | 60kg woman | 70kg woman | 80kg man | 100kg man | 120kg man |
|---|---|---|---|---|---|
| beginner | 4kg | 4kg | 4kg | 6kg | 6kg |
| novice | 6kg | 6kg | 8kg | 10kg | 10kg |
| intermediate | 8kg | 10kg | 12kg | 14kg | 18kg |
| advanced | 12kg | 14kg | 16kg | 20kg | 24kg |

(12-15 reps at RPE 7-8, the ordinary calf prescription. These differ from the
candidate table above by a step here and there because the reference is a
10-rep RPE-8 working weight scaled to the week's reps, like every other
isolation anchor, and rounded to a 2kg dumbbell.) The alternatives offered:
B lighter (8 / 12 for the 80kg man), C heavier (14 / 20), D halve today's
numbers and keep the squat anchor. Not chosen.

## BUILT

- **`single_leg_calf`**, a new standards category in `categorize()`
  (`src/lib/load-prescription.ts`), matched on PROPERTIES: `isolation_calf`
  AND `unilateral` AND a hand-held implement (one dumbbell/kettlebell, or a
  pair). A unilateral calf raise on a stack stays `isolation_calf` — the
  machine supplies the load. A future single-leg kettlebell calf raise is
  covered by construction; no name is matched.
- **`ISOLATION_FRACTION_OF_BODYWEIGHT`** — 6 / 10 / 16 / 22% of bodyweight
  by experience as the reference working weight, resolved through the same
  `resolveBodyBasis` and age taper the parent-lift path uses, so an assumed
  body and a 55-year-old behave exactly as they do everywhere else.
- **Not halved twice.** The reference is already the number in the hand, so
  `prescribeLoad`'s per-side halving skips categories declared in
  `BODYWEIGHT_ANCHORED_PER_SIDE` (derived from the table's keys, so the two
  cannot drift apart). The label still reads "(single side)", which is true.
- **The two anchors are never compared.** `enforceLoadCoherence`'s
  same-muscle pass caps every member of a group at twice its lightest; with a
  12kg dumbbell and a 70kg machine in one `calf_isolation` bucket it would
  have pulled the MACHINE down to 24kg. Both the generator's `coherenceGroup`
  and the scorer's `coherenceGroupOf` now put the bodyweight-anchored lift in
  its own `calf_single_leg` bucket — the same split shrugs got from lateral
  raises, for the same reason. **This was already happening the other way:**
  the old 36kg single-leg number was the group's minimum in plans that held
  both, and the machine calf raise was being capped at twice it. Freed, those
  machine numbers rose to their own standards value (554 exercise-weeks on a
  stride-5 grid; e.g. Seated Calf Raises 37.5kg → 55kg for an intermediate
  80kg man at 12-17 reps). Decided unprompted: it restores the intended
  number rather than setting a new one.
- **Rotation.** `rotateVariation`'s relative-load guard (±40% of effective
  total load) now declines to rotate a machine user onto the dumbbell version
  for most bodies, because 2 × 12kg against a 70kg stack reads as a
  regression to that yardstick. Left as is: the guard is doing its stated job
  on an honest number, and the exercise's reason to exist — a manual swap for
  a busy calf machine — does not use that guard and still offers it (pinned
  in the gate). Net effect on a stride-5 grid: 1,655 plan-days changed which
  calf variant a block rotated to, all of them machine ↔ machine.
- **Audit ceiling** `SAFETY_CEILING_KG_TOTAL.single_leg_calf = 75` (per-side
  ×2 basis; the formula's real top is 30kg in one hand for a 120kg advanced
  man at 3-5 reps, so 60 total with the usual ~25% headroom).
- **`CALF_MACHINE_CEILING_KG`'s mode gate stays** and its comment now says
  why: a named ceiling exception may only ever apply to a stack.
- **One-notch slack on the two rotation checks** (`rotation_relative_load` in
  `dev-constraint-audit.ts` and `test:per-side-load` §6). Both compared a
  rotated-in load against a fresh estimate with a bare 125% band; on a 6kg
  dumbbell one 2kg notch is 133%, and the identical mechanism on the same
  lift at its old 18kg was 111% and never fired. The flagged case was the
  lift matched to ITS OWN held weight on another day (one weight per lift per
  week) against a fresh estimate at that day's bumped reps — nothing
  inherited from a stranger. An offence now needs the ratio AND more than one
  implement notch of absolute gap; removing the slack re-fails on exactly that
  case and nothing else, and the audit had zero such offences before, so
  nothing is hidden.

## Gate: `npm run test:single-leg-calf` (new)

Seven sections: the category is a property (real entry, three fabricated
variants, both machines); the ruled table pinned as the spec; anchored to the
person (sex-blind at the same body across 300 cells, a reported 200kg squat
changes nothing, twice the body is twice the dumbbell — with the machine
calf raise as the control that still reads the squat table); never at the
48kg implement across 600 cells, never more than 30% of bodyweight in one
hand, the clamp never fires; the machine calf raises pinned bit-identical at
three bodies each; the coherence split proven on a real plan AND by running
the pass directly on a two-exercise day (a first version passed under
mutation by one stack rounding step, so the direct test exists); the swap
path still offers the dumbbell version for a busy machine.

**Eight mutations, eight caught** after the direct pass test was added:
category reverted; halved again; anchored to the squat; the unilateral half
of the match dropped; the generator's coherence split reverted; the scorer's
split reverted; a ruled fraction changed; the match widened to stacks.
`test:categorize-precedence`'s snapshot updated for the one deliberate move.

## Verified

- prescribeLoad-level: a 53,400-cell dump (every loaded exercise × 2 sexes ×
  5 bodies × 4 tiers × 5 rep ranges × 3 RPEs) before and after differs on
  **exactly one exercise**, the single-leg dumbbell calf raise. Clamp cells on
  that grid 686 → 602: the 84 it owned are gone, every other clamp identical.
- Plan-level (stride-5 quality grid, 893,096 exercise-weeks): the dumbbell
  calf raise down everywhere it appears; machine calf raises up in 554
  exercise-weeks (the released coherence cap, above); 1,655 plan-days with a
  different machine calf variant in a block (the rotation guard, above); no
  other exercise moved.
- Audit clamp warnings 7,340 → 4,597 (the balance is the honest top-corner
  clamps the ceiling exists for; the calf raise contributed none).
- Gates, audit and quality: recorded in BACKLOG with the numbers.
