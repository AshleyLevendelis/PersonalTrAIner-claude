# Adding one exercise to a session

Ashley chose this on 13 Sep 2026 over unlocking the eight locked setup answers
and wiring the coach's ban. It is the last `MISSING` line in CLAUDE.md's
**Changing one exercise** grain:

> Add one to a session AS PART OF THE PLAN — `MISSING` (extra work can be
> logged; it does not join the plan)

You can remove an exercise, swap it, move it and ban it. You cannot put one in.
`AddUnplannedWork` records extra work in the cardio/history log, which is a
different thing: it does not count towards the week's prescribed volume, the
balance passes never see it, and the coach cannot plan around it.

## Her ruling, 13 Sep 2026 — the time cap

Adding work makes the session longer. Asked what should happen when a Tuesday
goes from 55 to 64 minutes, the options were: say the new length and change
nothing else (my recommendation); trim accessories to fit; or ask every time.

**She chose: add it, and say it is now 64 minutes.** You asked for the
exercise, so you get the exercise. The card states the new length and how far
over the asked-for range it is, before the tap. Nothing else on the day is
touched — the app does not quietly remove work to pay for work you requested.

The named risk, recorded so it can be revisited: three additions across a block
and the sessions are twenty minutes longer than the setting says, one
reasonable decision at a time. If that shows up, the fix is a nudge, not a
silent trim.

## What already exists — measured, not assumed

| Piece | Where | What it gives us |
|---|---|---|
| `getConstrainedPool(profile, exclusions)` | `exercise-plan.ts` | The pool generation itself picks from — equipment, injuries and bans already applied. |
| `getReplacementCandidates(name, …)` | `mesocycle-edit.ts:43` | Ranked, explained suggestions — but keyed on an OUTGOING exercise. |
| `searchExerciseCatalog(query, limit)` | `exercise-db.ts:5128` | Free-text search over the **whole catalogue**. |
| `recomputeLoad(entry, …, isMainLiftReset)` | `mesocycle-edit.ts:146` | With the reset branch: *"New lift — find your working weight this session, then let it ramp from here."* Exactly right for a movement with no history. |
| `applyReplacement(slot, entry, load, …)` | `mesocycle-edit.ts:196` | Builds an `Exercise` around a new movement, carrying programming from the slot it replaces — including the primer guard that stopped kettlebell swings being prescribed 88kg. |
| `settleWeek(week, dayName, profile)` | `settle-week.ts` | The shared tail every edit runs. |

**The two real gaps:**

1. **Search is unfiltered.** `searchExerciseCatalog` reads the catalogue, not
   the pool, so it will happily return a barbell lift to someone with no
   barbell and a movement that loads an injured joint.

   **CORRECTED 13 Sep 2026, and the original line is left below because the
   correction matters more than the retraction.** What I wrote was: *"Every
   candidate list this feature shows MUST be intersected with
   `getConstrainedPool`. This is the injury-filtering path."* Right about the
   RANKED list and wrong about the search box, and I wrote it from the two
   function signatures without reading `getExerciseCompatibilityWarnings`
   (`exercise-plan.ts:4498`), whose own header records the deliberate opposite
   decision for swap: a filtered-only list dead-ends when every ranked option
   is also unavailable, so the fix chosen then was to let the user pick
   anything and SEE why it might not fit. Ashley ruled the same way for adding
   on 13 Sep — *show everything, warn me* — so the built behaviour is: ranked
   list from the pool, search across the catalogue with the clash stated on the
   row. The same error shape to watch for elsewhere: reasoning about what a
   function should do from its name and signature, when the file it lives in
   already says why it does something else.
2. **There is no slot to copy programming from.** Every generation-time
   construction of sets/reps/rest lives inside private functions taking the
   whole day's context.

## The build

### 1. Where the numbers come from — `addExerciseToSession`

New export in `session-edit.ts`, beside `removeExerciseFromSession` and
`moveExerciseInSession`, returning the same `SessionEditResult` shape.

- **Sets, reps and rest are copied from a PEER** — the nearest exercise in the
  same day at the same `mechanics_tier`, falling back to the same volume role,
  then to the role's floor with the goal policy's rep range. Rationale: the
  added exercise should look like the session it is joining, and a peer's
  numbers have already been through this week's progression, deload and
  duration passes. Exporting a slot-builder out of generation would mean
  reproducing fifteen parameters of context to get a worse answer.
- **The weight is `recomputeLoad(..., isMainLiftReset: true)`** — not because
  it is a main lift, but because the reset branch is precisely "a movement
  with no history in this plan": conservative, and its `basis` already says
  *find your working weight this session*. Anything else would be the app
  inventing a number about a lift it has never seen her do.
- **Position is by tier**, inserted where generation would have put it —
  tier 1 → tier 2 → tier 3 → cardio — never appended blindly to the end, which
  would put a squat after the calf raises.
- **A superset is never split**: inserting between two halves of a labelled
  pair is refused, the same rule moving already keeps.

### 2. It runs the shared tail, like every other edit

`settleWeek` after the insert: set hierarchy, one weight per prescription,
load coherence, the warm-up rebuilt from the exercises the day now holds, and
the week balance pass. This is rule 3 — "a change path that skips the checks
generation runs is a defect, not a shortcut."

### 3. What the card says before the tap

Per her ruling: the new estimated length and, when it is over, how far over
the range she asked for. Reuses the estimator the header already shows, so the
card and the screen cannot disagree — the defect the shorten work found on
13 Sep.

### 4. Both surfaces

- **Screen** — an "Add an exercise" entry on the session, offering what the day
  could use first (ranked through the constrained pool) with a filtered search
  underneath. Scope today / rest of block, the same two words the remove and
  swap sheets already use.
- **Coach** — `propose_exercise_add`, courier-shaped like the rest: raw args
  forwarded, the client builds the diff, nothing written server-side. The
  model names a movement and the CLIENT resolves it against the pool, so a
  hallucinated exercise fails closed rather than entering the plan.

## Verification

- **`test:exercise-add`** (new): the peer's programming is what lands; a brand
  new lift gets the find-your-weight basis and never an invented working
  number; position follows tier; supersets are never split; **the candidate
  list is the constrained pool, not the catalogue** — an equipment-forbidden
  and an injury-forbidden movement are both absent, driven from a real profile.
- **`test:edit-keeps-the-bar`** gains the path in its `PATHS` array, which
  hands it the forged-violation battery and the 7.2 re-score.
- **`test:enforcement-gaps` / `test:injury-coverage`**: the addition cannot
  become a hole in the filters generation applies.
- Coach parity in `test:coach-volume-schedule`'s tool loop (declared, forwards
  a proposal, writes nothing, puts no words in the model's mouth).
- A browser driver at 390×844: add an exercise, read the length line off the
  real screen, confirm it lands in tier order and survives leaving the tab.
- Every new check mutation-tested, tried/caught reported.

## Deploys

Frontend on merge, and **`chat-gemini`** for the new coach tool.
