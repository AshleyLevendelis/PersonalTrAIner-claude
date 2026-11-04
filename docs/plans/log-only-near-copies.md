# Log-only near-copies

3 Nov 2026. Ashley's ruling "Searchable, log-only" (from three options; `docs/plans/exercise-library.md`) and then
"then build the log-only near-copies". A near-copy is the same lift as a catalogue entry with another grip, angle,
stance, tempo or setup (a paused squat, a wide-grip pulldown): never prescribed, found in search, logged under its own
name with its own history and best.

## Traced first (investigator, 3 Nov 2026)

- `retired` keeps an entry out of every plan path but ALSO out of search, so it cannot be reused.
- Three doors put a NAMED exercise into a plan without the pool: the swap sheet and add picker (their search), the
  coach's swap card and its executor. All swaps end in `swapExerciseInMesocycle`; additions in `addExerciseToSession`.
- History and personal bests key by exercise id; the coach's function writes the SLUG of the name it logs, so a
  near-copy's id must be that slug or her history splits in two.
- The ban resolver and the chat logger's search would change behaviour if near-copies joined their search (more
  bans, more "which did you mean?").

## Built

- `exercise-near-copies.ts`: name -> parent, pure data. 85 rows, the first slice from her two lists (common free-weight,
  cable, machine and bodyweight lifts with an unambiguous parent).
- Entries are BUILT from the parent (kit, joints, tier, pattern, how it is loaded), with their own slug id, no cues,
  note or style. They live OUTSIDE `EXERCISE_DATABASE`, so no pool, rotation, shortlist or gate that iterates it can
  see one. `getExerciseEntry` resolves them, so history, the set box and the marks read the parent's shape.
- `searchExercisesToLog`: the picker's search first, then near-copies. Only the logging box calls it. The pickers, the
  ban resolver and the chat logger's search are unchanged.
- Refused in the writers: `swapExerciseInMesocycle` returns the plan unchanged; `addExerciseToSession`, the coach's
  swap card (before a card is drawn) and its executor say one sentence from the phrasebook (`logOnlyRefusal`) naming
  the parent. The session-kind path says the same instead of "not in the app" or "above your level".
- Marks: kit and injury come with the parent's fields; a banned PARENT marks its versions ("You've banned X, and this
  is a version of it."). Banning a lift does not ban its versions: they are never prescribed, so there is nothing to
  keep out of a plan.
- The logging sheet ("I also did…"): suggestions as she types, each a 44px row; a near-copy labelled "Log only · a
  version of X"; the marks on the row; a tap fills the exact name, Add logs it. The list scrolls itself above the
  docked bars (found in the first screenshot: it opened under the Start bar).
- The coach: `log_workout_set` already logs any name under its slug, so a near-copy said to the coach lands in the same
  history the screen writes. Parity holds without a new tool.

## Decided (CSCS, mine)

- A near-copy's logs are its OWN: a parent's progression never reads them (it reads its own id). A paused squat is not
  evidence for a squat's working weight.
- A personal best on a near-copy is its own record (it is a lift, never a primer or cardio).

## The rest of her lists (4 Nov 2026, her "carry on with the rest of the near-copies")

- 778 more, matched by written rules (`log-only-near-copies-rules.txt`, kept beside this plan): the kit word in the
  name picks the family (Smith, barbell, dumbbell, cable, machine, kettlebell, band, bodyweight), then the movement
  picks the parent, most specific first. 862 near-copies in all.
- Left out, 1,210 by rule: cardio, elite skills, strongman and specialty bars, Olympic and ballistic lifts, jumps,
  isometric holds, grip and neck work, kit the app does not ask about. A name goes in only when its parent is plain.
- Unmatched, 336: no rule named a parent with confidence (mostly odd combinations and one-off setups). Left out
  rather than guessed; a wrong parent would give a lift the wrong joints and marks.
- Every rule was read against the names it caught, and the wrong catches fixed before writing (upright rows read as
  rows, leg curls read as biceps curls, rear-delt flies read as chest flies, a safety squat bar read as a T-bar,
  hip and glute "extensions" read as triceps). Some of her names are near-duplicates of each other ("Paused Bench
  Press", "Barbell Paused Bench Press"); both kept, since she may type either.
- The table is its own download, fetched just after the app opens, so the first screen is no heavier (first paint and
  the app chunk went DOWN slightly, the first 85 left the app chunk with it). The logging box waits for it. Total size
  2588 -> 2631 kB raw; the total budget moved 2606 -> 2656 (her standing ruling, 25 raw of room).

## Not done, named

- The 336 unmatched and the 1,210 left out by rule.
- Whether elite skills and strongman lifts (left out of plans) are searchable log-only too: not covered by her ruling.

## Gates

`test:near-copies` (28 checks since 4 Nov; 10 mutations caught, one first crashed and was re-made to fail cleanly),
`verify:near-copies` (17 checks at 390x844, 4 mutations caught).
