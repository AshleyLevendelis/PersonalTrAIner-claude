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
import { getExerciseEntry, EXERCISE_DATABASE } from '../src/lib/exercise-db'
import {
  generateMesocycle, setRandomSource, resetRandomSource, sizeBlockToRestBudget,
  isLastCarrierOfPattern, isStructuralSlot, getConstrainedPool, mapMovementPattern,
} from '../src/lib/exercise-plan'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type {
  UserProfile, SessionDuration, EquipmentAccess, TrainingStyle, WorkoutDay, Exercise,
} from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const FUNDAMENTALS = ['push', 'pull', 'hinge', 'squat'] as const

/**
 * The quality harness's profile, field for field. It has to be: the cases
 * below are REAL OFFENDERS lifted out of a 9,216-profile measurement run with
 * the guard disabled, and a fixture that differs by one field is a different
 * plan.
 */
interface Combo {
  equipment: EquipmentAccess
  duration: SessionDuration
  style: TrainingStyle
  experience: UserProfile['training_experience']
  goal: UserProfile['fitness_goal']
  recovery: UserProfile['recovery_capacity']
  cardio: UserProfile['conditioning_preference']
}

/** Byte-for-byte the key `measure-pattern-coverage.ts` seeds each combo with. */
function comboKey(c: Combo): string {
  return [c.equipment, 'none', c.duration, c.style, c.experience, c.goal, c.recovery, c.cardio].join('|')
}

function profileFor(c: Combo): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', fitness_goal: c.goal, preferred_time: 'morning',
    bmr: 1800, tdee: 2500,
    equipment_access: c.equipment, injuries: [],
    training_style: c.style, training_experience: c.experience,
    session_duration_preference: c.duration,
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
    recovery_capacity: c.recovery, conditioning_preference: c.cardio,
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

  // MOVEMENT PREP IS PROTECTED ON THE SAME FOOTING, and this half exists
  // because protecting the patterns alone made things WORSE. Measured over the
  // full 9,216 grid with the pattern guard off and on: squat-less weeks 22 ->
  // 0, prep-less days 16 -> 102. The trimmer did not gain room, it moved on to
  // the front of the day. Eighty-six warm-ups for twenty-two squats.
  const primer = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'primer')!
  check('1h. the fixture really is a primer', primer.mechanics_tier === 'primer', { name: primer.name })
  check('1i. a movement-prep slot is never shed, even with prep beside it',
    isStructuralSlot([primer, primer, squatA, curl], 0)
    && isStructuralSlot([primer, primer, squatA, curl], 1))
  check('1j. ...and it is the TIER that protects it, not being last of a pattern',
    !isLastCarrierOfPattern([primer, primer, squatA, curl], 0))
  check('1k. an accessory is still shedding material with a primer in the day',
    !isStructuralSlot([primer, squatA, curl], 2))
  check('1l. and the wider rule still carries the pattern half',
    isStructuralSlot([press, squatA, curl], 1) && !isStructuralSlot([press, squatA, curl], 2))
}

