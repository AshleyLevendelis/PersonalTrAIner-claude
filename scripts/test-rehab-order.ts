// ---------------------------------------------------------------------------
// Gate: CORRECTIVE WORK IN THE PREP BLOCK IS NOT A SEQUENCING FAULT.
//
// Ashley relayed a second opinion on 18 Sep 2026 ranking "core before the main
// lift" (725 of 9,216 plans) the highest-priority coaching defect, and
// directing an immediate exercise-ordering change. The general rule behind it
// is right — a fatigued trunk before a heavy compound is a bracing problem.
//
// MEASURED FIRST, and it inverted. Reproduced from the exact combination the
// quality report named, the day reads:
//     Arm Circles (warm-up) -> Side Plank -> Pull-Ups
// and Side Plank is `isIndicatedFor` that trainee's flagged lower back. It is
// the app's REHAB slot, placed by a branch whose own comment reads "straight
// after the warm-up, before the working sets: rehab is prep". Low-intensity
// corrective work before the injured area is loaded is correct practice, so
// the plans were right and the MEASUREMENT was wrong — and reordering as
// directed would have pushed corrective work behind the heavy lifting for
// exactly the people who need it in front.
//
// The asymmetry was one rule above: `primer_not_first` has always carried this
// exemption (`allPrimersBefore && isIndicatedFor`). The core rule never got it.
//
// ASHLEY'S RULING, from three options: exempt it IN THE PREP BLOCK ONLY, over
// exempting it anywhere before the main lift and over leaving the score alone.
// Hers because it changes what a metric measures, not because the coaching was
// in doubt.
// ---------------------------------------------------------------------------

import { scorePlan } from '../src/lib/quality-score'
import { generateMesocycle, setRandomSource, resetRandomSource, getFlaggedJoints } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, isIndicatedFor } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

/** The combination the quality report named, field for field. */
function profileFor(injuries: string[]): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'bodyweight', injuries,
    training_style: 'hybrid', training_experience: 'intermediate',
    session_duration_preference: '90+', workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'love',
  } as unknown as UserProfile
}

const KEY = 'bodyweight|lower_back|90+|hybrid|intermediate|fat_loss|moderate|love'

function build(profile: UserProfile): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(KEY))
  try { return generateMesocycle(profile) } finally { resetRandomSource() }
}

const rulesOf = (r: ReturnType<typeof scorePlan>) =>
  new Set(r.dimensions.structure.deductions.map(d => d.rule))

// ---------------------------------------------------------------------------
console.log('\n[1] The real plan the report flagged')
// ---------------------------------------------------------------------------
const injured = profileFor(['lower_back'])
const meso = build(injured)
const flagged = getFlaggedJoints(injured.injuries ?? [])

// The fixture has to actually CONTAIN the shape, or everything below is
// vacuous — this is a generated subject, so it gets asserted, not assumed.
const week1 = meso.find(w => w.week_number === 1)!
let foundPrepRehab = false
for (const day of week1.days) {
  const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
  if (mainIdx <= 0) continue
  for (let i = 0; i < mainIdx; i++) {
    const entry = getExerciseEntry(day.exercises[i].name)
    if (entry && entry.movement_pattern === 'core' && isIndicatedFor(entry, flagged)) foundPrepRehab = true
  }
}
check('1a. the plan really does put indicated corrective work before a main lift',
  foundPrepRehab, { note: 'if this fails the rest of the gate proves nothing' })

check('1b. and that is no longer scored as a sequencing fault',
  !rulesOf(scorePlan(injured, meso, KEY, { skipComparisons: true } as never)).has('core_before_main'))

// ---------------------------------------------------------------------------
console.log('\n[2] The exemption is narrow in both directions')
// ---------------------------------------------------------------------------
{
  // SAME plan shape, trainee with NO flagged joint. Nothing is indicated for
  // them, so the identical placement is a real fault and must still fire.
  // This is the check that stops the exemption becoming "core is always fine".
  const healthy = profileFor([])
  const healthyMeso = build(healthy)
  const w1 = healthyMeso.find(w => w.week_number === 1)!
  let planted = false
  for (const day of w1.days) {
    const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
    if (mainIdx < 1 || planted) continue
    // Put a plain core exercise directly before the main lift.
    day.exercises.splice(mainIdx, 0, { name: 'Plank', sets: 3, reps: '30s', rest: '45s', substitution: '' } as never)
    planted = true
  }
  check('2a. the contrast fixture was actually planted', planted)
  check('2b. core before the main lift still fires for a trainee with no injury',
    rulesOf(scorePlan(healthy, healthyMeso, KEY, { skipComparisons: true } as never)).has('core_before_main'))

  // AND THE PREP-BLOCK HALF. Ashley rejected exempting corrective work
  // anywhere before the main lift, because that stops the app noticing work
  // that drifted into the middle of the heavy lifting. So the same indicated
  // exercise, with a working set in front of it, must still fire.
  const drifted = build(injured)
  const dw1 = drifted.find(w => w.week_number === 1)!
  let moved = false
  for (const day of dw1.days) {
    const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
    if (mainIdx <= 0 || moved) continue
    const rehabIdx = day.exercises.findIndex((e, i) => {
      const entry = getExerciseEntry(e.name)
      return i < mainIdx && !!entry && entry.movement_pattern === 'core' && isIndicatedFor(entry, flagged)
    })
    if (rehabIdx < 0) continue
    // Slide a real working exercise in FRONT of the corrective work, so the
    // corrective work is no longer in the prep block. Building it this way
    // round matters: my first attempt spliced the rehab exercise out and back
    // in at `mainIdx`, which by then had shifted down one, so it landed AFTER
    // the main lift and correctly did not fire. The fixture was wrong, not the
    // code, and it read exactly like the exemption being too broad.
    const working = day.exercises.findIndex((e, i) => {
      const entry = getExerciseEntry(e.name)
      return i > mainIdx && !!entry && entry.mechanics_tier !== 'primer' && !isIndicatedFor(entry, flagged)
    })
    if (working < 0) continue
    const [w] = day.exercises.splice(working, 1)
    day.exercises.splice(rehabIdx, 0, w)
    moved = true
  }
  check('2c. the drifted fixture was actually built', moved)
  check('2d. corrective work AFTER a working set still fires, as she ruled',
    rulesOf(scorePlan(injured, drifted, KEY, { skipComparisons: true } as never)).has('core_before_main'))
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)
