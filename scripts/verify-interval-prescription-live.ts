/**
 * Live verification for the combined #1+#2 cardio-prescription fix — the
 * exact scenario from the original bug report (Burpees, Mountain Climbers,
 * Elliptical, Cycling Intervals all showing an identical "6x33s"), run
 * through the real generation pipeline (generateExercisePlan ->
 * generateMesocycle), not a hand-constructed input. Throwaway script, no DB
 * writes.
 */
import { generateExercisePlan, generateMesocycle } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { scorePlan } from '../src/lib/quality-score'
import type { UserProfile, SessionDuration } from '../src/lib/types'

function buildProfile(duration: SessionDuration): UserProfile {
  return {
    age: 28,
    gender: 'female',
    height_cm: 165,
    weight_kg: 65,
    activity_level: 'moderate',
    fitness_goal: 'conditioning',
    preferred_time: 'morning',
    bmr: 1500,
    tdee: 2200,
    equipment_access: 'full_gym',
    injuries: [],
    training_style: 'hybrid',
    training_experience: 'intermediate',
    session_duration_preference: duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: false },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [],
  } as UserProfile
}

function isCardio(name: string): boolean {
  return EXERCISE_DATABASE.find(e => e.name === name)?.mechanics_tier === 'cardio'
}

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function main() {
  for (const duration of ['30-45', '45-60', '60-90', '90+'] as SessionDuration[]) {
    console.log(`\n=== session_duration_preference: ${duration} ===`)
    const profile = buildProfile(duration)
    const plan = generateExercisePlan(profile, []).plan
    const mesocycle = generateMesocycle(profile, plan)
    const week1 = mesocycle.find(w => w.week_number === 1)!

    const cardioSeen = new Map<string, { reps: string; rest: string; sets: number }[]>()
    for (const day of week1.days) {
      for (const ex of day.exercises) {
        if (!isCardio(ex.name)) continue
        console.log(`  ${day.day}: ${ex.name} — ${ex.sets}x${ex.reps} rest ${ex.rest}`)
        if (!cardioSeen.has(ex.name)) cardioSeen.set(ex.name, [])
        cardioSeen.get(ex.name)!.push({ reps: ex.reps, rest: ex.rest, sets: ex.sets })
      }
    }

    if (cardioSeen.size === 0) {
      console.log('  (no cardio-tier accessory selected for this profile/duration — nothing to check here)')
      continue
    }

    // The literal bug: two exercises from DIFFERENT categories (bodyweight-
    // HIIT vs machine-interval vs steady-state) with an identical
    // prescription. Same-category matches (e.g. two machine-interval
    // exercises sharing 45s/40s) are correct by design — the fix
    // differentiates by category, not by individual exercise.
    const CARDIO_MACHINE_EQUIPMENT = ['treadmill', 'stationary bike', 'rowing machine']
    const category = (name: string): string => {
      const entry = EXERCISE_DATABASE.find(e => e.name === name)!
      if (entry.prescription_type === 'steady_state') return 'steady_state'
      return entry.equipment.some(e => CARDIO_MACHINE_EQUIPMENT.includes(e)) ? 'machine_interval' : 'bodyweight_hiit'
    }
    const names = [...cardioSeen.keys()]
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (category(names[i]) === category(names[j])) continue
        const a = cardioSeen.get(names[i])![0]
        const b = cardioSeen.get(names[j])![0]
        const identical = a.reps === b.reps && a.rest === b.rest && a.sets === b.sets
        check(`"${names[i]}" (${category(names[i])}) and "${names[j]}" (${category(names[j])}) are not identically prescribed`, !identical, { a, b })
      }
    }

    // Elliptical, if selected, must be steady_state and sized to this
    // profile's session length, never a flat "20min"/"1200s" regardless of
    // duration preference.
    if (cardioSeen.has('Elliptical')) {
      const ellipticalReps = cardioSeen.get('Elliptical')![0].reps
      const expected: Record<SessionDuration, string> = {
        '30-45': '900s', '45-60': '1200s', '60-90': '1800s', '90+': '2100s',
      }
      check(`Elliptical sized to ${duration} -> ${expected[duration]}`, ellipticalReps === expected[duration], ellipticalReps)

      // frozen_week must NOT fire for Elliptical across the block (this is
      // the real integration test for the quality-score.ts exemption).
      const result = scorePlan(profile, mesocycle, `verify-interval::${duration}`)
      const frozenOnElliptical = result.dimensions.progression.deductions.some(
        d => d.rule === 'frozen_week' && d.detail.includes('Elliptical')
      )
      check('frozen_week does not fire on Elliptical (steady-state exemption)', !frozenOnElliptical, result.dimensions.progression.deductions)
    }

    // Any genuine interval-type exercise (not Elliptical) should show its
    // duration stepping across weeks 2/3 within the block, landing on round
    // numbers — the "33s" bug, now fixed.
    const week2 = mesocycle.find(w => w.week_number === 2 && !w.is_deload)
    const week3 = mesocycle.find(w => w.week_number === 3 && !w.is_deload)
    for (const name of names) {
      if (name === 'Elliptical') continue
      const find = (wk: typeof week1 | undefined) =>
        wk?.days.flatMap(d => d.exercises).find(e => e.name === name)
      const w1ex = find(week1)
      const w2ex = find(week2)
      const w3ex = find(week3)
      if (!w1ex || !w2ex || !w3ex) continue
      const allRound = [w1ex.reps, w2ex.reps, w3ex.reps].every(r => /^\d+s$/.test(r) && Number(r.slice(0, -1)) % 5 === 0)
      check(`"${name}" duration stays on 5s-step round numbers across weeks 1-3`, allRound, { w1: w1ex.reps, w2: w2ex.reps, w3: w3ex.reps })
    }
  }

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
