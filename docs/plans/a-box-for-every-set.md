# A box for every set

**Ashley's ruling, 17 Sep 2026, from three options: "A box for every set,
labelled — Warm-up 1, 2, 3 then Set 1, 2, 3 — each with its own box. Warm-up
boxes are marked as warm-ups so they never count toward your weight going up.
You never press Add Set to record work the app itself asked for."**

She was told this reverses her 7 Sep 2026 ruling ("let me tick the build-up
off, don't record it") and chose it anyway, having now stood in a gym with a
bar in front of her and three boxes for five sets.

---

## A correction to what she was told, before anything else

When the options were put to her, option A was described as "the only one of
the three that also fixes the sets you have already logged wrongly."

**That was wrong, and the way it was wrong is worth recording.** The repair
does not depend on the row design at all. Her deadlift and her dumbbell rows
can be un-frozen by changing how the app READS her existing logs, with no
schema change, no migration, no write of any kind, and no new rows. It would
work just as well under option B or C.

How the wrong claim was reached: the row design and the repair were assumed to
share a mechanism — that fixing the freeze meant marking the old rows as
warm-ups, which only option A's labelled rows make possible. That assumption
was never checked before it was put in front of her. Measured afterwards, the
opposite is true, and it is true in a way that matters:

**MARKING THE OLD ROWS IS THE ONE REPAIR THAT IS NOT AVAILABLE.** `is_warmup`
is part of the row's identity — it is in the local natural key
(`set-log-store.ts:175`) and in the database's upsert conflict target
(`:578`, `:982`). So flipping the flag on an existing row is an INSERT of a
second row, never an update. Repairing that way needs delete-then-resave, and
`saveSet` stamps `completedAt` from the app clock (`:378`) while
`writeHistoricalSession` — the only path that takes a timestamp — refuses any
date at or after today (`:945-950`). Today's rows could only be repaired by
losing their timestamps; past rows could not be repaired through the store at
all. The remaining route is a production UPDATE, which needs Ashley's word and
her machine.

Her ruling stands on its own merits and is unaffected. Only the reason given
for one of its advantages was wrong.

---

## What is actually broken, measured

### 1. Nothing in the app can mark a set as a warm-up

`exercise_set_logs.is_warmup` exists, is `NOT NULL DEFAULT false`, and is in
the unique constraint (`20260802090000_create_unified_logging_foundation.sql:149,153`).
**No migration is needed to start writing `true`.**

Twelve readers filter on it. Every writer defaults it
(`set-log-store.ts:370, :424, :976`); no component or hook passes it; the coach
hard-codes `false` (`chat-gemini/index.ts:190`). The filter was built and the
writer never was — the same shape as the walking plan (generator, type, no
pixel) and the goal (every piece of machinery, nothing writing the field).

### 2. The freeze, reproduced from the code with her numbers

`getDoubleProgressionRecommendation` (`progression-engine.ts:227-246`):

- `:237` `lastWeight = maxWorkingWeight(sessionSets)` — the heaviest row
- `:238` `hitTopOnAllSets = sessionSets.every(s => s.reps_completed >= high)`

Her rows: 20x10, 50x5, 70x3, 95x8, 95x8, 95x8, with `high` = 8.
`every(reps >= 8)` fails on the 50kg x 5. Result, verbatim: *"Held at 95kg —
didn't hit 8 reps on every set last time."* Three perfect 95x8 sets can never
clear it while one 5-rep build-up row sits beside them.

### 3. A SECOND, INDEPENDENT FREEZE, which nobody reported

`checkDoubleProgression` (`:103`) takes `todaySets.slice(0, prescribedSets)` —
the first three rows BY ORDER. Her first three rows are the build-up, so her
three real working sets at positions 4-6 are never looked at, and the
mid-session "you earned a bump" toast can never fire for her at all. **Any fix
must filter before the slice, or it fixes one freeze and leaves the other.**

### 4. A HARM WORSE THAN THE FREEZE, one step away from what she hit

She pressed "+ Add Set" four times and logged her 95kg sets. **Had she not
done that**, `maxWorkingWeight` would be 70, and TodayPanel stores
`rec.weightKg` whether or not it progressed (`TodayPanel.tsx:620-635`, handed
to `withWorkingLoadKg` at `:1365-1367`). Today's card would print **70kg** as
the working weight, replacing the header, `suggested_load` and the S-chips.
The ramp steps are scaled FROM `suggested_load_kg` (`session-derive.ts:98-117`),
so the next session's build-up would be computed off 70, logged, and become
the next anchor.

**Contamination does not only freeze the weight. Left alone, it walks the
prescription down.** That is the strongest argument for fixing the read path
now rather than waiting on the row redesign.

### 5. The prescribed ramp is FOUR steps, not three

`RAMP_SCHEMES.intermediate` is 0% / 50% / 70% / 85% (`warmup.ts:328-336`);
advanced adds 92%. Resolved against 95kg the app prescribes roughly
**20 / 47.5 / 66.5 / 80.75**. Her 20 / 50 / 70 was her own rounding of the
first three, and she stopped before the fourth. Every design mock in this
round assumed three steps. A design that hard-codes three is wrong for both
intermediate and advanced lifters.

---

## Stage 1 — unfreeze the read path (no schema change, no writes)

Ships with the frontend. Repairs every already-logged session on deploy,
independent of the row design, and closes §4 before it can walk her deadlift
down.

One new exported pure function in `progression-engine.ts`, beside
`maxWorkingWeight`, and three call sites: `:237-238`, `:103` (before the
slice), and `:299` (the added-load twin, which today also counts rows carrying
no added load at all).

**The rule must not discard a genuine working set**, and this is the part to
get right rather than fast. A ramped WORKING prescription is not hypothetical:
`RAMP_PERCENT_TABLE` (`load-prescription.ts:1177-1183`) makes a 3-set ramped
prescription [85, 92, 100] of top and a 5-set one [75, 85, 92, 96, 100], and
`buildPerSetLoads` plate-rounds every step. A naive 85% floor would throw away
the first prescribed set of a ramped session, and plate rounding can put it
just under any fixed line.

So the floor is DERIVED from the person's own prescription rather than chosen:
where `per_set_load` exists, the floor is the lowest prescribed share of the
top set; otherwise a default. Bodyweight (`top === 0`) falls through
untouched by construction, not by a guard. If the filter would empty the set,
it returns the input unchanged — the app never judges her on nothing.

**Measured against her two real sessions**: the deadlift session goes HOLD ->
PROGRESS at an 80%, 85% or 90% floor (70/95 = 73.7%). Her dumbbell rows stay
HOLD at every floor, because she logged 9 reps on the top set too and the
target is 13 — correctly, this time.

Gate: a new `test:working-sets` with her two sessions as fixtures, the ramped
3-set and 5-set prescriptions as the cases that must NOT lose a set, a
bodyweight session that must be untouched, and the empty-result fallback.
Mutation-tested, count reported.

## Stage 2 — a box for every set

Her ruling. Needs the fixes below regardless of which rendering wins; every
one of them was found by the design review and is confirmed in the code.

**Six readers that have never had to think about a warm-up row:**

1. **The week strip.** `daily-tracking.ts:411` has no `is_warmup` filter, and
   `useTrainingWeek.ts:136` returns `partial` off a single row. Tick three
   warm-up boxes and walk out and the week says you part-trained. `:134` is
   worse in kind: it is the guard written FOR her Thursday, and a warm-up row
   satisfies its `loggedWork` half.
2. **The coach's own context.** `ChatAssistant.tsx:929`, `:995` read
   `activeSession.logs.length` raw as `todayLogged`, and `:1453` sends it as
   `setsLogged`. A warm-up alone would tell the coach she has trained, and
   three warm-ups plus three working sets would report "6 of 3 sets logged".
3. **PR detection is NOT fixed by the flag.** `pr-engine.ts:95`'s `SessionSet`
   has no warm-up field and `toSessionSets` drops it, while `SetGrid.tsx:443`
   calls `checkForPR` on every save. A 20kg build-up single on a new exercise
   still fires the badge; the DB-derived cache then filters it, so the badge
   evaporates on refresh — a flicker, which is harder to notice and harder to
   report than a wrong record.
4. **Delete hits the wrong row.** FOUR callers, not two:
   `SetGrid.tsx:476`, `ChatAssistant.tsx:5884`, `nl-logging-executor.ts:186`
   and its wiring at `ChatAssistant.tsx:4301`. All omit `isWarmup`, which
   defaults to false — so a delete reachable from a warm-up row tombstones the
   WORKING set of the same number.
5. **Additional work.** `session-derive.ts:366` does not filter warm-ups
   (unlike its sibling at `:467`), so a warm-up against a swapped-out exercise
   raises an "Additional work" card for a lift nobody did a working set of.
6. **Ghost prefills.** `loadGhosts` fills from `getLastSessionSets`, which
   filters `is_warmup = false` — so a warm-up box would prefill with last
   week's WORKING weight. A blank tap would log 95kg as warm-up 1.

**Two things any rendering must avoid, both measured:**

- **Duplicate DOM ids.** `SetGrid.tsx:538` renders
  `id={`setgrid-weight-${exerciseId}-${setNumber}`}` and
  `ExerciseRow.tsx:111` does `getElementById` on the same string for
  BottomDock's "Start next set". Two blocks for one exercise both emit
  `...-1`, and the dock lands on the warm-up box.
- **A second "Add Set" button and a second column header.** Both are
  unconditional in `SetGrid` (`:495-506`, `:707-717`). A design that renders a
  second grid gets both, which contradicts the ruling's own sentence — she is
  looking at an "Add Set" button on the block that is supposed to need none.

**The offline queue does not collide — it DUPLICATES.** The coalescing at
`set-log-store.ts:396` only cancels ops sharing the same `is_warmup`, so a
pending working upsert and a pending warm-up upsert for set 1 both survive and
both land.

**Gates that will go red and are RIGHT to**: `test:ramp-visibility` §4 and
`verify:ramp-ticks`, roughly 22 checks. They encode the 7 Sep ruling this
supersedes, including the explicit "ticking writes no set, anywhere in the
strip" at `test-ramp-up-visibility.ts:245-246`. They are re-anchored, not
deleted — the property they protect (a build-up is visible and cannot be
mistaken for working volume) survives the change; only the mechanism moves.

**The coach needs no deploy to READ this correctly** — `is_warmup=eq.false` is
already in the deployed query (`chat-gemini/index.ts:230`). It needs one to be
able to LOG a warm-up, which parity rule 4 will require.

---

## Verification

1. `test:working-sets` (stage 1) and the extended set-grid gates (stage 2),
   every new check mutation-tested with counts reported.
2. `verify:` drivers at 390x844 for both stages — stage 2 is a screen and the
   design review already showed this area is where source checks pass over
   real defects.
3. `npx tsc --noEmit`, then a full sweep before any merge. Three checks always
   fail in a cloud session (`test:meal-quality`, `test:schema-parity`,
   `verify:rls`) and are reported as environmental.
4. Records: BACKLOG with her ruling, the reversal of the 7 Sep one, and the
   correction at the top of this document; CLAUDE.md for the lasting rule.

## Named, not done

- **Repairing her existing rows by marking them** is not available without a
  production write. Stage 1 makes it unnecessary for the freeze; it does NOT
  repair tonnage, the history graph, or the bodyweight "most reps in one set"
  record, which a high-rep warm-up row can still win. Those need the write.
- The rest-period stacking and the style filter hiding machine leg curls are
  separate, and are Ashley's rulings, queued one at a time.
