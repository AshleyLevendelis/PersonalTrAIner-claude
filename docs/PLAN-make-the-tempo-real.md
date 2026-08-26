# Make the tempo real

## Context

Shipped earlier today (`074ad9d`): a trainee with no weights is no longer
told to add load. The replacement wording for a strength block says:

> *"Fewer reps, taken harder. With no weight to add, the difficulty comes
> from how you move: about three seconds lowering, a pause at the bottom, no
> bounce."*

**That sentence is currently the only place tempo exists.** There is no
tempo field anywhere in the app — `grep -n "tempo" src/lib/` finds one
string, `rpeNote: 'RPE 6-7 — Focus on form and tempo'`. The session itself
still says `Air Squat 9-12` and nothing more, nothing tracks it, and nothing
progresses it. The app is describing a prescription it does not make.

This is the same shape as `update_workout_schedule` and the Muay Thai swap:
**a promise with no delivery.** It is worth fixing precisely because we just
made the promise.

### Why this and not "move up to a harder exercise"

Ashley's ruling was "fix the words first, then the training". The obvious
training fix — progress the *movement* (Air Squat → something harder) — was
measured and **is not feasible on this catalogue**:

- Inverting `capability_requirement.regression` (each hard exercise names an
  easier fallback, so that fallback's next step up comes free) yields **15
  entries forming 10 links**.
- Only **53 of 731 (7.3%)** of a bodyweight trainee's weightless working
  slots have a harder version they can actually reach. Minimalist: 8.5%.
- The backbone of a no-equipment plan — Air Squat, Box Squat, Plank, Side
  Plank, Low Box Step-Up, Step-Down — has **no rung up at all**.

So that route needs ~15-25 new exercise entries written first. Tempo needs
none, and it is the lever the app already claims to be using.

## The build

### 1. Tempo is the phase's voice for a lift that cannot take weight

For a loaded lift, the phase expresses itself through the weight. For a
weightless lift there is nothing for it to express itself through, which is
the root of the whole problem — the reps fall and nothing else changes.

So tempo becomes that expression, keyed on phase, matching each phase's
existing intent:

| phase | rep_shift | tempo (ecc-pause-con) | why |
|---|---|---|---|
| anatomical_adaptation | +3 | `2-0-1` | high reps, controlled, not grinding |
| hypertrophy | 0 | `3-0-1` | time under tension is the stimulus |
| strength | −3 | `4-1-1` | this is what replaces adding weight |
| power | −4 | none | explosive intent; a slow eccentric fights it |
| metabolic | +4 | none | short rest is the stimulus; tempo fights it |

**One lever at a time**, following `loadStepUnaffordable`'s precedent. Tempo
is set by the BLOCK and constant within it; reps stay the within-block lever
exactly as now. That also makes the falling reps legible: they fall *because*
each rep got slower.

### 2. Scope, deliberately narrow for round one

Applied only to a **rep-based, weightless working lift on a loadless week**
(`isLoadlessWeek`, already shipped today). Excludes primers, time-based holds
(`Plank 30-45s` has no reps to slow), distance, and intervals.

That means it reaches a bodyweight/minimalist trainee and NOT a full-gym
trainee's Pull-Ups — even though the same argument applies to those. The
reason is duration, below. Widening is flagged, measured, and left to Ashley.

### 3. Duration is the real risk, and it is not hypothetical

`SECONDS_PER_REP = 3.5`, and its own comment says it already covers "a
deliberate eccentric/concentric plus the brief pause most working sets have."
So a `4-1-1` set is ~6s/rep against an assumed 3.5 — **+71% working time on
that lift**. `duration` is the audit check that has bitten twice.

`computeSetWorkSeconds` must therefore learn about tempo, which means
threading it through `DurationSlot` and every `estimateSlotsSeconds` caller
(time-cap trimming, duration top-up, `estimateDaySeconds`). A tempo the
duration model cannot see is the *exact* mechanism that let a steady-state
block be estimated at 30s instead of 20min.

Note what partially rescues this: the phases that get the slowest tempo also
carry the biggest NEGATIVE rep shift. A hypertrophy set at 12 reps x 4s = 48s
against a strength set at 9 reps x 6s = 54s. And a bodyweight trainee never
reaches strength or power at all (`BODYWEIGHT_ALLOWED_PHASES`), so within the
shipped scope only `2-0-1` (−14% vs baseline) and `3-0-1` (+14%) apply. Close
to neutral by construction — but measured, not assumed.

### 4. It has to appear on screen

New `tempo?: string` on `Exercise`, rendered next to the reps. A field written
by the engine that no client reads is the `update_workout_schedule` defect
wearing different clothes, and the gate asserts the render, not just the write.

## Verification

- **New gate `npm run test:tempo-prescription`**:
  - a bodyweight trainee's rep-based working lifts carry a tempo, and it
    matches the block's phase;
  - a full-gym trainee's lifts carry NONE (the scope check);
  - holds, carries, intervals and primers never get one (unit mismatch);
  - tempo is constant within a block and changes at block boundaries — one
    lever at a time;
  - the rendered component actually reads the field.
- **`test:audit` must stay 0 / 13,967**, and `test:session-length` clean —
  the two duration checks.
- **Measure the duration delta explicitly** before/after, per equipment tier,
  and report it rather than trusting the gate's pass/fail.
- **Measure what widening to ALL weightless lifts would cost**, and report it
  without shipping it.
- `test:quality` before/after (11.20). `test:mesocycle-roundtrip`,
  `test:frozen-weeks`, `test:loadless-notes`, `test:band-slots`,
  `test:block-consistency`, `test:starting-out`, `tsc -b`, `npm run build`.
- **No deploy** — engine + frontend, ships with the Vercel push.
