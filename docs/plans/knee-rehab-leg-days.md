# Knee rehab goes on leg days only

**Ashley's ruling, 2 Nov 2026: "B", leg days only, always.** She chose it from three options:

- A: every day for a lasting injury, leg days only for an ease-off.
- B: leg days only, always.
- C: every day, always (what the app did).

## Why this needed a ruling

Found by the whole-app test, 1 Nov 2026 (#19), and traced. Two of her rulings collided.

- **"Rehab goes in every session"** (`docs/PLAN-actually-prescribe-the-rehab.md`). Generation's guaranteed rehab slot, `pickRehabMovement`, fills every training day for every flagged joint, whatever the day is.
- **Her 20 Oct "work for that day instead"**: no knee-rehab move on a non-leg day. This was built only into the slot-by-slot ease-off.

So a knee on the injuries list put Seated Short-Arc Quad Set on "Upper Pull & Core". So did a rebuild while a knee ease-off was running, because the ease-off weeks are generated with the knee in the profile.

## The change

In `selectExercisesForTrack` (`exercise-plan.ts`), on a day whose own work is not legs, the knee leaves the set of joints the rehab slot is chosen for.

- **Unchanged:**
  - every other joint keeps its rehab on every day. Her ruling names the knee, and a shoulder's band work on leg day is the older rule, untouched;
  - a leg day keeps its knee rehab;
  - a full-body day counts as a leg day, because it squats.
- **One test decides what a leg day is:** the same one the 20 Oct ease-off uses (`isLegTrack` on the day's track).

## CSCS review

1. **Training effect.** Knee rehab now sits beside the knee's loading (leg and full-body days). On a three- or four-day split it drops from every session to about half of them. That is her ruling. Nothing else about the knee changes: contraindicated moves are still filtered on every day.
2. **What it takes away.** The rehab slot on upper days for a knee-only flag. That time goes back to the day. No other joint loses anything.
3. **Fundamentals.** Pattern coverage, volume and progression are untouched. The removed slot was rehab, not training work.
4. **Floors and ceilings.** None move. The "never below three exercises" floor never counted the rehab slot as training work.
5. **Scope.** This decides where an existing drill goes. It does not prescribe new rehab or read a symptom.

## Checks

`test:rehab-prescribed` §1 is re-anchored for the knee:

- every leg or full-body day carries knee rehab;
- no day that is not about legs carries a knee-indicated move;
- every other joint is still on every day.

It is mutation-tested.
