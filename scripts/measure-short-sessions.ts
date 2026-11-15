// The "20-30" session setting, measured (15 Nov 2026, the coeliac nurse: "I only have 20 minutes"). Prints what plans
// look like at 20-30 against the same profiles at 30-45: minutes, exercises, the main lift, patterns, the quality score.
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { estimateDaySeconds } from '../src/lib/session-duration'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile, SessionDuration, WorkoutDay } from '../src/lib/types'

export function shortProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 34, gender: 'female', height_cm: 168, weight_kg: 72, activity_level: 'moderate',
    fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 1450, tdee: 2100,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'beginner', session_duration_preference: '20-30',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map((day, i) => ({ day, available: i === 0 || i === 2 || i === 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

export const GOALS = ['fat_loss', 'hypertrophy', 'functional', 'conditioning'] as const
export const EXP = ['beginner', 'intermediate', 'advanced'] as const
export const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const
export const DAYS = [2, 3, 4] as const

export function planFor(p: UserProfile, key: string) {
  setRandomSource(seededRngFromKey(key))
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return generateMesocycle(p, generateExercisePlan(p).plan) } finally { console.debug = d; console.warn = w; console.log = l; resetRandomSource() }
}

/** Working exercises: not warm-up or movement prep. */
export function workingOf(day: WorkoutDay) {
  return day.exercises.filter(e => !(e as { is_warmup?: boolean }).is_warmup && e.tier !== 'tier_0_primer' && e.tier !== 'tier_4_finisher')
}

export function daysFor(n: number) {
  const pick = n === 2 ? [0, 3] : n === 3 ? [0, 2, 4] : [0, 1, 3, 4]
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) => ({ day, available: pick.includes(i) }))
}

if (process.argv[1]?.includes('measure-short-sessions')) {
  for (const dur of ['20-30', '30-45'] as SessionDuration[]) {
    let sessions = 0, overMax = 0, underMin = 0, minEx = 99, maxEx = 0, exTotal = 0, minutes: number[] = [], scores: number[] = [], below = 0
    const maxS = dur === '20-30' ? 30 * 60 : 45 * 60, minS = dur === '20-30' ? 20 * 60 : 30 * 60
    for (const goal of GOALS) for (const exp of EXP) for (const eq of EQUIP) for (const n of DAYS) {
      const p = shortProfile({ fitness_goal: goal, training_experience: exp, equipment_access: eq, training_days: daysFor(n), session_duration_preference: dur })
      const key = `short:${goal}:${exp}:${eq}:${n}`
      const plan = planFor(p, key)
      const s = scorePlan(p, plan, key).overall
      scores.push(s); if (s < 7.2) below++
      for (const week of plan) {
        if (week.is_deload) continue
        for (const day of week.days) {
          if (day.exercises.length === 0) continue
          const sec = estimateDaySeconds(day); sessions++; minutes.push(sec / 60)
          if (sec > maxS) overMax++
          if (sec < minS) underMin++
          const n2 = workingOf(day).length; exTotal += n2; minEx = Math.min(minEx, n2); maxEx = Math.max(maxEx, n2)
        }
      }
    }
    minutes.sort((a, b) => a - b); scores.sort((a, b) => a - b)
    const q = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))]
    console.log(`${dur}: ${sessions} loading sessions; minutes p5 ${q(minutes, 0.05).toFixed(1)} median ${q(minutes, 0.5).toFixed(1)} p95 ${q(minutes, 0.95).toFixed(1)}; over max ${overMax}, under min ${underMin}; exercises ${minEx}-${maxEx} (mean ${(exTotal / sessions).toFixed(2)}); score min ${scores[0].toFixed(2)} median ${q(scores, 0.5).toFixed(2)}, below 7.2: ${below} of ${scores.length}`)
  }
}
void getExerciseEntry
