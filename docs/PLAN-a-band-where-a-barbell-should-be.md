# A band where a barbell should be

## Context

An LLM coach review flagged a **full gym** user prescribed **Band Shoulder
Press** for a tier2 compound slot. The reviewer's objection — bands lose
tension at the bottom — is a fair training point but not the one that bites.

The one that bites: a resistance band is not in `LOADED_EQUIPMENT`
(`load-prescription.ts:660`), so **the app shows no weight at all**. The
weight column that carries a lift's entire progression story is simply blank,
and the lift can only progress by reps — while a barbell sits unused in the
same pool.

### Measured, before anything changed

`npm run report:band-slots`, 18,909 main/secondary slots across 4 equipment
tiers x 3 experience levels x 3 splits x 4 goals x 3 durations x 3 injury
sets:

| count | case |
|---|---|
| **906 (4.79%)** | **band in a main/secondary slot with a real weight available the same day** |
| 125 | band where nothing loaded was available — correct, nothing to fix |
| 352 | band that is rehab-INDICATED for the trainee's flagged joint — correct and deliberate |

By tier: minimalist 384 (8.03%), home_gym 320 (6.82%), full_gym 202 (4.16%),
bodyweight 0. The bodyweight zero is real, not a hole in the measurement —
`EQUIPMENT_SETS.bodyweight` is `['bodyweight', 'pull-up bar', 'weighted
backpack']` and contains no band at all.

Three exercises account for all of it: Spanish Squat 789, Kneeling Band Lat
Pulldown 471, Band Shoulder Press 123.

### Mechanism, traced

`scoreCandidate` (`exercise-plan.ts:1127`) weighs five factors — role support,
goal fit, experience fit, session balance, weekly variety — plus an
unconditional tier bonus. **Not one of them looks at the implement.**

`Dumbbell Shoulder Press` and `Band Shoulder Press` are both
`tier2_compound` / `vertical_push`, and score **identically on every factor**.
The winner is decided by the `(randomSource() - 0.5) * 0.6` tie-break jitter.
A coin flip, every time, for every one of the 906.

All four ranking call sites (`findForSlot`, `pickFromTier`, the cardio pass,
`refill`) funnel through `orderCandidates` -> `scoreCandidate`, so unlike the
main-lift rest floor this is a **single choke point**, not three.

## The build

A sixth weight in `scoreCandidate`: when a real weight is on offer for this
slot, a band loses to it.

```
if (candidate is tier1/tier2 compound
    && candidate is band-equipped
    && candidate is NOT externally loaded
    && candidate is NOT indicated for a flagged joint
    && SOME OTHER candidate in this same ranked list IS externally loaded)
  score -= BAND_WITHOUT_WEIGHT_PENALTY
```

Four properties, each load-bearing:

1. **"Some other candidate in this same list is loaded"** is what makes it a
   preference rather than a ban. A minimalist trainee whose only
   `vertical_pull` option is a band keeps it — demoting it would be demoting
   the only thing left. Computed once per `orderCandidates` call from the
   candidate list itself, so it is scoped to the actual slot being filled,
   not to the pool in general.

2. **The rehab exemption.** Spanish Squat is a patellar-tendon rehab tool
   (`indicated_joints: ['knee']`); Kneeling Band Lat Pulldown is shoulder-
   tolerable pulling. The rehab pass puts them in plans ON PURPOSE, and 352
   of the current placements are exactly that. This must never undo it, so an
   indicated candidate is exempt.

3. **Tier1/tier2 only.** A band in a tier3 isolation slot (Band Pull-Aparts,
   Band Face Pulls) is the right tool and stays untouched.

4. **Magnitude 12** — comfortably above the jitter (0.3) and above anything
   the five factors can swing together (~5), and far below the 30-point gap
   between tiers, so a tier1 band still outranks a tier2 dumbbell. The
   penalty never reorders tiers, only implements within one.

**Kept out of `factors`**, following the tier bonus's own precedent: it is
baseline structure ("of course we use the real weight if you have one"), not
a non-obvious coaching call, and `explainWinner` would otherwise cite it on
nearly every affected pick.

### Deliberately NOT done

**Bodyweight is untouched.** The narrow rule is "a real weight beats a
BAND", not "a real weight beats anything unloaded". Pull-Ups, Dips and
Push-Ups are legitimate main lifts with their own progression (harder
variations), and demoting them for a full-gym trainee would be a far larger
change than the one asked for. Flagged here rather than assumed either way.

## Verification

- **`npm run report:band-slots`** before/after. Target: the first column
  goes to ~0; **the third column must stay at 352** — a change that drove
  the headline down by eating the rehab placements would read as success.
- **New gate `npm run test:band-slots`**:
  - a full-gym trainee gets no band in a main/secondary slot;
  - a band that is the ONLY option for its pattern is still selected (the
    over-fire check);
  - a knee-injured trainee still gets Spanish Squat, and a shoulder-injured
    trainee still gets its band rehab — the exemption is real, not accidental;
  - tier3 band placements are unchanged;
  - a band never outranks its own tier — no tier reordering.
- **`test:audit` must stay 0 / 13,967.** Swapping a band for a dumbbell
  changes `avg_duration_seconds`, so this is a duration risk.
- **`test:quality` before/after** — currently 11.20. Watch `Selection`
  (1.94) and `Time fit` (1.63).
- `test:injury-rebuild`, `test:rehab-prescribed`, `test:joint-tags`,
  `test:slot-replacement`, `test:frozen-weeks`, `test:session-length`,
  `test:mesocycle-roundtrip`, `test:per-side-load`, `test:starting-out`,
  `tsc -b`, `npm run build`.
- **No deploy** — engine only, ships with the Vercel push.
