# The coach's swap card says what it costs

Written 14 Sep 2026, on Ashley's go-ahead. A plan first because this runs the
swap trial — which recomputes load — at a new moment, and load prescription
gets a plan even when the change looks small.

## The gap, re-measured rather than quoted

CLAUDE.md records it under "Adjustable AND best-in-class is one promise":

> ONE SURFACE STILL SILENT, named: the COACH's swap card — its builder is
> synchronous and a faithful trial needs the async load recompute, so it says
> nothing rather than something that might not match what confirm does.

Measured today, and both halves of that are true:

- `buildExerciseSwapProposal` is synchronous. Its whole `diff.implications` is
  one line: "Load recomputed for the new movement once you confirm."
- `swapExerciseInMesocycle` really is `async`, because it awaits the load
  recompute. So the trial cannot run in a synchronous builder.

**What does NOT follow is that the card must stay silent.** Every other edit
path states its cost before the tap — removing an exercise, changing volume,
adding an exercise, moving a meal. The swap is the only one that doesn't, and
the reason is a detail of how its builder was written rather than anything
about swapping.

**And there is a precedent in the same file.** `buildExerciseAddProposal` is
also synchronous and DOES report the balance cost, with its own note saying
why that is sound:

> The two things the card DOES state — the new length and the balance cost —
> do not read the weight, so they are exact.

Add gets away with it because `addExerciseToSession` is synchronous. Swap's
trial is not. So the fix is not to copy add's shortcut — it is to let the
builder await, which is what its own siblings already do.

## Why awaiting is the right answer and not a workaround

`processResponse`, the function that dispatches every proposal, is already
`async` — and already awaits two sibling builders, `buildMealSwapProposal` and
`buildInjuryAdaptationProposal`. Making this one async puts it alongside them
rather than inventing anything.

The alternative — deriving a balance cost from the old and new exercise
without running the trial — was rejected: it would be a second implementation
of what the settle tail does, and a card that disagrees with what confirm
produces is worse than a card that says nothing. That is exactly the reasoning
the original note gives, and it still holds. The trial is the one source.

## The work

1. `buildExerciseSwapProposal` becomes `async`, and awaits
   `swapExerciseInMesocycle` as a TRIAL — the same call confirm makes.
2. `describeEditImpact(before, after, dayName)` turns that into
   `{ balancing, cost }`, exactly as the add card does.
3. Both go on the card: what the app fixed for her (`balancing`, info) and what
   it could not (`cost`, warn).
4. The existing "Load recomputed once you confirm" line STAYS. The weight is
   still deferred, and still correctly: the trial's weights are real, but
   confirm re-runs against the live plan and quoting a number here that confirm
   could supersede is the thing the original note was right to refuse.
5. `await` at the one call site.

## The risk this carries, and how it is contained

**The trial must never be persisted.** It produces a full mesocycle and it is
read for two sentences only. Nothing in the builder may save it, and the
payload stays what it was — the swap's description, not its result. Confirm
still does the real work against the live plan.

**It costs one extra async pass per swap proposal.** Acceptable: it is the
same call confirm already makes, once, on a card the user is about to read.

## Gates

Nothing currently holds "every edit path states its cost" — measured, not
assumed: no check references `describeEditImpact`, and nothing asserts the
coach's swap is silent. So this adds the guarantee rather than flipping one.

- `test:coach-promises` (or a new section of `test:edit-keeps-the-bar`): the
  swap card's implications carry the balance cost when the trial produces one,
  and the builder reads it from the trial rather than deriving its own.
- The property, pinned both ways: a swap that COSTS something says so, and a
  swap that costs nothing does not invent a warning.
- The trial is not persisted — asserted on the builder's body.
- `verify:swap-request` drives the real chat and reads the card.
- Mutation-test every new check.

## Not in this plan

Quoting the new weight on the card — deliberately still deferred, above. The
screen's own swap control, which is a different surface and already has its
own cost reporting through the remove sheet's path.

## What was actually built, measured 14 Sep 2026

Built as planned, with one addition the plan did not foresee.

- `buildExerciseSwapProposal` awaits the trial; `describeEditImpact` reads it;
  both sentences go on the card; the weight stays deferred; the trial is never
  persisted. `test:coach-promises` holds all seven, 5 mutations tried, 5 caught.
- `verify:swap-request` §4 drives two real swaps — one like-for-like, one
  cross-pattern off a differently-focused day — and reads both cards.
- **THE ADDITION: the card marks each implication with its own severity.**
  Written because the first two versions of the driver check were worthless and
  both were caught by breaking the code rather than by reading it. The second
  matched the whole card's text for a sentence with a number in it, and
  "Unchanged: … Sets × reps: 2×8" satisfied it even after the words "pushing
  sets to" were deleted out of the real sentence. Reading the line the app
  ITSELF calls a warning is the property; matching words that look like a cost
  was the mechanism.
- Driver mutations: 4 tried, 4 caught — silence the cost, strip the units out
  of the sentence, a constant cost on every swap, remove the severity marker.
