// ---------------------------------------------------------------------------
// How often does a main or secondary slot resolve to a resistance band when
// the trainee has a real weight available?
//
// The defect, from an LLM coach review: a FULL GYM user was prescribed
// "Band Shoulder Press" for a tier2 compound slot. The reviewer's objection
// (bands lose tension at the bottom) is a fair training point but not the one
// that bites. A resistance band is not in load-prescription.ts's
// LOADED_EQUIPMENT, so the app shows NO WEIGHT AT ALL — the lift can only
// progress by reps, and the weight column that carries a lift's whole
// progression story is simply blank, with a barbell sitting unused in the
// same pool.
//
// MECHANISM, traced: scoreCandidate weighs five factors (role support, goal
// fit, experience fit, session balance, weekly variety) plus an unconditional
// tier bonus. NONE of them look at the implement. Dumbbell Shoulder Press and
// Band Shoulder Press are both tier2_compound vertical_push and score
// IDENTICALLY, so the winner is decided by the +/-0.3 tie-break jitter. A
// coin flip, every time.
//
// Split three ways, because the three cases want different answers:
//
//   band, loaded peer available   the defect. A real weight was on offer for
//                                 this exact slot and lost a coin toss.
//   band, no loaded peer          correct. A bodyweight-tier trainee's
//                                 vertical_pull options ARE bands; demoting
//                                 them would be demoting the only thing left.
//   band, indicated for a flagged joint
//                                 correct and deliberate. Spanish Squat is a
//                                 patellar-tendon rehab tool and Kneeling
//                                 Band Lat Pulldown is shoulder-tolerable
//                                 work; the rehab pass puts them there ON
//                                 PURPOSE and this must never undo that.
//
// Reports all three every run. A change that drove the first to zero by
// quietly eating the third would read as success.
// ---------------------------------------------------------------------------

import { generateExercisePlan, getConstrainedPool, getFlaggedJoints, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry, isBandEquipped, isIndicatedFor } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, EquipmentAccess, TrainingExperience, FitnessGoal, SessionDuration } from '../src/lib/types'

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

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const EXP: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
const SPLITS = ['upper_lower', 'full_body', 'push_pull_legs'] as const
const GOALS: FitnessGoal[] = ['hypertrophy', 'strength', 'fat_loss', 'conditioning']
const DUR: SessionDuration[] = ['30-45', '45-60', '60-90']
const INJURIES: string[][] = [[], ['knees'], ['shoulders']]

interface Row {
  slots: number
  bandWithPeer: number
  bandNoPeer: number
  bandIndicated: number
  names: Map<string, number>
}
const mk = (): Row => ({ slots: 0, bandWithPeer: 0, bandNoPeer: 0, bandIndicated: 0, names: new Map() })
const byEquip = new Map<string, Row>()
const total = mk()

for (const equipment_access of EQUIP) {
  byEquip.set(equipment_access, mk())
  for (const training_experience of EXP)
    for (const workout_split_preference of SPLITS)
      for (const fitness_goal of GOALS)
        for (const session_duration_preference of DUR)
          for (const injuries of INJURIES) {
            const profile = buildProfile({
              equipment_access, training_experience, workout_split_preference,
              fitness_goal, session_duration_preference, injuries,
            } as Partial<UserProfile>)
            const key = `bs:${equipment_access}:${training_experience}:${workout_split_preference}:${fitness_goal}:${session_duration_preference}:${injuries.join('+')}`
            setRandomSource(seededRngFromKey(key))
            const d = console.debug, w = console.warn
            console.debug = () => {}; console.warn = () => {}
            let plan
            try { plan = generateExercisePlan(profile).plan }
            finally { console.debug = d; console.warn = w; resetRandomSource() }

            const flagged = getFlaggedJoints(injuries)
            const row = byEquip.get(equipment_access)!

            // "Was a real weight on offer for THIS slot?" has to be asked the
            // same way scoreCandidate asks it — of the candidates eligible for
            // the slot's own pattern and tier. An earlier cut of this report
            // asked the looser "did the day contain ANY loaded main lift",
            // which counted a band as a defect whenever some unrelated slot
            // elsewhere in the session happened to hold a dumbbell. That
            // inflates the before-number and leaves a residual that is
            // correct-by-construction looking like unfixed work.
            const pool = getConstrainedPool(profile, [])
            const loadedPeerExists = (e: { movement_pattern: string; mechanics_tier: string }) =>
              pool.some(c =>
                c.movement_pattern === e.movement_pattern &&
                c.mechanics_tier === e.mechanics_tier &&
                isExternallyLoaded(c) && !isBandEquipped(c)
              )

            for (const day of plan) {
              const dayEntries = day.exercises.map(x => getExerciseEntry(x.name)).filter(Boolean) as NonNullable<ReturnType<typeof getExerciseEntry>>[]
              const mains = dayEntries.filter(e => e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound')
              for (const e of mains) {
                row.slots++; total.slots++
                if (!isBandEquipped(e)) continue
                row.names.set(e.name, (row.names.get(e.name) ?? 0) + 1)
                if (isIndicatedFor(e, flagged)) { row.bandIndicated++; total.bandIndicated++ }
                else if (loadedPeerExists(e)) { row.bandWithPeer++; total.bandWithPeer++ }
                else { row.bandNoPeer++; total.bandNoPeer++ }
              }
            }
          }
}

const pct = (n: number, d: number) => d === 0 ? '  n/a' : `${((n / d) * 100).toFixed(2)}%`
console.log('\nBands occupying a main (tier1) or secondary (tier2) slot')
console.log(`Sweep: ${EQUIP.length} equipment x ${EXP.length} experience x ${SPLITS.length} splits x ${GOALS.length} goals x ${DUR.length} durations x ${INJURIES.length} injury sets\n`)
console.log(`  ${'tier'.padEnd(11)} ${'slots'.padStart(6)}  ${'BAND, WEIGHT WAS AVAILABLE'.padStart(28)}  ${'band, no loaded peer '.padStart(22)}  ${'band, rehab-indicated'.padStart(22)}`)
for (const eq of EQUIP) {
  const r = byEquip.get(eq)!
  console.log(`  ${eq.padEnd(11)} ${String(r.slots).padStart(6)}  ${`${r.bandWithPeer} (${pct(r.bandWithPeer, r.slots)})`.padStart(28)}  ${String(r.bandNoPeer).padStart(22)}  ${String(r.bandIndicated).padStart(22)}`)
}
console.log(`  ${'ALL'.padEnd(11)} ${String(total.slots).padStart(6)}  ${`${total.bandWithPeer} (${pct(total.bandWithPeer, total.slots)})`.padStart(28)}  ${String(total.bandNoPeer).padStart(22)}  ${String(total.bandIndicated).padStart(22)}`)

console.log('\nby exercise:')
const all = new Map<string, number>()
for (const r of byEquip.values()) for (const [n, c] of r.names) all.set(n, (all.get(n) ?? 0) + c)
for (const [n, c] of [...all.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n.padEnd(34)} ${c}`)
console.log('')
