# The dumbbell pack

3 Nov 2026. Ashley's "1 then 2 then 3 then 4", item 2: "Fix dumbbell-only plans". Named since 11 Oct as the fix
for the kit list's measured cost (`docs/plans/kit-list.md`, CSCS review question 2) and recommended in the
equipment tracer's report (`docs/test-log-2026-10-09/tracer-reports/A-equipment.md`). Exercise selection is
delegated (CSCS), so nothing here was asked.

## Measured first

The pool after every filter, and the first week's sets by pattern, for a home trainee who has said "dumbbells and a
bench" or "just dumbbells", with no injury and with a shoulder, elbow or knee flag, across three styles and two goals
(`/scratchpad` script, numbers in BACKLOG):

- **Dumbbells only, no bench: no loaded row at all.** Every row in the catalogue that takes a dumbbell needs the
  bench (Dumbbell Rows), so pulling was a Towel Row, a Table Row and Rear Delt Flyes.
- **Dumbbells and a bench with a shoulder flag: no triceps isolation**, 4 pressing sets a week against 12 pulling,
  quality 11.2. The one dumbbell triceps move (Overhead Tricep Extension) is rightly excluded for a shoulder.
- No dumbbell hip thrust and no loaded reverse lunge, the two staples of home lower-body work after the RDL and the
  split squat.

## What is added

Five catalogue entries, each filling one measured gap. Loads come from the categories the app already has:

| Entry | Kit | Pattern / priced as | Excluded for |
|---|---|---|---|
| Bent-Over Dumbbell Row | dumbbells | horizontal pull / `row` | lower back (axial), as the barbell row |
| Dumbbell Tricep Kickback | dumbbells | triceps isolation / `isolation_tricep` | elbow (the band kickback excludes nothing; a dumbbell loads the elbow more, as every loaded extension) |
| Lying Dumbbell Tricep Extension | dumbbells, bench | triceps isolation / `isolation_tricep` | elbow, shoulder, wrist (as skull crushers) |
| Dumbbell Hip Thrust | one dumbbell, bench | hip hinge / `hinge_accessory` (as the barbell hip thrust) | none (as the barbell hip thrust) |
| Dumbbell Reverse Lunge | dumbbells | single leg / `single_leg_dumbbell` | ankle, hip, knee (as walking lunges) |

Not added: a close-grip ("crush") dumbbell press. The shoulder case already has two shoulder-friendly presses
(Floor Press, Neutral-Grip Dumbbell Press), and a crush press would fall to the bench category, which prices it as a
full dumbbell bench press. That is the over-prescription direction, so it waits for a category of its own.

## CSCS review

1. **Training effect.** A home trainee with dumbbells and no bench gets a loaded row that can progress, instead of a
   towel row. Dumbbells and a bench with a shoulder flag get triceps work again, and the week rebalances: pressing
   4 -> 8 sets, pulling 12 -> 10, triceps 0 -> 3, quality 11.2 -> 11.6.
2. **What it takes away.** The pool's existing "worse implement than available" rule now demotes some bodyweight
   single-leg and hinge moves (Step-Ups (Bodyweight), Cossack Squat, Single-Leg RDL (Bodyweight)) where a loaded
   equivalent exists. That rule is the app's, and a loaded move beats its bodyweight twin for someone who owns the
   weights. Some plans re-roll their exercise picks, and a few knee-flag plans now hold a lift at the stated 24 kg
   dumbbell limit (the existing `frozen_week` mechanism, 12 -> 11.6). The full quality grid is the measurement.
3. **Fundamentals.** Push, pull, hinge and squat coverage unchanged or better on every measured case; progression is
   the existing load path.
4. **Floors and ceilings.** None moved. Every entry is priced by an existing category and capped by the stated
   dumbbell limit like every other dumbbell lift.
5. **Scope.** Exercise selection only. Each exclusion copies the closest existing entry's; nothing new about any
   joint is decided here.

## Gates

A catalogue change is a full sweep (CLAUDE.md), `test:quality` included. Plus a new `test:dumbbell-pack`: the
measured gaps, held as properties (a dumbbells-only kit has a loaded row; dumbbells and a bench with a shoulder flag
has triceps isolation and at least as many pressing sets as before), with the exclusions checked against the entries
they copy.
