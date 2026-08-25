/**
 * How many replacements the swap dialog can actually offer, per movement
 * pattern, per equipment tier.
 *
 * Exists because a real gym session hit a wall: a machine was busy, the
 * trainee looked for another machine that was physically in front of her,
 * and the app didn't offer it. Two separate causes, and this report
 * separates them — which is the whole point of measuring rather than
 * guessing:
 *
 *   ELIGIBLE  = how many legitimate replacements exist in the catalogue for
 *               this trainee (same pattern, equipment they have, no skill
 *               downgrade). This is a CATALOGUE number.
 *   OFFERED   = how many getSmartReplacements actually returns. This is a
 *               CAP number.
 *
 * When OFFERED < ELIGIBLE the cap is hiding real options. When ELIGIBLE is
 * itself near zero the catalogue has run out and no UI change can help.
 * Before this report, both failures looked identical from the outside: a
 * short list.
 *
 * A CORRECTION IS BAKED INTO THIS REPORT, because the first cut of it got
 * the headline wrong. Counting same-pattern candidates directly said
 * isolation_shoulder had ZERO alternatives at home_gym — "Lateral Raises has
 * nothing to swap to". That was false. getSmartReplacements falls back to
 * NEAREST_PATTERN_FALLBACK when same-pattern comes back empty, so it really
 * offers 5 (all vertical_push). The mistake was measuring with a hand-rolled
 * filter and only ever running the REAL function against full_gym, where
 * same-pattern is never empty and the fallback therefore never fires.
 *
 * So this reports three numbers, not two. SAME is same-pattern depth;
 * OFFERED is what the trainee actually sees; and a pattern served entirely
 * by the fallback is flagged, because being offered an Overhead Press when
 * you wanted a lateral raise is a real quality signal — it is just not a
 * dead end, and conflating the two is what produced the wrong headline.
 */
import { EXERCISE_DATABASE, getSmartReplacements } from '../src/lib/exercise-db'
import { isRegressionFor } from '../src/lib/periodization'
import { getConstrainedPool } from '../src/lib/exercise-plan'
import type { UserProfile, EquipmentAccess, TrainingExperience } from '../src/lib/types'

const TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const EXPERIENCE: TrainingExperience = 'intermediate'

function buildProfile(equipment_access: EquipmentAccess): UserProfile {
  return {
    age: 30, gender: 'female', height_cm: 168, weight_kg: 65, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1500, tdee: 2100,
    equipment_access, injuries: [], training_style: 'hybrid',
    training_experience: EXPERIENCE, session_duration_preference: '45-60',
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
  } as UserProfile
}

/**
 * Mirrors getSmartReplacements' own `eligible` predicate, minus the cap —
 * same-pattern, not itself, not a skill regression. Deliberately duplicated
 * rather than exported from there: this needs to answer "what COULD be
 * offered", and reusing the capped function to measure the cap is circular.
 */
function eligibleCount(current: (typeof EXERCISE_DATABASE)[number], pool: typeof EXERCISE_DATABASE): number {
  return pool.filter(e =>
    e.name !== current.name &&
    e.movement_pattern === current.movement_pattern &&
    !(isRegressionFor(e.name, EXPERIENCE) && !isRegressionFor(current.name, EXPERIENCE))
  ).length
}

console.log(`\nSWAP COVERAGE — catalogue ${EXERCISE_DATABASE.length} exercises\n`)

let deadEnds = 0
let cappedPatterns = 0
let fallbackPatterns = 0

for (const tier of TIERS) {
  const pool = getConstrainedPool(buildProfile(tier), [])
  const patterns = [...new Set(pool.map(e => e.movement_pattern))].sort()

  const rows = patterns.map(p => {
    const members = pool.filter(e => e.movement_pattern === p)
    // Worst member, not the average — one exercise with nowhere to go is a
    // dead end for the trainee holding it, however well its neighbours fare.
    let worstSame = Infinity
    let worstOffered = Infinity
    let worstName = ''
    let anyFallback = false
    for (const m of members) {
      const same = eligibleCount(m, pool)
      const offered = getSmartReplacements(m.name, pool, EXPERIENCE, []).length
      if (offered < worstOffered) { worstOffered = offered; worstName = m.name }
      worstSame = Math.min(worstSame, same)
      if (same === 0 && offered > 0) anyFallback = true
    }
    return { p, same: worstSame, offered: worstOffered, worstName, anyFallback, n: members.length }
  }).sort((a, b) => a.offered - b.offered || a.same - b.same)

  console.log(`${tier.toUpperCase()}  (pool ${pool.length})`)
  console.log('  pattern                  in pool     same  offered')
  for (const r of rows) {
    const flags: string[] = []
    if (r.offered === 0) { flags.push(`DEAD END: "${r.worstName}" has nowhere to go`); deadEnds++ }
    if (r.anyFallback) { flags.push('served only by the nearest-pattern fallback'); fallbackPatterns++ }
    if (r.offered < r.same) { flags.push(`cap hides ${r.same - r.offered}`); cappedPatterns++ }
    console.log(
      '  ' + r.p.padEnd(24) + String(r.n).padStart(5) + String(r.same).padStart(9) +
      String(r.offered).padStart(9) + (flags.length ? '   <-- ' + flags.join('; ') : '')
    )
  }
  console.log('')
}

console.log(
  `TOTALS — true dead ends (0 offered): ${deadEnds}   ` +
  `patterns leaning on the nearest-pattern fallback: ${fallbackPatterns}   ` +
  `patterns where the cap hides options: ${cappedPatterns}\n`
)
