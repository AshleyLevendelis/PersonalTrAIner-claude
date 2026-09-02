# Consolidation, and the capped bar

*Plan before build, per CLAUDE.md — this is load prescription and it adds a
training phase. Written 2 Sep 2026, straight after Ashley's answer.*

## The decision, and how it was reached

Two findings from the day's measurements turned out to be one block:

- A beginner's third block is called **Maximal Strength** and runs the main
  lift at **8-10 flat** — the same as their Hypertrophy block — because a
  beginner's rep floor is 8 and the block's −3 shift cannot go below it.
  `getPhaseSequence` calls this deliberate ("only the label and rep range
  differ"); the rep range does not differ either.
- In any Strength block, once the unverified ramp reaches the standards
  estimate, the rep bump that should take over could not move the range:
  it computed base + phase shift + bump and clamped to the floor, so a
  novice's 6-8 or a beginner's 8-10 stayed put. **75% of the remaining
  repeated barbell weeks** (4,298 pairs in 1,115 plans) sit exactly there.
  The weekly +1 ramp for reps-led lifts was swallowed by the same clamp
  (Pull-Ups, Chin-Ups, Glute Bridge, Push-Ups: 15,942 pairs).

Put to her as one question, four options: reps climb and rename
(recommended); hold flat and rename; reps climb and keep the name; leave
both. **She chose "reps climb, rename the block."** Decision log: asked,
answered; the cost was stated in the question (a beginner's block reads
8-10 up to 11-13; novice and intermediate capped-bar weeks up to 9-11).

This is her earlier ruling — *"buy a rep with the week"* — applied where the
arithmetic had been blocking it, plus a true name for the one block whose
heading the change would otherwise make lie harder.

## Half one: a floor is a minimum, not a value

This is the variant tried and withdrawn this morning, now sanctioned. The
week's reps are computed in two steps: the phase's range first (base +
phase shift, clamped to the rep floor), then the weekly ramp climbs FROM it;
the frozen-load bump climbs from the week's own displayed range. Arithmetic
is unchanged wherever no floor binds. Where one does — the experience floor
under a negative phase shift, and the two main-lift floors — the ramp and
the bump now work above the floor instead of vanishing into it.

`floorLift` (this morning's constant lift for the main-lift floors) becomes
redundant under the two-step and is removed: a clamp that the ramp and the
bump climb from does the same job for every floor at once, with one
mechanism instead of two.

Measured this morning when tried: repeated-week plans 5,787 → 4,138, the
whole bodyweight class to zero, and Strength main lifts outside the block's
promise 0% → 17.5% (beginners at 10-12 / 11-13, novices at 9-11 when capped).
The first half of that is the point; the second is the cost she accepted,
and the rename below removes the largest part of it from under a "Maximal
Strength" heading.

## Half two: 'consolidation', a real phase key

From the read-only trace: the phase KEY is never persisted — only
`phase_label` / `phase_focus` strings are — and `shortPhaseLabel`, the block
rail, the coach brief and three label-literal gates all key on the label. A
label override at stamping time would create a stored name with no entry in
`PHASE_CONFIGS`, the "second vocabulary" `test-block-phases` exists to
forbid. So it is a new key:

- `periodization.ts`: `'consolidation'` added to `TrainingPhase`; a
  `PHASE_CONFIGS` entry cloned from strength's (rest +45s kept, or every
  beginner plan's exercise count moves via `sizeBlockToRestBudget`;
  `target_rpe` 8.5 kept, the beginner ceiling of 7 still applies; `rep_shift`
  −3 kept — inert for a beginner and identical in intent) with its own
  label, short label, focus and coach notes written for what the block
  actually is for a beginner: the same lifts under heavier intent, longer
  rests, technique under load; a `PHASE_TEMPO` entry equal to strength's;
  `getPhaseSequence`'s beginner return uses it in place of `'strength'`.
- `goal-policies.ts`: `PHASE_FALLBACK.consolidation` = strength's fallback;
  added to the hypertrophy and functional `allowedPhases` (the two goals
  whose beginner sequence reaches it — fat loss goes metabolic, conditioning
  keeps its own). Deliberately NOT added to `ALL_PHASES` or
  `BODYWEIGHT_ALLOWED_PHASES`, so dedupe can never hand it to a non-beginner
  and a bodyweight beginner keeps today's block 3.
- `load-prescription.ts`: the two places that key set-ramping and added
  load on `'strength' | 'power'` learn `'consolidation'`, so the only things
  that change for a beginner's block 3 are its name and its reps.
- Scripts that enumerate phases literally: `test-block-phases` (`PHASES`),
  `test-loadless-notes`, `report-rep-ranges-by-phase` (`PHASE_ORDER`; no
  promise — the block makes none).
- Existing beginners keep "Maximal Strength" until a full regeneration
  (`plan-adaptations.ts` re-pins the stored label on in-place rebuilds).

## Gates

- `test-block-phases` §7: across goals × equipment × experience, a
  beginner's third block is Consolidation and never Maximal Strength or
  Power, and no non-beginner ever sees Consolidation. Mutations: revert the
  beginner return → 6 wrong blocks and 24 heavy headings on beginners (red);
  add consolidation to the dedupe pool → **not red**: the pool's priority
  order never reached it in the sweep, so that check is a guard, not a
  proven one. Recorded as such.
- `test-block-phases` §6 (floors): beginners now included in the
  "floor does not freeze" pairs — the exclusion existed only because the
  experience floor swallowed the ramp, which is the thing this fixes.
  Mutation: revert the two-step → 72 stuck (red).
- `test-frozen-weeks` §5 re-based to the new numbers with the change
  called out; §7 unchanged.
- `test:audit` 17,423 / 0; `test:quality` ≥ 11.48 with 0 below floor.

## Measurement

BEFORE (item 2's AFTER, same grid, same seeds): repeated-week plans 5,467
(59.3%), pairs 41,092; bodyweight class 15,942; ceiling/range_fixed 4,298;
Strength main lifts outside the block's promise: 4 slots in 2 plans.

AFTER — repeated-week plans **5,467 → 4,138 (59.3% → 44.9%)**, frozen pairs **41,092 → 23,627**; the bodyweight class **15,942 → 0** (Pull-Ups, Chin-Ups, Glute Bridge, Push-Ups — every one now climbs) and the 'no permitted bump can move the range' class **4,298 → 0**; what took their place is bars at the standards ceiling with the bump at its cap of three (1,164 → 3,984, designed: three reps bought, then held with the sentence that says why). Barbell Bench Press 1,826 → 978 pairs, 794 → 318 plans. Every remaining repeated pair is a carry at its distance cap (12,393), an implement cap (4,822), a capped bump (3,984), a band decline (1,581), or the matched cascade (498) — named, all of them. **The cost, measured:** Maximal Strength main lifts outside that block's promise 4 slots → **522 (3.1%), 463 plans (5.0%)** — novice and intermediate capped-bar weeks at 9-11, exactly as put to her; beginners no longer appear under that heading at all (their block now reads Consolidation: 11-13 40%, 10-12 31%, 8-10 18%, 9-11 11%). Hypertrophy and Metabolic Conditioning main lifts: 0 outside their floors, unchanged. `test:audit` 17,423 / 0. `test:quality`: Overall average: 11.54 / 12 (11.48 before); Plans below the 7.2 floor: 0 / 9216; its own frozen-week tally 4138 plans (44.9%), matching the measurement
