// ---------------------------------------------------------------------------
// WHY 5.0% of plans miss the session length asked for, and why 4.9% of
// low-recovery plans do not carry their intended volume cut — audit §6.5,
// items 18 on its own list.
//
// Both were reported as bare percentages with no cause attached, which is
// not enough to fix either. This attributes them.
//
// A NOTE ON THE SECOND ONE, because the audit's wording was misleading: the
// rule is `recovery_volume_not_reduced`, and it has nothing to do with a
// deload or "recovery week". It compares a `recovery_capacity: 'low'` PERSON
// against an otherwise identical high-recovery one and asks whether the low
// one really gets ~15% less weekly work. The audit called it "actually cut
// volume in a recovery week", which is a different thing the app already does.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { RECOVERY_SET_MULTIPLIER } from '../src/lib/goal-policies'
import { estimateDaySeconds, getSessionMinimumSeconds, getSessionMaximumSeconds } from '../src/lib/session-duration'
import type { UserProfile, MesocycleWeek, WorkoutDay } from '../src/lib/types'

const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const DURATION = ['30-45', '45-60', '60-75', '90+']
const EXP = ['beginner', 'novice', 'intermediate', 'advanced']
const STYLE = ['bodybuilding', 'hybrid', 'combat', 'functional']

function build(o: Record<string, unknown>): UserProfile {
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
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as unknown as UserProfile
}

const sumSets = (w?: MesocycleWeek) =>
  (w?.days ?? []).reduce((s, d) => s + (d.exercises ?? []).reduce((t, e) => t + (e.sets ?? 0), 0), 0)
const atFloor = (w?: MesocycleWeek) =>
  (w?.days ?? []).reduce((s, d) => s + (d.exercises ?? []).filter(e => (e.sets ?? 0) <= 2).length, 0)
const exCount = (w?: MesocycleWeek) =>
  (w?.days ?? []).reduce((s, d) => s + (d.exercises ?? []).length, 0)

function gen(p: UserProfile, key: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(key))
  const m = generateMesocycle(p, generateExercisePlan(p).plan)
  resetRandomSource()
  return m
}

console.log('\n=== 1. Low recovery: does the volume cut survive? ===\n')
{
  const expected = RECOVERY_SET_MULTIPLIER.low / RECOVERY_SET_MULTIPLIER.high
  let total = 0, failed = 0
  const failures: { combo: string; low: number; high: number; ratio: number; floorShare: number }[] = []
  for (const equipment_access of EQUIP) for (const session_duration_preference of DURATION)
    for (const training_experience of EXP) for (const training_style of STYLE) {
      const combo = `${equipment_access}/${session_duration_preference}/${training_experience}/${training_style}`
      const common = { equipment_access, session_duration_preference, training_experience, training_style }
      const lowW = gen(build({ ...common, recovery_capacity: 'low' }), `tf:${combo}`)[0]
      const highW = gen(build({ ...common, recovery_capacity: 'high' }), `tf:${combo}::high`)[0]
      const low = sumSets(lowW), high = sumSets(highW)
      total++
      if (!(high > 0 && low <= high * (expected + 0.02))) {
        failed++
        failures.push({ combo, low, high, ratio: high ? low / high : 0, floorShare: exCount(lowW) ? atFloor(lowW) / exCount(lowW) : 0 })
      }
    }
  console.log(`combinations: ${total}   target ratio <= ${(expected + 0.02).toFixed(2)}`)
  console.log(`missing the cut: ${failed}  (${((failed / total) * 100).toFixed(1)}%)\n`)
  const highFloor = failures.filter(f => f.floorShare >= 0.5).length
  console.log(`of those, ${highFloor} (${failed ? Math.round(highFloor / failed * 100) : 0}%) have HALF OR MORE of their exercises already at the 2-set floor —`)
  console.log('i.e. there is no room left to cut, not a multiplier that failed to apply.\n')
  for (const f of failures.slice(0, 10)) {
    console.log(`  ${f.combo.padEnd(46)} low ${String(f.low).padStart(3)} vs high ${String(f.high).padStart(3)}  ratio ${f.ratio.toFixed(2)}  at-floor ${(f.floorShare * 100).toFixed(0)}%`)
  }
}

console.log('\n=== 2. Session length: who is under, and by how much? ===\n')
{
  // THE APP'S OWN ESTIMATOR AND THE SCORER'S OWN THRESHOLDS. An earlier
  // version of this section rolled its own `sets * (rest + 40)` and counted
  // every unavailable day as a 0-minute session, so it reported 100% of
  // combinations failing by 100% — a number about the probe, not the app.
  let total = 0, under = 0, over = 0
  const worst: { combo: string; day: string; mins: number; want: string; pct: number }[] = []
  for (const equipment_access of EQUIP) for (const session_duration_preference of DURATION)
    for (const training_experience of EXP) for (const training_style of STYLE) {
      const combo = `${equipment_access}/${session_duration_preference}/${training_experience}/${training_style}`
      // Low recovery is exempt from under-run BY DESIGN (computeDurationTopUp
      // gives it zero top-up), so including it would report the exemption as
      // a defect.
      const p = build({ equipment_access, session_duration_preference, training_experience, training_style, recovery_capacity: 'moderate' })
      const weeks = gen(p, `tf:${combo}`)
      const min = getSessionMinimumSeconds(session_duration_preference)
      const max = getSessionMaximumSeconds(session_duration_preference)
      total++
      let worstUnderPct = 0, worstDay = '', worstMins = 0, wentOver = false
      for (const w of weeks) {
        if ((w as unknown as { is_deload?: boolean }).is_deload) continue
        for (const d of w.days ?? []) {
          // A day with no exercises is a REST DAY, not a failed session.
          if (!(d.exercises ?? []).length) continue
          const secs = estimateDaySeconds(d as unknown as WorkoutDay)
          if (secs > max * 1.10) wentOver = true
          if (secs < min) {
            const pct = (min - secs) / min
            if (pct > worstUnderPct) { worstUnderPct = pct; worstDay = `wk${w.week_number} ${d.day}`; worstMins = Math.round(secs / 60) }
          }
        }
      }
      if (wentOver) over++
      if (worstUnderPct > 0.10) {
        under++
        worst.push({ combo, day: worstDay, mins: worstMins, want: session_duration_preference, pct: worstUnderPct })
      }
    }
  console.log(`combinations: ${total}`)
  console.log(`with a training day more than 10% under the minimum asked for: ${under} (${((under / total) * 100).toFixed(1)}%)`)
  console.log(`with a day more than 10% OVER the maximum: ${over} (${((over / total) * 100).toFixed(1)}%)\n`)
  worst.sort((a, b) => b.pct - a.pct)
  for (const w of worst.slice(0, 12)) {
    console.log(`  ${(w.pct * 100).toFixed(0).padStart(3)}% under   ${w.combo.padEnd(46)} ${w.day} = ${w.mins}min, asked ${w.want}`)
  }
  const tally = (pick: (w: typeof worst[number]) => string, label: string) => {
    const m = new Map<string, number>()
    for (const w of worst) m.set(pick(w), (m.get(pick(w)) ?? 0) + 1)
    console.log(`\n  by ${label}:`)
    for (const [k, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(14)} ${n}`)
  }
  if (worst.length) {
    tally(w => w.want, 'requested length')
    tally(w => w.combo.split('/')[0], 'equipment')
    tally(w => w.combo.split('/')[2], 'experience')
  }
}
