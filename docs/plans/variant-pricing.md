# Pricing a lighter variant as a fraction of its parent lift

3 Nov 2026. Ashley: "Build the pricing rule for the held-back exercises". Load prescription is safety-adjacent, so
this plan comes first; the numbers are CSCS decisions under her delegation (basis below), not hers.

## The problem

The exercise library's batch 1 held back eight exercises because their category prices them at the PARENT lift's
full weight: `categorize` puts a front squat in `squat` (the back squat standard), an incline or close-grip barbell
bench in `bench`, a dumbbell front squat in `squat` (halved per hand), a suitcase deadlift in `deadlift`.

## The trace (engine-tracer, 3 Nov 2026)

- Every number that comes from a category's standard is made in ONE block of `prescribeLoad`
  (`load-prescription.ts`, the `if (fromKnownWeight) … else …` estimate). Every other path forces a number that is THIS
  exercise's own figure (its log by name or id, or its own printed week): week-to-week carry, frozen pins, one weight
  per lift, swaps and rebuilds from history, calibration re-anchor, the block-start offer, today's card, re-pricing
  (a ratio in which the fraction cancels). None of those may be discounted again.
- So the fraction goes **right after the estimate**, before the calibration discount, the per-side halving, the
  unverified ramp cap, the floors, rounding and both ceilings. It reaches the known-weight branch too, which matters:
  with calibration skipped, a typed back squat prices every `squat` lift.
- `enforceLoadCoherence` is a set of ceilings keyed on tags, not names; a fraction under them leaves them idle (no
  double discount). An incline tagged `diagonal` in `bench_press` stays under the incline-vs-flat 0.9 cap.
- Nothing in the edge functions prices loads.

## Found by the trace, fixed here (same defect, older)

The known-weight branch never applied `DERIVED_COMPOUND_SCALE`. A goblet squat maps to the typed SQUAT, so a person who
typed a 60 kg squat at setup got a 58 kg goblet squat, held at 48 kg only by the implement's safety ceiling (and its
console warning); the estimate path gives 32 kg to the same 85 kg intermediate. Fixed: the known-weight branch applies
the derived scale of the category against its known family (goblet 0.35 of the squat), exactly as the estimate does.

## The rule

`price_fraction` on a catalogue entry, a number strictly between 0 and 1: the share of its category's price this
exercise takes. Read through one function; a value outside (0, 1) is ignored, so it can only ever lower a number. Never
set on an isolation entry (the floor-swap pre-check reads the isolation reference directly and would disagree).

## The entries and their fractions (CSCS; the basis is the usual strength-coaching ratio, taken at its LOW end)

| Entry | Category | Fraction | Basis |
|---|---|---|---|
| Front Squat | squat | 0.80 | front squat runs about 80-85% of the back squat (rack position, upright torso) |
| Incline Barbell Bench Press | bench | 0.80 | a 30-45 degree incline runs about 80-85% of the flat bench |
| Close-Grip Bench Press | bench | 0.85 | about 90-95% of the flat bench; taken lower, the triceps limit it first |
| Dumbbell Squeeze Press | bench | 0.60 | pressing the bells together caps the load at about 60-70% of a dumbbell bench |
| Renegade Row | row | 0.45 | rowing from a push-up plank: the trunk, not the back, limits it, about 40-50% of a supported row |
| Dumbbell Front Squat | squat | 0.40 | the pair held at the shoulders, rack and grip limited, as two-dumbbell leg work (`single_leg_dumbbell` 0.4) |
| Suitcase Deadlift | deadlift | 0.60 | ONE dumbbell; the per-side rule halves it, so the hand holds 0.30 of the deadlift's price, which side-bending strength limits |

Landmine Squat stays out: what its number would mean (plates on the sleeve, or the felt load at the hands) is not
settled anywhere in the app, and a number whose unit is unclear is the "number without its unit" rule.

Each copies its nearest entry's exclusions; Front Squat, Renegade Row and the suitcase deadlift wait for intermediate.

## Gates

`test:variant-pricing`: the fraction lands on the estimate and the known-weight path, never on a forced own figure;
it only lowers; each entry is its fraction of the parent within rounding across several people; no isolation entry
carries one; the goblet squat from a typed squat. `test:exercise-library` gains the seven entries. Mutation round,
the quality grid and a full sweep (a catalogue change).
