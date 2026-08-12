/**
 * Injury adaptation — safety-critical gate. The constraint pipeline is
 * safety-critical here: an injury adaptation must not produce a plan that
 * still loads the injured area. For each of the 5 joint-mapped injury
 * codes, generates a synthetic mesocycle (no injury), runs
 * substituteForInjury against week 1, and asserts every kept exercise in
 * the touched week has NO loads_joints overlap with the flagged joint set
 * — using the real getFlaggedJoints export, not a hand-copied map, so this
 * test and the actual filter can never silently drift apart.
 */
import { generateMesocycle, getFlaggedJoints } from '../src/lib/exercise-plan'
import { substituteForInjury } from '../src/lib/plan-adaptations'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isContraindicatedFor } from '../src/lib/exercise-db'
import type { UserProfile, EquipmentAccess, TrainingStyle, TrainingExperience } from '../src/lib/types'

function buildProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: 'full_gym',
    injuries: [],
    training_style: 'bodybuilding',
    training_experience: 'intermediate',
    session_duration_preference: '60-90',
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
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [] as unknown as never,
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
    ...overrides,
  } as UserProfile
}

const INJURY_CODES = ['lower_back', 'knees', 'shoulders', 'neck', 'wrists']
const EQUIPMENT_TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const STYLES: TrainingStyle[] = ['bodybuilding', 'functional', 'hybrid']
const EXPERIENCES: TrainingExperience[] = ['novice', 'intermediate', 'advanced']

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

async function main() {
  console.log('[1] substituteForInjury never leaves a flagged-joint exercise in the touched week, across representative combinations')
  let combosChecked = 0

  for (const injuryCode of INJURY_CODES) {
    for (const equipment of EQUIPMENT_TIERS) {
      for (const style of STYLES) {
        for (const experience of EXPERIENCES) {
          const profile = buildProfile({ equipment_access: equipment, training_style: style, training_experience: experience })
          const mesocycle = generateMesocycle(profile)
          if (mesocycle.length === 0) continue

          const flaggedJoints = getFlaggedJoints([injuryCode])
          const result = await substituteForInjury({
            mesocycle, profile, injuryCode, weekNumbers: [1], exclusions: [],
          })
          combosChecked++

          const week1 = result.mesocycle.find(w => w.week_number === 1)
          if (!week1) continue

          for (const day of week1.days) {
            for (const ex of day.exercises) {
              const entry = getExerciseEntry(ex.name)
              if (!entry) continue
              const conflict = isContraindicatedFor(entry, flaggedJoints)
              if (conflict) {
                failures++
                console.error(`  FAIL: [${injuryCode}/${equipment}/${style}/${experience}] "${ex.name}" on ${day.day} still loads a flagged joint after substitution`, entry.loads_joints)
              }
            }
          }
        }
      }
    }
  }
  check(`checked ${combosChecked} combinations, all touched weeks clean of flagged-joint exercises`, failures === 0)

  console.log('\n[2] A dropped slot (no safe candidate) is genuinely removed, never left holding the injuring exercise')
  // Force a scenario likely to produce a drop: bodyweight + a heavily
  // joint-loading injury on a minimal pool.
  const tightProfile = buildProfile({ equipment_access: 'bodyweight', training_experience: 'novice' })
  const tightMesocycle = generateMesocycle(tightProfile)
  if (tightMesocycle.length > 0) {
    const flaggedJoints = getFlaggedJoints(['shoulders'])
    const result = await substituteForInjury({
      mesocycle: tightMesocycle, profile: tightProfile, injuryCode: 'shoulders', weekNumbers: [1], exclusions: [],
    })
    const week1 = result.mesocycle.find(w => w.week_number === 1)
    let allClean = true
    if (week1) {
      for (const day of week1.days) {
        for (const ex of day.exercises) {
          const entry = getExerciseEntry(ex.name)
          if (entry && isContraindicatedFor(entry, flaggedJoints)) allClean = false
        }
      }
    }
    check('no flagged-joint exercise survives even in a tight (bodyweight/novice) pool', allClean)
    check('droppedPatterns is an array (present even if empty)', Array.isArray(result.droppedPatterns), result.droppedPatterns)
  } else {
    console.log('  (skipped — tight profile produced no mesocycle)')
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll injury-adaptation safety checks passed.')
}

main().catch(err => {
  console.error('Test harness crashed:', err)
  process.exit(1)
})
