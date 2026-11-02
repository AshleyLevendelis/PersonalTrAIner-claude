# A swapped-in lift starts where the plan would have started it

Found by the whole-app test, 1 Nov 2026 (#20). Traced 2 Nov 2026, read only.

## What is wrong

Swapping an exercise to Dumbbell Shrugs prescribed about 26 kg per hand. The same person's plan already held Dumbbell
Shrugs at about 12 kg.

**Cause (traced, `mesocycle-edit.ts`).** Every swap-shaped edit prices the incoming lift through `buildReplacementSlot`
→ `recomputeLoad` → `prescribeLoad`:

- swap, today or block;
- ban;
- the injury and kit adaptations;
- the session rebuild;
- the different-kind session;
- the coach's swap.

With no logged history for the lift, `recomputeLoad` passes `isCalibrationWeek` only when the week being written IS the
calibration week. In any other week the incoming lift is priced at 100% of the standards estimate.

Generation does something different. Every unverified lift starts in the calibration week at the experience factor
(0.45-0.55 of the estimate) and then moves at most one increment per loading week. This is the rule at
`load-prescription.ts:1413-1430`: "an unverified lift can never move by more than one loading-mode increment between
consecutive loading weeks. The standards estimate is consulted only as a ceiling". The swap therefore writes about twice
what the plan around it carries. The 12 against 26 is exactly that factor (0.50 for intermediate). It is not a per-hand
mix-up.

## The change

An unverified incoming lift (no logged history, so no progression recommendation) is priced with the plan's
calibration conservatism **whenever the plan itself had a calibration week**, not only during it.

- A plan that skipped calibration (known working weights) keeps today's behaviour. Its own unverified lifts were never
  discounted either.
- A lift with logged history is unchanged. The recommendation from what she lifted wins, as now.
- The main-lift reset path is unchanged. It already says "find your working weight this session".
- The deload stays 70% of whatever this produces, as now.

**Where.** `recomputeLoad` gains one input: whether the plan calibrates. Each caller passes
`mesocycle.some(w => w.isCalibrationWeek)`, because each already holds the mesocycle. One function decides. The callers
only say what plan they are editing.

## CSCS review (the five)

1. **Training effect.** A new movement with no history starts conservatively and is re-anchored from the first logged
   session. This is standard practice for an unverified load, and it is exactly the rule the plan follows for every
   other unverified lift. The stimulus for the first session is lower than the estimate. Re-anchoring after one logged
   session (the existing progression engine) brings it up.
2. **What it takes away.** The first session of a swapped-in lift is lighter than today, by the experience factor. It
   is never lighter than the calibration week the plan already gave every other lift. Nothing else moves.
3. **Fundamentals.** Pattern coverage and volume are untouched (no set, rep or exercise changes). Progressive overload
   now starts from the same base as the rest of the plan rather than skipping it. Specificity is unchanged.
4. **Does it redefine a floor or ceiling?** No. The ceiling (the standards estimate) and the one-increment rule read the
   same and mean the same. What changes is that a swap now obeys them.
5. **Scope.** Load prescription for healthy training only. No rehab, no diagnosis.

## Checks

- `test:replacement-prescription`. Today it pins the swap at the fresh estimate outside the calibration week (lines
  ~205-220). It is re-anchored to the rule above: an unverified swapped-in lift in a calibrating plan carries the
  calibration price in every loading week, and a non-calibrating plan keeps the estimate. A same-fixture contrast
  stops the check passing vacuously.
- A measurement over a grid: share of swaps whose weight is more than 1.5x the plan's own figure for the same lift,
  before and after.
- `verify:swap-request` and the swap drivers still pass. Their weights move.

## Not in this change

- Carrying the plan's own figure for the same exercise when it already appears elsewhere in the week at the same
  prescription. `settleWeek`'s one-weight rule already does this for an identical key. For a different key, the
  calibration price is the conservative answer.
- The "+ Add exercise" path prices with `recomputeLoad(..., true)` and no calibration flag. It is the same defect one
  door over. It gets the same input in the same change if the call site allows; otherwise it is named.
