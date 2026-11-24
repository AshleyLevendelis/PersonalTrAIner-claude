# Sets logged under the wrong exercise move to the one he did

Ashley, 24 Nov 2026, in the gym. He logged Seated Leg Curl (25 x 14, 20 x 15, 20 x 15) when he had done Leg Extensions,
then told the coach: "I incorrectly logged leg curl, I actually did leg extensions".

What happened:
- The coach logged ONE Leg Extensions set, 25 x 14, using numbers he never said.
- The three leg curl sets stayed, ready to set next week's leg curl from a lift he did not do.

## Why (traced)

- No path in the app could move logged sets. The coach's only logging tool adds sets or fixes numbers on the same exercise.
- His message went down the add path: the target was named in his words, so it passed.
- The sets text came from the model, because nothing checks that the numbers are his.
- The extra rows on the Additional Work card are the card's fixed three rows at 8-12. They are suggestions, not logs.

## What changed

- **One planner** in `move-logged-sets.ts`, used by both the chat and the screen.
  - It takes every set from the app's OWN log and keeps each set's weight, reps, effort, unit, build-up, drop and added load.
  - Moved sets are numbered after any already under the target. A drop keeps its set's number.
  - It writes every new row first and then deletes the old ones. If a save is refused, the rows already written are taken back and nothing is deleted.
- **The coach** gains `move_logged_sets` (from/to, both in his words, no numbers), plus a prompt rule that a wrong exercise is a move, never a new log.
  - The exercise logged by mistake must be on today's log (the 15 Sep rule).
  - The exercise he did must be in his words and in the catalogue (the 14 Sep rule). Anything less is asked about.
  - The receipt is "Moved · Tuesday" with the correction receipt's Undo. That Undo now deletes a moved build-up or drop as itself.
- **The screen** gets "Logged the wrong exercise?" on a logged exercise's ⋮ menu: a search, then the same planner, then a line on the card with Undo.
- The coach-actions list and the parity document carry the new action, `screen` on both.

## Not done (named)

- **A past day.** The move is today only, on both surfaces.
- **The coach writing numbers he never said through `log_workout`.** The set text is still not checked against his words; this is what produced the invented 25 x 14. The new tool and rule take this case off that path; the general check is the next fix.
- **His own stray Leg Extensions set** from the old path stays until he deletes it.

## Checks

- `test:move-logged-sets` (27 checks; 12 mutations, 12 caught, one only after a malformed mutant was rewritten).
- `verify:wrong-exercise` (10 checks; 2 mutations, 2 caught).
- `test:coach-actions` and `test:coach-parity` updated.
- Needs the `chat-gemini` deploy for the coach's half.
