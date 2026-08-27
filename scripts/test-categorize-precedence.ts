/**
 * Gate: categorize()'s substring rules are ordered SPECIFIC BEFORE GENERIC,
 * and no exercise is priced by a rule nobody wrote for it.
 *
 * Found in test:quality's console output, not in any gate: 357,497 warnings
 * reading "computed 78kg, above the 48kg realistic ceiling — clamping. This is
 * a safety net, not a fix: something upstream produced a wrong number and
 * should be traced." Nobody had traced it, and the clamp had been absorbing
 * the symptom for long enough that the prescription stopped telling people
 * apart — 19 of 48 sampled profiles landed on exactly the 48kg kettlebell
 * ceiling, a 55kg lifter and a 110kg lifter handed the same bell.
 *
 * The cause: four rules sat AFTER the generic 'deadlift'/'squat' name matches
 * and were unreachable for any name containing those words. A Bulgarian split
 * squat was priced as a bilateral barbell back squat (44kg PER HAND for a male
 * intermediate at 85kg), a Romanian deadlift as a full conventional deadlift.
 *
 * single_leg_dumbbell's doc comment names "Bulgarian split squat" among the
 * lifts it claims to have fixed. It only ever landed for lunges and step-ups —
 * whose names happen not to contain "squat".
 *
 * Two halves of this gate, and BOTH are needed:
 *   §1 the four intended routes, and the three deliberate shadows that must
 *      NOT change — an ordering fix is one careless line from re-pricing them.
 *   §2 a whole-DB trapdoor: nothing outside those four may move. That is what
 *      catches the next reorder, including the one this fix nearly shipped.
 */
import { categorize } from '../src/lib/load-prescription'
import { getExerciseEntry, EXERCISE_DATABASE } from '../src/lib/exercise-db'

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

console.log('\n1. The four rules that were written and never reached')
{
  const INTENDED: [string, string, string][] = [
    ['Romanian Deadlifts', 'hinge_accessory', "an RDL is a hinge accessory, not a full conventional deadlift"],
    ['Bulgarian Split Squats', 'single_leg_dumbbell', 'a per-hand unilateral lift, not a bilateral barbell back squat'],
    ['Split Squat (Bodyweight)', 'single_leg_dumbbell', 'same family; the category also drives its ceiling'],
    ['Farmer Squat Hold (Isometric Carry)', 'carry', 'grip-limited hold, not a back squat'],
  ]
  for (const [name, want, why] of INTENDED) {
    const e = getExerciseEntry(name)
    if (!e) { check(`${name} exists in the DB`, false); continue }
    check(`${name} -> ${want} (${why})`, categorize(e) === want, categorize(e))
  }
}

console.log('\n2. The three cases where an EARLIER rule winning is deliberate')
{
  // These are not accidents of ordering — each has its own doc comment saying
  // why the specific rule must beat the generic one. An ordering fix is one
  // careless line away from undoing them, and a first attempt at this change
  // did exactly that to Overhead Carry.
  const DELIBERATE: [string, string, string][] = [
    ['Goblet Squats', 'goblet_squat', 'a dumbbell held at the chest, not a barbell back squat'],
    ['Hack Squat', 'leg_press', 'a sled, which loads far past a back squat'],
    ['Overhead Carry', 'overhead_carry', 'pressing-limited, not grip-limited like a farmer carry'],
  ]
  for (const [name, want, why] of DELIBERATE) {
    const e = getExerciseEntry(name)
    if (!e) { check(`${name} exists in the DB`, false); continue }
    check(`${name} still -> ${want} (${why})`, categorize(e) === want, categorize(e))
  }
}

