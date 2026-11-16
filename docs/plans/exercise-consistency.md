# Same exercises all block; main lifts kept across blocks

His question, 16 Nov 2026: "Should it be the same exercises every week?" He quoted Gemini's answer: within a 4-week
block, yes; across blocks, keep the main lifts and rotate the accessories. His "Yes" to planning the change.

## What the app does today (measured, 108 seeded plans: 4 goals x 3 experience levels x 3/4/6 days x 3 styles)

| | kept |
|---|---|
| Main lifts, week to week inside a block | 100% |
| Accessories, week to week inside a block | 79.4% (new ones at week 3: 3,435; week 2: 836; week 4: 821) |
| Main lifts, into a new block | 45.5% |
| Accessories, into a new block | 51.5% |

## Why (traced; file:line in the trace report, summarised)

1. **Across blocks, every slot is re-rotated from the base week by block number** (`exercise-plan.ts:7840`, picker
   `periodization.ts:455`): an alphabetical list of variations, index + block number. A main lift with two or more
   eligible variations changes at EVERY block boundary. Nothing scores the choice and nothing carries the last
   block's pick forward.
2. **Inside a block, accessories rotate on a cadence** (`exercise-plan.ts:8073-8078`, `goal-policies.ts`
   `accessoryRotationWeeks`): 2 for hypertrophy, fat loss and conditioning (swap at week 3); 1 for functional (swap at
   weeks 2, 3 and 4, the deload included). Beginners and novices are exempt.
3. **The plan-quality score rewards that rotation**: `accessory_never_rotates` (`quality-score.ts:790-824`) takes
   points off a plan whose accessories do not change between weeks 2 and 3.
4. **No ruling of his introduced any of it.** VISION.md:41-42 says "movement patterns stay consistent while
   variations rotate"; the code's own comment at `:7814` says variations rotate once per block, which the weekly
   rotation contradicts.

## The coaching call (mine, under the CSCS delegation; basis below)

- **A. No exercise changes inside a block.** Every slot keeps its exercise for all four weeks, the deload included.
  Progress is then read off the same movement four times: weight, reps or cleaner technique.
- **B. Main lifts are the anchors across the whole plan.** The first one or two compound lifts of each day keep their
  exercise from block to block; only sets, reps, rest and tempo change with the phase.
- **C. Accessories rotate at block boundaries**, as now (about half change), which keeps joints and interest fresh
  and keeps VISION's "variations rotate".

Basis (NSCA periodisation practice): adaptation to a lift needs repeated exposure (neural learning dominates the
first
weeks of a new movement), and progressive overload can only be judged on the same movement. A new accessory at week 3
of 4 gets two sessions before the block ends, too few to progress. Rotating accessories between blocks limits
repetitive-strain overuse at little cost, while rotating the main lifts every block erases the strength record the
plan is meant to build.

The five questions:
1. **Training effect:** more practice on each lift, and progression that can actually be read.
2. **What it takes away:** some novelty inside a block. A functional trainee loses the weekly change their goal text
   promises (his call, below).
3. **Fundamentals:** pattern coverage is unchanged (the same slots); overload gets better; recovery is unchanged.
4. **Floors and ceilings:** none redefined. But the quality score's meaning changes (below), and a kept main lift
   crosses a phase change into a new rep target, so its starting weight at each block needs re-checking (today it
   re-estimates fresh each block; the by-name step cap carries over).
5. **Scope:** inside it.

## What changes

- `exercise-plan.ts:8073-8078`: no weekly rotation (or every `accessoryRotationWeeks` set to at least 4).
- `exercise-plan.ts:7840`: main slots (classified from the BASE day, before rotation) pass offset 0; accessories keep
  rotating by block.
- The kept main lift's first week of a new block is priced from the end of the last loading week, adjusted to the new
  rep range, under the same ceilings (the "carry into the next block" rule already offered on screen), never a fresh
  guess. Measured on the block-transition audit before and after.
- Stale comments, the unused `mainRotationWeeks`, and the deload branch that exists only because functional rotated
  in week 4.

## His decisions (not mine: wording and what a score means)

1. **Functional's promise.** Its weekly note says "exercises rotate faster". Under A it would not be true. Options:
   reword it to what it will do (my recommendation), or keep weekly rotation for functional only.
2. **The plan-quality score.** `accessory_never_rotates` must go and be replaced by its opposite ("an exercise changed
   inside a block"). That changes what the score measures: quality numbers before the change stop being comparable.
3. **"Your next block starts and your plan changes exercises"** (the whole-block swap sentence, his 10 Oct ruling):
   still true of accessories, no longer of main lifts. It would become "...when your next block starts and some
   exercises change", unless he prefers otherwise.

## Verification

- The 108-plan measurement re-run: inside a block 100% kept for every tier; main lifts 100% across blocks (except
  where kit or an injury forces a change); accessories still rotate at boundaries.
- `test:quality` (9,216 profiles) with the new rule, compared to the last run; `test:audit` (the block-transition
  jump), `test:frozen-weeks` (a held exercise must still progress load or reps), `test:block-swap-reach`,
  `test:ramp-up-visibility`, and the gates that read the changed files.
- A new gate holding A and B, mutation-tested.
- A screen check of a block boundary in the Full Program list.

Needs no deploy beyond the frontend: plans are built on the phone. Existing plans keep their exercises until rebuilt.
