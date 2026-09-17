// ---------------------------------------------------------------------------
// ONE CARD, ONE SET COUNT: the weight chips and the "N working sets" line.
//
// Ashley saw a card reading "3 working sets" above four weight chips. The
// chips come from `per_set_load`; the line comes from `sets`. They are two
// views of one number and must agree.
//
// WHY THIS IS A WHOLE-PLAN SWEEP AND NOT A UNIT TEST. `resizePerSetLoads` is
// trivially correct in isolation — it takes a count and returns that many
// entries, and a unit test of it would have passed throughout the bug. What
// was wrong was WHERE it ran. At least five passes change `sets` after the
// loads are built (the time-cap trimmer at two sites, the duration-budget
// pass, the duration filler, the conditioning progression, and the weekly
// pattern-balance pass, which both bumps and trims), and reconciling at the
// ones I could name still left 72 mismatches from the one I could not.
//
// So the property this pins is the OUTPUT's, not any pass's: no exercise
// leaving plan generation may carry a `per_set_load` whose length differs
// from its `sets`. That holds for a writer nobody has written yet, which a
// check anchored on the passes I happen to know about would not.
//
// Both public generation entry points are swept, because they finalise
// separately: generateExercisePlan (the single week) and generateMesocycle
// (every week of every block, deloads and calibration weeks included).
//
// Seeded, so it gives the same answer on a Tuesday.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

// Spread across goal, experience, equipment and session length, because the
// passes that move `sets` are driven by exactly those: the trimmers fire on
// short sessions, the filler on long ones, the balance pass on splits that
// skew push or pull.
const PROFILES: Array<[string, Partial<UserProfile>]> = [
  ['A hypertrophy/intermediate/full-gym/60-90', {}],
  ['B fat_loss/beginner/home-basic/30-45', {
    fitness_goal: 'fat_loss', training_experience: 'beginner',
    equipment_access: 'home_basic', session_duration_preference: '30-45',
  }],
  ['C functional/advanced/full-gym/low-recovery', {
    fitness_goal: 'functional_fitness', training_experience: 'advanced',
    recovery_capacity: 'low',
  }],
  ['D endurance/intermediate/dumbbells/45-60', {
    fitness_goal: 'endurance', equipment_access: 'dumbbells_only',
    session_duration_preference: '45-60',
  }],
]

const quiet = <T,>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

type Offence = { where: string; name: string; sets: number; chips: number }

function scan(where: string, days: WorkoutDay[], out: Offence[]): number {
  let loaded = 0
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!ex.per_set_load?.length) continue
      loaded++
      if (ex.per_set_load.length === ex.sets) continue
      out.push({ where: `${where} ${day.day}`, name: ex.name, sets: ex.sets, chips: ex.per_set_load.length })
    }
  }
  return loaded
}

// ---------------------------------------------------------------------------
console.log('\n1. Every generated week: chips === sets')
// ---------------------------------------------------------------------------
{
  const offences: Offence[] = []
  let loaded = 0
  for (const [label, o] of PROFILES) {
    const profile = buildProfile(o)

    setRandomSource(seededRngFromKey(`chips-match-sets:week:${label}`))
    const single = quiet(() => generateExercisePlan(profile))
    resetRandomSource()
    loaded += scan(`${label} single-week`, single.plan, offences)

    setRandomSource(seededRngFromKey(`chips-match-sets:meso:${label}`))
    const meso = quiet(() => generateMesocycle(profile))
    resetRandomSource()
    for (const week of meso) {
      loaded += scan(`${label} wk${week.week_number}${week.is_deload ? '(deload)' : ''}`, week.days, offences)
    }
  }

  // A vacuous pass is the failure mode this guards against: if generation
  // stopped producing per_set_load at all, every exercise would be skipped
  // and the sweep would report zero offences out of zero.
  check(`the sweep actually saw loaded exercises (${loaded})`, loaded > 500,
    `only ${loaded} exercises carried a per_set_load — the sweep is not measuring what it claims`)

  check(`no exercise ships more or fewer chips than sets (0 of ${loaded})`, offences.length === 0,
    offences.slice(0, 8).map(o => `${o.where} ${o.name}: sets=${o.sets} chips=${o.chips}`).join('; ')
      + (offences.length > 8 ? ` … and ${offences.length - 8} more` : ''))
}

// ---------------------------------------------------------------------------
console.log('\n2. A resized ramp is a real ramp, not a truncation')
// ---------------------------------------------------------------------------
{
  // Dropping a set from a 70/80/90/100% ramp is not "delete the last entry"
  // — it is the ramp generation would have built for that many sets. Pinned
  // because a slice would satisfy section 1 while prescribing a warm-up
  // shape nobody chose.
  const offences: string[] = []
  let ramps = 0
  for (const [label, o] of PROFILES) {
    setRandomSource(seededRngFromKey(`chips-match-sets:ramp:${label}`))
    const meso = quiet(() => generateMesocycle(buildProfile(o)))
    resetRandomSource()
    for (const week of meso) {
      for (const day of week.days) {
        for (const ex of day.exercises) {
          const ps = ex.per_set_load
          if (!ps || ps.length < 2) continue
          const weights = ps.map(p => p.load_kg)
          if (new Set(weights).size === 1) continue
          ramps++
          for (let i = 1; i < weights.length; i++) {
            if (weights[i] < weights[i - 1]) {
              offences.push(`${label} wk${week.week_number} ${ex.name}: ${weights.join('/')} does not climb`)
              break
            }
          }
          if (ps.some((p, i) => p.set_number !== i + 1)) {
            offences.push(`${label} wk${week.week_number} ${ex.name}: set numbers ${ps.map(p => p.set_number).join('/')}`)
          }
          // THE TOP SET SURVIVES THE RESIZE. This is the half a slice passes
          // the rest of section 2 without: chopping the tail off 70/80/90/100
          // leaves 70/80 — still climbing, still numbered 1..2, and the
          // working set is gone. The headline weight on the card is
          // suggested_load_kg, so the heaviest chip has to BE it, or the card
          // shows a number none of its own chips reach.
          if (ex.suggested_load_kg != null && Math.abs(weights[weights.length - 1] - ex.suggested_load_kg) > 1e-9) {
            offences.push(`${label} wk${week.week_number} ${ex.name}: top chip ${weights[weights.length - 1]} but card says ${ex.suggested_load_kg}`)
          }
        }
      }
    }
  }
  check(`the sweep found ramps to check (${ramps})`, ramps > 20, `only ${ramps} ramping prescriptions`)
  check('every ramp climbs, is numbered 1..n, and ends on the card\'s headline weight', offences.length === 0,
    offences.slice(0, 5).join('; '))
}

console.log(failures === 0 ? '\nAll chips-match-sets checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
