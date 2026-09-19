# Ramp-up vs working sets on the exercise screen

**Plan before build**, because this changes what is logged and what volume counts.
From Ashley's design handoff, 19 Sep 2026 (`design_handoff_ramp_vs_working_sets`),
build `2a` and `3a`.

## The rule everything follows

From the handoff, and it is the thing to hold on to when any detail is unclear:

> **A rail means grouping. A colour means what a set counts as.**
> Violet = ramp-up, logged but excluded from volume and PRs. Mint = working set,
> saved to history. Colour never carries grouping and rails never carry meaning.

That is what lets a superset — which already owns the mint rail — contain a ramp
without two rails fighting. Inside a superset the phase rails drop away and the
ramp is signalled by violet row labels and save buttons only.

## MEASURED FIRST: two of the six scope items are already shipped

The handoff describes a current screen where "ramp loads can't be logged at
all". That was true when the design work started and is **not true today** —
Ashley's 17 Sep 2026 gym-floor ruling ("a box for every set, labelled") already
landed. Measured before building:

| Scope item | State today |
|---|---|
| 1. Ramp rows using the same set grid, real weight/reps fields, own save button | **Already built** in `SetGrid.tsx` — warm-up rows, real fields, own save button, "add warm-up set". What is left of this item is the *labelling and colour*. |
| 5. Ramp entries persisted flagged, excluded from volume, PRs, progression | **Already built** — `is_warmup` on the row, `filterWarmupSets` in `session-derive.ts`, and the exclusions hold by construction. |
| 2. Progress track + the two group headers | New |
| 3. Remove the `.glow-sweep` hairline | New — one line in `ExerciseRow.tsx:153` |
| 4. Retire amber for violet | New |
| 6. Drop sets as continuation rows | New, and the only part needing a data change |

`RampStrip` is **no longer on today's card at all** — since 17 Sep it is the
read-only block that browse and peek render. So item 1's "replace RampStrip's
chips" is really two separate jobs: today's card needs re-labelling and
re-colouring, and `RampStrip` (a different surface) needs its amber retired.

**Recording this because the obvious reading of the handoff is that item 1 is
the big build. It is the smallest.**

## The one collision, and how it is resolved

Her 17 Sep ruling named the row labels: *"Warm-up 1, 2, 3 then Set 1, 2, 3"*.
The handoff says `R1`…`Rn`. Both are hers.

**Resolved in favour of the handoff, because the meaning moved rather than
disappeared.** The long label carried "this does not count"; the design gives
that job to the group header ("RAMP UP · not counted") and frees the 22px label
track for a short one. Nothing is lost on screen.

**The spoken label does not change.** The standing rule — *two rows must not
share one spoken name* — was written after the tick button said "Save set 2" on
both a warm-up row and a working row. The visible label becomes `R2`; the
accessible name stays "Warm-up 2".

## The data change (Ashley's ruling, 19 Sep 2026)

Asked how a drop should be recorded, from three options — a proper marker / reuse
ordinary set numbers / draw it now and store it later — she chose **a proper
marker**, over the option that would have made "3 working sets" read as 5
everywhere outside this screen.

`exercise_set_logs` gains `drop_index integer NOT NULL DEFAULT 0`, and the
`unique_set_per_session` constraint extends to include it. Parent set = 0,
drops = 1, 2, … So:

- Every existing row is `drop_index = 0`. No backfill, and nothing that reads
  today's data changes meaning.
- `set_number` still names the set a row belongs to, so the working-set COUNT is
  the rows at `drop_index = 0`, and "3 working sets" stays true by construction
  rather than by a filter somebody has to remember.

**What a drop counts toward — decided here under the CSCS delegation, and the
basis recorded rather than asserted.** The handoff says drops are working
volume, not warm-up, and says nothing about records or progression.

- **Volume: included.** The work was done; it is the same exercise in the same
  set.
- **Personal bests: excluded.** A drop is performed in a deliberately fatigued
  state immediately after a working set, with no rest. It is a continuation of
  that effort, not a fresh maximal attempt, so treating 45kg x 6 after 60kg x 8
  as a candidate record would mean the app congratulating someone for the
  easier half of one set. This is the same reasoning that already excludes
  warm-ups.
- **Progression and re-anchoring: excluded**, for the same reason and one
  sharper one: re-anchoring a lift off its drop would lower next week's
  prescription every time somebody trained harder.

## The CSCS review

1. **Training effect** — unchanged. Nothing prescribed moves. Drops become
   loggable where before they were untrackable, so the app stops under-counting
   work that was actually done.
2. **What it takes away** — nothing is removed. The ramp keeps every field it
   has today; the change is what it is called and what colour it is.
3. **Do the fundamentals survive** — yes. Overload, coverage and recovery are
   untouched. Drop volume entering the total makes the volume figure *more*
   accurate, not less.
4. **Does it quietly redefine a floor or ceiling?** This is the one with teeth,
   and it is why the drop marker is a column rather than a convention: volume
   is a number several things read. With `drop_index`, the set COUNT and the
   volume TOTAL answer two different questions and neither silently changes
   meaning. Under the rejected option they would both have changed while
   reading the same.
5. **Scope** — presentation and logging. Not diagnosis, rehab or clinical
   nutrition.

## Build order

1. Migration `add_drop_index_to_set_logs` — written here, **pushed by Ashley**
   (`db:push-both` refuses without a typed confirmation).
2. `session-derive.ts`: drops in the model; volume includes them, the set count,
   PRs and progression do not.
3. `SetGrid.tsx`: violet ramp rows labelled `R1`–`Rn`, group headers, drop rows
   and the "+ Add a drop" link.
4. `ExerciseRow.tsx`: progress track, target-weight block, neutral calibration
   cue, and the `.glow-sweep` hairline removed.
5. `SupersetGroup.tsx`: rails dropped inside, `A1`/`A2`, the alternation
   footnote with its conditional ramp clause.
6. `index.css`: violet role tokens; amber retired from this screen and from
   `RampStrip` on browse and peek, because a colour that means "ramp" cannot
   mean it on one surface and not another.

## Verification

- Every new check mutation-tested, counts reported.
- A browser driver at 390x844 on the real screen: the ramp rows log, the
  progress track advances, the two groups read as two groups, a drop appears
  under its parent and the exercise still says three working sets.
- `npx tsc --noEmit`, then the gates that READ each touched file, derived with
  `grep -rln <file> scripts/*.ts` rather than chosen from memory — the habit
  this session added after two gates went red for exactly that reason.
