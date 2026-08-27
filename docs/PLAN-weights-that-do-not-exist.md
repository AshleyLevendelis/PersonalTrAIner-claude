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

## Defect 2 — `hinge_accessory` is one bucket for four different things

Separate from the routing, and it survives Defect 1's fix. `hinge_accessory`
is a single `0.55 x deadlift 1RM`, and after Defect 1 it holds:

| Exercise | implement | 85kg male, beg / int / adv |
|---|---|---|
| Good Mornings | barbell | 32.5 / 65 / 82.5 |
| Hip Thrust | barbell | 32.5 / 65 / 82.5 |
| Kettlebell Swing (Heavy) | kettlebell | 32 / **48** / **48** |
| Romanian Deadlifts | barbell *or* dumbbells | 16 / 32 / 40 |
| Glute Bridge, Single-Leg RDL, BW Good Morning | bodyweight | unloaded |
| Leg Swings | bodyweight | unloaded |

Four distinct problems fall out, and they point in **different directions** —
which is why this is a split, not a re-scale:

1. **Swings are far too heavy.** 32kg for a *beginner*'s heavy swing (a
   typical beginner heavy swing is 16-20kg), and intermediate and advanced
   both pinned at the 48kg implement ceiling. A swing is ballistic and
   hip-snap driven; it is not 55% of a deadlift.
2. **Hip thrust is too light — but ALREADY KNOWN AND DELIBERATE.** 82.5kg for
   an advanced 85kg male, where a barbell hip thrust is routinely loaded at or
   above deadlift weight. `exercise-db.ts` says so at the entry itself: the
   name matches none of `categorize()`'s substrings, it falls through to the
   `hip_hinge` pattern default, *"so this under-prescribes. That is the safe
   direction and it is left deliberately conservative — a trainee adding
   plates is a better failure than a trainee pinned under them on the first
   session."* Listed here as a problem in the first draft of this plan; it
   isn't one. Read the entry's own comment before calling a number wrong.
3. **Romanian Deadlifts is implement-ambiguous — traced, and NOT a defect.**
   Its equipment list is `["barbell","dumbbells"]`, and `loadingMode` checks
   `dumbbells` first, so it is always priced and labelled *per hand*
   regardless of what the user has. 40kg per hand is a sensible advanced
   dumbbell RDL, and crucially the label SAYS "per hand" — so the app is
   telling the user which implement it means rather than leaving it
   ambiguous. A full-gym user who would naturally reach for a barbell gets a
   dumbbell prescription, which is a defensible default, not a wrong number.
   Recorded because it was checked, not because it needs changing.
4. **`Leg Swings` is in the bucket at all**, matched by the `swing` substring.
   It is a warm-up mobility drill, not a hip hinge. Harmless today because it
   is unloaded — which is exactly how a mis-route survives.

None of these is fixable by moving one multiplier. Each needs its own anchor
and its own before/after, and (1) is the one that touches safety.

## Defect 3 — the question that isn't mine

What should someone get when they have genuinely outgrown the heaviest
implement in the gym? A strong lifter on kettlebell swings is not a bug — the
48kg bell really is the ceiling. Options are (a) give the heaviest available
and add reps, (b) route them to a loadable alternative, (c) prescribe the
ceiling and say plainly that it is the ceiling. This is a coaching decision
and goes to Ashley before anything is built for it.

## Order of work

1. **Defect 1 first, alone.** DONE — mechanical, has a right answer, and the
   numbers above are the before/after. Gated by `test:categorize-precedence`.
2. **Re-measure the clamp count.** The 357,497 figure is the baseline; a
   substantial part of it should disappear with Defect 1 and the remainder
   isolates Defect 2's true size.
3. **Defect 2** — DONE for the swing half (the safety-relevant one). Ashley
   ruled on the resulting WEIGHTS rather than a multiplier: an 85kg man doing
   sets of 15 gets 32kg advanced / 26kg intermediate / 14kg starting out, a
   60kg woman 12kg, and **nobody is pinned to the 48kg ceiling** (was 19 of
   48). Built as a `kettlebell_swing` category rather than a smaller shared
   multiplier — mutation-tested: re-scaling the shared bucket instead drops
   Good Mornings and Hip Thrust from 82.5kg to 32.5kg. `Leg Swings`, a warm-up
   mobility drill that was in the hinge bucket purely because its name
   contains "swing", is out and reads "Bodyweight". Hip thrust left alone per
   the note above.
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
