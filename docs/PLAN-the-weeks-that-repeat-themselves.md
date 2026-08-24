# The weeks that repeat themselves

**Status: NOT BUILT. Diagnosed, measured, and reverted after five failed
attempts.** The measurement script shipped; no engine change did. Read this
before trying again — most of the work is already done, and the traps are
named.

## What Ashley asked for

Some weeks hand the trainee the identical prescription as the week before —
same weight, same reps, only the effort wording changes. Her ruling on what
should happen: **when the weight can't move, ask for an extra rep instead**
(6-8 becomes 7-9).

She chose that over forcing the weight to the next plate (rejected: ~5% jumps
on a main lift where the design wants 3.5%, compounding over sixteen weeks, in
the direction that costs an injury rather than a boring set) and over leaving
the numbers and explaining the week (rejected: still looks like a copy).

That ruling stands. It is not what failed.

## The scale, measured

`npm run report:frozen-weeks` — shipped, and the honest number.

The quality report's `progression/frozen_week` fires on **84.1%** of
combinations, which is not the useful figure: it counts "at least one instance
anywhere in a sixteen-week plan". The real rate, over 5,728 week-to-week
transitions:

- **9.0% of transitions are frozen** — load *and* reps identical.
- `tier_2_secondary` 14.3%, `tier_1_primary` 5.7%, `tier_3_isolation` 3.5%.

| share | cause | what it wants |
|---|---|---|
| **73%** (380) | loaded, non-carry | Ashley's ruling — an extra rep |
| 19% (100) | carries | nothing yet: `shiftReps` passes `'40m'` through untouched, so their lever is distance, and whether distance should progress is a product decision nobody has made |
| 7% (38) | bodyweight | `rampReps` is already true here, so a freeze means something downstream flattens it — uninvestigated |

## The mechanism, traced

Not rounding. `UNVERIFIED_RAMP_STEP_KG` is 5kg for a barbell, comfortably
larger than the 2.5kg plate step. The cause is `load-prescription.ts:1264`:

```ts
estimate = Math.min(options.unverifiedPreviousLoadingWeekKg + unverifiedRampStepKg(entry), estimate)
```

For a lift with no verified working weight, each loading week steps up from the
last but is **capped by that week's fresh standards estimate**. The constant's
own doc comment says this is deliberate — the estimate is "a ceiling to
approach, never a target to close in on" — and it is right: for someone the app
has never seen lift, prescribing past the standards estimate would be inventing
strength data.

Once the ramp converges on that ceiling, `Math.min` pins it there for the rest
of the programme. And these are load-progression lifts, so `rampReps` is false
(`exercise-plan.ts:5059`) — reps are held flat *because load was supposed to be
the lever*. Load stops; reps never start. `Barbell Bench Press 6-8 @ 47.5`,
week after week from block 3 onward.

## Five attempts, and what each one taught

Every attempt reached a measurably better frozen-week number and broke
something else. The numbers below are loaded non-carry freezes, baseline 380.

1. **Lagging counter.** Detect a freeze, spend the rep next week via
   `repShift`. → 248. Correct but weak: the FIRST transition of every frozen
   run still ships identical, because a week can only be known to have frozen
   once its load resolves, and reps must be chosen *before* the load (they feed
   `repRangeLabel`). Main lifts barely improved — their freezes come in short
   runs, so the lag ate most of the benefit.

2. **Detect inside the week loop and pin.** → **272, worse than doing nothing
   clever.** `load.starting_weight_kg` there is the PRE-`enforceLoadCoherence`
   figure while the stored history is post-coherence. The mismatched comparison
   pinned loads that coherence would otherwise have moved, manufacturing the
   freeze it was meant to prevent.

3. **Post-coherence detection + spend the rep immediately.** Main lifts went
   44 → 10. But tier-3 isolation went **77 → 191**: the pass walked *slots*,
   and an accessory appearing on two days in a week aged its streak twice, hit
   the +3 cap in half the time, then froze outright.

4. **Same, gathered per lift instead of per slot.** → 214. Did not fix it.
   The per-slot theory was wrong and I never isolated the real cause.

5. **Detection-only, name-keyed pin.** → **359 total (6.2%), 207 loaded
   non-carry** — the best result reached, audit at 0/13,967 after pinning to
   the name-keyed previous load rather than `Math.min(name, slot)` (the slot
   value belongs to whatever variation occupied it last week; pinning to it
   held a rotated-in lift at the outgoing variation's weight and produced 9
   `rotation_relative_load` failures).

   **This is the one that broke a safety invariant.** `test:assumed-body`
   failed: a STATED profile's Romanian Deadlift collapsed to 6kg — below an
   empty bar — and ended up *lighter* than the same lift for a profile that
   declined its body metrics entirely (16kg). The two personas are nearly the
   same body (55kg/52/female stated, 50kg/60/female assumed), so a 2.7x gap is
   structural, not physiological.

## Why attempt 5 failed, precisely

**The pin makes the freeze self-perpetuating.** Once `frozenRepBump > 0` pins
this week's load to last week's, this week *equals* last week, so the lift is
still "stuck", so it pins again next week. The weight can never escape — even
once the underlying estimate has risen enough to afford a real step. Meanwhile
an unpinned equivalent keeps ramping, and the two diverge.

The pin is not optional: reps feed `prescribeLoad` as `repRangeLabel`, so more
reps means a lower estimate, and bumping reps *without* a pin lets the weight
fall. More reps at less weight is a deload wearing progress's clothes — and it
is invisible, because the frozen-week counter falls either way. Both the pinned
and unpinned versions fail `test:assumed-body`, for opposite reasons.

## What a sixth attempt should do

Compute the load FIRST with unbumped reps. Only if it resolves equal to the
previous week's post-coherence load, bump reps and re-derive with the pin. That
costs a second `prescribeLoad` call on the minority of weeks that actually
froze, and it is the only ordering where the pin cannot manufacture a freeze,
because the freeze is observed before the pin exists.

Attempt 2 was this shape and failed only because it compared pre-coherence
against post-coherence. That specific trap is now understood and avoidable.

Non-negotiables for whoever tries:

- `test:assumed-body` must pass. It encodes item 2b: a trainee who declined
  their body metrics must never be prescribed more than one who gave them.
  This is the check that caught attempt 5, and it is a safety property, not a
  quality metric.
- `test:audit` must stay 0/13,967. `rotation_relative_load` is the sensitive
  one — a held weight rotating into a lighter variation reads as
  contamination.
- Pin to the NAME-keyed previous load, never `Math.min(name, slot)`.
- Compare post-`enforceLoadCoherence` on both sides.
- Carries stay excluded until Ashley rules on distance.

## What shipped from this round

- `scripts/report-frozen-weeks.ts` / `npm run report:frozen-weeks` — the
  before-and-after measurement, split by cause so a fix that drives the total
  down while quietly leaving a bucket untouched cannot read as success.
- This document.
- No engine change. `src/lib/exercise-plan.ts` is untouched.
