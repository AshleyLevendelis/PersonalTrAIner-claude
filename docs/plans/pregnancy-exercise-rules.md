# Pregnancy: exercise rules (his ruling 14 Nov 2026, "Exercise rules only")

## What he chose, and what he did not
From three options: **exercise rules only**, over "talk to your midwife" copy alone and over the full version with a
pregnancy calorie adjustment and a food-safety filter. Calories and food stay as they are: that is clinical nutrition,
outside the CSCS delegation, and would need someone qualified to sign the numbers.

## Today (traced 14 Nov 2026)
- A "Pregnant" tap on setup's injuries card and on Profile (`health-conditions.ts`), stored in `health_conditions`
  (migration `20261114150000`, not yet applied on his machine). It caps working sets at RPE 8 and conditioning at RPE 7,
  shows the GP line, tells the coach and offers a rebuild.
- Said in words, pregnancy now ticks that tap in setup (14 Nov, this branch). In the coach chat it does not yet.
- The engine has no pregnancy exercise rule: `ExerciseEntry` carries no plyometric, supine or balance tag, and the pool
  filters are equipment, injury (joints), style and skill only. Priya's plan held box jumps, a supine floor press and
  single-leg glute bridges.

## The rules (CSCS, mine under his delegation; basis below)
1. **No jumping or impact**: plyometrics, jumps, bounds, burpees, jumping jacks, skipping, sprints. ACOG and RCOG
   advise against high-impact and fall-risk exercise in pregnancy; relaxin and a shifting centre of mass raise both.
2. **No moves lying flat on the back from week 16**: supine presses, floor presses, supine bridges, dead bugs, lying leg
   raises. Supine hypotension (vena cava compression) is the recognised concern from the second trimester; incline or
   seated versions replace them (incline press, seated press, standing or side-lying alternatives).
3. **Balance-risky moves flagged, not removed**: single-leg standing work (single-leg RDL, step-ups to height, pistol
   progressions) gets a one-line note ("hold a support if you need it") rather than disappearing, so the plan keeps its
   single-leg pattern with support.
4. **No heavy breath-holding**: the RPE 8 cap (already built) keeps loads off maximal; no change.
5. **No contact or fall-risk conditioning**: combat-style and agility conditioning is swapped for steady cardio.
6. **The coach**: names the midwife on any symptom, never calls the plan "safe" (built 14 Nov), and says the plan is
   adapted for pregnancy in exercise choice only.

## The build
- **The answer**: a due date (preferred) or trimester, asked when "Pregnant" is ticked (setup and Profile); weeks of
  pregnancy are worked out each day from the due date, so the week-16 rule switches itself on. Needs a column
  (`pregnancy_due_date`), so a migration: **his word for the database step.**
- **Catalogue tags**: `impact: true` and `position: 'supine'` on the catalogue entries that are; a gate lists every
  tagged entry so a new exercise cannot slip through untagged (a name pattern cross-check: jump, plyo, burpee, floor
  press, supine, lying).
- **A pool stage** beside the injury filter (`exercise-plan.ts`): removes impact always and supine from week 16, with
  the same replacement search the injury filter uses, so a slot is filled and never emptied.
- **Every path**: generation, swap list, add, rebuild, session rebuild and the coach's swap all read the same pool, so
  a swap can never bring a box jump back (the injury filter's own rule, rule 3 of the must-have list).
- **Plan invalidation**: ticking Pregnant, or crossing week 16, offers a rebuild from this week (days trained untouched).
- **Checks**: `test:pregnancy-rules` (pool stage, tags, week 16 switch, every path, the replacement keeps the pattern),
  `verify:pregnancy` at 390px (tick, due date, rebuilt plan holds no impact/supine move, the note on a single-leg move),
  `test:quality` re-measured (a pregnancy profile set added to the grid; every plan still clears 7.2), the coach exam
  given a pregnancy case.

## The CSCS review (the five questions)
1. Training effect: the same patterns at the same RPE cap, with safer positions; strength and conditioning kept.
2. What it takes away: jump training and supine pressing; replaced, never emptied.
3. Fundamentals: pattern coverage held by the replacement search (the pattern floor applies).
4. No floor or ceiling redefined: the RPE cap is unchanged.
5. Scope: exercise selection only; no diagnosis, no clinical nutrition, symptoms go to the midwife (the red-flag rule).

## Not in it (named)
Calories, the food-safety list, postnatal rules, pelvic-girdle-pain rules (a separate decision of his: a pain report
today changes nothing, by the red-flag rule), heart-rate zones.
