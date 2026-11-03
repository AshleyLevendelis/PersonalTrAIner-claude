# The exercise library (from Ashley's 1,001-exercise list)

3 Nov 2026. Ashley uploaded a list of 1,001 exercises: "I want the app to have at its disposal". Exercise selection
is delegated (CSCS); what kit the app ASKS about is hers, and she ruled on it (below). Same shape as
`docs/plans/machine-pack.md` and `docs/plans/dumbbell-pack.md`, at roughly ten times the size, so it is built in
batches, each with its own gate and a full sweep.

## Measured first (a name-matching estimate, to be re-measured per batch)

- The catalogue holds 231 entries. About 236 of the list's 1,001 lines match one of them by name (grip and angle
  variants of one entry match it), leaving about **765**.
- Of those: about **476** use kit the app already asks about (barbell, dumbbells, cables, machines, kettlebells,
  bands, bodyweight); about **124** need kit it never asks about; about **50** are elite skills or lifts left out on
  purpose; about **115** are cardio, conditioning or sport drills.

## The second list (3 Nov 2026, the same day)

Ashley then sent `expanded_exercise_database_2000.md`: 1,971 numbered lines, about 1,820 distinct names, about 1,150
not in the first list, and no cardio section. Sampled, the additions are almost all grip, angle, stance and setup
versions of the same lifts ("Leg Press Calf Raise Setup", "Dumbbell Pronated Kickback"). Both lists are the source
for every batch; cardio still comes from the first.

## Her second ruling, 3 Nov 2026, from three options: "Searchable, log-only"

A NEAR-COPY (the same lift with another grip, angle, stance, setup or method) is never prescribed by a plan, but can be
found in search and logged under its own name, with its own history and best. Rejected: leaving them out (logged as
the parent lift) and making them all prescribable (plans would shuffle near-identical lifts and call it variety).
What that needs, and so batch 6:
- A log-only entry is its own kind: it names its PARENT, takes the parent's exclusions and kit for the clash marks the
  search already shows, never enters a pool, a rotation, a swap list or the coach's choices, and carries no prescribed
  weight (she types it).
- Its history and best are its own; whether a parent's progression ever reads a near-copy's logs is decided in the
  build, measured, and is the CSCS call (a paused squat is not a squat for estimating a squat).
- The coach can log one by name, as it logs anything else (parity).
- Not yet decided, and not covered by this ruling: whether the elite skills and strongman lifts left out of plans
  (rule 3 below) are searchable log-only too.

## Her ruling, 3 Nov 2026, from three options: "Known kit + a few"

Add everything sensible for the kit the app knows, and add a few common new kit ticks: **rings or suspension straps,
sled, landmine, slam ball, glute-ham bench**. Strongman gear (stones, kegs, yokes, logs, tyres, sandbags) is left out.
Rejected: known kit only (the ring, sled and landmine work waits) and new ticks for everything (a long kit screen
for gear most people will never own).

## What a coach adds, and what not (CSCS, mine)

The list is a taxonomy, not a prescription list, and a plan's rotation reads every entry as a real alternative. So:

1. **An entry is added when a coach would prescribe it as a DIFFERENT exercise**: a different stimulus, joint demand,
   stability demand or kit. A grip, angle or stance micro-variant of an entry the app has (incline at 15, 30, 45 and
   60 degrees; four lat-pulldown grips) is not added as four entries: the rotation would serve it as variety while
   the session is unchanged. At most one distinct variant is added where the difference trains something else
   (e.g. a neutral-grip press for a cranky shoulder, which also gives the injury filter something to keep).
2. **A training METHOD is not an exercise.** Tempo, pause, pin, box, board, chains, bands-resisted, speed and
   cluster versions are how a lift is prescribed; the app expresses them through the prescription, not new entries.
3. **Left out on purpose**: elite skills (planche, front and back lever, human flag, iron cross, one-arm pull-up and
   push-up, muscle-ups, dragon flag, freestanding handstand push-up), kipping, behind-the-neck and guillotine
   pressing, a loaded Jefferson curl, depth jumps, and strongman implements. A general app cannot coach these safely
   from a phone, and nothing here could tell when someone is ready.
4. **Cardio, conditioning and sport drills** (treadmill, ergs, swimming, boxing, agility ladders, sprints) are not
   lifts: they go to the cardio activity list the app logs and prescribes cardio from, where one is missing, in the
   last batch.
5. **Every entry copies the exclusions of its nearest existing entry** (injuries, joint stress, experience floor),
   is priced by an existing load category with per-side and per-hand marked, and is appended at the END of the
   catalogue so a tie still goes to an entry the app already had. A movement that fits no load category, or that
   needs a new joint rule, is left out of its batch and named, never priced by guess.

## New kit (her ruling) — the build behind it

- Five ticks join the existing nine on setup's kit screen, Profile's "What you have" and the coach's kit card
  (`propose_kit_change`, so a chat deploy). Nobody's plan changes unless they tick one.
- **Landmine** is the exception, decided here: it needs only a barbell in a corner or a cheap sleeve, so it is
  available wherever a barbell is, and a tick can remove it. To be measured before it ships (how many full-gym
  plans change).
- Which equipment choices assume which new kit (does a full gym assume a sled?) is decided per item in batch 4 with
  the measured effect on the 9,216-plan grid.

## Batches, each: entries, a gate on every field, mutation round, full sweep, the quality grid, BACKLOG

1. Barbell and dumbbell (known kit). BUILT 3 Nov 2026: nine entries (BACKLOG); eight lighter variants wait for a
   "fraction of the parent" pricing rule (front squat, incline and close-grip barbell bench, squeeze press, renegade
   row, dumbbell front squat, suitcase deadlift, landmine squat).
2. Cable and machine (known kit).
3. Bodyweight and kettlebell (known kit).
4. The five new kit ticks, then their exercises.
5. Cardio: missing activities onto the cardio list.
6. Near-copies, searchable and log-only (her second ruling), from both lists.

The CSCS review (five questions) is answered per batch, with numbers from the grid: pattern coverage, push:pull,
chest:back, repeated-movement days, quality floor and average, and how many plans changed.

## Not decided here

Whether exercises outside a plan's kit should be findable by search for LOGGING ONLY (the swap and add pickers
already search the whole catalogue and mark a clash) needs no new ruling: every added entry is searchable the same
way.