console.log('\n3. TRAPDOOR: no other exercise in the database moved')
{
  // Every exercise, by the category it had immediately AFTER the ordering fix
  // — GENERATED from the code at that moment, not hand-written. The first
  // draft of this section hand-typed the numbers and was wrong on 15 of 20
  // categories, which is the whole argument for freezing a measured snapshot
  // instead of an author's recollection of one.
  //
  // This is what catches the NEXT reorder. A first attempt at the fix moved
  // `carry` above `overhead_carry` and silently reclassified Overhead Carry;
  // §2 names that one, but only a whole-DB comparison catches the case nobody
  // thought to name.
  const AT_THE_FIX: Record<string, string[]> = {
    bench: ["Archer Push-Ups", "Barbell Bench Press", "Barbell Floor Press", "Chest Dips", "Chest Press Machine", "Deficit Push-Ups", "Dumbbell Bench Press", "Dumbbell Floor Press", "Incline Dumbbell Press", "Incline Machine Press", "Incline Push-Ups", "Neutral-Grip Dumbbell Press", "Push-Ups"],
    carry: ["Farmer Squat Hold (Isometric Carry)", "Farmer's Walk", "Loaded Backpack Walk", "Suitcase Carry", "Trap Bar Carry"],
    deadlift: ["Deadlifts", "Trap Bar Deadlift"],
    goblet_squat: ["Goblet Squats"],
    hinge_accessory: ["Bodyweight Good Morning", "Glute Bridge", "Good Mornings", "Hip Thrust", "Kettlebell Swing (Heavy)", "Kettlebell Swings", "Leg Swings", "Romanian Deadlifts", "Single-Leg RDL (Bodyweight)"],
    isolation_bicep: ["Band Curl", "Barbell Curls", "Cable Curls", "Dumbbell Curls", "Hammer Curls", "Incline Dumbbell Curls"],
    isolation_calf: ["Calf Raises", "Calf Raises (Bodyweight)", "Seated Calf Raises", "Single-Leg Calf Raise (Bodyweight)", "Single-Leg Dumbbell Calf Raise"],
    isolation_chest: ["Cable Crossover", "Cable Flyes", "Cable Woodchops", "Dead Bug", "Dumbbell Flyes", "Face Pulls", "Pallof Press", "Pec Deck Machine", "Plank", "Rear Delt Flyes", "Reverse Pec Deck", "Russian Twist", "Side Plank", "Straight-Arm Pulldown", "Wall Sit"],
    isolation_hamstring: ["Dumbbell Leg Curl", "Lying Leg Curl", "Nordic Hamstring Curl", "Seated Band Leg Curl", "Seated Leg Curl", "Single-Leg Sliding Leg Curl", "Sliding Leg Curl"],
    isolation_quad: ["Banded Terminal Knee Extension", "Chair Leg Extension", "Leg Extensions", "Seated Short-Arc Quad Set", "Sissy Squat"],
    isolation_shoulder: ["Band Lateral Raise", "Cable Lateral Raises", "Front Raises", "Lateral Raises", "Machine Lateral Raise"],
    isolation_tricep: ["Band Tricep Kickback", "Band Tricep Pushdown", "Overhead Tricep Extension", "Skull Crushers", "Tricep Dips", "Tricep Pushdowns"],
    leg_press: ["Hack Squat", "Leg Press"],
    null: ["Ab Wheel Rollout", "Arm Circles", "Band Dislocates", "Band Face Pulls", "Band Pull-Aparts", "Battle Ropes", "Box Jumps", "Broad Jumps", "Burpees", "Cycling Intervals", "Elliptical", "Hanging Leg Raises", "Jump Rope", "Lateral Step Touches", "Medicine Ball Slams", "Mountain Climbers", "Plyo Push-Ups", "Prone Y-T Raises", "Scapular Push-Ups", "Treadmill Intervals", "Wall Slides"],
    overhead: ["Arnold Press", "Band Shoulder Press", "Dumbbell Shoulder Press", "Landmine Press", "Overhead Press", "Shoulder Press Machine"],
    overhead_carry: ["Overhead Carry"],
    pulldown: ["Close-Grip Lat Pulldown", "Kneeling Band Lat Pulldown", "Lat Pulldown"],
    row: ["Backpack Row", "Barbell Rows", "Cable Rows", "Chest-Supported Row", "Chin-Ups", "Dumbbell Rows", "Inverted Row", "Neutral-Grip Seated Cable Row", "Pull-Ups", "Pull-Ups (Assisted)", "Rowing Machine", "Seated Cable Row", "Seated Machine Row", "T-Bar Rows", "Table Row", "Towel Row"],
    shrug: ["Band Shrug", "Cable Shrug", "Dumbbell Shrugs", "Shrugs"],
    single_leg_dumbbell: ["Bulgarian Split Squats", "Low Box Step-Up", "Split Squat (Bodyweight)", "Step-Down (Eccentric)", "Step-Ups", "Step-Ups (Bodyweight)", "Walking Lunges"],
    squat: ["Air Squat", "Barbell Squats", "Bodyweight Squat Marches", "Box Squat (Bodyweight)", "Pistol Squat Progression", "Spanish Squat"],
  }

  const actual: Record<string, string[]> = {}
  for (const e of EXERCISE_DATABASE) (actual[String(categorize(e))] ??= []).push(e.name)
  for (const k of Object.keys(actual)) actual[k].sort()

  const moved: string[] = []
  const wasIn = new Map<string, string>()
  for (const [cat, names] of Object.entries(AT_THE_FIX)) for (const n of names) wasIn.set(n, cat)
  for (const [cat, names] of Object.entries(actual)) {
    for (const n of names) {
      const was = wasIn.get(n)
      if (was === undefined) moved.push(`${n}: NEW, now ${cat}`)
      else if (was !== cat) moved.push(`${n}: ${was} -> ${cat}`)
    }
  }
  for (const [n, cat] of wasIn) if (!(actual[cat] ?? []).includes(n)) {
    if (!moved.some(m => m.startsWith(`${n}:`))) moved.push(`${n}: ${cat} -> GONE`)
  }

  check('no exercise changed category', moved.length === 0, moved.slice(0, 8))
  check('the snapshot covers the whole DB, so this has teeth',
    Object.values(AT_THE_FIX).reduce((a, b) => a + b.length, 0) === EXERCISE_DATABASE.length,
    { frozen: Object.values(AT_THE_FIX).reduce((a, b) => a + b.length, 0), db: EXERCISE_DATABASE.length })
}

console.log('\n4. The generic rules still work for the lifts they are FOR')
{
  // The fix must not have broken the common case by moving things too early.
  for (const [name, want] of [['Barbell Bench Press', 'bench'], ['Lat Pulldown', 'pulldown']] as [string, string][]) {
    const e = getExerciseEntry(name)
    if (e) check(`${name} -> ${want}`, categorize(e) === want, categorize(e))
  }
  const deadlifts = EXERCISE_DATABASE.filter(e => e.name.toLowerCase().includes('deadlift'))
  check('there are still real deadlifts routed as deadlifts',
    deadlifts.some(e => categorize(e) === 'deadlift'), deadlifts.map(e => `${e.name}=${categorize(e)}`))
  const squats = EXERCISE_DATABASE.filter(e => e.name.toLowerCase().includes('squat'))
  check('there are still real squats routed as squats',
    squats.some(e => categorize(e) === 'squat'), squats.map(e => `${e.name}=${categorize(e)}`))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll categorize-precedence checks passed.\n')
