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
import { categorize, prescribeLoad } from '../src/lib/load-prescription'
import { getExerciseEntry, EXERCISE_DATABASE } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

const profileFor = (o: Partial<UserProfile>): UserProfile => ({
  age: 34, gender: 'male', height_cm: 178, weight_kg: 85, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 0, tdee: 0,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower', training_days: [], weekly_schedule: {},
  dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o,
} as UserProfile)

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
  //
  // UPDATED ONCE, deliberately, when kettlebell_swing was split out of
  // hinge_accessory: it flagged exactly three moves (the two swings out, and
  // Leg Swings — a warm-up mobility drill that had been sitting in
  // hinge_accessory purely because its name contains "swing" — out to no
  // category at all, which renders as "Bodyweight"). Re-snapshotting is the
  // right response to a change you meant; the wrong response is loosening
  // the check so it stops noticing.
  const AT_THE_FIX: Record<string, string[]> = {
    bench: ["Archer Push-Ups","Barbell Bench Press","Barbell Floor Press","Chest Dips","Chest Press Machine","Deficit Push-Ups","Dumbbell Bench Press","Dumbbell Floor Press","Incline Dumbbell Press","Incline Machine Press","Incline Push-Ups","Knee Push-Ups","Neutral-Grip Dumbbell Press","Push-Ups","Wide Push-Ups"],
    carry: ["Farmer Squat Hold (Isometric Carry)","Farmer's Walk","Loaded Backpack Walk","Suitcase Carry","Trap Bar Carry"],
    deadlift: ["Deadlifts","Trap Bar Deadlift"],
    goblet_squat: ["Goblet Squats"],
    hinge_accessory: ["Bodyweight Good Morning","Glute Bridge","Good Mornings","Hip Thrust","Romanian Deadlifts","Single-Leg Glute Bridge","Single-Leg RDL (Bodyweight)"],
    isolation_bicep: ["Backpack Curl","Band Curl","Barbell Curls","Cable Curls","Dumbbell Curls","Hammer Curls","Incline Dumbbell Curls"],
    isolation_calf: ["Bent-Knee Calf Raise (Bodyweight)","Calf Raises","Calf Raises (Bodyweight)","Seated Calf Raises","Single-Leg Calf Raise (Bodyweight)","Single-Leg Calf Raise Hold","Single-Leg Dumbbell Calf Raise"],
    isolation_chest: ["Cable Crossover","Cable Flyes","Dumbbell Flyes","Pec Deck Machine"],
    isolation_hamstring: ["Bodyweight Hip Hinge to Wall","Dumbbell Leg Curl","Lying Leg Curl","Nordic Hamstring Curl","Prone Hamstring Curl (Bodyweight)","Seated Band Leg Curl","Seated Leg Curl","Single-Leg Sliding Leg Curl","Sliding Leg Curl"],
    isolation_lat: ["Scapular Pull-Ups","Single-Arm Band Pulldown","Straight-Arm Pulldown"],
    isolation_quad: ["Banded Terminal Knee Extension","Chair Leg Extension","Leg Extensions","Reverse Nordic Curl","Seated Short-Arc Quad Set","Sissy Squat","Wall Sit","Wall Sit March"],
    isolation_rear_delt: ["Face Pulls","Rear Delt Flyes","Reverse Pec Deck"],
    isolation_shoulder: ["Backpack Front Raise","Backpack Lateral Raise","Band Lateral Raise","Cable Lateral Raises","Front Raises","Lateral Raises","Machine Lateral Raise"],
    isolation_tricep: ["Band Tricep Kickback","Band Tricep Pushdown","Chair Dips","Overhead Tricep Extension","Skull Crushers","Tricep Dips","Tricep Pushdowns"],
    kettlebell_swing: ["Kettlebell Swing (Heavy)","Kettlebell Swings"],
    leg_press: ["Hack Squat","Leg Press"],
    null: ["Ab Wheel Rollout","Ankle Alphabet","Arm Circles","Band Dislocates","Band Face Pulls","Band Pull-Aparts","Banded Ankle Dorsiflexion","Banded Wrist Extension","Banded Wrist Flexion","Battle Ropes","Bear Crawl","Bird Dog","Box Jumps","Broad Jumps","Burpees","Cable Woodchops","Clamshell","Cycling Intervals","Dead Bug","Eccentric Wrist Extension","Elliptical","Forearm Pronation-Supination","Hanging Leg Raises","High Knees","Isometric Grip Squeeze","Jump Rope","Jumping Jacks","Lateral Step Touches","Leg Swings","Medicine Ball Slams","Mountain Climbers","Pallof Press","Plank","Plyo Push-Ups","Prone Y-T Raises","Russian Twist","Scapular Push-Ups","Shadow Boxing","Side Plank","Side-Lying Hip Abduction","Single-Leg Balance Hold","Skater Bounds","Standing Band Hip Abduction","Treadmill Intervals","Wall Slides","Wrist Circles"],
    overhead: ["Arnold Press","Backpack Overhead Press","Band Shoulder Press","Dumbbell Shoulder Press","Landmine Press","Overhead Press","Pike Push-Ups","Shoulder Press Machine"],
    overhead_carry: ["Overhead Carry"],
    pulldown: ["Band Lat Pulldown","Close-Grip Lat Pulldown","Kneeling Band Lat Pulldown","Lat Pulldown"],
    row: ["Backpack Row","Barbell Rows","Cable Rows","Chest-Supported Row","Chin-Ups","Dumbbell Rows","Inverted Row","Neutral-Grip Seated Cable Row","Pull-Up Negatives","Pull-Ups","Pull-Ups (Assisted)","Rowing Machine","Seated Cable Row","Seated Machine Row","T-Bar Rows","Table Row","Towel Row"],
    shrug: ["Backpack Shrug","Band Shrug","Cable Shrug","Dumbbell Shrugs","Shrugs"],
    single_leg_dumbbell: ["Bulgarian Split Squats","Low Box Step-Up","Split Squat (Bodyweight)","Step-Down (Eccentric)","Step-Ups","Step-Ups (Bodyweight)","Walking Lunges"],
    squat: ["Air Squat","Barbell Squats","Bodyweight Squat Marches","Box Squat (Bodyweight)","Cossack Squat (Bodyweight)","Pistol Squat Progression","Spanish Squat","Tempo Air Squat"],
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
  // THE SNAPSHOT ALONE ONLY PROVES NOTHING MOVED. It was regenerated from the
  // database on 31 Aug 2026 (158 -> 185 entries, stale since ~40 exercises
  // were added), and a regenerated snapshot blesses whatever it finds —
  // including anything already wrong. So this checks the one category that
  // can be validated independently.
  //
  // isolation_chest is `categorize`'s DEFAULT for a tier-3 lift whose
  // movement_pattern the switch has no case for. That default's own comment
  // records it firing twice before ("trap work priced as a cable fly"). An
  // exercise landing there without a chest muscle in it did not get chosen —
  // it fell through.
  const chestish = (m: string) => /chest|pec/i.test(m)
  const notReallyChest = (actual.isolation_chest ?? [])
    .filter(n => !(EXERCISE_DATABASE.find(e => e.name === n)?.primary_muscles ?? []).some(chestish))

  // The three known fall-throughs, pinned BY NAME rather than by a count, so
  // fixing one while another appears still fails. Their movement_patterns are
  // CORRECT (hip_hinge, vertical_pull); the gap is that the isolation switch
  // has no case for either. hip_hinge has an obvious home (isolation_hamstring
  // exists); vertical_pull has none — there is no lat-isolation category — and
  // inventing one sets a load anchor, which is Ashley's call, so these wait.
  // Measured impact today: nil. All three are bodyweight or band and prescribe
  // no load at all. It is the next LOADED exercise with those patterns that
  // would be priced as a cable fly.
  // FIFTEEN, not three. The first version of this check listed only the three
  // exercises added in §6.2 and went red immediately with twelve more that had
  // been sitting there — core work, rear-delt work and a lat pulldown, all
  // priced off the bench press at 0.38. Six of them carry a real load:
  //
  //   Face Pulls (rear deltoid, rotator cuff)     27.5kg
  //   Reverse Pec Deck (rear deltoid)             27.5kg
  //   Straight-Arm Pulldown (lats)                27.5kg
  //   Cable Woodchops (obliques)                  27.5kg
  //   Russian Twist (obliques)                    27.5kg
  //   Rear Delt Flyes (rear deltoid)              14kg per hand
  //
  // measured for a male intermediate, 80kg, full gym. The other nine are
  // bodyweight and prescribe nothing, so they are latent rather than live.
  //
  // Two of the live ones are the reason this is logged loudly rather than
  // filed: a 27.5kg Face Pull loads the rotator cuff off a PRESSING anchor,
  // and a 27.5kg Russian Twist is a loaded spinal rotation. Neither number
  // was chosen for those movements; both are a default nobody wrote for them.
  // EMPTY, AND THAT IS THE POINT. This list held fifteen names for about an
  // hour: the three added in §6.2 plus twelve this check found on its first
  // run. Ashley's ruling was to fix all three groups properly rather than
  // patch the two dangerous ones, so `categorize` now has cases for core,
  // horizontal_pull, vertical_pull, hip_hinge and knee_dominant, and nothing
  // falls to the isolation_chest default any more.
  //
  // Kept as an empty array rather than deleted, so the check above stays live:
  // the next pattern without a case fails here by name instead of quietly
  // being priced as a cable fly.
  const KNOWN_FALLTHROUGH: string[] = []

  check('no NEW exercise falls through to the isolation_chest default',
    notReallyChest.every(n => KNOWN_FALLTHROUGH.includes(n)),
    notReallyChest.filter(n => !KNOWN_FALLTHROUGH.includes(n)))
  check('...and the known ones are still exactly those — remove them here as they are fixed',
    KNOWN_FALLTHROUGH.every(n => notReallyChest.includes(n)),
    KNOWN_FALLTHROUGH.filter(n => !notReallyChest.includes(n)))

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

console.log('\n5. Kettlebell swings are a weight that exists')
{
  // The category split is only half of it — the point was the WEIGHTS. Ashley
  // ruled on these as numbers, not as a multiplier, so they are pinned as
  // numbers here. Sharing hinge_accessory's 0.55x deadlift anchor put an 85kg
  // intermediate man on the heaviest bell in the gym and an 85kg beginner on
  // 32kg.
  const e = getExerciseEntry('Kettlebell Swing (Heavy)')
  if (!e) check('Kettlebell Swing (Heavy) exists', false)
  else {
    const opts = { sets: 3, reps: '12-15', intensity: 'RPE 7-8' } as unknown as Parameters<typeof prescribeLoad>[2]
    let pinned = 0, total = 0
    for (const gender of ['male', 'female'] as const)
      for (const training_experience of ['beginner', 'novice', 'intermediate', 'advanced'] as const)
        for (const weight_kg of [50, 60, 70, 85, 100, 120]) {
          const l = prescribeLoad(e, profileFor({ gender, training_experience, weight_kg }), opts)
          total++
          if (l?.starting_weight_kg === 48) pinned++
        }
    // THE PROPERTY THAT MATTERS: a clamp makes the prescription stop telling
    // people apart. 19 of 48 used to land on exactly 48kg.
    check('nobody is pinned to the 48kg implement ceiling', pinned === 0, { pinned, total })

    const at = (gender: 'male' | 'female', training_experience: string, weight_kg: number) =>
      prescribeLoad(e, profileFor({ gender, training_experience: training_experience as never, weight_kg }), opts)?.starting_weight_kg ?? null
    // Ashley's chosen numbers, verbatim.
    for (const [g, exp, w, want] of [
      ['male', 'beginner', 85, 14], ['male', 'intermediate', 85, 26],
      ['male', 'advanced', 85, 32], ['female', 'intermediate', 60, 12],
    ] as [('male'|'female'), string, number, number][]) {
      check(`${g} ${exp} ${w}kg -> ${want}kg`, at(g, exp, w) === want, at(g, exp, w))
    }
    // A swing must still get HEAVIER with experience and bodyweight, or the
    // fix has traded one flat prescription for another.
    check('still increases with experience',
      at('male', 'beginner', 85)! < at('male', 'intermediate', 85)! && at('male', 'intermediate', 85)! < at('male', 'advanced', 85)!)
    check('still increases with bodyweight',
      at('male', 'intermediate', 60)! < at('male', 'intermediate', 100)!,
      { at60: at('male', 'intermediate', 60), at100: at('male', 'intermediate', 100) })
  }

  // The barbell lifts that share the old bucket must NOT have moved — this is
  // why swings got their own category instead of a smaller shared multiplier.
  for (const [name, expect] of [['Good Mornings', 82.5], ['Hip Thrust', 82.5]] as [string, number][]) {
    const ex = getExerciseEntry(name)
    if (!ex) { check(`${name} exists`, false); continue }
    const l = prescribeLoad(ex, profileFor({ gender: 'male', training_experience: 'advanced', weight_kg: 85 }), { sets: 3, reps: '10-12', intensity: 'RPE 7-8' } as unknown as Parameters<typeof prescribeLoad>[2])
    check(`${name} is untouched by the swing recalibration (${expect}kg)`, l?.starting_weight_kg === expect, l?.starting_weight_kg)
  }

  // Leg Swings was in hinge_accessory only because its name contains "swing".
  const legSwings = getExerciseEntry('Leg Swings')
  if (legSwings) {
    const l = prescribeLoad(legSwings, profileFor({ gender: 'male', training_experience: 'advanced', weight_kg: 85 }), { sets: 2, reps: '10', intensity: 'Light' } as unknown as Parameters<typeof prescribeLoad>[2])
    check('a mobility drill named "swing" carries no load', l?.starting_weight_kg == null && l?.display === 'Bodyweight', l?.display)
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll categorize-precedence checks passed.\n')
