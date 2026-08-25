# The catalogue runs out in the gym

## Context

Ashley, testing in a real gym: a machine was busy, she tried to swap for
another machine that was physically in front of her, and the app didn't
offer it.

That is two separate defects stacked, and they fail in different situations.
Measured, not assumed — full-gym intermediate profile, `getConstrainedPool`
+ `getSmartReplacements`, the same functions the swap dialog calls.

### 1. The swap hides options that already exist

`MAX_SMART_REPLACEMENTS = 8` (`src/lib/exercise-db.ts`), and
`SwapDialog.tsx:62` shows `INITIAL_SHOWN = 4` with a "show more" toggle.

| pattern | real alternatives | offered | hidden |
|---|---|---|---|
| horizontal_push | 14 | 8 | **6** |
| activation | 14 | 8 | **6** |
| horizontal_pull | 12 | 8 | **4** |

**This is a repeat.** The cap carries its own comment: it was raised from 5
to 8 because *"a real user's swap dialog dead-ended — flat bench busy, only
incline offered, also busy — decline bench, which conflicts with nothing,
simply never made the cut."* Same defect, same shape, one number higher.
Raising it again to 12 would be the third round of the same mistake; the cap
should be removed as a *count* and the dialog should page instead.

### 2. The catalogue genuinely runs out — and not where you'd guess

15 of 18 movement patterns have **fewer than 8** alternatives, so the cap
never even binds there. The thinnest, by equipment tier:

| pattern | full_gym | home_gym | minimalist |
|---|---|---|---|
| **isolation_shoulder** | 1 | **0** | **0** |
| **isolation_trap** | 1 | 1 | 1 |
| isolation_quad | 3 | 2 | 2 |
| vertical_push | 4 | 4 | 2 |
| vertical_pull | 6 | 2 | 2 |

**A home-gym trainee prescribed Lateral Raises has nothing to swap to at
all** — the only other `isolation_shoulder` movement is Cable Lateral
Raises, which needs a cable machine. That is a harder dead-end than the one
Ashley hit, and nobody has reported it because the swap simply shows an
empty list rather than an error.

Catalogue totals: **135 exercises**, 131 available to a full-gym trainee,
of which only **8 are tier1 main lifts**.

### Machines genuinely absent, verified by name

`Chest Press Machine` (we have Incline Machine Press and Pec Deck, not the
flat one), `Shoulder Press Machine` (overhead pressing has **five**
exercises and **zero** machines), plate-loaded/`Machine Row`, `Hip Thrust`,
`Back Extension`, `Preacher Curl`, `Cable Crossover`, `Assisted Dip
Machine`, anything `Smith Machine`, and `Front Squat` (not a machine, but a
conspicuous barbell omission).

**Correction to my first pass:** I initially reported incline pressing as
missing. That was a substring-search artefact — `Incline Machine Press` and
`Incline Dumbbell Press` both exist. Corrected before it reached the plan.

## The safety-adjacent part, which is why this gets a plan

A new exercise's **starting weight is chosen by its NAME.**
`categorize()` (`src/lib/load-prescription.ts:358`) matches name substrings
first (`'chest press'` → bench, `'shoulder press'` → overhead, `'row'` →
row, `'pulldown'` → pulldown), and only falls through to a
`movement_pattern` switch when none match.

That fallthrough is sound today — every pattern maps to a sensible category,
and its comment records why: `Landmine Press` once fell through
`horizontal_push` and was prescribed **132.5kg to a man whose two-arm
overhead press is 80kg**, because `SAFETY_CEILING_KG` is keyed by category
too, so sitting in `bench` gave it a 220kg ceiling instead of overhead's
140kg. The lesson written there is the one that governs this round:

> *"The exercise was never the bug. The fallback was, and it was a trapdoor:
> any future overhead movement whose NAME missed that substring list would
> have fallen through it too."*

So **every new entry must be checked on both axes** — the name it matches
and the pattern it falls back to — and the check must be a gate, not a
reading. Two entries are known-risky before we start:

