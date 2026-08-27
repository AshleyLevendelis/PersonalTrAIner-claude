// ---------------------------------------------------------------------------
// How often does an injured trainee actually RECEIVE the rehab work the
// database has marked for their joint?
//
// `indicated_joints` is documented in exercise-db.ts as "the prep/rehab work a
// physio would prescribe FOR that joint... the plan should deliberately
// include them when the matching injury is present." Nothing implements that
// sentence: isIndicatedFor is read only by isContraindicatedFor (to keep rehab
// ELIGIBLE) and by one label-writing line. So any rehab that reaches a plan
// today arrives by luck.
//
// This measures the luck, per joint, before the fix — and is the same script
// that measures after, so the two numbers are comparable by construction
// rather than by my remembering to hold the sweep constant.
//
// The two joints are expected to differ sharply and it matters why: knee-rehab
// movements are ALSO some of the only leg work that survives a knee injury, so
// a knee-injured trainee may already meet them often. Shoulder-rehab movements
// are warm-up-tier and compete with every other primer, so they may almost
// never appear. One headline number across both joints would hide that.
// ---------------------------------------------------------------------------

import { generateExercisePlan, setRandomSource, resetRandomSource, getFlaggedJoints } from '../src/lib/exercise-plan'
import { getExerciseEntry, isIndicatedFor } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
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

function gen(profile: UserProfile, seed: string): WorkoutDay[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateExercisePlan(profile).plan } finally { console.debug = d; console.warn = w; resetRandomSource() }
}

const SPLITS = ['upper_lower', 'push_pull_legs', 'full_body', 'ai_recommendation'] as const
const STYLES = ['hybrid', 'bodybuilding', 'functional'] as const
const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const
const DURATIONS = ['30-45', '45-60', '60-90'] as const

interface Row {
  days: number
  daysWithRehab: number
  plansWithNoRehabAtAll: number
  plans: number
  byName: Map<string, number>
}

function sweep(injury: string): Row {
  const flagged = getFlaggedJoints([injury])
  const row: Row = { days: 0, daysWithRehab: 0, plansWithNoRehabAtAll: 0, plans: 0, byName: new Map() }
  for (const split of SPLITS) {
    for (const style of STYLES) {
      for (const equipment_access of EQUIP) {
        for (const session_duration_preference of DURATIONS) {
          const profile = buildProfile({
            injuries: [injury], workout_split_preference: split, training_style: style,
            equipment_access, session_duration_preference,
          })
          const plan = gen(profile, `rehab:${injury}:${split}:${style}:${equipment_access}:${session_duration_preference}`)
          row.plans++
          let planHadAny = false
          for (const day of plan) {
            if (day.exercises.length === 0) continue
            row.days++
            const hits = day.exercises.filter(ex => {
              const e = getExerciseEntry(ex.name)
              return !!e && isIndicatedFor(e, flagged)
            })
            if (hits.length === 0) continue
            row.daysWithRehab++
            planHadAny = true
            for (const h of hits) row.byName.set(h.name, (row.byName.get(h.name) ?? 0) + 1)
          }
          if (!planHadAny) row.plansWithNoRehabAtAll++
        }
      }
    }
  }
  return row
}

function report(label: string, row: Row) {
  const pct = row.days === 0 ? 0 : (row.daysWithRehab / row.days) * 100
  console.log(`\n${label}`)
  console.log(`  training days carrying at least one indicated movement: ${row.daysWithRehab}/${row.days} (${pct.toFixed(1)}%)`)
  console.log(`  whole plans containing NONE at all:                     ${row.plansWithNoRehabAtAll}/${row.plans}`)
  const top = [...row.byName].sort((a, b) => b[1] - a[1])
  console.log(`  which movements arrived: ${top.length === 0 ? '(none)' : top.map(([n, c]) => `${n}=${c}`).join(', ')}`)
}

console.log('Rehab coverage for an injured trainee — how often the marked work actually arrives.')
console.log(`Sweep: ${SPLITS.length} splits x ${STYLES.length} styles x ${EQUIP.length} equipment tiers x ${DURATIONS.length} session lengths.`)

report('SHOULDER injury (9 movements marked: 7 warm-up tier, 2 isolation)', sweep('shoulders'))
report('KNEE injury (10 movements marked: 0 warm-up tier, 7 isolation, 3 compound)', sweep('knees'))

// Added when hips and the lower back got rehab of their own. They read 0/0
// BEFORE that work and are the headline it has to move — kept in the same
// script as the two that already worked so all four numbers come off one
// sweep, rather than from a second tool that could drift from this one.
report('HIP injury (4 marked: 3 activation primers written for this, plus Bird Dog)', sweep('hips'))
report('LOWER BACK injury (3 marked, all tier3: Dead Bug, Side Plank, Bird Dog)', sweep('lower_back'))

// The over-fire control. An uninjured trainee has no flagged joints, so this
// must read 0 both before and after the fix — if the AFTER run moves this off
// zero, the rehab slot is firing for people who never reported an injury.
const none = sweep('__no_such_injury__')
console.log(`\nCONTROL — no injury flagged: ${none.daysWithRehab}/${none.days} days (must be 0 before AND after)`)
