# "Add load next week" — to someone with no weights

## Context

Measured while answering a different question: **84.7% of bodyweight lifts
end a sixteen-week plan on fewer reps than they started** (1,007 tracked).
`Air Squat 15-18` in week 1, `9-12` in week 15.

The first instinct — "the plan isn't progressing" — is wrong, and the wrong
number nearly got reported. Strip the block's own `rep_shift` out
(`anatomical_adaptation` carries +3, `strength` −3) and **77.2% climb**, with
only 4.9% genuinely regressing. The engine is fine. The falling reps are
periodization working as designed.

What is not fine is what the trainee is told about it. A loaded lift has a
weight column to carry the story — "fewer reps, but 20kg heavier" reads as
progress. A bodyweight lift has no column at all (`LoadChip`: *"Bodyweight
(source === undefined) renders no chip and no ⓘ — there is no load to
explain"*), so the number just goes down.

And the week-level text that should have explained it says the opposite.
Measured on a real bodyweight-only profile whose session was Box Squat
(Bodyweight), Deficit Push-Ups, Table Row and Low Box Step-Up:

> *"…with **load climbing week to week** within each block. Loads start
> deliberately light — **find the weight** where the last rep feels like
> RPE 6, log it…"*
> *"**Baseline week — this sets the working weight** every later week in the
> block adds load on top of."*
> *"**Drop the load** if you need to in order to keep the pace."*

Every one is an instruction about equipment she does not own. **369 of 576
bodyweight week notes** carried at least one. Same class as the assumed-body
work: the app asserting something untrue about her own session.

### What was NOT wrong, having checked rather than assumed

- **`BODYWEIGHT_ALLOWED_PHASES` already excludes 'strength' and 'power'**, so
  *"Heavier and lower rep"* and *"Move the weight fast… bar speed"* never
  reach a bodyweight trainee. I reported that as part of the defect before
  checking; it isn't.
- **The per-exercise guidance was already correct**: *"Progress by adding
  reps or slowing the tempo before adding load."*

So the defect is confined to the **week note**, which is assembled from three
independent sources — `phaseConfig.coach_note`, `policy.coachNote`, and
`buildProgressionNote`. All three had to change; fixing one or two would have
left the paragraph half-wrong, which is the shape the main-lift rest floor
already taught.

**Ashley's ruling:** fix the words first, then look at the training.

## The build

A second voice for each of the three sources, used when the week has nothing
to add weight to.

- `PhaseConfig.coach_note_loadless` and `GoalPolicy.coachNoteLoadless` are
  **required, not optional** — a new goal or phase cannot ship without
  someone deciding what it says to that trainee. Provided for 'strength' and
  'power' too, even though they are unreachable today, so relaxing
  `BODYWEIGHT_ALLOWED_PHASES` can never silently reintroduce this.
- `buildProgressionNote` gains a `loadless` flag, and treats the week as
  reps-emphasis regardless of what the goal would otherwise ramp.

### The predicate keys on the plan, not on the equipment answer

`isLoadlessWeek(days)` — true when at most 25% of the week's working sets
carry a load. Deliberately **not** `equipment_access === 'bodyweight'`:
`EQUIPMENT_SETS` includes `'weighted backpack'` at every tier on purpose,
since it is the one progressive load available with no gym, so a
bodyweight-tier plan does contain a couple of real numbers. Keying on the
equipment answer would have declared those weightless.

Measured share of working sets carrying a load: **bodyweight 12.2%,
minimalist 52.2%, full_gym 77.0%**. The threshold sits in the gap with room
on both sides, and `test:loadless-notes` prints all three every run.

## Verification

- **New gate `npm run test:loadless-notes`**, 20 checks:
  - no weight instruction in any bodyweight week note — **369 of 576 → 0**;
  - full-gym weeks still get the load coaching (the over-fire check: 381 of
    576 still mention it);
  - the loaded-share figures still straddle the threshold;
  - every phase and every goal has a weight-free variant, including the two
    a bodyweight trainee cannot currently reach.
- **No prescription changed anywhere, proven rather than argued.** Generated
  432 plans (4 equipment x 4 goals x 3 experience x 3 splits x 3 injury
  sets) with `coach_note` stripped, against both engines: **identical md5
  over 163MB**. So `test:quality` cannot have moved and was not re-run.
- `test:audit` 0 / 13,967; `test:band-slots`, `test:mesocycle-roundtrip`,
  `test:frozen-weeks`, `test:session-length`, `test:main-lift-rest`,
  `test:rehab-prescribed`, `test:assumed-body`, `test:starting-out`,
  `test:per-side-load`, `test:load-suggestions`, `test:block-consistency`,
  `test:block-review`, `test:interval-prescription`, `test:joint-tags`,
  `test:coach-promises`, `test:training-week`, `tsc -b`, `npm run build`.
- **No deploy** — engine only, ships with the Vercel push.

## Still open — the second half Ashley asked for

Fixing the words does not make a bodyweight lift get harder. The training
half — progressing the *movement* (Air Squat → a harder variation) rather
than only the rep count — is a separate change needing its own measurement
pass, and is not in this round.
