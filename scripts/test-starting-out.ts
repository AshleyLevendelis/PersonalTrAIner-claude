// ---------------------------------------------------------------------------
// "Starting out" gate — the coaching call that a day should be a walk.
//
// The premise being protected (Ashley's, and the reason this isn't a second
// plan type): a plan is a plan. Same weeks, same blocks, same days. The only
// thing that differs for someone who isn't exercising yet is what's
// prescribed INSIDE each day.
//
// Both bugs this file locks down were found by generating a real plan and
// reading it, not by inspecting the code:
//   1. Rest-day conditioning suggestions were also being turned into walks,
//      so a chosen three-day week came out as five sessions.
//   2. A per-week ramp hit the duration ceiling by week 6 and then flatlined
//      for ten weeks.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle } from '../src/lib/exercise-plan'
import { isStartingOut, startingOutMinutes, STARTING_OUT_PRESCRIPTION } from '../src/lib/starting-out'
import type { UserProfile } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const CHOSEN_DAYS = ['Monday', 'Wednesday', 'Friday']
const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function profileOf(over: Partial<UserProfile> = {}): UserProfile {
  return {
    age: 63, gender: 'female', height_cm: 165, weight_kg: 72,
    activity_level: 'sedentary', fitness_goal: 'functional',
    training_days: ALL_DAYS.map(d => ({ day: d, available: CHOSEN_DAYS.includes(d) })),
    preferred_time: 'morning', dietary_preferences: [],
    session_duration_preference: '30-45', workout_split_preference: 'ai_recommendation',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'bodyweight',
    training_style: 'functional', training_experience: 'beginner',
    coaching_persona: 'supportive', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...over,
  }
}

console.log('starting-out gate\n')

console.log('1. Who this applies to — read from answers they already give')
check('beginner + sedentary → starting out', isStartingOut(profileOf()))
check('beginner but ACTIVE → normal plan (has real work capacity)', !isStartingOut(profileOf({ activity_level: 'active' })))
check('sedentary but ADVANCED → normal plan (returning, not starting)', !isStartingOut(profileOf({ training_experience: 'advanced' })))
check('sedentary + novice → normal plan', !isStartingOut(profileOf({ training_experience: 'novice' })))

console.log('\n2. The week they actually get')
const plan = generateExercisePlan(profileOf()).plan
check('every day is a walk', plan.every(d => d.plannedActivity?.activity === 'Walk'), JSON.stringify(plan.map(d => d.focus)))
check('no day carries exercises', plan.every(d => d.exercises.length === 0))
check(
  'EXACTLY the three days they chose — no appended extra sessions',
  plan.length === 3 && CHOSEN_DAYS.every(d => plan.some(p => p.day === d)),
  `got ${plan.length}: ${plan.map(d => d.day).join(', ')}`,
)
check('each day marked scheduled (so a logged walk builds a streak)', plan.every(d => d.is_scheduled === true))
check('first block is the gentle starting dose', plan.every(d => d.plannedActivity!.duration === STARTING_OUT_PRESCRIPTION.startMinutes))
check('effort target is conversational, not hard', plan.every(d => d.plannedActivity!.targetRpe === STARTING_OUT_PRESCRIPTION.targetRpe))
check('every day explains itself in coach voice', plan.every(d => (d.plannedActivity!.reason ?? '').length > 20))

console.log('\n3. Progression — steps per block, never plateaus early, never overreaches')
const meso = generateMesocycle(profileOf(), plan)
const perWeek = meso.map(w => ({
  week: w.week_number,
  block: w.block_number ?? 1,
  minutes: w.days.find(d => d.plannedActivity)?.plannedActivity?.duration ?? 0,
}))
check('all 16 weeks prescribe a walk', perWeek.every(w => w.minutes > 0), JSON.stringify(perWeek))
check('week 1 starts at the starting dose', perWeek[0].minutes === STARTING_OUT_PRESCRIPTION.startMinutes)
check('duration never decreases', perWeek.every((w, i) => i === 0 || w.minutes >= perWeek[i - 1].minutes))
check('holds steady within a block', perWeek.filter(w => w.block === 1).every(w => w.minutes === perWeek[0].minutes))
const blockMinutes = [1, 2, 3, 4].map(b => perWeek.find(w => w.block === b)?.minutes ?? 0)
check('steps up once per block', new Set(blockMinutes).size === 4, JSON.stringify(blockMinutes))
check(
  'each step is one small increment, never a jump',
  blockMinutes.every((m, i) => i === 0 || m - blockMinutes[i - 1] === STARTING_OUT_PRESCRIPTION.blockIncrementMinutes),
  JSON.stringify(blockMinutes),
)
check('never exceeds the ceiling', perWeek.every(w => w.minutes <= STARTING_OUT_PRESCRIPTION.capMinutes))
check(
  'still progressing in the final block (no long flatline)',
  blockMinutes[3] > blockMinutes[2],
  `block3=${blockMinutes[2]} block4=${blockMinutes[3]}`,
)
const finalWeekly = blockMinutes[3] * 3
check('final weekly volume is sane for a first-timer (60-150 min)', finalWeekly >= 60 && finalWeekly <= 150, `${finalWeekly} min/week`)

console.log('\n4. The ceiling holds even far out')
check('block 20 still capped', startingOutMinutes(20) === STARTING_OUT_PRESCRIPTION.capMinutes)
check('block 0/1 both give the starting dose', startingOutMinutes(0) === STARTING_OUT_PRESCRIPTION.startMinutes && startingOutMinutes(1) === STARTING_OUT_PRESCRIPTION.startMinutes)

console.log('\n5. Regression — everyone else is untouched')
for (const [label, over] of [
  ['active beginner', { activity_level: 'active' as const }],
  ['sedentary advanced', { training_experience: 'advanced' as const, equipment_access: 'full_gym' as const }],
  ['moderate novice', { activity_level: 'moderate' as const, training_experience: 'novice' as const }],
] as const) {
  const p = generateExercisePlan(profileOf(over)).plan
  check(`${label}: still gets real exercises`, p.some(d => d.exercises.length > 0))
  check(`${label}: no walk substitution`, !p.some(d => d.plannedActivity))
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll starting-out checks passed.')
