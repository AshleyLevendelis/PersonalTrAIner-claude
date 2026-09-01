# The machine floor — exercise catalogue expansion (injury path)

**Status: BUILT, same session (1 Sep 2026) — see the machine-floor entry in
BACKLOG.md for the measured outcome.** One deliberate addition over the table
below: Machine Shrug (15 entries, not 14) — the shrug group already existed,
so the stack version cost one mirrored entry. Ashley, 1 Sep 2026:
*"many times I've used the app in the gym and a machine I've wanted to use
was busy so I've used another machine instead but that machine or exercise
wasn't an available swap in the app so I wasn't able to record it."* New
entries carry injury tags, so per CLAUDE.md this gets a written plan first;
the build proceeds under her explicit go-ahead.

## What the investigation established

- **The swap flow is not the problem.** The search box in both swap surfaces
  covers the whole catalogue, unfiltered by equipment/injury/style — by
  design, with warnings rather than blocks on a constraint clash. Nothing
  needed widening (task closed as "no change").
- **The catalogue is the problem.** 185 entries, only ~32 machine-type. A
  standard commercial floor's busy-machine substitutes are simply absent:
  no Smith machine (any exercise), no preacher curl, no hip
  abduction/adduction machines, no glute kickback machine, no assisted dip,
  no belt squat, no shrug machine, no cable pull-through, no landmine row,
  no dumbbell pullover, no dedicated back-raise bench.
- Two incidental defects to fix while here: `searchExerciseCatalog` doesn't
  skip `retired` entries (the one retired entry is selectable via search),
  and the swap search's affordance doesn't advertise that it reaches the
  whole catalogue — which is half of how "wasn't an available swap"
  happens on a phone in a gym.

## The batch — 14 entries, aimed at "the machine I wanted was busy"

For each, the safety fields mirror the named sibling and deviate only where
the implement genuinely differs. Every entry gets: correct
`movement_pattern` (all already have `categorize` cases — no new fall-through
risk), `mechanics_tier`, `prescription_type`, joint tags
(`loads_joints`/`contraindicated_joints` per the 3-way model),
`substitution_group` (existing groups wherever possible, so ranked swaps
find them), and a `SKILL_DEMAND` entry where non-low.

| New entry | Busy-machine substitute for | Safety sibling |
|---|---|---|
| Smith Machine Squat | Barbell Squats / Hack Squat | Barbell Squats (guided bar: same joints, lower skill) |
| Smith Machine Bench Press | Barbell/Machine chest press | Barbell Bench Press |
| Smith Machine Shoulder Press | Shoulder Press Machine | Overhead Press |
| Preacher Curl (EZ bar) | Cable/Dumbbell curls | Barbell-style curls (isolation_bicep) |
| Machine Preacher Curl | same, stack version | as above |
| Hip Abduction Machine | Band/side-lying abduction | Standing Band Hip Abduction |
| Hip Adduction Machine | (no current sibling — new group) | Clamshell-adjacent, low stress |
| Glute Kickback Machine | Hip thrust / RDL accessories | Bodyweight Hip Hinge family |
| Machine Hip Thrust | Hip Thrust (barbell) | Hip Thrust |
| Assisted Dip Machine | Tricep Dips | Pull-Ups (Assisted) pattern + Tricep Dips joints |
| Belt Squat | Leg Press / squats with a bad back | Leg Press (axial-load-free knee work) |
| Cable Pull-Through | Romanian Deadlifts | Romanian Deadlifts (lighter, cable) |
| Landmine Row | Barbell/T-Bar Rows | T-Bar Rows |
| Dumbbell Pullover | Straight-Arm Pulldown | Straight-Arm Pulldown (isolation_lat) |

Deliberately NOT added: GHD, reverse hyper, sled (uncommon outside
strength-specialist gyms — thin value per safety-tagging effort), and any
core machine (core carries no load anchor by this morning's ruling).

## Gates that must move, and how

- `test:categorize-precedence` — snapshot regenerated FROM the DB; the
  independent no-chest-fall-through check stays the guard against blessing
  a wrong bucket.
- `test:injury-coverage` — per-injury counts and the wipe table recomputed
  from the DB (the same honest re-measure as yesterday's refresh); any NEW
  wipe is investigated, not just recorded.
- `test:joint-tag-states` — the pinned lower-back exclusion count (12) will
  rise with Smith Squat / Pull-Through / Landmine Row; updated with the
  entries named.
- `test:audit` (13,967 combos) must stay at 0 failures; `test:workout`,
  `test:frozen-weeks`, `test:pattern-tags`, `test:lift-plausibility` green.
- Measured before/after: per-pattern alternative counts at full_gym (the
  busy-machine scenario), so the claim "more substitutes" is a number.

## Also in this change

- `searchExerciseCatalog` skips `retired` (+ a gate line pinning it).
- Swap-search affordance says what it can do: "Machine busy? Search all
  exercises" as the section label/placeholder in both swap surfaces.
