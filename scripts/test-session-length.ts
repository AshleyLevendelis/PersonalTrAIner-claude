// ---------------------------------------------------------------------------
// Gate for a session using the time the trainee actually set aside.
//
// applyDurationFiller used to trigger on a flat 15-minute gap below the
// MIDPOINT budget. That number is correct for exactly one tier by coincidence:
// 75 - 15 lands precisely on the "60-90" minimum of 60 minutes. Every other
// tier had a hole beneath its own minimum — "45-60" topped nothing up between
// 37 and 45 minutes — so sessions could ship shorter than the range the
// trainee chose and nothing noticed.
//
// MEASURED on loading weeks before the fix: 13% of "45-60" sessions came in
// under 45 minutes, against 1% of "60-90" ones. After: 3%.
//
// The rules:
//
//   MEASURE LOADING WEEKS. A deload is half volume BY DESIGN and is
//   deliberately never filled. Counting deloads is what made this look like a
//   quarter of all long sessions when it was 13% of one tier — the mistake is
//   asserted against here so nobody repeats it.
//   THE MINIMUM IS THE FLOOR, NOT THE MIDPOINT. Under the midpoint can be
//   fine. Under the low end of what they told us is not.
//   FILLING MUST NOT OVERSHOOT. A top-up that pushes a session past the top of
//   the trainee's own range trades one complaint for a worse one. Measured
//   against that range, not the midpoint — 121% of a 37-minute midpoint is 44
//   minutes, which is exactly what a "30-45" trainee asked for.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getSessionMinimumSeconds, estimateDaySeconds } from '../src/lib/session-duration'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, SessionDuration } from '../src/lib/types'

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

const DURATIONS: SessionDuration[] = ['30-45', '45-60', '60-90']
const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const
const SPLITS = ['upper_lower', 'push_pull_legs', 'full_body'] as const

interface Tally { loading: number; belowMin: number; overBudget: number; deload: number; deloadFilled: number }

const tally = new Map<SessionDuration, Tally>()
for (const dur of DURATIONS) {
  const t: Tally = { loading: 0, belowMin: 0, overBudget: 0, deload: 0, deloadFilled: 0 }
  for (const equipment_access of EQUIP) {
    for (const workout_split_preference of SPLITS) {
      const profile = buildProfile({ session_duration_preference: dur, equipment_access, workout_split_preference })
      setRandomSource(seededRngFromKey(`f:${dur}:${equipment_access}:${workout_split_preference}`))
      const d = console.debug, w = console.warn
      console.debug = () => {}; console.warn = () => {}
      const plan = generateMesocycle(profile, generateExercisePlan(profile).plan)
      console.debug = d; console.warn = w
      resetRandomSource()

      const minimum = getSessionMinimumSeconds(dur)
      const maximum = Number(dur.split('-')[1]) * 60
      for (const week of plan) {
        for (const day of week.days) {
          if (day.exercises.length === 0) continue
          const seconds = estimateDaySeconds(day)
          if (week.is_deload) {
            t.deload++
            if ((day.recommendedCardio as { is_filler?: boolean } | undefined)?.is_filler) t.deloadFilled++
            continue
          }
          t.loading++
          if (seconds < minimum) t.belowMin++
          // Against the stated MAXIMUM, not the midpoint budget — symmetric
          // with the minimum check above, and for the same reason. A "30-45"
          // session running to 44 minutes is 121% of its 37-minute midpoint
          // and entirely within what the trainee asked for; calling that an
          // overshoot would be measuring against a number they never saw.
          // (Checked: 69 such sessions exist identically at HEAD, so the
          // midpoint reading was flagging pre-existing, correct behaviour.)
          if (seconds > maximum) t.overBudget++
        }
      }
    }
  }
  tally.set(dur, t)
}

// ---------------------------------------------------------------------------
console.log('\n1. Sessions reach the time the trainee set aside')
// ---------------------------------------------------------------------------
// Thresholds sit just above the measured post-fix figures (1%, 3%, 1%), so
// ordinary drift passes and a regression to the pre-fix 13% does not. The
// residual is understood: enforceWeeklyPatternBalance trims sets AFTER the
// filler has sized itself, so a day that was long enough at filler time can
// land a couple of minutes under afterwards.
const CEILING: Record<string, number> = { '30-45': 0.03, '45-60': 0.06, '60-90': 0.03 }
for (const dur of DURATIONS) {
  const t = tally.get(dur)!
  const rate = t.belowMin / t.loading
  check(`"${dur}": ${t.belowMin}/${t.loading} loading sessions below the ${Math.round(getSessionMinimumSeconds(dur) / 60)}min minimum (${(rate * 100).toFixed(0)}%)`,
    rate <= CEILING[dur], `ceiling ${(CEILING[dur] * 100).toFixed(0)}%`)
}

// ---------------------------------------------------------------------------
console.log('\n2. Filling never overshoots what they asked for')
// ---------------------------------------------------------------------------
for (const dur of DURATIONS) {
  const t = tally.get(dur)!
  check(`"${dur}": no loading session runs past the ${Number(dur.split('-')[1])}min they said they had (${t.overBudget})`,
    t.overBudget === 0, String(t.overBudget))
}

// ---------------------------------------------------------------------------
console.log('\n3. Deload weeks are deliberately left short')
// ---------------------------------------------------------------------------
{
  // A deload is half volume on purpose. Filling one back up to budget would
  // fight the entire point of the recovery week — and counting deloads as
  // too-short is exactly what made this problem look four times bigger than it
  // was when it was first measured.
  const totalDeload = DURATIONS.reduce((n, d) => n + tally.get(d)!.deload, 0)
  const filledDeload = DURATIONS.reduce((n, d) => n + tally.get(d)!.deloadFilled, 0)
  check(`no deload session is topped up (${filledDeload} of ${totalDeload})`, filledDeload === 0, String(filledDeload))
  check('...and deload sessions exist, so the check has teeth', totalDeload > 0, String(totalDeload))
}

console.log(failures === 0 ? '\nAll session-length checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