// ---------------------------------------------------------------------------
console.log('\n[2] Both trimmers ask, and the pressure is real')
// ---------------------------------------------------------------------------
{
  const plan = stripComments(readFileSync(join(ROOT, 'src/lib/exercise-plan.ts'), 'utf8'))
  // `name(` rather than the bare name: an import line is not a use, and a
  // check that matches one passes over the exact defect it was written for.
  const calls = (plan.match(/isStructuralSlot\(/g) ?? []).length
  check('2a. both removal loops consult it, not just the one that was reported',
    calls >= 3, { calls, note: 'one definition + one call in each of the two trimmers' })
  check('2b. the detector needs a call, not an import',
    !/isStructuralSlot\(/.test('import { isStructuralSlot } from "./exercise-plan"'))
  // AND NEITHER TRIMMER MAY ASK THE NARROWER QUESTION. A loop still calling
  // isLastCarrierOfPattern directly would protect the patterns and go on
  // shedding warm-ups, which is precisely the state this fix replaced.
  const narrow = (plan.match(/^\s*!?isLastCarrierOfPattern\(entriesNow/gm) ?? []).length
  check('2c. no removal loop asks only about patterns any more', narrow === 0, { narrow })
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
  // THE FIRST FOUR ARE MEASURED OFFENDERS, not plausible fixtures. They come
  // out of a 9,216-profile run with the guard switched off, which is the only
  // honest way to know a case is under pressure — my own hand-picked six all
  // passed with the guard disabled and proved nothing. Every one is a combat
  // profile on a 30-45 minute session: the shortest budget against a style
  // whose own table asks for the longest rests.
  const cases: Combo[] = [
    { equipment: 'full_gym', duration: '30-45', style: 'combat', experience: 'novice', goal: 'fat_loss', recovery: 'moderate', cardio: 'love' },
    { equipment: 'full_gym', duration: '30-45', style: 'combat', experience: 'novice', goal: 'conditioning', recovery: 'high', cardio: 'love' },
    { equipment: 'home_gym', duration: '30-45', style: 'combat', experience: 'novice', goal: 'fat_loss', recovery: 'moderate', cardio: 'love' },
    { equipment: 'home_gym', duration: '30-45', style: 'combat', experience: 'advanced', goal: 'conditioning', recovery: 'moderate', cardio: 'love' },
    // And a spread beside them, so the gate is not pinned to one shape.
    { equipment: 'full_gym', duration: '30-45', style: 'bodybuilding', experience: 'intermediate', goal: 'hypertrophy', recovery: 'moderate', cardio: 'tolerate' },
    { equipment: 'minimalist', duration: '30-45', style: 'functional', experience: 'intermediate', goal: 'hypertrophy', recovery: 'moderate', cardio: 'tolerate' },
  ]
  let trimmedSomewhere = 0
  const gaps: string[] = []
  for (const combo of cases) {
    const profile = profileFor(combo)
    setRandomSource(seededRngFromKey(comboKey(combo)))
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
          gaps.push(`${comboKey(combo)}: no ${p} (${exerciseCount} exercises in the week)`)
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

// ---------------------------------------------------------------------------
console.log('\n[4] The real trimmer, on a day built to make it choose')
// ---------------------------------------------------------------------------
// §3 asks whether generated weeks come out intact, which is the outcome that
// matters but is a WEAK test of the guard: measured, disabling
// isLastCarrierOfPattern entirely leaves §3 green, because none of six
// reasonable profiles happens to sit on the knife edge. A gate built from
// comfortable fixtures never reaches the code it exists to hold.
//
// So this hands the real exported trimmer a day that is genuinely over budget
// and whose ONLY squat sits LAST — the position Phase B removes from first.
// Before the guard this day lost its squat; after it, an accessory goes
// instead. Deterministic, no seed, no dice.
{
  const ex = (name: string, sets: number, rest: string): Exercise =>
    ({ name, sets, reps: '8-10', rest, substitution: '' })

  const squeezedDay = (): WorkoutDay => ({
    day: 'Monday',
    focus: 'Full body',
    exercises: [
      ex('Barbell Bench Press', 3, '90s'),
      ex('Dumbbell Shoulder Press', 3, '75s'),
      ex('Cable Lateral Raises', 3, '60s'),
      ex('Overhead Tricep Extension', 3, '60s'),
      ex('Cable Woodchops', 3, '60s'),
      // The whole point: the day's only squat pattern, at the end of the
      // array, where the lowest-tier work lives and the trimmer starts.
      ex('Goblet Squats', 3, '75s'),
    ],
  })

  const before = squeezedDay().exercises.map(e => e.name)
  const [after] = sizeBlockToRestBudget(
    [squeezedDay()], 200, 18 * 60, new Set(), getGoalPolicy('hypertrophy'), [],
  )
  const names = after.exercises.map(e => e.name)

  check('4a. the day really was squeezed — something had to go',
    names.length < before.length, { before: before.length, after: names.length })
  check('4b. and what went was not the day\'s only squat',
    names.includes('Goblet Squats'), { names })
  check('4c. an accessory went in its place, from the end inwards',
    !names.includes('Cable Woodchops'), { names })
  // Contrast, so 4b cannot pass by the trimmer simply doing nothing: the
  // exercises that SHOULD survive are the ones that did.
  check('4d. the main lift and the day\'s only squat are what is left standing',
    names.includes('Barbell Bench Press') && names.includes('Goblet Squats')
    && names.length === 3, { names })
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
// ONE exit, at the bottom, reached by every path — a gate that can print FAIL
// and exit 0 is worse than no gate, because the tick becomes evidence.
if (failures > 0) process.exit(1)
