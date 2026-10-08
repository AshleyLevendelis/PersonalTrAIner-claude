# A workout made of timer blocks (RULED A, 8 Oct 2026)

Ashley, 8 Oct 2026, from the gym: she skipped the prescribed session and used the round timer for
5 x 3 min skipping rope, 3 x 30s push-ups, 3 x 30s sit-ups and 5 x 15s assault bike on 45s rest.
*"That's still a decent workout but the app has no way of logging or tracking that."*

**Her ruling, from three options: A, one workout made of blocks.** Each timer block is logged by
name, they build into one workout, and one tap counts it as today's workout in place of the plan.
The coach records the same from a message. She rejected B (one entry with a typed name, the pieces
lost) and C (build the circuit in the timer first; it needs planning she did not do).

## What was true before (READ, traced by an investigator; nothing run)
- A finished round's "Log session" opened the unplanned-work sheet prefilled "Intervals", N
  minutes, a note like "5 rounds · 180s work / 0s rest", and an effort to pick. One cardio row.
  Every block was "Intervals"; the app could not tell rope from bike.
- Marking the plan as replaced was a second, separate step (day menu "I did something else"),
  which asks the name again and writes ANOTHER cardio row if minutes are given.
- The coach's swap tool takes one activity name; four blocks collapse into one. Its executor
  stores an effort of 6 when none was said (`intensityRpe ?? 6`), an invented number the 24 Sep
  "nothing pre-chooses an effort" ruling forbids. Named here, fixed on the new path only.

## The design
- **A block is a cardio log.** One `cardio_logs` row per block: the activity is the block's name
  ("Skipping rope"), minutes are work plus the rests between rounds (the timer's own rule, rounded,
  at least 1), the note is the shape ("5 × 3 min", "3 × 30s", "5 × 15s, 45s rest"), the effort is
  asked. No new column and no migration: `duration_minutes` is whole minutes, so the exact shape
  lives in the note.
- **The workout is the day.** The blocks of a circuit are the day's cardio logs. Counting them as
  today's workout is ONE write, the existing swap (`setSwappedForActivity`) named for the blocks
  ("Circuit: skipping rope, push-ups, sit-ups and assault bike"), and it adds no extra cardio row.
- **The timer asks what the block was.** "Log session" opens "What was this block?" with chips of
  common names (each carrying the timer's minutes and NO effort) plus Other. Nothing is called
  "Intervals" unless she types it.
- **The offer, one tap, where she is.** When today has cardio logged, a planned lifting session
  still due (not started, swapped, moved, rested or marked missed): "Count this as today's workout
  instead of <session>?" on Tools right after a block is logged, and on the Exercise tab's Today
  card. One component, one decision function, both places. "Not today" hides it for the day.
- **The coach: `propose_circuit_log`.** Blocks (name, rounds, work and rest seconds), an overall
  effort, and whether it replaced the session. The server refuses any block whose rounds and work
  time she never stated (her recent messages, not the model's word) and asks for the effort when
  she did not give one, so nothing is invented. A card lists the blocks; confirm writes the same
  rows the screen writes; Undo removes them.

## CSCS review
1. Training effect: none on the plan; it records conditioning she did. 2. Takes away: nothing; the
session stays on the plan, as every swap does. 3. Fundamentals: the record now says what she did,
which the coach and the week read. 4. Floors: none redefined; minutes keep the timer's rule.
5. Scope: logging only.

## Not in this
Timed bodyweight SETS in lifting history (30s of push-ups as a set): a seconds-unit set would meet
the bodyweight reps record (her 16 Sep ruling counts reps), so it stays a conditioning block.
Building a circuit in the timer before starting (option C).
