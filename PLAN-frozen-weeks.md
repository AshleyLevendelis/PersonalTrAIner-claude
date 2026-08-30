# Plan — weeks that repeat themselves (audit §6.5)

Written before building, because this is load prescription and that always
gets a plan first. Nothing in here is built.

**It also corrects the audit.** The audit named this defect "bodyweight
progression" and said it was "overwhelmingly bodyweight work — pull-ups and
chin-ups at 4-6 @ bodyweight, week after week". Measured now, bodyweight is
the SMALLEST of three causes, at 15.7%. Building what the audit asked for
would have spent the effort on a sixth of the problem.

## What is actually happening

`npm run report:frozen-weeks` — 4 equipment tiers x 3 splits x 3 experience
levels, 5,705 week-to-week transitions:

```
frozen: 185  (3.2% of transitions)

   107   57.8%   loaded, non-carry     <- the real one
    49   26.5%   carry
    29   15.7%   bodyweight
```

Two numbers are floating around for this and they measure different things.
Neither is wrong; quoting them together is:

| | |
|---|---|
| **3.2%** | share of week-to-week TRANSITIONS that repeat. The rate. |
| **61.7%** (audit) / **84.1%** (current) | share of PLANS containing at least one repeat, anywhere in sixteen weeks. |

A sixteen-week plan has roughly forty transitions per exercise-slot, so "3% of
transitions" and "most plans contain one" are the same fact stated twice. The
rate is the number a fix should move; the plan share is the number that tells
you a user will probably see it at least once.

## The mechanism, exactly

`load-prescription.ts:1420`:

```ts
estimate = Math.min(options.unverifiedPreviousLoadingWeekKg + unverifiedRampStepKg(entry), estimate)
```

For an exercise the user has never logged, the app has no verified number —
only an estimate from strength standards for their bodyweight, sex and
experience. Each week it steps the prescription toward that estimate. When the
step would overshoot, the `Math.min` holds it AT the estimate.

From then on the load never moves again, because there is nothing new to move
it toward. And these are `rampLoad` exercises: load is designated the lever,
so reps are deliberately held flat (`exercise-plan.ts:5804`). Both levers are
therefore still, and `frozen_week` fires.

**This is not a bug in the arithmetic.** The app has climbed to the limit of
what it can honestly claim about someone it has never measured. Prescribing
more would be inventing strength nobody has evidence for — the exact class of
fabrication this codebase has repeatedly refused (see ASSUMED_BODY, the
weight-basis offer, the calibration-week conservatism tiers).

The bug is that it says nothing about it. The user sees week 9 and week 10
print the same thing, is told they are in a progressive programme, and is
given no reason and no way out.

## The question for Ashley

**When the app has pushed an exercise as far as its estimate allows and has
never seen you actually lift, what should it do?**

It cannot keep adding weight — it would be making the number up. So:

**A. Ask for one real set.** The exercise holds, and the app says why:
"Holding at 47.5 kg — log a set and I can take this further." One logged set
replaces the estimate with a fact and the ramp restarts from something real.
*Recommended.* It is the only option that actually ends the freeze rather than
disguising it, and the app already reads logged sets.

**B. Switch that exercise to adding reps.** When load converges, reps start
climbing instead, so the prescription changes every week. Honest, and it works
with no input — but it changes what the exercise is training toward, and a
6-8 that drifts to 12-14 over a block is a different exercise.

**C. Say it plainly and change nothing else.** A line on the exercise: "at
your estimated working weight — this holds until you log a set." Smallest
change, no risk to the load logic. Leaves the repetition, removes the mystery.

**D. A and C together.** Say it, and restart the ramp the moment a set is
logged.

What happens either way: nobody is ever prescribed more weight than the app
can justify. The difference is whether the person is told why their programme
looks static, and whether the app gives them a way to unstick it.

## The other two causes, and what I would do with them

**Carry (26.5%).** Farmer's walks holding at "55m @ 22kg". There is no rep
lever — distance is fixed and `shiftReps` deliberately never touches a carry.
The honest levers are distance and time. This is a separate decision and I
would not fold it into the same change.

**Bodyweight (15.7%).** These already get `rampReps` (+1 rep/week within a
block), so a freeze here means something downstream flattens it. **I do not
yet know what, and I am not going to guess.**

I had written a block-boundary explanation into this plan — the ramp restarts
at `w = 1`, so a new block's first week lands where the old block's last week
did — and then checked it. It does not hold: blocks here are four weeks with
weeks 4, 8, 12 and 16 as deloads, and the observed freezes are `wk9->10` and
`wk13->14`, both squarely INSIDE a block. The probe I wrote to test it was
also reading the wrong field for load, so it called every exercise frozen and
would have "confirmed" whatever I asked it. Neither the claim nor the
instrument survived, and both are recorded here rather than quietly dropped,
because the same probe shape is the one I would otherwise reuse next time.

So the first step for this bucket is root-causing it, not fixing it: take one
reproducing case from `report:frozen-weeks`, follow `repShift` through
`shiftReps`, and find what flattens a rep ramp that is switched on. It is
mechanical and carries no product question, so it needs no ruling — but it
needs an actual cause before it needs a patch.

## What I will NOT do

- Prescribe more load than the estimate supports, under any option.
- Fold the carry decision into this one.
- Change what `frozen_week` measures. If the rule's definition moves, every
  number above stops being comparable and the "before" is worthless.

## Verification

- `report:frozen-weeks` before and after, all three buckets printed every run,
  so a fix that drove the total down while leaving a bucket untouched cannot
  read as success.
- `test:quality` for the plan-level rate and the Progression dimension
  (currently 1.65/2). 22 minutes.
- A new gate asserting the block-boundary fix specifically: consecutive blocks
  never open on the exact prescription the previous one closed with.
- `test:audit` stays at 13,967/0, and `test:load-suggestions`,
  `test:load-display`, `test:assumed-body`, `test:load-ceilings` stay green —
  they are the ones that would catch a load regression.

## Deploy

Client-side only. No migration, no edge function.
