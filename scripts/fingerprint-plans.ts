// Fingerprint of every plan on the quality grid — day names, focus per day,
// and the conditioning placed on each day, for every week. Two runs of this
// against two versions of the generator must print the same hash for every
// profile that has NO concurrent activity, or the "nobody without a second
// sport is touched" promise is broken. Usage: npx tsx scripts/fingerprint-plans.ts [--stride=N] > out.txt
import { createHash } from 'crypto'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations } from '../src/lib/dev-constraint-audit'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'
const GOALS = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const STRIDE = Number((process.argv.find(a => a.startsWith('--stride=')) ?? '--stride=37').split('=')[1]) || 37
function profileFor(equipment: string, injuries: string[], duration: string, style: string, experience: string, goal: string): UserProfile {
  return { age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: goal, preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: equipment, injuries, training_style: style, training_experience: experience,
    session_duration_preference: duration, workout_split_preference: 'ai_recommendation',
    training_days: [ { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false } ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate' } as unknown as UserProfile
}
let seen = 0
for (const equipment of ALL_EQUIPMENT)
  for (const injuries of getInjuryCombinations())
    for (const duration of ALL_DURATIONS)
      for (const style of ALL_STYLES)
        for (const experience of ALL_EXPERIENCE)
          for (const goal of GOALS) {
            if (seen++ % STRIDE !== 0) continue
            const key = [equipment, injuries.join('+') || 'none', duration, style, experience, goal].join('|')
            setRandomSource(seededRngFromKey(key))
            const real = console.log; console.log = () => {}
            let meso: MesocycleWeek[]
            try { meso = generateMesocycle(profileFor(equipment, injuries, duration, style, experience, goal)) }
            catch (e) { console.log = real; console.log(`${key} ERROR ${String(e).slice(0, 60)}`); continue }
            finally { console.log = real }
            resetRandomSource()
            const shape = meso.map(w => ({
              n: w.week_number,
              d: w.days.map(d => [d.day, d.focus, d.recommendedCardio?.activity ?? null, d.recommendedCardio?.timing ?? null, d.exercises.map(e => `${e.name}|${e.sets}x${e.reps}|${e.suggested_load_kg ?? ''}`)]),
            }))
            console.log(`${key} ${createHash('sha1').update(JSON.stringify(shape)).digest('hex')}`)
          }
