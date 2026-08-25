// ---------------------------------------------------------------------------
// Gate for a loaded bar getting real recovery between sets.
//
// Root finding: someone whose goal is CONDITIONING was prescribed Barbell
// Squats and Barbell Bench Press with 42 SECONDS rest between sets. Nothing
// was broken — conditioning's restSecondsMultiplier is 0.8 on tier1, and on a
// short session that lands at 42s. The goal working exactly as designed, on
// the one exercise where it should not.
//
// Ashley's ruling: the session still conditions, the part with a bar on your
// back does not. Short rest stays everywhere else — accessories, machines,
// bodyweight, carries. The asymmetry is the argument: too much rest on one
// lift costs a slightly easier session, too little costs a rep failing under
// load.
//
// MEASURED before: 91% of conditioning's LOADED main lifts rested under 90s,
// and it was the only goal that ever went below 60s at all. Other goals sat at
// 17-27% under 90s with nothing under 60 — which is why the floor is scoped to
// the goal rather than applied globally. A blanket floor would have quietly
// rewritten a fifth of every other goal's main lifts.
//
// THE FLOOR HAS TO HOLD IN THREE PLACES, and that is the real lesson here.
// Rest is set independently at prescription (assignSetsRepsFromConfig), at the
// per-week phase adjustment (adjustRest), and at the duration trimmer
// (trimWeekRestForBudget, which carried its own hardcoded 60s). Fixing only
// the first left 288 of 432 still under the floor; fixing the first two left
// 285. Each path needs it.
//
// FOUR PLACES, as it turned out — and this gate did not catch the fourth,
// which is why section 4 below exists. All three floors above were gated on
// isExternallyLoaded, so they only ever guarded a bar. stageTimeCap's Phase 2
// takes a blanket -15s off EVERY non-cardio exercise with a 30s floor and no
// main-lift gate at all, and a BODYWEIGHT main lift fell straight through it:
// measured, 553 of 9,216 combinations (6.0%) had the day's main lift under a
// minute, every observed one a pull-up at 42s or 57s.
//
// Ashley's second ruling: a flat 60-second minimum under any main lift,
// bodyweight included, and nothing may take it below — not the time squeeze,
// not the phase. Her first ruling still stands ABOVE that line, which is what
// section 3 keeps honest: conditioning's 90s floor is still loaded-only, so a
// conditioning chin-up still rests less than a conditioning squat.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, FitnessGoal, SessionDuration } from '../src/lib/types'

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

const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'endurance', 'conditioning', 'functional']
const STYLES = ['hybrid', 'bodybuilding', 'functional'] as const
const DURATIONS: SessionDuration[] = ['30-45', '45-60', '60-90']

interface Row { loaded: number; underFloor: number; underSixty: number; bodyweight: number; bodyweightShort: number; bodyweightUnderSixty: number; deloadMains: number; deloadUnderSixty: number }
const rows = new Map<FitnessGoal, Row>()

for (const goal of GOALS) {
  const row: Row = { loaded: 0, underFloor: 0, underSixty: 0, bodyweight: 0, bodyweightShort: 0, bodyweightUnderSixty: 0, deloadMains: 0, deloadUnderSixty: 0 }
  const floor = getGoalPolicy(goal).minLoadedMainLiftRestSeconds ?? 60
  for (const training_style of STYLES) {
    for (const session_duration_preference of DURATIONS) {
      const profile = buildProfile({ fitness_goal: goal, training_style, session_duration_preference })
      setRandomSource(seededRngFromKey(`rw:${goal}:${training_style}:${session_duration_preference}`))
      const d = console.debug, w = console.warn
      console.debug = () => {}; console.warn = () => {}
      let plan
      try { plan = generateMesocycle(profile, generateExercisePlan(profile).plan) }
      finally { console.debug = d; console.warn = w; resetRandomSource() }

      for (const week of plan) {
        for (const day of week.days) {
          const i = day.exercises.findIndex(ex => ex.tier === 'tier_1_primary')
          if (i < 0) continue
          const main = day.exercises[i]
          const entry = getExerciseEntry(main.name)
          if (!entry) continue
          const seconds = parseInt(String(main.rest), 10)
          if (!Number.isFinite(seconds)) continue
          // The 60s floor is NOT a density rule, so unlike the goal's loaded
          // floor it holds on a deload too — a light week does not make a set
          // easier to finish 42 seconds after the last one. Counted
          // separately so section 4 can say so out loud.
          if (week.is_deload) {
            row.deloadMains++
            if (seconds < 60) row.deloadUnderSixty++
            continue
          }
          if (!isExternallyLoaded(entry)) {
            row.bodyweight++
            if (seconds < floor) row.bodyweightShort++
            if (seconds < 60) row.bodyweightUnderSixty++
            continue
          }
          row.loaded++
          if (seconds < floor) row.underFloor++
          if (seconds < 60) row.underSixty++
        }
      }
    }
  }
  rows.set(goal, row)
}

