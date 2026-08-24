# A one-arm press scaled off the bench press

The item `docs/PLAN-one-arm-both-arms-weight.md` found and deliberately did
not fix. Picked up by Ashley on 2026-08-24.

---

## The defect

`Landmine Press` was prescribed **132.5kg** to a 120kg advanced male at 8–10
reps / RPE 7–8. That same trainee's two-arm barbell **Overhead Press** is
80kg. A one-armed press at **1.66× the two-arm press** — the largest load
error left in the engine, and nothing caught it.

### It was never the exercise. It was a pattern fallback.

`categorize()` picks a strength standard by matching words in the exercise's
NAME, then falls back on `movement_pattern`. The fallback collapsed two
patterns into one case:

```ts
case 'horizontal_push':
case 'vertical_push':
  return 'bench'
```

Right for horizontal push — that *is* the bench. Wrong for vertical push,
which is overhead pressing and has its own, materially lighter standard
(0.65 vs 1.0 × bodyweight at intermediate).

Measured across the whole database, only one exercise was actually reaching
the fallback — the other three vertical pushes are caught by the name rules
above it:

| vertical_push exercise | standard used | 120kg advanced male |
|---|---|---|
| Overhead Press | overhead ✓ | 80kg |
| Dumbbell Shoulder Press | overhead ✓ | 40kg/hand |
| Arnold Press | overhead ✓ | 40kg/hand |
| **Landmine Press** | **bench** ✗ | **132.5kg** |

Those three are correct **by their names**, not by construction. Any future
overhead movement whose name missed that substring list would have fallen
through the same trapdoor.

**Why no guard caught it.** `SAFETY_CEILING_KG` is keyed by category. Sitting
in `bench` gave the landmine a 220kg ceiling, which 132.5kg passes cleanly.
Its real category `overhead` has a 140kg ceiling.

## The fix

One line — split the case:

```ts
case 'horizontal_push': return 'bench'
case 'vertical_push':   return 'overhead'
```

Landmine Press then resolves to the overhead standard directly, with no new
`DERIVED_COMPOUND_SCALE` entry, and inherits the tighter ceiling so a future
regression is caught by the audit rather than by someone reading a plan.

| Body | before | after | their own 2-arm OHP |
|---|---|---|---|
| 120kg advanced male | 132.5kg | **80kg** | 80kg |
| 100kg intermediate male | 75kg | **47.5kg** | 47.5kg |
| 80kg novice male | 45kg | **30kg** | 30kg |
| 50kg novice female | 20kg | 20kg (empty bar) | 20kg |

## Deliberately NOT halved

`Landmine Press` is `unilateral: true`, so the obvious move was to add barbell
to `isPerSideLoad`. Two corrections oppose and roughly cancel:

- one arm presses, so the hand handles about **half** what two arms can;
- the far end sits in a floor pivot that carries part of the load, so the
  **bar-end number reads higher** than what the hand feels.

Modelling each separately means inventing a lever coefficient and a per-side
factor and hoping the product is right. Using the overhead standard directly
asserts only that they cancel — the weaker and more defensible claim — and
turns the question into an invariant that needs no coefficient at all.

## The invariant, gated

**A one-arm landmine press must never be prescribed more than the same
trainee's two-arm barbell overhead press.** Checked across five bodies and
three rep/RPE brackets in `npm run test:per-side-load`, alongside the trapdoor
itself: every `vertical_push` entry in the database must resolve to
`overhead`, `horizontal_push` must still resolve to `bench`, and the three
name-matched lifts must be byte-identical to before — a fix that moved
correct numbers would be a regression wearing a fix's clothes.

Same shape of reasoning the file already uses for `overhead_carry`: *"if you
can't press 10kg overhead for reps, you cannot hold 36kg overhead and walk."*

## Verified

- `npm run test:audit` — **0 failures across 13,967 combinations**, held. The
  landmine's ceiling tightened 220 → 140kg in the process, so this also
  proves the new number clears the stricter bound.
- `test:per-side-load` (extended), `test:workout`, `test:load-suggestions`,
  `test:assumed-body`, `test:weight-basis`, `test:mesocycle-roundtrip`,
  `test:block-consistency`, `test:block-review`, `test:ramp-visibility`,
  `test:slot-replacement`, `test:session-derive`, `test:injury-separation`,
  `test:dashboard`, `test:no-forked-state`, `tsc -b`, `npm run build`.
- **No deploy** — engine only, ships with the Vercel push.

## The judgement call, flagged

The overhead standard at full scale puts the landmine **level with** the
two-arm barbell press rather than below it: the closest case in the gate is
87.5kg against 87.5kg, holding with zero margin. I believe that is right —
the pivot genuinely does carry load — but it is the least certain number in
this change. The conservative alternative is a `DERIVED_COMPOUND_SCALE` entry
at `{ parent: 'overhead', scale: 0.8 }`, giving 64 / 38 / 24 / 20kg. The
file's own doctrine is that too light costs a boring set and too heavy costs
a shoulder, so this is worth revisiting if a real trainee finds it heavy.

## Still open

- The wider `categorize()` substring-routing audit: every rule that keys on a
  name fragment rather than a structured field. This change fixed the one
  confirmed instance and closed its pattern fallback; the full sweep is its
  own report.
- Load ceilings by equipment tier; the injury rebuild-vs-remove decision.
