// ---------------------------------------------------------------------------
// How often does a week hand someone the same prescription as the week before?
//
// quality-score.ts's `frozen_week` rule fires on 84.1% of combinations, which
// sounds catastrophic and is not the useful number: it counts "at least one
// instance anywhere in a sixteen-week plan". This measures the RATE — what
// share of week-to-week transitions are identical in both load and reps — and
// splits it by cause, because the three causes want three different answers
// and one headline hides that.
//
//   loaded, non-carry  the unverified ramp has converged on its standards
//                      ceiling (load-prescription.ts:1264) so load stops
//                      moving, and reps are held flat because load was
//                      supposed to be the lever. THIS is what the fix targets.
//   carry              no rep lever by design — distance is fixed and
//                      shiftReps deliberately never touches it. Left alone
//                      this round; Ashley's ruling was about reps.
//   bodyweight         rampReps is already true here, so a freeze means
//                      something downstream flattened it.
//
// Deliberately reports all three every run. A fix that drove the total down
// while quietly leaving a bucket untouched would read as success.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile } from '../src/lib/types'

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

const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const
const SPLITS = ['upper_lower', 'push_pull_legs', 'full_body'] as const
const EXP = ['novice', 'intermediate', 'advanced'] as const

type Cause = 'loaded, non-carry' | 'carry' | 'bodyweight'

let transitions = 0
let frozen = 0
const byCause = new Map<Cause, number>()
const examples = new Map<Cause, string[]>()
const byName = new Map<string, number>()
const tierSeen = new Map<string, number>()
const tierFrozen = new Map<string, number>()

for (const equipment_access of EQUIP) {
  for (const workout_split_preference of SPLITS) {
    for (const training_experience of EXP) {
      const profile = buildProfile({ equipment_access, workout_split_preference, training_experience })
      setRandomSource(seededRngFromKey(`frozen:${equipment_access}:${workout_split_preference}:${training_experience}`))
      const d = console.debug, w = console.warn
      console.debug = () => {}; console.warn = () => {}
      const meso = generateMesocycle(profile, generateExercisePlan(profile).plan)
      console.debug = d; console.warn = w
      resetRandomSource()

      for (let i = 0; i < meso.length - 1; i++) {
        const a = meso[i], b = meso[i + 1]
        // Deload weeks are SUPPOSED to differ from their neighbours in a way
        // that has nothing to do with progression, so a transition into or
        // out of one says nothing about whether the plan is advancing.
        if (a.is_deload || b.is_deload) continue
        for (const dayA of a.days) {
          const dayB = b.days.find(x => x.day === dayA.day)
          if (!dayB) continue
          dayA.exercises.forEach((exA, j) => {
            const exB = dayB.exercises[j]
            if (!exB || exB.name !== exA.name) return
            const pt = (exA as { prescription_type?: string }).prescription_type
            if (exA.tier === 'tier_0_primer' || pt === 'steady_state') return

            transitions++
            tierSeen.set(exA.tier, (tierSeen.get(exA.tier) ?? 0) + 1)

            const loadFrozen = exA.suggested_load_kg == null
              ? exB.suggested_load_kg == null
              : exA.suggested_load_kg === exB.suggested_load_kg
            if (!(loadFrozen && exA.reps === exB.reps)) return

            frozen++
            tierFrozen.set(exA.tier, (tierFrozen.get(exA.tier) ?? 0) + 1)
            byName.set(exA.name, (byName.get(exA.name) ?? 0) + 1)

            const entry = getExerciseEntry(exA.name)
            const cause: Cause = entry?.movement_pattern === 'carry'
              ? 'carry'
              : exA.suggested_load_kg == null ? 'bodyweight' : 'loaded, non-carry'
            byCause.set(cause, (byCause.get(cause) ?? 0) + 1)
            const ex = examples.get(cause) ?? []
            if (ex.length < 4) ex.push(`${exA.name} wk${a.week_number}->${b.week_number}: ${exA.reps} @ ${exA.suggested_load_kg ?? 'bodyweight'}`)
            examples.set(cause, ex)
          })
        }
      }
    }
  }
}

const pct = (n: number, d: number) => d === 0 ? '0.0' : (n / d * 100).toFixed(1)

console.log('\nRepeated weeks — same load AND same reps as the week before.')
console.log(`Sweep: ${EQUIP.length} equipment tiers x ${SPLITS.length} splits x ${EXP.length} experience levels.`)
console.log(`\nweek-to-week transitions: ${transitions}`)
console.log(`frozen: ${frozen}  (${pct(frozen, transitions)}%)`)

console.log('\nby cause:')
for (const [cause, n] of [...byCause].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${pct(n, frozen).padStart(5)}% of frozen  ${cause}`)
  for (const e of examples.get(cause) ?? []) console.log(`          ${e}`)
}

console.log('\nby tier:')
for (const [tier, seen] of [...tierSeen].sort()) {
  const f = tierFrozen.get(tier) ?? 0
  console.log(`  ${tier.padEnd(20)} ${String(f).padStart(4)} / ${String(seen).padStart(5)}  ${pct(f, seen)}%`)
}

console.log('\ntop repeated lifts:')
for (const [name, c] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${name.padEnd(34)} ${c}`)
}