// ---------------------------------------------------------------------------
console.log('\n1. A loaded main lift never rests less than its goal allows')
// ---------------------------------------------------------------------------
for (const goal of GOALS) {
  const r = rows.get(goal)!
  const floor = getGoalPolicy(goal).minLoadedMainLiftRestSeconds ?? 60
  check(`${goal}: ${r.underFloor}/${r.loaded} loaded main lifts under ${floor}s`, r.underFloor === 0, String(r.underFloor))
}

// ---------------------------------------------------------------------------
console.log('\n2. Nothing anywhere puts a bar under 60 seconds')
// ---------------------------------------------------------------------------
{
  // The hard line, independent of any goal's own floor. 60s is the threshold
  // quality-score.ts itself calls "not a full rest period" for a main lift.
  const total = GOALS.reduce((n, g) => n + rows.get(g)!.underSixty, 0)
  const seen = GOALS.reduce((n, g) => n + rows.get(g)!.loaded, 0)
  check(`no loaded main lift rests under 60s (${total} of ${seen})`, total === 0, String(total))
  check('...and there are loaded main lifts to check', seen > 500, String(seen))
}

// ---------------------------------------------------------------------------
console.log('\n3. Conditioning keeps its density everywhere else')
// ---------------------------------------------------------------------------
{
  // The over-fire check, and the half of the ruling that is easy to lose. If
  // the floor had been applied by TIER rather than by "is there a bar", a
  // conditioning trainee's chin-up day would have been slowed down too, and
  // the goal would have quietly become hypertrophy.
  const c = rows.get('conditioning')!
  check(`conditioning bodyweight main lifts keep short rest (${c.bodyweightShort} of ${c.bodyweight} still under 90s)`,
    c.bodyweight === 0 || c.bodyweightShort > 0, `${c.bodyweightShort}/${c.bodyweight}`)
  // The 60s floor must not have swallowed the density it was scoped to
  // preserve: "under 90 but at or above 60" is the band that has to survive.
  const inBand = c.bodyweightShort - c.bodyweightUnderSixty
  check(`...and they land in the 60-90s band, not at the 90s loaded floor (${inBand} of ${c.bodyweight})`,
    c.bodyweight === 0 || inBand > 0, `${inBand}/${c.bodyweight}`)

  // And the floor must not have leaked into goals that never asked for it.
  for (const goal of GOALS) {
    if (goal === 'conditioning') continue
    check(`${goal} has no floor of its own`, getGoalPolicy(goal).minLoadedMainLiftRestSeconds === undefined)
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. No main lift anywhere rests under a minute — bar or no bar')
// ---------------------------------------------------------------------------
{
  // The check that was missing. Section 2 asks the same question of LOADED
  // main lifts only, which is exactly how a bodyweight pull-up at 42s passed
  // this gate green while quality-score was deducting for it in 6% of plans.
  const bwShort = GOALS.reduce((n, g) => n + rows.get(g)!.bodyweightUnderSixty, 0)
  const bwSeen = GOALS.reduce((n, g) => n + rows.get(g)!.bodyweight, 0)
  check(`no bodyweight main lift rests under 60s (${bwShort} of ${bwSeen})`, bwShort === 0, String(bwShort))
  check('...and there are bodyweight main lifts to check', bwSeen > 100, String(bwSeen))

  const dShort = GOALS.reduce((n, g) => n + rows.get(g)!.deloadUnderSixty, 0)
  const dSeen = GOALS.reduce((n, g) => n + rows.get(g)!.deloadMains, 0)
  check(`the floor holds on deload weeks too (${dShort} of ${dSeen})`, dShort === 0, String(dShort))
  check('...and there are deload main lifts to check', dSeen > 100, String(dSeen))
}

console.log(failures === 0 ? '\nAll main-lift-rest checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