- **Hip Thrust** → `hip_hinge` → `hinge_accessory` (0.55 × deadlift 1RM).
  A hip thrust is normally *heavier* than an RDL, so this under-prescribes.
  Under is the safe direction, but it should be a deliberate scale rather
  than an accident.
- **Abduction / adduction machines have no movement pattern at all.**
  Inventing one touches split construction, push/pull balance and primer
  affinity. Tagging them into an existing pattern is worse: `isolation_quad`
  would price a hip abduction at 0.4 × squat 1RM — a real over-prescription
  in the dangerous direction. **Deferred to its own round**, named here
  rather than quietly dropped.

## The build

### Phase 1 — the catalogue, thinnest pattern first

Priority is driven by the measured alternative counts above, NOT by which
machine happened to be busy. The dead-ends are worst where the count is
lowest, and those are mostly *not* full-gym problems.

1. **`isolation_shoulder`** (0 alternatives off a cable machine) — Front
   Raises (dumbbell), Machine Lateral Raise, Band Lateral Raise. The band
   entry is what rescues home_gym and minimalist from zero.
2. **`vertical_push`** (zero machines) — Shoulder Press Machine, Push Press.
3. **`isolation_trap`** (1) — Trap Bar Shrug / Cable Shrug.
4. **`isolation_quad`** (3) — a machine and a band variant.
5. **`horizontal_push`** — Chest Press Machine, Cable Crossover.
6. **`horizontal_pull`** — Machine Row (chest-supported, plate-loaded).
7. **`hip_hinge`** — Hip Thrust, Back Extension.
8. **`knee_dominant`** — Front Squat, Smith Machine Squat.

Each entry needs the full `ExerciseEntry` contract (`exercise-db.ts:100`):
`id` (slug, collision-free), pattern, tier, `angle_vector`,
`primary_muscles`, `equipment` (+ `equipment_alternatives` when the
implements are interchangeable, not required together), `joint_stress`,
`form_cues`, `loads_joints`, `contraindicated_joints`, `style_tags`,
`substitution_group`, `unilateral`, `avg_duration_seconds`.

`EQUIPMENT_SETS.full_gym` is `null` (no filtering), so machine entries reach
full-gym trainees automatically and are correctly invisible to the other
tiers — which is exactly why the band/dumbbell variants above matter.

### Phase 2 — stop hiding what exists

Remove the count cap as the mechanism. The dialog keeps a short initial list
(it should not dump 14 options at a trainee mid-session) but "show more"
must reach **everything eligible**, not everything up to 8.

## Verification

- **Re-run the alternative-count measurement** per pattern per equipment
  tier, before and after, and report both. Target: no pattern at 0 in any
  tier, and `isolation_shoulder`/`isolation_trap` off 1.
- **New gate, `test:swap-coverage`**: every exercise in every equipment tier
  offers at least one legitimate replacement, and the swap list is never
  truncated below what's eligible. This is the check whose absence let a
  zero-alternative pattern ship.
- **`categorize()` gate for every new entry** — assert the resolved category
  AND the category its pattern falls back to, so a rename can't silently
  reprice a lift. Extends `test:pattern-tags`, which already has a trapdoor
  check of exactly this shape.
- **Load sanity per new entry**: prescribed weight for a 65kg intermediate
  female and a 90kg advanced male, read and eyeballed against the movement
  — the Landmine Press number was caught by a human reading it, not by a
  gate.
- `npm run test:audit` must stay **0 / 13,967** (it will grow — say so, the
  denominator changes when the catalogue does).
- `test:joint-tags`, `test:pattern-tags`, `test:injury-separation`,
  `test:slot-replacement`, `test:quality` before/after.
- **Metric warning to state out loud:** adding ~20 exercises changes the
  denominator of the audit and shifts selection across every plan. Quality
  and audit numbers from before this round are **not comparable** with
  numbers after it.

## Out of scope, flagged

- **Abduction/adduction**, per the reasoning above.
- **A search box in the swap dialog** — Ashley's fourth option. It would
  bypass the same-pattern, skill and injury guards, so what stays blocked
  needs deciding before it's built.
- **Only 8 tier1 main lifts.** Real, and a different question from swap
  coverage: it constrains what a program can be built *around*, not what a
  trainee can substitute mid-session.
