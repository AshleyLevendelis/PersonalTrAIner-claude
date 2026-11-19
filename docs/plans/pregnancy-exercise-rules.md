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

## As built (15 Nov 2026)
- No due date column yet: every pregnancy is treated as past week 16 (no lying flat from the start), the safe side.
  A due date would let flat moves back before week 16 and drive a "crossing week 16" offer; both need a migration.
- Lists by name in `src/lib/pregnancy-rules.ts` (impact 7, lying flat/face down 19); variants and machine copies follow
  their parent. Kept on purpose: hip thrusts, incline presses, seated machines, standing cable flyes, side-lying work.
- One stage (`stagePregnancyFilter`) after the injury stage, in generation and the shared pool; same-group replacement
  only. Free search warns. The rebuild offer names the change. The coach is told.
- Measured on 401 plans: 22,019 of these moves without pregnancy, 0 with; quality 11.66 -> 11.67, none below 7.2; weeks
  without pressing unchanged (288 of 2,432).
- Not built: balance-risky single-leg notes (rule 3), the combat/agility -> steady cardio swap (rule 5), a due date.

## Extended 18 Nov 2026 (the full pass)
A walk of setup with "Pregnant" ticked was handed a flat dumbbell press ("Neutral-Grip Dumbbell Press"). The list had
been checked against exercise NAMES, and a move whose name does not say how it is done slipped through. Every catalogue
entry was read again for the position it is done in, and the warm-up, which the rule had never reached, was measured.

**The same two rules, applied to moves the first list missed (CSCS, mine; all on the safe side, none a new rule):**
- Flat on the back: Neutral-Grip Dumbbell Press, Dumbbell Squeeze Press (flat bench); Sliding Leg Curl and its
  single-leg version (supine, hips bridged); Inverted Row and Table Row (the trunk is horizontal and face-up for the
  whole set, and a failed grip drops her onto her back). Basis: the same supine-position guidance as rule 2.
- Face down with the body's weight on the front: Chest-Supported Row, T-Bar Row Machine, Reverse Hyper Machine, Back
  Extension Machine, Dumbbell Leg Curl, and the Nordic Hamstring Curl (a controlled fall forward onto the hands).
  Basis: pressure on the abdomen and fall risk; the first list already left out "Lying Leg Curl" and "Prone Y-T Raises"
  for this reason.
- Impact: High Knees (running on the spot, the same class as Jumping Jacks) and Medicine Ball Slams (a maximal throw
  whose ball rebounds toward the body).
- KEPT, each recorded with its reason in the check: incline, seated and standing work; hip thrusts (shoulders up on a
  bench); push-up and plank positions (hands and feet, nothing lying on the front); side-lying work; a 45-degree leg
  press; kettlebell swings; treadmill intervals (cardio is already capped by effort). Plank-type work later in
  pregnancy is an individual call for her midwife or physio, not an app rule.

**The warm-up obeys the rule the session obeys (new):** measured before, 4,608 of 6,144 sampled warm-ups for a pregnant
trainee held a jump ("Jumping Jacks & High Knees", "Jump Rope or Brisk Walk") and 928 a Glute Bridge. The opening item
was chosen by kit alone and the mobility drills asked only about injuries. Now the opening item has a
both-feet-on-the-floor twin of the same length, used while pregnant AND when an injury on the list rules out a jump the
item names (the catalogue's own judgement: knees, ankles, a shoulder for jumping jacks, a wrist for the rope), which
was an injury-filter gap for everybody; a drill lying flat is left out of the warm-up and of the "feels tight" drills
while pregnant. After: 0 and 0.

**The starting-out circuit keeps its hinge:** its Glute Bridge had no alternative, so a pregnant beginner lost the
pattern. It now falls back to a standing hip hinge to a wall, and each alternative is described in its own words (a
Wall Sit had been described as "sit to a chair and stand back up").

**Cost, measured in the same run (96 profiles, 16 weeks each, pregnant against not):** weeks that lost a squat, hinge,
push or pull pattern: 0. Exercises kept: 97.7%. No empty training day.

**CSCS review:** (1) same patterns at the same effort cap in safer positions; (2) takes away thirteen more moves and the
jumping warm-up, each replaced, no pattern lost; (3) coverage, overload and recovery unchanged; (4) no floor or ceiling
redefined, the warm-up twin is the same length so no session is resized; (5) exercise selection only.

Checks: `test:pregnancy-rules` section 1 now reads name, form cues and group, proves its detector on every listed move,
and records each kept move with its reason (5 mutations caught); `test:warmup-rules` (29 checks; 15 mutations, 13
caught, 2 equivalent: the generator's own warm-up call is rebuilt downstream by the function that does pass the flag,
and the two list removals belong to the other gate, which catches them).

