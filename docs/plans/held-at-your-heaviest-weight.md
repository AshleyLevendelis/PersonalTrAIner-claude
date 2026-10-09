# Held at your heaviest weight

*Plan before build, per CLAUDE.md: this is load prescription and progression.
Written 9 Oct 2026 from test log H18 ("Dumbbell Rows are also at 24kg per hand
in week 2, which is Sam's maximum with 14 weeks to go") and a measurement run
the same day. The first part below is BUILT; the levers are NOT.*

## What was wrong

A person who has told the app their heaviest dumbbells are 24kg is never
prescribed more. That part is right. What was missing:

- **Nothing recorded why the weight had stopped.** The prescription's "hold"
  reason was only ever set for a backpack's strap limit. A dumbbell pinned at
  a stated limit read as held by nothing — or, once the estimate caught up, as
  "at your estimate's ceiling", whose sentence promises *"log a set and the
  number can start moving again"*. Untrue for somebody with nothing heavier to
  pick up.
- **On the weeks it bought a rep, the sentence beside it said "Add 2kg next
  time"** — an instruction he cannot follow.
- **A bag held by what its owner said it holds** carried no reason at all,
  under *"I have no way to know what your bag actually holds"*.

## Built on 9 Oct 2026 (mechanical; in this branch)

- A new hold reason, `stated_limit`: the weight on the plan is AT the heaviest
  dumbbell, kettlebell or bag load the person has stated. "At", not "clamped
  to", so a week re-anchored to the limit from a logged set is covered too.
- The sentence beside the weight: *"Held at your 24kg dumbbells — the heaviest
  you've told me you have. The reps go up instead."* (a bag: *"Held at 10kg —
  as much as you've told me your bag holds…"*). It replaces every sentence
  that told the person to add weight or to log a set to move it.
- The card's label: **"held at your 24kg dumbbells"**, shown every week the
  weight sits there, including weeks where a rep is being bought and after a
  set is logged — unlike the three existing labels, which describe a week with
  nothing left to add and stay silent while a lever is moving.
- The coach is told the same fact, and told not to call it progress.

"The reps go up instead" is a description of what the plan already does: when
a weight does not move from one loading week to the next, generation buys a
rep (up to three above the phase's range).

Held by `test:load-ceilings` §9 (the reason, the sentence, the label, the
coach's note, and a whole generated plan with 77 slots at the limit) and
`test:calibration-search` §6.

## What is still wrong, measured

72 seeded plans — Minimalist and Home gym, bodybuilding and hybrid, two
goals, three experience levels, dumbbell limits of 10, 16 and 24kg — all
sixteen weeks:

| | |
|---|---|
| Loaded slots | 17,314 |
| ...sitting at the stated limit | **3,886 (22%)** |
| ...of those, a rep was bought that week | 1,290 |
| ...of those, NO lever moved (reps capped, or the range could not move) | **1,713 (44%)** |
| ...of those, carrying a tempo | **0** |
| Block-to-block pairs with the same lift at the same held weight | 1,012 |
| ...where the new block STARTS ON FEWER REPS | **444 (44%)** |

Three findings in that table.

1. **Nearly half the held slots are flat.** The rep lever is capped at three
   reps above the phase's range, by design, and resets each block. After that
   there is nothing: same weight, same reps, now with an honest label.
2. **Tempo is never used.** It is the app's lever for "no more load to add",
   and Ashley has ruled on exactly this for a backpack ("slow the movement
   down"). But the test it uses reads the backpack's built-in limit by
   experience, not the person's own stated limit — so a 24kg dumbbell at its
   owner's limit, and a bag at the 10kg its owner says it holds, both miss it.
3. **A new block can make the lift EASIER.** A strength block shifts the rep
   range down by three, because the weight is meant to go up. At a held
   weight it cannot, so the block opens with the same 10kg for 9-11 where the
   last one closed on 11-13 or more. Example from the run: *Dumbbell Floor
   Press, 10kg: Hypertrophy 11-13 → Maximal Strength 9-11.* That is less work
   at the same load, under a heading that says "Maximal Strength". The same
   fault was fixed for holds on 9 Oct (a rep shift trades reps against load;
   with no load to trade it is just less).

## The rule (decided as a CSCS coach; NOT built)

When external load cannot rise, overload is progressed through the other
variables, in this order. Basis: progressive overload is a property of the
training stimulus, not of the number on the implement; volume, time under
tension and leverage are the standard substitutes once equipment caps load,
and each is exhausted before the next is added so one thing changes at a time
(the app's own "one lever at a time" rule).

1. **Reps, to the top of the bracket and a little beyond.** As now: up to
   three above the phase's range within a block.
2. **The phase's rep shift never LOWERS reps on a held lift.** A held lift
   opens a new block on at least the reps it could close the last one on —
   the same decision made for holds, for the same reason. (Reps may still
   rise in a higher-rep phase.) The block's name on screen has to stay true:
   a "Maximal Strength" block in which most lifts are held is the case
   `consolidation-and-the-capped-bar.md` already renamed for a beginner; the
   same answer applies.
3. **Tempo, once reps are capped.** The block's own tempo (3-0-1 in a
   hypertrophy block, 4-1-1 in a strength block), which is the existing lever
   and Ashley's existing ruling, with the condition widened from "a backpack
   at the built-in limit" to "any implement at the limit that actually binds
   for this person".
4. **A harder variation of the same pattern**, offered rather than applied:
   paused reps, one-and-a-half reps, a single-leg or single-arm version where
   the catalogue has one (Romanian Deadlift → single-leg RDL; goblet squat →
   split squat). This is an exercise change, so it goes through the block
   review as an offer the person confirms, never silently.
5. And, separately, **say that heavier kit would help** — once, at the block
   review, not every week.

### The CSCS review

1. **Training effect.** Restores progression on roughly a fifth of loaded
   slots for limited-kit trainees, where today 44% are flat and 44% of block
   changes are a step back.
2. **What it takes away.** Time: a 4-1-1 rep takes 6 seconds against the 3.5
   the duration model assumes, so tempo on held lifts lengthens sessions. The
   backpack plan flagged the same risk and measured it; this must too, per
   session length, before anything ships. Something else will be trimmed to
   pay for it — count what.
3. **Fundamentals.** Overload restored; recovery unchanged in volume, raised
   in time under tension, so the deload must still be lighter (tempo is
   already off on deload weeks).
4. **Floors and ceilings.** `MAX_FROZEN_LOAD_REP_BUMP` (three) keeps its
   meaning. The "at the limit" test gains a second definition of the limit;
   the gate that holds the backpack case (`test:tempo-prescription`) must be
   shown still to bite on it. Rule 2 changes what a phase's rep shift means
   for one class of lift — the same kind of quiet redefinition that question
   exists to catch — so the phase-rep report (`report-rep-ranges-by-phase`)
   is re-run and compared.
5. **Scope.** Inside. Nothing clinical.

## How it would be built, and measured

- `isTempoEligible` (one predicate since 9 Oct) reads the limit that binds:
  the lower of the built-in one and the stated one. Needs the profile, which
  generation has and `applyReplacement` now receives.
- Rule 2 in the week loop of `generateMesocycle`: for a lift whose natural
  weight is at a stated limit, the phase shift is floored at zero relative to
  the previous block's closing range.
- Rule 4 is block-review work and needs a "harder variation" relation in the
  catalogue; not part of the first build.
- Measure with the script behind the table above (72 plans, then the limited-
  kit slice of the quality grid): held slots with no lever, block changes that
  start lower, minutes per session before and after, and what the time-cap
  trimmer removed to make room.

Gates: `test:tempo-prescription`, `test:frozen-weeks` (slow; ~150 s),
`test:session-length`, `test:filler-yields`, `test:load-ceilings`,
`test:block-phases`, `test:deload-lighter`, `test:quality`.

## Questions for Ashley

**1. Someone logs more than the limit they gave (30kg with a 24kg limit).**
Today nothing is said unless it is wildly over (your 8 Sep ruling: warn above
one and a half times, a borrowed heavier pair passes without a word).

- A. As now.
- B. Log it, then ask once: "Heavier than the 24kg you told me — new
  dumbbells?" One tap raises the limit. It never blocks the set.
- C. Warn before logging anything over the limit.
- **Recommended: B.** It never gets in the way, and the app learns the one
  fact that would let the plan move again.

**2. The words.** "held at your 24kg dumbbells" on the card, and "Held at
your 24kg dumbbells — the heaviest you've told me you have. The reps go up
instead." beside the weight. Both are in the app now and are yours to change.

**3. When a lift has been held for a whole block, should the app suggest
heavier kit?**

- A. Never; work with what they have.
- B. Once, at the end of a block: "your rows have been at your heaviest
  dumbbells for four weeks — a heavier pair would let them move again."
- **Recommended: B.**
