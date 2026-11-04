# Machine versions: swappable, never generated

4 Nov 2026. Ashley: *"I've been in the gyms used machines which were not available as swaps in the app. And I want to
avoid that."* Asked how the swap sheet should handle a machine she is standing at, from four options, she chose
**"Machines swappable only"**: machine and cable versions become real swap options, priced like the machine they are a
version of; I add the common missing ones; free-weight versions stay log-only; no "add your own machine" (she turned
that down). It partly REVERSES her 3 Nov "Searchable, log-only" for machine, cable and Smith versions only.

## Measured first

Her two lists hold about 800 machine and cable names. On 4 Nov: 385 were log-only (found when logging, refused by
every swap), 410 were in neither table. Two of the commonest gaps were machines like the V-squat, the pendulum squat,
the leg press foot placements and the assisted pull-up machine.

## Built

- `exercise-machine-versions.ts`: name -> parent, pure data. 395 rows moved from the log-only table by one rule, and 82
  more matched to a same-kit parent (477). The rule, held by `test:machine-versions`: the parent needs a machine; the
  name names no free weight, and names a machine or sits under a machine-only parent; a one-sided name (single-arm,
  one-leg, iso-lateral) only under kit the app prices per side. 14 one-sided names under other kit (an iso-lateral
  abductor, a single-arm T-bar row) stay log-only rather than be priced as two-sided. So do the lever squats
  (pendulum, super squat): the machine pack found no price category fits them, and a first build priced them as the
  hack squat; caught by its own CSCS review an hour later and made log-only.
- Loaded WITH the app, not after it: a plan holding one must open on the first screen. The log-only names still load
  after the app opens. App chunk 1252 -> 1279 kB raw, budget 1274 -> 1304.
- Built from the parent in `exercise-db.ts`: its joints, tier, pattern and style; the parent's MACHINE kit (a cable
  overhead extension does not need a dumbbell); one-sided by name; its own slug id, so its history is its own. No
  cues: the parent's describe a different grip or setup.
- Found by the swap and add pickers' search (after every catalogue match), by the logging box, and by the coach's
  swap (exact name, or offered as a tap from a loose one). Never by the strict search the ban and logged-set resolvers
  use: banning "leg press" bans the catalogue lift, not forty machines.
- Every writer takes one: the swap writer, the addition, the coach's card and executor, and a named move in a
  different kind of session (judged as its parent for kit, injury and the avoid list).
- Every plan reader that looked a slot up in the catalogue alone now asks the shared lookup (timing, progression,
  tempo, rotation tiers, the balance passes, the quality score, the trade-off sheet). Generated plans are unchanged:
  144 seeded plans byte-identical before and after.
- The swap and add rows say "A version of Hack Squat, priced like it." The logging row says "A version of X".

## Two defects found on the way, both fixed

- **Priced by its own name.** The price category and the movement family read the exercise's NAME, so "V-Squat
  Machine" came out at 45 kg where the hack squat got 97.5 kg in the same slot. A version is now priced and grouped as
  its parent (`categorize`, `getMovementFamily`). Checked across all 477.
- **The coach said an injury kept a machine out.** Asked for "pendulum squat", the coach's fallback looked the
  machine up in the catalogue-only pool and told her her injuries ruled it out. It now judges a version as its parent,
  and still says so when an injury really does (a shoulder press with a shoulder injury).

## CSCS review

1. Training effect: the same movement on the machine in front of her; the stimulus is the parent's, so the price is.
2. Takes away: nothing. Generated plans are byte-identical; free-weight versions stay log-only.
3. Fundamentals: pattern coverage counts it as its parent's pattern; progression reads its own history (a V-squat log
   is not hack squat evidence, the 3 Nov decision); recovery unchanged.
4. Floors and ceilings: unchanged. The parent's category ceiling applies; one-sided versions use the existing
   per-side halving. Plate-loaded machines differ in leverage by brand, so a first number on an unfamiliar machine is a
   guess, as any machine's is: the calibration price and the RPE target correct it. Named, not hidden.
5. Scope: inside it.

## Not done, named

- The common machines with nothing to be a version of (ab crunch machine, pullover machine, cable chest press and
  shoulder press, Smith machine rows, Romanian deadlift, shrug and hip thrust): part 2, full exercises.
- 81 machine names still unmatched, and the 14 one-sided ones kept log-only.
- No form cues on a version.
- A loose name logged through the coach ("pendulum squat") goes under its own words, not the machine's id (as for any
  name the app does not hold exactly).

## Gates

`test:machine-versions` (39 checks; 17 mutations: 16 caught, 1 recorded as equivalent: timing reads nothing from a
machine entry that an unknown name lacks), `verify:machine-swap` (12 checks at 390x844, 4 mutations caught),
`test:near-copies` (floor 800 -> 450 rows), `test:bundle`.
