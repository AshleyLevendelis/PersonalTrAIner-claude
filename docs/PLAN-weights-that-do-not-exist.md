# Weights that don't exist

## How this was found

`test:quality`'s console output, not a gate. A full sweep logged **357,497**
instances of this warning, which `prescribeLoad` prints itself:

> *"computed 78kg, above the 48kg realistic ceiling for its implement —
> clamping. This is a safety net, not a fix: something upstream produced a
> wrong number and should be traced, not just the clamp trusted."*

Nobody traced it. The clamp has been absorbing the symptom, which is exactly
what its own comment warned against.

Seven exercises account for all of it:

| Exercise | median computed | ceiling |
|---|---|---|
| Kettlebell Swing (Heavy) | 78kg | 48kg |
| Romanian Deadlifts | 72kg | 50kg/hand |
| Bulgarian Split Squats | 58kg | 50kg/hand |
| Single-Leg Dumbbell Calf Raise | 50kg | 48kg |
| Calf Raises / Seated Calf Raises | 102.5kg | 100kg |
| Kettlebell Swings (primer) | — | 48kg |

## Why it matters more than a wrong number

A clamp produces a plausible-looking figure, so nothing downstream complains.
But once it engages the prescription **stops telling people apart**. Measured
directly:

```
Kettlebell Swing (Heavy)
  intermediate,  70kg body  ->  48kg
  intermediate, 110kg body  ->  48kg
  advanced,      55kg body  ->  48kg
  advanced,     110kg body  ->  48kg
```

19 of 48 sampled profiles land on exactly 48kg. The app looks like it is
personalising and is not.

## Defect 1 — four routing rules were written and never reached

`categorize()` matches exercise names by substring, in order. Four rules sit
*after* the generic `deadlift` / `squat` matches and are therefore unreachable
for any name containing those words:

| Exercise | routed as | rule written for it |
|---|---|---|
| Romanian Deadlifts | `deadlift` | `hinge_accessory` |
| Bulgarian Split Squats | `squat` | `single_leg_dumbbell` |
| Split Squat (Bodyweight) | `squat` | `single_leg_dumbbell` |
| Farmer Squat Hold (Isometric Carry) | `squat` | `carry` |

`single_leg_dumbbell`'s own doc comment lists **"Bulgarian split squat"** among
the lifts it says it fixed. That fix only ever landed for lunges and step-ups
— whose names happen not to contain "squat". Same two-halves shape this
codebase keeps producing, and a truthful-looking comment sitting over it.

So a Bulgarian split squat has been priced as a **bilateral barbell back
squat**, and a Romanian deadlift as a **full conventional deadlift**.

### Measured, by moving the four rules above the generic ones

Whole exercise DB swept: **exactly 4 of 145** categories change. `Goblet
Squats`, `Hack Squat` and `Overhead Carry` — the three cases where an earlier
rule winning IS deliberate — all hold.

| Exercise | profiles changed | median new/old |
|---|---|---|
| Romanian Deadlifts | 47 / 48 | **0.56x** |
| Bulgarian Split Squats | 48 / 48 | **0.40x** |
| Farmer Squat Hold | 0 / 48 (unloaded) | — |
| Split Squat (Bodyweight) | 0 / 48 (unloaded) | — |

```
Bulgarian Split Squats, per hand
  male intermediate 85kg    44kg  ->  18kg
  female intermediate 60kg  20kg  ->   8kg
```

44kg in each hand for a Bulgarian split squat is not a conservative estimate
that needed trimming; it is a weight almost nobody should be handed.

**One thing the measurement caught that reasoning did not:** a first attempt
moved `carry` up without keeping `overhead_carry` ahead of it, silently
reclassifying `Overhead Carry`. That is the argument for keeping these four
rules adjacent and commented rather than sorted by topic.

## Defect 2 — `hinge_accessory` is one bucket for two different implements

Separate from the routing, and it survives Defect 1's fix. `hinge_accessory`
is `0.55 x deadlift 1RM`, which is reasonable for a **barbell** good morning
or RDL and impossible for a **kettlebell swing**, whose implement stops at
48kg. PROJECT-LOG already flags the swing mapping as known and untraced.

Defect 1's fix moves Romanian Deadlifts *into* this bucket, so the bucket
matters more afterwards, not less. It needs splitting by implement, not
re-scaling as a whole.

## Defect 3 — the question that isn't mine

What should someone get when they have genuinely outgrown the heaviest
implement in the gym? A strong lifter on kettlebell swings is not a bug — the
48kg bell really is the ceiling. Options are (a) give the heaviest available
and add reps, (b) route them to a loadable alternative, (c) prescribe the
ceiling and say plainly that it is the ceiling. This is a coaching decision
and goes to Ashley before anything is built for it.

## Order of work

1. **Defect 1 first, alone.** Mechanical, has a right answer, and the numbers
   above are the before/after. Gate: every one of the four routes to its
   intended category, the three deliberate-precedence cases still hold, and
   the whole-DB sweep still shows exactly 4 changes.
2. **Re-measure the clamp count.** The 357,497 figure is the baseline; a
   substantial part of it should disappear with Defect 1 and the remainder
   isolates Defect 2's true size.
3. **Defect 2**, with its own before/after.
4. **Defect 3** only after Ashley rules.

## Verification

- `test:audit` — expect **0 / 13,967** held, not improved; this changes load,
  not structure.
- `test:quality` — the clamp-warning count is the headline measurement.
- `test:load-suggestions`, `test:added-load`, `test:block-consistency`,
  `test:week-load-consistency`, `test:load-ceiling-units`, `test:pattern-tags`.
- New gate `test:categorize-precedence`: the four intended routes, the three
  deliberate shadows, and a trapdoor asserting no *other* exercise's category
  moves — the whole-DB comparison, so a future rule reorder cannot silently
  re-price something.
- Mutation: put the four rules back after `deadlift`/`squat` and confirm the
  gate goes red for all four.
