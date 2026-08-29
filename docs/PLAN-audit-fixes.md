# Fixing the five the audit found

Ashley: "fix all the issues you found." Two of the five are safety-adjacent
(dietary filtering, load prescription) and get this plan first per CLAUDE.md.

## 1. A meal swap can serve back a banned food — SAFETY

Proven: ban almond butter, ask to swap breakfast, get "Almond Butter Oats".
`buildMealSwapProposal` reads the stored pool and rotates. The pool is frozen
at generation time and the swap path has **no dislike or dietary check at all**.

Two stale channels, and they must BOTH be re-checked at swap time:
- **dislikes** → `compileFoodDislikes` (now every food dislike, after today).
- **allergens/diet** → an allergy disclosed in chat lands in
  `dietary_preferences` via `detectAllergenTags`, not in the dislike list. So
  filtering dislikes alone would leave the allergy half of this hole open.

Filter the pool before rotating, using the SAME matchers the generator uses —
never a second copy of the rule (that is what produced this codebase's
recurring defect, and today's almond-butter bug specifically). When filtering
empties the slot, say so and offer to find new ones, reusing the existing
`exhausted` shape rather than inventing a second dead end.

## 2. Availability facts never reach the plan

`compileTrainingDayOverrides` works in isolation and has zero callers. Wire it
into the enriched profile in `App.tsx` before `generateExercisePlan`.

## 3. Goal-stated lifts never reach load prescription — SAFETY

`compileKnownLiftOverrides` works in isolation and has zero callers, so the
only writer of `known_*_kg` is onboarding and a stated lift can never be
corrected. Wire it into the enriched profile.

Composes with today's plausibility guard rather than bypassing it: the
overrides land in the same columns `implausibleLifts` already reads, so a
goal claiming a 300kg deadlift is flagged exactly like an onboarding one.
Onboarding stays the base; a goal baseline overrides it — the more recent,
more specific statement, matching the memory-wins rule used elsewhere.

## 4. The profile screen contradicts this morning's fix

`factEffect` still labels a soft food dislike "biases suggestions — nothing
removed", which is false since the compiler change, and the "foods you won't
eat" editor filters to hard only, so a soft-filed ban is enforced but missing
from the list of what is banned. Both read hardness where they should now read
polarity.

## 5. Failed cardio logs are unreachable

A cardio log that exhausts its retries is marked failed in local storage.
`getPendingCardioFailures` / `retryFailedCardioLog` / `discardFailedCardioLog`
all exist and none has a caller, so the log is invisible and unrecoverable.
Surface it where cardio is logged, with retry and discard.

## Verification

Gates for each, each with mutations that must bite. The swap fix gets the
strongest: a pool containing a banned option, proven un-offerable, and the
empty-after-filtering case proven to offer new options rather than dead-end.
Plus a standing check that the orphan class cannot return — every compiler in
`fact-compiler.ts` must have a production caller.

## Deploy

All client-side. Vercel push, no edge function, no migration.
