# One arm, both arms' weight

Chosen by Ashley on 2026-08-24 after the weigh-in rebuild offer shipped. The
target was the 51 remaining `load_cap` failures in `npm run test:audit`. The
audit now stands at **0 failures across all 13,967 combinations**.

---

## Defect 1 — the per-side rule had a hole

`prescribeLoad` decides whether a prescribed number describes one side or
both. It was written out by hand, at three separate call sites:

```ts
const perSideLoad = isDumbbell || (mode === 'single_implement' && entry.unilateral)
```

A cable lateral raise is `unilateral: true` — one arm at a time — but its
equipment is `'cable machine'`, which `loadingMode()` sorts into `stack`. So it
was never recognised as per-side, and **one arm was handed the number derived
for two**. Same defect already fixed once for one-arm kettlebell carries
(`isUnilateralSingleImplement` exists for exactly that); the fix never covered
weight stacks.

| Body | before | after | ceiling |
|---|---|---|---|
| 120kg advanced male | **37.5kg** — breach | 17.5kg | 25kg |
| 100kg intermediate male | 20kg | 10kg | 25kg |
| 50kg novice female | 5kg | 2.5kg | 25kg |

### The fix

One named `isPerSideLoad(entry)` covering all three shapes: a dumbbell pair, a
unilateral single implement, a unilateral weight stack.

The stack test keys on real machine equipment — `'cable machine' | 'machine' |
'leg press machine' | 'hack squat machine'`, already enumerated in
`LOADED_EQUIPMENT` — and **not** on `loadingMode() === 'stack'`. That value is
the fallback bucket: 18 of the database's 28 unilateral entries land in it and
17 of those are bodyweight or resistance-band work. Keying on the bucket would
have been right by accident and would have started halving band movements the
moment one became externally loaded.

Two consumers route through the same predicate:

- **`labelModeForEntry`**, or the number gets halved while its caption still
  says "total" — and the caption is what a trainee reads to decide whether to
  load one dumbbell or two.
- **`estimateEffectiveTotalKg`**, which doubles a per-side number back so two
  exercises can be compared like for like. It tested `'dumbbell'` only. Left
  alone, this change would have traded one audit failure for another: the
  newly-halved cable lift would read as half its real demand and the rotation
  guard would fire on it instead.

---

## Defect 2 — a block baseline surviving a rotation

Fixing the first made this one fire more (`rotation_relative_load` 3 → 9), so
it had to be root-caused rather than absorbed.

`blockBaselineKg` and `blockWeek3Kg` are keyed by `[dayIndex][exerciseIndex]` —
slot POSITION — but an accessory's variation rotates on a two-week sub-cycle
*within* the block. From week 3 the slot can hold a different exercise than the
one whose baseline is sitting in it.

The file already states the rule — *"a capped or broken anchor must never
propagate through a rotation"* — and implemented it as a 25% divergence
backstop. That backstop is porous in both directions:

1. its comparison is **exclusive** (`force > fresh * 1.25`), so a value at
   *exactly* 125% passes;
2. plate rounding then rounds that value **up**, after the check.

**Traced live** (temporary instrumentation, fully reverted): a 50kg advanced
female carried a 5kg `Cable Lateral Raises` baseline into `Lateral Raises`,
passed the backstop at exactly `5` against a `5.0` limit, and rounded to
**6kg** — 150% of a fresh estimate for the exercise actually in the slot.

### The fix

Name-key both trackers. A slot whose exercise changed simply has no baseline,
and weeks 2–3 fall through to a fresh estimate for the exercise that is really
there. This removes the cause instead of bounding the symptom — and it is
exactly the treatment `lastUnverifiedLoadingWeekKg` needed for the same reason,
one tracker over, earlier the same day.

---

## Measured

| | before | after |
|---|---|---|
| Total audit failures | 54 | **0** |
| `load_cap` | 51 | 0 |
| `rotation_relative_load` | 3 | 0 |
| Combinations passing | 13,913 / 13,967 | **13,967 / 13,967** |

The plan predicted `load_cap` → 0 and `rotation_relative_load` 3 → 1. The first
was right; the second was wrong in the harder direction — it went to 9 before
being root-caused, then to 0.

## Verified

- **New gate `npm run test:per-side-load`** — the rule on all three shapes and
  its non-firing on four (bodyweight unilateral, band unilateral, bilateral
  cable, bilateral single implement); label and rotation-comparison agreement
  across every entry in `EXERCISE_DATABASE`; the cable number under its ceiling
  and still a real prescription; and 286 real mid-block rotations checked for
  an inherited load. Runs in seconds where the full audit takes ~75.
- `test:audit`, `test:quality`, `test:workout`, `test:load-suggestions`,
  `test:assumed-body`, `test:weight-basis`, `test:slot-replacement`,
  `test:ramp-visibility`, `test:mesocycle-roundtrip`, `test:block-consistency`,
  `test:block-review`, `test:session-derive`, `test:dashboard`,
  `test:injury-separation`, `test:injury-adaptation-safety`,
  `test:starting-out`, `tsc -b`, `npm run build`.
- **No deploy** — client/engine only, ships with the Vercel push.

## Flagged, not fixed

**Landmine Press is prescribed 145kg for one arm** (120kg advanced male).
Larger than the cable defect and nothing catches it: `categorize()` routes it
to the `bench` family, which has no low-enough `SAFETY_CEILING_KG`. Halving
would give 72.5kg — but a landmine is a loaded bar END, so "halve it" may be
the wrong answer even though the movement is one-armed, and the `bench` scaling
is itself suspect. `test:per-side-load` asserts the current, deliberate state
so a later change to it is a decision rather than a drift. Needs its own plan.

**Backpack Row** is unilateral and externally loaded but already bounded by
`IMPROVISED_IMPLEMENT_CEILING_KG`; its raw estimate (102–120kg) trips the
existing clamp warning, a separate pre-existing finding.
