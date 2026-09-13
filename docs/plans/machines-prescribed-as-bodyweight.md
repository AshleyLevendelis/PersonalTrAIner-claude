# Machines prescribed as "Bodyweight"

Found 13 Sep 2026 while probing the add-an-exercise path: a Smith Machine Bench
Press came back with `display: "Bodyweight"`, `kg: null`. It is not caused by
that work — it is in the generation path and on plans today.

## Measured, not assumed

54 plans generated across every combination of gym (full / commercial / home),
style (bodybuilding / powerlifting / hybrid), goal (muscle / weight / strength)
and experience (novice / intermediate / advanced).

**14 of 54 — 26% — contain at least one loaded machine prescribed as
"Bodyweight" with no kilos.** Examples off the run: Smith Machine Shoulder
Press (full_gym/hybrid, novice AND intermediate), Machine Hip Thrust
(commercial_gym/bodybuilding/novice).

Eight catalogue entries are affected: Smith Machine Bench Press, Smith Machine
Shoulder Press, Smith Machine Squat, Machine Hip Thrust, Glute Kickback
Machine, Hip Abduction Machine, Hip Adduction Machine, Belt Squat.

## Root cause, and why the second half matters more

```ts
const LOADED_EQUIPMENT = new Set(['barbell', 'dumbbell', … 'medicine ball'])
export function isExternallyLoaded(entry) {
  return entry.equipment.some(e => LOADED_EQUIPMENT.has(e))
}
```

An **allowlist of exact strings that fails silently and open**. An equipment
string the Set has never heard of does not raise anything — it reads as "no
external load", which is the answer that puts "Bodyweight" on a Smith machine.

The machine-floor catalogue expansion (12 Sep) added six new equipment strings.
Nothing required the Set to grow with them, and nothing noticed it had not.

**So the eight names are the symptom.** The defect is a classifier that treats
"I don't recognise this" as "no weight". The next catalogue addition repeats it.

## The catalogue, enumerated

38 distinct equipment strings across 201 exercises. Every one is either loaded
or it is not, and the fix makes that a **partition** rather than an allowlist:

- **LOADED (20)** — the existing 14 plus `smith machine`, `hip thrust machine`,
  `glute kickback machine`, `hip abduction machine`, `hip adduction machine`,
  `belt squat machine`.
- **NOT LOADED (18)** — `bodyweight`, `resistance band`, `pull-up bar`,
  `dip bars`, `assisted pull-up machine`, `bench`, `incline bench`,
  `preacher bench`, `squat rack`, `box`, `plyo box`, `ab wheel`, `jump rope`,
  `battle ropes`, `treadmill`, `stationary bike`, `rowing machine`,
  `elliptical machine`.

Three of those deserve saying out loud, because they look like misses and are
not: the **assisted** pull-up/dip machine subtracts weight and is handled by
`suggested_assistance_kg`, not by a load; **resistance band** resistance is real
but not prescribable in kg; and the **cardio** machines have no load to set.

## The loading mode is the other half, and it is not just a flag

Turning the flag on is not enough. `loadingMode` falls through to `'stack'` for
anything that is not a dumbbell, kettlebell, EZ or barbell — and `'stack'`
carries a 100 kg ceiling and a 5 kg pin floor. That is right for the four true
selectorised machines (hip abduction, hip adduction, glute kickback, hip
thrust) and **wrong for the Smith machine**, which is a bar on rails and should
be floored at bar weight rather than at a 5 kg pin.

- `smith machine` → **barbell** mode. It is a barbell on rails. Its true bar
  weight varies by gym (counterbalanced ones can be 7 kg, others 20 kg), and
  the app already has the right answer for "we do not know your starting
  number": the calibration week finds it and the ramp takes over. Assuming
  barbell is the consistent treatment, not a new invention.
- `belt squat machine` → **CORRECTED: stays `stack`, and I had this wrong in
  the first draft of this file.** "Plate-loaded, therefore barbell" was the
  reasoning, and it is wrong twice over. There is no bar, so the barbell mode's
  20 kg floor is a fiction. And the 100 kg ceiling was never the risk:
  `getLoadingCeilingKg` special-cases `category === 'leg_press'` — which
  `belt squat` deliberately maps to, with its own written rationale about the
  load hanging from the hips — to 400 kg BEFORE it ever consults the loading
  mode. So `stack` gives it an honest 5 kg floor and costs it nothing.
  Caught by printing the numbers: routing it to barbell produced **160 kg for a
  novice**, which is the leg-press standard and correct, sitting on a floor
  that was not.

**FLAGGED FOR ASHLEY, overrulable:** treating a Smith bar as a 20 kg barbell
starts a novice heavier than a counterbalanced Smith would. The calibration
week is what corrects it, and that is the same protection every other unknown
lift already has — but if she wants Smith to start lighter than a free barbell,
that is a coaching call and this is where it changes.

## A SEPARATE, LARGER THING THIS TURNED UP — a lead, not a fact

Probing for "externally loaded but printed with no kilos" across the same 54
plans returns a much bigger group than the eight machines, and it is
**pre-existing and unchanged by this work**: 40 of 54 plans before the fix,
34 after (the drop is only the machines leaving the category). The names are
Russian Twist, Medicine Ball Slams, Cable Woodchops, Kettlebell Swings,
Eccentric Wrist Extension, Forearm Pronation-Supination.

**I have not established whether that is deliberate, and it must not be
conflated with what is fixed here.** Two things suggest at least some of it is
intentional: Kettlebell Swings is tiered `primer`, and the primer guard
deliberately forces "Light" with no kilos; and BACKLOG carries a COMPLETED item
named "Close the tag-loaded / effectively-loadless gap (Russian Twist)", which
sounds like exactly this question already having been answered once.

Recorded here so the next session re-measures rather than either believing it
is broken or believing it is fine.

## What gets built

1. `LOADED_EQUIPMENT` gains the six machines.
2. A new `UNLOADED_EQUIPMENT` set, so the two together are a partition.
3. `loadingMode` routes `smith machine` to barbell. Belt squat stays a stack —
   see the correction above.
4. **The gate that makes this un-repeatable**: every equipment string in
   `EXERCISE_DATABASE` must appear in exactly one of the two sets. An
   unrecognised string fails the build instead of silently meaning "no weight".

## Verification

- **`test:load-display`** extended: no catalogue entry that is externally
  loaded may render "Bodyweight"; driven over the whole catalogue, not a sample.
- **New partition check** (in `test:load-ceilings`, which already owns the
  implement tables): the two sets cover the catalogue exactly, with no overlap
  and no orphan. Mutation: add an exercise with an unknown equipment string →
  must fail.
- **Re-measure the 26%** on the same 54-profile sweep and report the after
  number. If a metric changes scale, say so.
- `test:quality` in full — this changes prescribed weights, so plan scores move.
- Every new check mutation-tested, tried/caught reported.

## Who is using this yet

Ashley, 10 Sep 2026: *"No live users… just update the weight. No message."*
So the corrected weights simply stand; no migration, no coach message.

## Deploys

Frontend on merge. No edge function, no migration.
