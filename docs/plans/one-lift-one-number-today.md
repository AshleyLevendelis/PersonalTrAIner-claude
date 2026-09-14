# Two numbers for one lift — the plan before the fix

**Reported by Ashley, 14 Sep 2026, from a real session:** *"On the T-Bar Rows
detail screen, the main header prominently displays 40kg, but the pre-filled
numbers in the set input rows show 35kg, making it confusing to know which
weight to hit."*

Load prescription is safety-adjacent, so this is a plan before a build
(CLAUDE.md, **Safety-adjacent work**).

## What is actually happening — measured, not inferred

Today's exercise card asks the progression engine, for every loaded lift, what
the trainee should be doing based on their **last logged session**
(`TodayPanel.tsx:502`, `getDoubleProgressionRecommendation`). That answer lands
in `progressedLoads[ex.name]` and in `progressionNotes[ex.name]`.

It is then used for exactly two things:

1. the chip's **label** — `loadSourceFor` returns `'logged'`, which renders as
   *"from your last session"* (`TodayPanel.tsx:1147`, `LoadChip.tsx:67`);
2. the **note** under the row — *"Held at 35kg — didn't hit 11 reps on every
   set last time"* (`progression-engine.ts:157`).

**It is never used for the number.** `ExerciseRow.tsx:203` renders
`ex.suggested_load_kg` — the figure generation printed weeks ago — and
`LoadChip.tsx:163` renders `ex.per_set_load`, the same figure's per-set ramp.
So the card shows the plan's 40kg, labels it as coming from a session in which
the trainee lifted 35kg, and prints a note underneath saying 35.

The set rows disagree with the header for a third, separate reason: their
placeholder is the **ghost** — the actual last session's weight
(`SetGrid.tsx:539`). The ghost and the progression note agree at 35. The header
and the S-chips are the outliers.

**The added-load path does substitute**, five lines above the gap, with a
comment saying exactly why: *"The progressed added weight REPLACES the plan's
figure on the row, so a trainee who hit their reps last week actually sees
+17.5kg rather than the plan's +15kg with a note about it"*
(`TodayPanel.tsx:1171`). The ordinary-weight case was simply left out.

## The gate that should have caught it, and why it did not

`test:logged-reanchor` §5 asserts, in its own words:

> `'...and OVERRIDES the plan number with what came back'`

checked by `/progressedLoads\[ex\.name\] != null/`. That regex matches the
**label** line. The check is green today and the override it claims to prove
does not exist. Its module header states the same false thing in prose:
*"TodayPanel … OVERRIDES the plan's number with it, labelling the chip
'logged'."*

This is CLAUDE.md's named failure shape — *"asserted a call APPEARED in the file
rather than that its value was used"* — and it is the reason this shipped. The
gate gets re-anchored on the property, not the line.

## Which number is right

**35 — what the log says.** Not a judgement call:

- It is the app's own stated rule, printed next to every loaded lift:
  *"Hit the top of your rep range on every set? Add Xkg next time. Otherwise
  hold this weight and chase more reps first."* (`buildProgressionBasis`).
- It is what the note on the row already says, and what the set rows already
  prefill.
- The plan's 40kg is a forecast made before a single set existed. The chip
  state `'logged'` exists precisely to mean "this number came from a session,
  not an estimate" (`LoadChip.tsx`'s own header).

The stored plan is **not** changed. Re-anchoring the printed future weeks to
logged numbers is a separate thing that is deliberately an OFFER
(`beat-target-offer.ts`). This is a display substitution on today's card only,
on a copy — which is exactly what the added-load path already does.

## The build

### 1. One helper, in the module that owns the rule

`rebuildLoadForExercise` (`exercise-plan.ts:2945`) already carries the rule this
fix needs, in a comment worth quoting because it is the whole risk here:

> *"`suggested_load_kg`, `suggested_load` and `per_set_load` are three views of
> one number and every screen reads a different one, so they move together or
> they contradict each other."*

That one is private and mutates in place. Add an exported sibling in
`load-prescription.ts` — the module that owns loading modes, plate rounding and
labels — that returns a **copy**:

```
withWorkingLoadKg(ex, targetKg, profile) -> Exercise
```

- rounds the target with `roundToPlate` for the lift's own loading mode;
- clamps to `effectiveLoadingCeilingKg(entry, category, profile)` — the lower of
  the app's table and what the trainee says they own. This matters now in a way
  it did not before: `getDoubleProgressionRecommendation` returns
  `lastWeight + increment` with no ceiling of its own, so someone who hit their
  reps on their heaviest dumbbell would be shown a weight they cannot load the
  moment this number becomes visible;
- **preserves the ramp shape.** `per_set_load` is not flat — `buildPerSetLoads`
  builds it from `getSetPercents(sets, ramping)`, so a strength-phase main lift
  climbs to its top set. Each set keeps its own share of the top and is
  re-rounded. Flattening it (what `rebuildLoadForExercise` does, safely, because
  its two callers never meet a ramp) would turn a ramped session into five top
  sets — materially harder work than the plan prescribed, and the reason this
  step is spelled out rather than assumed;
- rewrites `suggested_load` and every `display` through `formatLoad` with the
  entry's own label mode, so a "per hand" or "per leg" qualifier survives.

### 2. One line in `TodayPanel`

In `rowProps`, beside the added-load substitution that is already there:
when `progressedLoads[ex.name] != null`, `rowEx` becomes
`withWorkingLoadKg(ex, progressedLoads[ex.name], profile)`.

Today's card only. `PeekPanel` suppresses `progressedLoads` by construction and
`ProgramBrowse` never receives it, so future weeks keep showing plan numbers —
unchanged, and correct.

### 3. Re-anchor `test:logged-reanchor` §5 on the property

Replace the line-presence regex with a behavioural check: call the helper with a
recommendation and assert all three views come back at that number, that the
ramp keeps its shape, and that the ceiling clamps. Plus a source check that the
substituted copy — not the plan's exercise — is what reaches the row. Correct
the module header, which currently asserts the false thing in prose.

### 4. A browser driver, because this is what she SEES

`verify:one-number` on `real.tsx` with a new `?logged=1` fixture: a prior
session on today's first loaded lift, at a weight below the plan's, with reps
short of the top of the range — Ashley's exact case. The driver reads the header
figure, every S-chip and every set-row placeholder off the real screen and
asserts they are one number. A screenshot read, not a tick.

## Verification

- `test:logged-reanchor` re-anchored and mutation-tested; `test:load-display`,
  `test:week-load-consistency`, `test:frozen-weeks`, `test:single-implement`,
  `test:load-ceilings` re-run (all read the same three fields).
- `verify:one-number`, `verify:ramp-ticks`, `verify:calibration-search`,
  `verify:absurd-weight`, `verify:six` — everything that reads a weight off a
  real screen.
- `npx tsc --noEmit`, and the affected sweep.

## Deliberately not in this plan

- Changing the **stored** plan. That is `beat-target-offer`'s job and it is an
  offer by design.
- The other four issues Ashley reported the same day. Each gets its own change.
