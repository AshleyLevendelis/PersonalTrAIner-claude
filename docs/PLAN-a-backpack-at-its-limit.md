# A backpack at its limit

## Context

A trainee whose only load is a weighted backpack runs out of progression and
the app has nothing left to give them. Measured (`npm run report:frozen-weeks`,
5,731 week-to-week transitions):

| | repeated weeks | share of all repeats |
|---|---|---|
| `Backpack Row` | 91 | 42% |
| `Loaded Backpack Walk` | 42 | 19% |
| **together** | **133 of 217** | **61%** |

Traced across a real 16-week plan (bodyweight / intermediate / upper-lower):

```
Loaded Backpack Walk   wk5 50m@20   wk6 55m@20   wk7 55m@20   wk9 55m@20
                       wk10 55m@20  wk11 55m@20  wk13 55m@20  wk14 55m@20
```

**Ten of sixteen weeks identical.** Both its levers are exhausted at once:
the weight is at `IMPROVISED_IMPLEMENT_CEILING_KG` (8 / 12 / 20 / 25kg by
experience) and the distance is at the carry cap (40m + 3 × 5m = 55m) added
in the earlier carry round.

**A correction to my own first reading.** I reported these as "pinned at the
ceiling from day one". That is true of the ceiling comparison but wrong about
the experience: `Backpack Row` at bodyweight/intermediate actually climbs
12.5 → 17.5 → 20kg with reps rising inside each block, and the novice cases
(12kg flat, reps 8-10 → 10-12 → 12-14) are textbook double progression, not a
defect. The real stuck cases are narrower and they cluster at **week 10→11**,
after the load has genuinely converged. Measuring one profile and
generalising is what produced the wrong version.

**Ashley's ruling: slow the movement down.** Chosen over more sets (fights
the time budget and the existing set-count rules), harder variations (the
right answer in principle, but those movements do not exist yet — it is a
content request wearing a progression hat), and telling the trainee to put
more in the bag (honest, but reads as the app giving up on the person who
picked bodyweight *because* they have nothing to add).

## Why tempo is the precedent, not a new idea

`applyTempoPrescription` (`src/lib/exercise-plan.ts:4102`) already exists and
already does exactly this — it gives a weightless lift the phase's tempo
(`2-0-1` anatomical adaptation, `3-0-1` hypertrophy, `4-1-1` strength) so the
rep itself gets harder when the weight cannot. The whole feature was built on
the principle that *tempo is how a lift progresses when it has no load to
add*.

It skips these lifts for one reason only, at line 4109:

```ts
if (ex.suggested_load_kg != null) continue
```

A backpack row at its ceiling **has** a load — 20kg — so it is skipped. But
20kg is every kilogram it will ever have. The condition encodes "has no
weight" when the question that matters is "has no more weight to gain".

That function also carries Ashley's earlier ruling, which this change must
not disturb: chin-ups and dips are excluded because they *can* take a belt,
so slowing them down "would paper over that gap instead of closing it". That
gap was subsequently closed by the added-load round. The distinction survives
intact — a belt can always take another plate; a backpack cannot.

## The build

### 1. Widen the condition from "no load" to "no more load"

In `applyTempoPrescription`, replace the null-load skip with a predicate that
also admits an improvised-implement lift sitting at its ceiling:

- `isImprovisedLoadImplement(entry)` (already exported, `load-prescription.ts:707`)
- and `ex.suggested_load_kg >= IMPROVISED_IMPLEMENT_CEILING_KG[experience]`

Everything else about the function is untouched: deloads still exempt,
primers still excluded, `accepts_added_load` still excluded, the
reps-shaped-string guard still applies.

`applyTempoPrescription` needs the trainee's experience to read the ceiling —
it is called once per week from `generateMesocycle` where `profile` is in
scope, so this is a parameter, not new plumbing.

### 2. Carries are the harder half, and get nothing here

`Loaded Backpack Walk` is `prescription_type: 'carry'`, and the existing
function already skips anything whose reps are not a plain number — a `55m`
string fails that guard. **Deliberately left alone.** Tempo on a walk is
meaningless: you cannot take three seconds to lower a carry. The 42 repeats
it contributes are a genuine dead end that this round does not fix, and
saying so is better than stretching tempo to cover something it does not fit.
Flagged for its own round.

So the honest ceiling on this work is **91 of 217 repeats (42%)**, not 61%.

### 3. Duration will move, and that is the risk

`computeSetWorkSeconds` (`session-duration.ts`) already reads tempo via
`tempoSecondsPerRep`, so a `3-0-1` rep costs 4s against `SECONDS_PER_REP`'s
assumed 3.5. Adding tempo to lifts that previously had none makes sessions
longer — and the tempo round already caused a duration regression once, when
2 of 576 "30-45" sessions ran to 45.8 minutes.

Measure per equipment tier against the STATED MAXIMUM, not the midpoint, and
report both.

## Verification

- **`npm run report:frozen-weeks` before/after.** Target: the `Backpack Row`
  bucket (91) falls substantially; `Loaded Backpack Walk` (42) unchanged and
  reported as unchanged rather than quietly omitted.
- **`npm run test:audit` must stay 0 / 13,967**, and `test:session-length`
  clean — §3 is why this is a real risk rather than a formality.
- **`test:tempo-prescription`** extended: a backpack lift at its ceiling gets
  a tempo, one below its ceiling does NOT, a chin-up still does not (Ashley's
  earlier ruling), a deload still does not, and a carry still does not.
- **Read one real 16-week plan** and confirm the backpack row reads as
  progression rather than an arithmetic sequence.
- `test:quality` before/after. **Progression is the dimension this targets**
  (currently 1.75); Time fit is the one at risk.
- No deploy — engine only, ships with the Vercel push.

## Out of scope, flagged

- **Carries at their distance cap**, per §2. The bigger half of the problem.
- **The beginner load DROP.** `bodyweight/beginner` showed `Backpack Row`
  going 8kg → 7.5kg while reps climbed — a rep bought with a lighter weight.
  `test:frozen-weeks` already tracks this class (9 bad against a HEAD baseline
  of 10) and it is a separate defect from running out of load.
- **Harder backpack variations** (single-arm row, elevated feet). The most
  training-correct answer and the largest piece of work; named here so
  choosing tempo is visibly a scope decision rather than an oversight.
