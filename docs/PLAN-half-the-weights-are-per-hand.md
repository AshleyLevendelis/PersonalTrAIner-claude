# Half the weights in a plan are per-hand, and nothing says so

**Status: PLAN ONLY. Nothing built.** Load prescription gets a plan before a
build (CLAUDE.md), and one decision in here is Ashley's.

Found by `npm run verify:screens` — the first walk of the real screens with
effects running.

---

## What a user sees

On the Exercise tab, one list:

```
MAIN LIFT
Barbell Squats                          3×9-11   ·  42.5kg
ACCESSORY
Walking Lunges                          3×11-13  ·   8kg
ACCESSORY
Romanian Deadlifts                      3×11-13  ·  14kg
```

Squats are **42.5kg total**. The lunges are **8kg per hand — 16kg total**. The
RDL is **14kg per hand — 28kg total**. Three numbers, one format, two units,
nothing distinguishing them.

Read straight down, the RDL looks like a third of the squat. It is
two-thirds. Someone checking whether their plan is sensible is being shown
something that isn't.

## How much of a plan this is

Measured across `full_gym / home_gym / minimalist` × `beginner /
intermediate / advanced`:

| | |
|---|---|
| prescriptions rendered as a bare `Nkg` | **2356** |
| of those, the number is **per hand** | **1126 (47.8%)** |

Not an edge case. Roughly half of every weight the app has ever shown.

## Why it happens

`loadingMode()` (`load-prescription.ts:535`) checks `equipment.includes('dumbbells')`
**first**. So anything dumbbell-capable is priced per hand — including
movements whose name reads barbell, because the catalogue tags Romanian
Deadlifts as `['barbell', 'dumbbells']`.

That part is correct and deliberate. The problem is downstream.

## The machinery to fix it already exists, and two of three screens ignore it

```ts
formatLoad(kg, labelMode)   //  '~14kg per hand' | '~14kg (single side)' | '~14kg'
```

`formatLoad` is already called when the plan is built, and its result is
already stored on every exercise as `ex.suggested_load`. There is nothing to
compute.

| surface | renders | correct? |
|---|---|---|
| `LoadChip.tsx` | `ex.suggested_load` | **yes** — says "per hand" |
| `ExerciseLine.tsx:58` | `` `· ${ex.suggested_load_kg}kg` `` | no — bare number |
| `ExerciseRow.tsx:148` | `{ex.suggested_load_kg}` + `kg` | no — bare number |

`isPerSideLoad()` and `loadLabelMode()` exist too, and their **only** consumer
in the whole app is `dev-constraint-audit.ts`. The app knows the distinction
well enough to audit itself against it, and never tells the user.

This is the "feature built in two halves" shape the log keeps recording: the
label was built, and the two screens people actually read were not wired to
it.

## The data question, and why it is smaller than it looks

`exercise_set_logs.weight_kg` carries **no unit flag**. Prescription is per
hand; the logging box's placeholder is the same per-hand number; so the two
agree — by convention, not by construction.

Nothing is corrupt today. The exposure is a user who reads `14kg`, assumes
total, loads two 7kg dumbbells and types `14`, or loads two 14s and types
`28`. Either way the number that drives next week's prescription is wrong by
2×, and nothing anywhere would notice.

Labelling the display closes that without a migration. A stored unit flag
would be the belt-and-braces version and is **not** proposed here — it is a
schema change for a hazard that only exists because the label is missing.

## What fitting it looks like

Measured in the browser at 390px, real font (`400 12px ui-monospace`). The
meta column has **221px**; the longest candidate needs **181px**:

| | width | |
|---|---|---|
| `3×9-11 · 42.5kg` (today) | 108px | fits |
| `3×9-11 · 2×42.5kg` | 123px | fits |
| `3×9-11 · 42.5kg each` | 144px | fits |
| `3×9-11 · 42.5kg/hand` | 144px | fits |
| `3×9-11 · 42.5kg per hand` | 173px | fits |
| `3×9-11 · ~42.5kg per hand` | 181px | fits |

All of them fit. Exercise names longer than ~113px already push the meta onto
its own line (Banded Terminal Knee Extension does today), so the long forms
degrade the same way the current one does.

**This is the decision that is Ashley's**, and it is a wording question, not a
technical one — every option above is equally cheap.

## Proposed build, once the wording is chosen

1. `ExerciseLine.tsx` and `ExerciseRow.tsx` render `ex.suggested_load`
   (already correct) instead of re-formatting `ex.suggested_load_kg`. Where
   the raw number is still needed for layout, take the label from
   `loadLabelMode(...)` rather than re-deriving it — re-deriving is what
   produced the original single-implement-unilateral bug (`exercise-plan.ts`
   comment at `rebuildLoadForExercise`).
2. The logging box's placeholder and its column header say the same thing, so
   the number someone types means the same as the number they were shown.
3. A gate that fails when any surface renders a load without going through
   the shared formatter — this is a two-halves defect, so the check has to be
   "nobody hand-rolls a kg string", not "these two files look right today".
4. Re-run `verify:screens` and put the before/after lines in the log.

## What is NOT in scope

- Changing any prescribed number. Nothing here says a weight is wrong; the
  loads are as intended and the audit ceilings are unchanged.
- A `per_side` column on `exercise_set_logs`.
- The chat's spoken loads (`ChatAssistant.tsx:1721` reads
  `suggested_load_kg`). Worth checking after, separately — a coach saying
  "fourteen kilos" out loud has the same ambiguity, but it is a different
  surface with different wording constraints.
