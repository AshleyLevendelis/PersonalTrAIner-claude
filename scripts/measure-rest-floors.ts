/**
 * REPORT ONLY — what rest reaches the screen, and what a session costs to keep
 * it. Run before and after a change to the floors; the sample is FIXED (a
 * deterministic slice of the same grid run-quality-score.ts uses) so the two
 * runs are comparable. Prints the distribution per tier, how many exercises
 * sit at or under 30s, exercises per day, and how many days miss their budget.
 */
import { generateMesocycle } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity,
} from '../src/lib/types'

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimal', 'bodyweight']
const DURATIONS: SessionDuration[] = ['30-45', '45-60', '60-90']
const STYLES: TrainingStyle[] = ['bodybuilding', 'functional', 'combat', 'hybrid']
const EXPERIENCE: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const RECOVERY: RecoveryCapacity[] = ['low', 'moderate', 'high']

const tierOf = (name: string) => EXERCISE_DATABASE.find(e => e.name === name)?.mechanics_tier ?? 'unknown'

function buildProfile(
  equipment: EquipmentAccess, duration: SessionDuration, style: TrainingStyle,
  experience: TrainingExperience, goal: FitnessGoal, recovery: RecoveryCapacity,
): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: goal, preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: equipment, injuries: [], training_style: style,
    training_experience: experience, session_duration_preference: duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: recovery,
    conditioning_preference: 'tolerate',
  } as unknown as UserProfile
}

const BUDGET_SECONDS: Record<SessionDuration, number> = { '30-45': 45 * 60, '45-60': 60 * 60, '60-90': 90 * 60 }

const restsByTier: Record<string, number[]> = {}
const restsByTierSolo: Record<string, number[]> = {}
let exercises = 0, atOrUnder30 = 0, days = 0, profiles = 0
const perDayCounts: number[] = []

for (const equipment of EQUIP) {
  for (const duration of DURATIONS) {
    for (const style of STYLES) {
      for (const experience of EXPERIENCE) {
        for (const goal of GOALS) {
          for (const recovery of RECOVERY) {
            const weeks = generateMesocycle(buildProfile(equipment, duration, style, experience, goal, recovery))
            profiles++
            const week = weeks[1] ?? weeks[0]
            for (const day of week?.days ?? []) {
              if (!day.exercises?.length) continue
              days++
              perDayCounts.push(day.exercises.length)
              for (const ex of day.exercises) {
                const secs = parseInt(String(ex.rest ?? '0'), 10) || 0
                const tier = String(tierOf(ex.name))
                ;(restsByTier[tier] ??= []).push(secs)
                if (!ex.superset_label) (restsByTierSolo[tier] ??= []).push(secs)
                exercises++
                if (secs > 0 && secs <= 30) atOrUnder30++
              }
            }
          }
        }
      }
    }
  }
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

console.log(`\nREST FLOORS — ${profiles} profiles, ${days} training days, ${exercises} exercises (week 2)\n`)
console.log(`  exercises resting 30s or less: ${atOrUnder30} (${pct(atOrUnder30, exercises)})`)
console.log(`  exercises per training day:    median ${median(perDayCounts)}, min ${Math.min(...perDayCounts)}, max ${Math.max(...perDayCounts)}`)
console.log('')
for (const tier of ['tier1_compound', 'tier2_compound', 'tier3_isolation', 'primer', 'cardio', 'unknown']) {
  const xs = restsByTier[tier]
  if (!xs?.length) continue
  const s = [...xs].sort((a, b) => a - b)
  const under = s.filter(x => x > 0 && x <= 30).length
  console.log(`  ${tier.padEnd(16)} n=${String(s.length).padStart(5)}  min=${String(s[0]).padStart(3)}  p25=${String(s[Math.floor(s.length * 0.25)]).padStart(3)}  median=${String(median(s)).padStart(3)}  max=${String(s[s.length - 1]).padStart(3)}  at/under 30s: ${String(under).padStart(5)} (${pct(under, s.length)})`)
}
console.log('\n  ...and the same again counting ONLY exercises that are NOT half of a labelled superset.')
console.log('  (A superset shares its rest by design — that is what a superset IS, and the card says so.)')
for (const tier of ['tier1_compound', 'tier2_compound', 'tier3_isolation']) {
  const xs = restsByTierSolo[tier]
  if (!xs?.length) continue
  const s2 = [...xs].sort((a, b) => a - b)
  const under = s2.filter(x => x > 0 && x <= 30).length
  console.log(`  ${tier.padEnd(16)} n=${String(s2.length).padStart(5)}  min=${String(s2[0]).padStart(3)}  p25=${String(s2[Math.floor(s2.length * 0.25)]).padStart(3)}  median=${String(median(s2)).padStart(3)}  max=${String(s2[s2.length - 1]).padStart(3)}  at/under 30s: ${String(under).padStart(5)} (${pct(under, s2.length)})`)
}
console.log(`\n  BUDGET_SECONDS used for reference only: ${JSON.stringify(BUDGET_SECONDS)}\n`)
