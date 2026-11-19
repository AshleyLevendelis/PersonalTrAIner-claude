/**
 * Measurement: what an exercise ADDED to a session is prescribed, against the plan's own number for the same lift.
 * docs/plans/added-lift-price.md (Exercise walk E1, 19 Nov 2026). Prints the old pricing (the new-main-lift branch)
 * beside the new (priceAddedLift's rule), over 36 seeded profiles, weeks 2 to 4.
 *
 *   npm run measure:added-lift-price
 */
import { generateMesocycle, mapTier } from '../src/lib/exercise-plan'
import { peerProgrammingFor } from '../src/lib/session-edit'
import { recomputeLoad, calibrates } from '../src/lib/mesocycle-edit'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { setRandomSource } from '../src/lib/exercise-plan'
import type { UserProfile } from '../src/lib/types'

const days = (on: string[]) => ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => ({ day: d, available: on.includes(d) }))
const base = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'build_muscle',
  preferred_time: 'morning', bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '60', workout_split_preference: 'ai_recommendation',
  training_days: days(['Monday','Tuesday','Thursday','Friday']), weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

async function main() {
  const log = console.log
  const warn = console.warn
  console.warn = () => {}
  const rows: { who: string; lift: string; week: number; own: number; oldKg: number; newKg: number }[] = []
  for (const exp of ['beginner','intermediate','advanced']) for (const goal of ['build_muscle','lose_fat','general_fitness']) for (const gender of ['male','female']) for (const eq of ['full_gym','home_gym']) {
    const profile = { ...base, training_experience: exp, fitness_goal: goal, gender, weight_kg: gender === 'male' ? 80 : 65, equipment_access: eq } as unknown as UserProfile
    console.log = () => {}; console.debug = () => {}
    let meso
    try { setRandomSource(seededRngFromKey(`${exp}|${goal}|${gender}|${eq}`)); meso = generateMesocycle(profile) } finally { console.log = log }
    const cal = calibrates(meso)
    for (const week of meso) {
      if (week.is_deload || week.isCalibrationWeek || week.week_number > 4) continue
      const trainDays = week.days.filter(d => d.exercises.length > 3)
      for (const from of trainDays) for (const ex of from.exercises) {
        if (!(typeof ex.suggested_load_kg === 'number' && ex.suggested_load_kg > 0) || ex.tier === 'primer') continue
        const to = trainDays.find(d => d.day !== from.day && !d.exercises.some(e => e.name === ex.name)); if (!to) continue
        const entry = getExerciseEntry(ex.name); if (!entry) continue
        const prog = peerProgrammingFor(to.exercises, mapTier(entry.mechanics_tier)); if (!prog) continue
        const oldL = await recomputeLoad(entry, profile, prog.intensity, prog.sets, prog.reps, true)
        const newL = await recomputeLoad(entry, profile, prog.intensity, prog.sets, prog.reps, false, false, cal)
        if (oldL.starting_weight_kg == null || newL.starting_weight_kg == null) continue
        rows.push({ who: `${exp}/${goal}/${gender}/${eq}/cal=${cal}`, lift: ex.name, week: week.week_number, own: ex.suggested_load_kg, oldKg: oldL.starting_weight_kg, newKg: newL.starting_weight_kg })
      }
    }
  }
  const r = (a: number, b: number) => a / b
  const over = (k: 'oldKg' | 'newKg', x: number) => rows.filter(row => r(row[k], row.own) > x).length
  const under = (k: 'oldKg' | 'newKg', x: number) => rows.filter(row => r(row[k], row.own) < x).length
  log(`rows ${rows.length}`)
  for (const k of ['oldKg', 'newKg'] as const) {
    const ratios = rows.map(row => r(row[k], row.own)).sort((a, b) => a - b)
    log(k, 'median', ratios[Math.floor(ratios.length / 2)].toFixed(2), 'max', ratios[ratios.length - 1].toFixed(2), 'min', ratios[0].toFixed(2), '>1.25x', over(k, 1.25), '>1.5x', over(k, 1.5), '<0.6x', under(k, 0.6))
  }
  const brief = (x: typeof rows) => x.map(row => `${row.who} | ${row.lift} wk${row.week} own ${row.own} old ${row.oldKg} new ${row.newKg}`).join('\n')
  log('OVER 1.25x after:\n' + brief(rows.filter(row => r(row.newKg, row.own) > 1.25)))
  log('UNDER 0.6x after:\n' + brief(rows.filter(row => r(row.newKg, row.own) < 0.6)))
  const calRows = rows.filter(row => /cal=true/.test(row.who)), noCal = rows.filter(row => /cal=false/.test(row.who))
  log('calibrating plans', calRows.length, 'non-calibrating', noCal.length)
}
main()
