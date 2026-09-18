// ---------------------------------------------------------------------------
// Gate: A TRIMMED SESSION LOSES SETS, NEVER A MOVEMENT PATTERN.
//
// The quality sweep after the 18 Sep rest work showed weeks with no squat
// pattern at all going from 4 to 22 of 9,216 — a real cost of Ashley's
// "protect the rest, do less" ruling, recorded at the time as hers to weigh.
//
// Decided 18 Sep 2026 under her standing delegation of training questions
// rather than handed back: a microcycle that contains no knee-dominant work is
// not a lighter week, it is an incomplete needs analysis. Push, pull, hinge and
// squat are the patterns a programme is built from; accessory volume is the
// adjustable part. That is not a preference between two defensible options, so
// it is a defect and it is fixed.
//
// AND THE APP ALREADY AGREED WITH ITSELF. stageTimeCap's Phase 5 says, in its
// own comment, "a short session should mean fewer sets, not a session missing
// whole movement patterns". Phase 4 — the loop directly above it — removed
// whole exercises with no such guard, and sizeBlockToRestBudget's Phase B was
// written to match Phase 4 and inherited the gap.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import { getExerciseEntry } from '../src/lib/exercise-db'
import {
  generateMesocycle, setRandomSource, resetRandomSource,
  isLastCarrierOfPattern, getConstrainedPool, mapMovementPattern,
} from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, SessionDuration, EquipmentAccess, TrainingStyle } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const FUNDAMENTALS = ['push', 'pull', 'hinge', 'squat'] as const

function profileFor(equipment: EquipmentAccess, style: TrainingStyle, duration: SessionDuration): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1800, tdee: 2500,
    equipment_access: equipment, injuries: [],
    training_style: style, training_experience: 'intermediate',
    session_duration_preference: duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  } as UserProfile
}

// ---------------------------------------------------------------------------
console.log('\n[1] The rule itself: what may be shed and what may not')
// ---------------------------------------------------------------------------
{
  const e = (name: string) => getExerciseEntry(name)!
  const squatA = e('Barbell Squats')
  const squatB = e('Goblet Squats')
  const press = e('Barbell Bench Press')
  const curl = e('Dumbbell Curls')

  check('1a. these fixtures really are the patterns this gate thinks they are', [
    mapMovementPattern(squatA.movement_pattern) === 'squat',
    mapMovementPattern(squatB.movement_pattern) === 'squat',
    mapMovementPattern(press.movement_pattern) === 'push',
    mapMovementPattern(curl.movement_pattern) === 'isolation',
  ].every(Boolean), {
    squatA: mapMovementPattern(squatA.movement_pattern),
    squatB: mapMovementPattern(squatB.movement_pattern),
    press: mapMovementPattern(press.movement_pattern),
    curl: mapMovementPattern(curl.movement_pattern),
  })

  const oneSquat = [press, squatA, curl]
  check('1b. the only squat in a day is protected', isLastCarrierOfPattern(oneSquat, 1))
  check('1c. ...and the accessory beside it is not', !isLastCarrierOfPattern(oneSquat, 2))
  check('1d. ...and neither is the only PUSH, which is also protected', isLastCarrierOfPattern(oneSquat, 0))

  const twoSquats = [press, squatA, squatB, curl]
  check('1e. with two squats, neither is the last one', ![1, 2].some(i => isLastCarrierOfPattern(twoSquats, i)))

  // Isolation is deliberately NOT a protected pattern: accessory volume is the
  // adjustable part, and protecting it would leave the trimmer nothing to shed.
  check('1f. a lone isolation movement is shedding material, not a pattern',
    !isLastCarrierOfPattern([squatA, curl], 1))

  check('1g. an index that holds nothing is not protected by accident',
    !isLastCarrierOfPattern([squatA, null], 1) && !isLastCarrierOfPattern([], 0))
}

// ---------------------------------------------------------------------------
console.log('\n[2] Both trimmers ask, and the pressure is real')
// ---------------------------------------------------------------------------
{
  const plan = stripComments(readFileSync(join(ROOT, 'src/lib/exercise-plan.ts'), 'utf8'))
  // `name(` rather than the bare name: an import line is not a use, and a
  // check that matches one passes over the exact defect it was written for.
  const calls = (plan.match(/isLastCarrierOfPattern\(/g) ?? []).length
  check('2a. both removal loops consult it, not just the one that was reported',
    calls >= 3, { calls, note: 'one definition + one call in each of the two trimmers' })
  check('2b. the detector needs a call, not an import',
    !/isLastCarrierOfPattern\(/.test('import { isLastCarrierOfPattern } from "./exercise-plan"'))
}

// ---------------------------------------------------------------------------
console.log('\n[3] A real generated week keeps every pattern its kit can supply')
// ---------------------------------------------------------------------------
// SEEDED, and under real PRESSURE. An unseeded run picks exercises through
// Math.random and would measure the dice; a comfortable fixture never reaches
// the trimmers this gate exists to hold. Both were learned the hard way by
// test:rest-floors on 18 Sep, which passed unseeded and failed on its next run
// against identical code.
{
  const cases: [EquipmentAccess, TrainingStyle, SessionDuration][] = [
    ['full_gym', 'bodybuilding', '30-45'],
    ['full_gym', 'functional', '30-45'],
    ['home_gym', 'hybrid', '30-45'],
    ['minimalist', 'functional', '30-45'],
    ['full_gym', 'combat', '30-45'],
    ['home_gym', 'bodybuilding', '45-60'],
  ]
  let trimmedSomewhere = 0
  const gaps: string[] = []
  for (const [equipment, style, duration] of cases) {
    const profile = profileFor(equipment, style, duration)
    setRandomSource(seededRngFromKey(`${equipment}|${style}|${duration}`))
    try {
      const meso = generateMesocycle(profile)
      const week1 = meso.find(w => w.week_number === 1)
      const pool = getConstrainedPool(profile, [])
      const poolPatterns = new Set(pool.map(p => mapMovementPattern(p.movement_pattern)))
      const present = new Set<string>()
      let exerciseCount = 0
      for (const day of week1?.days ?? []) {
        exerciseCount += day.exercises.length
        for (const ex of day.exercises) if (ex.movement_pattern) present.add(ex.movement_pattern)
      }
      // Vacuity guard: a week nobody trimmed proves nothing about a trimmer.
      // A 30-45 minute session that still fits every exercise it was handed is
      // not under pressure, and its passing says only that.
      const trimmed = (week1?.days ?? []).some(d => d.exercises.length <= 4)
      if (trimmed) trimmedSomewhere++
      for (const p of FUNDAMENTALS) {
        if (poolPatterns.has(p) && !present.has(p)) {
          gaps.push(`${equipment}/${style}/${duration}: no ${p} (${exerciseCount} exercises in the week)`)
        }
      }
    } finally {
      resetRandomSource()
    }
  }
  check('3a. no week is missing a pattern its equipment could have supplied',
    gaps.length === 0, gaps.slice(0, 4))
  check('3b. ...and at least some of these sessions were actually squeezed, so 3a is not vacuous',
    trimmedSomewhere > 0, { trimmedSomewhere, of: cases.length })
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
// ONE exit, at the bottom, reached by every path — a gate that can print FAIL
// and exit 0 is worse than no gate, because the tick becomes evidence.
if (failures > 0) process.exit(1)
