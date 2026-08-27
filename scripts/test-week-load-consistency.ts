/**
 * Gate: one lift, one weight, in a given week.
 *
 * The defect: the same exercise, in the same week, with IDENTICAL
 * sets/reps/intensity, prescribed two different weights. A user opening the
 * app saw "Calf Raises 3x15-20 @ RPE 6-7" at 12.5kg on one day and 20kg on
 * another, with no way to tell which was right.
 *
 * It surfaced as 2 `rotation_relative_load` failures in test:audit, which
 * made it look like a rotation problem. It was not: the audit only compares
 * consecutive weeks at the same slot INDEX, so it saw only the handful of
 * cases where the second instance happened to land in a slot that changed
 * hands. MEASURED across the same 4x4x4 sweep the audit uses: 202 of 1,536
 * lift-weeks, not 2.
 *
 * Cause: exercise-plan.ts memoised the per-week REP bump
 * (frozenBumpDecidedThisWeek) and the per-week CARRY step
 * (carryStepDecidedThisWeek) — the file's own comment describes the rep
 * version of this exact bug, "'4-6' on Monday and '5-7' on Thursday" — but
 * never the weight. A lift holding two slots in a week re-derived
 * independently in the second and could land an increment out.
 *
 * WHAT REMAINS IS DELIBERATE, and this gate draws that line rather than
 * pretending the number is zero. enforceLoadCoherence applies ceilings
 * relative to THAT DAY'S main lift — a unilateral accessory against the day's
 * bilateral main lift, and curls/laterals/shrugs against the day's main press.
 * Different days have different main lifts, so those ceilings legitimately
 * differ, and a safety ceiling outranks week-level consistency. Every
 * remaining case is one of those two shapes; anything else is a regression.
 */
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { WEIGHT_GENDER_OPTIONS, ALL_EXPERIENCE } from '../src/lib/dev-constraint-audit'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import type { UserProfile, EquipmentAccess, TrainingExperience } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

function base(o: Partial<UserProfile>): UserProfile {
  return { age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate',
    // 60-90, matching baseMesocycleProfile in dev-constraint-audit.ts. The
    // audit's own failure LABEL says 45-60, which is a hardcoded string at the
    // point the case is recorded and does not name the profile it used — two
    // reproduction attempts went to the wrong configuration because of it.
    session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o } as UserProfile
}
const quiet = <T,>(f: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return f() } finally { console.debug = d; console.warn = w; console.log = l }
}

/** The two shapes enforceLoadCoherence legitimately varies BY DAY. */
const dayCeilingApplies = (name: string) => {
  const e = EXERCISE_DATABASE.find(x => x.name === name)
  if (!e) return false
  return !!e.unilateral
    || e.movement_pattern === 'isolation_bicep'
    || e.movement_pattern === 'isolation_shoulder'
}

let weeks = 0, total = 0, explained = 0
const unexplained: string[] = []

for (const equipment of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[])
  for (const experience of ALL_EXPERIENCE as TrainingExperience[])
    for (const { weightKg, gender } of WEIGHT_GENDER_OPTIONS) {
      // Seeded exactly as the audit seeds, so this and test:audit describe the
      // same plans. An unseeded sweep here would be a coin flip.
      const comboLabel = `[mesocycle safety] equipment=${equipment} experience=${experience} weight=${weightKg} gender=${gender}`
      const meso = quiet(() => {
        setRandomSource(seededRngFromKey(comboLabel))
        try { return generateMesocycle(base({ equipment_access: equipment, training_experience: experience, weight_kg: weightKg, gender })) }
        finally { resetRandomSource() }
      })
      for (const week of meso) {
        weeks++
        const byPrescription = new Map<string, Set<number>>()
        for (const day of week.days) for (const ex of day.exercises) {
          if (ex.suggested_load_kg == null) continue
          const key = `${ex.name}|${ex.sets}|${ex.reps}|${ex.intensity}`
          if (!byPrescription.has(key)) byPrescription.set(key, new Set())
          byPrescription.get(key)!.add(ex.suggested_load_kg)
        }
        for (const [key, weightsSeen] of byPrescription) {
          if (weightsSeen.size <= 1) continue
          total++
          if (dayCeilingApplies(key.split('|')[0])) explained++
          else if (unexplained.length < 8) unexplained.push(`${equipment}/${experience}/${weightKg}${gender[0]} wk${week.week_number} ${key} -> ${[...weightsSeen].sort((a, b) => a - b).join('/')}kg`)
        }
      }
    }

console.log(`\nSwept ${weeks} lift-weeks across the audit's own grid.`)
console.log(`Same lift, same sets/reps/RPE, different weight: ${total} (${explained} explained by a per-day ceiling)`)

console.log('\n1. The sweep has teeth')
check('it actually generated plans', weeks > 1000, weeks)

console.log('\n2. No lift gets two weights for identical work without a reason')
{
  // The strict invariant. A lift that enforceLoadCoherence cannot vary by day
  // must have exactly one weight per prescription per week.
  check('every remaining case is a per-day ceiling shape', unexplained.length === 0, unexplained)
}

console.log('\n3. The population has not regressed')
{
  // Ratchet at the measured post-fix figure. Before the per-week weight memo
  // this was 202; after it, 96, all of them unilateral accessories or
  // bounded isolations bounded against that day's main lift.
  const CEILING = 96
  check(`no more than ${CEILING} day-ceiling cases (was 202 before the fix)`, total <= CEILING, total)
  check('...and the fix genuinely moved it', total < 202, total)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll week-load-consistency checks passed.\n')
