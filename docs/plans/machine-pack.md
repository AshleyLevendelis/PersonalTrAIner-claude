# The machine pack

3 Nov 2026. Ashley: "I want more exercises and machine options". Exercise selection is delegated (CSCS), so nothing
here was asked. Same shape as `docs/plans/dumbbell-pack.md`.

## Measured first

The catalogue had 216 entries. By movement and kit:

- **Single-leg work: no machine or cable option at all.** Ten entries, every one dumbbells or bodyweight.
- **Quad isolation: one machine** (Leg Extensions); the rest are bodyweight and rehab drills.
- One or two machine or cable options for overhead pressing, biceps, rear delts, calves and core.
- A full-gym bodybuilding pool held 54 machine or cable exercises.

## What is added

Fifteen entries, appended at the END of the catalogue so a tie between equally good candidates still goes to an entry
the app already had. Each copies its nearest entry's exclusions and is priced by an existing category, checked against
the model for four people (never heavier on the body, a per-side number counted twice):

| Entry | Kit | Priced as | Copies exclusions of |
|---|---|---|---|
| Seated Dip Machine | machine | isolation_tricep (as pushdowns: under a dip machine's real loads, the safe side) | Assisted Dip Machine (elbow, shoulder) |
| Machine Tricep Extension | machine | isolation_tricep | Dumbbell Tricep Kickback (elbow) |
| Cable Rear Delt Fly | cable, one arm | isolation_rear_delt, per side | Reverse Pec Deck (shoulder) |
| Single-Arm Cable Row | cable, one arm | row, per side | Seated Cable Row (none) |
| Iso-Lateral High Row | machine | row | Seated Machine Row (shoulder) |
| Iso-Lateral Pulldown | machine | pulldown (same family as Lat Pulldown) | Lat Pulldown (shoulder) |
| Cable Y-Raise | cable, one arm | isolation_shoulder, per side (lateral-raise family) | Cable Lateral Raises (shoulder) |
| Bayesian Cable Curl | cable, one arm | isolation_bicep, per side | Incline Dumbbell Curls (elbow) |
| Leg Press Calf Raise | leg press | isolation_calf | Standing Calf Raise Machine (ankle) |
| Smith Machine Split Squat | Smith | single_leg_dumbbell, a total | Bulgarian Split Squats (ankle, hip, knee); intermediate and up |
| Single-Leg Leg Press | leg press | leg_press, per leg | Leg Press (hip, knee) |
| Single-Leg Leg Extension | machine | isolation_quad, per leg | Leg Extensions (knee) |
| Cable Glute Kickback | cable, one leg | isolation_hamstring, per leg | Glute Kickback Machine (none) |
| Cable Crunch | cable | none: core progresses by reps, as every core move | Rotary Torso Machine (lower back) |
| Half-Kneeling Single-Arm Dumbbell Press | one dumbbell | overhead, per side | Dumbbell Shoulder Press (shoulder) |

Not added, each for a reason that would have needed a new rule:

- **Incline Cable Fly, and any two-handed cable move on two stacks.** The app shows one total, which reads as the
  weight on each pulley (double). Cable Crossover and Cable Flyes already do this (BACKLOG, 3 Nov).
- **Pendulum Squat.** No category fits it without a new pricing rule.
- **Two-handed cable Y-raises and rear-delt flies.** Written as one-arm moves instead, so the number is per side.

## Two engine changes the pack needed

1. **A one-leg press is capped at half the two-leg ceiling** (200kg a leg). `getLoadingCeilingKg` returned the two-leg
   400kg in the units of a per-leg prescription, so a 120kg advanced lifter at 3-5 reps got 227.5kg a leg, uncapped,
   while the same lifter is capped at 400kg on two legs. Only ever lowers a number.
2. **A rotation sees what the slots before it became.** Both rotations (block start and week to week) guessed each
   other slot's movement from its OLD name, assuming every member of a substitution group is one movement. The triceps
   group holds three (pushdowns, kickbacks, overhead work), so two slots could rotate into two pushdowns. Measured on
   1,024 grid plans: 24 repeated-movement days before today (18 pushdown, 6 press); 93 + 6 with the pack and no fix;
   0 with both fixes. Each fix is pinned by a plan it binds on.

Found, not fixed: 712 core-stability pairs (a plank with a bird dog, by the app's own duplicate rule) on the same
grid before today, 760 after the pack re-rolled picks, untouched by either fix (measured with them off). Mostly
beginner and bad-back plans, which the movement-family gate's intermediate sample never reaches.

## What the sweep found (3 Nov 2026)

- **Kept in proportion by the load on the body.** The coherence pass compared printed numbers, so a per-leg or
  per-hand figure (half the load) held a two-limb lift beside it down. Now compared on the body, as the scorer does.
  1,377 of 217,078 loaded slots in 181 of 1,024 plans rise toward their own price (median x1.33); none can pass it.
- **A coherence clamp records why** (`load_hold: 'coherence'`), so a held week is never a silent freeze. A machine
  exemption from the unilateral-vs-squat cap was measured and reverted: the cap was protecting an advanced lifter from
  127.5 kg a leg beside a 65 kg squat. Not done: the reps do not rise under a held clamp.
- The kneeling one-arm press ranks as a main lift (it lost the label to a swing on a Shoulders day).

## CSCS review

1. **Training effect.** A full-gym trainee gets one-leg machine work (a one-leg press, a Smith split squat), a second
   quad machine, one-arm cable options that train each side alone, and loaded abs.
2. **What it takes away.** Nothing is removed; full-gym plans re-roll some picks among more options. Measured by the
   full quality grid, not assumed.
3. **Fundamentals.** Pattern coverage unchanged or wider; progression is the existing load path.
4. **Floors and ceilings.** One ceiling moved, and only down: a one-leg press at half the two-leg ceiling. The
   coherence pass now compares the load on the body; it still only lowers, so it raises nothing past a lift's own
   price, and it now gives slightly LESS ground to a per-hand dumbbell number beside a machine (as it always meant to).
5. **Scope.** Exercise selection. Every exclusion copies its nearest entry; nothing new about a joint is decided.

## Gates

`test:machine-pack` (61 checks), `test:movement-families` §4, `test:ceiling-units`, and the full sweep (a catalogue
change). 7 mutations, 7 caught, two only after a check was strengthened (a one-arm row losing its one-arm flag; the
week-to-week rotation fix, which had no plan it bound on until the 1,024-plan measurement named two).
