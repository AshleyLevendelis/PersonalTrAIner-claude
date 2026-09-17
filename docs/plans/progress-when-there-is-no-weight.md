# Progress when there is no weight on the bar

Ashley chose this from three options, 16 Sep 2026, and then ruled on the one
question it could not be built without.

## What is wrong, measured 16 Sep rather than taken from the note

Three independent places drop bodyweight work on the floor. They are separate
code, so fixing one would have left the others.

1. `pr-engine.ts` → `refreshPRCacheFromDB` queries with `.gt('weight_kg', 0)`.
   Every bodyweight row is excluded by the DATABASE QUERY, before any logic.
2. `pr-engine.ts` → `checkForPR` opens `if (weight <= 0 || reps <= 0) return null`.
   The live PR badge can never fire on a bodyweight set.
3. `exercise-history.ts` → the per-session loop does `if (s.isBodyweight) continue`,
   so `topSetWeightKg` and `topSetE1RM` both stay 0, and `derivePRHistory`
   then skips the session outright (`<= 0 && <= 0`).

Net effect: someone training at home with no kit has an empty strength graph
and no personal best, for ever. Going from 5 chin-ups to 15 registers as
nothing anywhere in the app. 131 catalogue entries touch bodyweight.

### Two corrections to the written record, both measured

- **The BACKLOG note says the chart is labelled "One Rep Max", presenting an
  estimate as a measurement. It is not.** `ExerciseDetailDialog.tsx:221` says
  "Strength trend". Fixing from the note would have "fixed" a label that is
  already honest. Correct where it sits and in the new entry.
- **A comment asserts a behaviour the code cannot produce.** `SetGrid.tsx:437`
  says a weighted pull-up "keeps exactly today's behaviour (bodyweight, PR by
  reps)". There is no PR by reps. It is PR by nothing, and the comment reads
  as a deliberate design choice rather than a gap. This is the comment-as-
  evidence trap from CLAUDE.md, one level up: not a check satisfied by a
  comment, but a READER satisfied by one.

### What already exists and must not be rebuilt

`added_load_kg` is a real column (migration `20260825120000`) and `SetGrid`
already writes it. The belt weight on a weighted chin-up IS being recorded,
deliberately in its own column, because writing 15 into `weight_kg` made a row
saying "this pull-up weighed 15kg" — indistinguishable from an ordinary 15kg
lift. Nothing reads it back for progress. So this build is about READING, not
about capture.

## Ashley's ruling, 16 Sep 2026, from three options

**Most reps in one set.** Over "most reps across the whole session" (an easy
high-volume day can beat a genuinely hard one, so the app would congratulate
someone for going easier) and over converting bodyweight to an estimated load
so everything sits on one line (tidiest graph, but the conversion factors are
numbers the app would have to INVENT and then show as if measured —
`load-prescription.ts:12` already says this app "is not a 1RM calculator and
must never be presented as one").

And the half that makes it coherent, stated in the option she chose: **the
moment a belt goes on, added weight becomes the record, and the reps record
stays as the best-without-weight.** Both are kept; they are different lifts.

## The design

**One classifier, used everywhere**, so the badge, the cache, the history and
the chart cannot disagree — the failure `SetGrid.tsx:440` already warns about
within a single function, generalised:

    added_load_kg > 0        -> the record is ADDED LOAD, in kg
    is_bodyweight, no load   -> the record is REPS
    otherwise                -> unchanged: weight, and its estimate

**A number never travels without its unit.** `RecentPR` currently carries
`weightKg`, and Home renders it beside a name. A reps figure arriving in that
field would render "12" where the reader has been trained to see kilograms —
worse than showing nothing, so the kind travels with the value and the
renderer has no default branch.

## Files

| | |
|---|---|
| `src/lib/pr-engine.ts` | the classifier; `PRRecord` gains `maxReps` + `maxAddedLoad`; drop the query filter; `checkForPR`/`getTopPRSet` take the set's kind |
| `src/lib/exercise-history.ts` | stop skipping bodyweight; top-set reps and added load; reps PRs in `derivePRHistory`; trend points carry their metric |
| `src/components/exercise/ExerciseStrengthChart.tsx` | plot the metric the points declare |
| `src/components/exercise/ExerciseDetailDialog.tsx` | say which metric is on screen |
| `src/lib/dashboard-data.ts`, `src/components/Dashboard.tsx` | `RecentPR` carries its kind; Home renders reps as reps |
| `src/components/exercise/SetGrid.tsx` | pass the kind through; delete the comment that claims a behaviour |
| `src/lib/coach-voice.ts` | the PR sentences, so both surfaces say it one way |

Existing readers of `maxWeight` (`goal-progress.ts`, `ChatAssistant`,
`dashboard-data`, `useActiveSession`, `ToolsTab`) keep working — the new fields
are additive and nothing is renamed.

## Gates

- **new** `test:bodyweight-progress`, mutation-tested, CALLING the engine rather
  than reading it. It must fail if any ONE of the three exclusions comes back,
  which is the point of having found all three first.
- A browser driver: the graph and the personal best on a real screen at phone
  size. Per CLAUDE.md a `test:` gate cannot prove a branch is REACHED, and this
  feature's whole failure mode was code that existed and was never read.
- `test:dashboard`, `test:exercise-history`, `test:silent-writes` re-run.

## Deploys

**None.** No edge function changes. Frontend ships on merge.
