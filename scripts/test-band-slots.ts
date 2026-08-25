// ---------------------------------------------------------------------------
// Gate for a real weight beating a band when a real weight is on offer.
//
// Root finding: a FULL GYM user was prescribed "Band Shoulder Press" for a
// tier2 compound slot. The training objection (bands lose tension at the
// bottom) is fair but not the one that bites — a resistance band is not in
// LOADED_EQUIPMENT, so the app shows NO WEIGHT AT ALL. The weight column
// that carries a lift's entire progression story is blank, and the lift can
// only progress by reps, while a barbell sits unused in the same pool.
//
// MECHANISM: scoreCandidate weighed five factors and a tier bonus, and not
// one of them looked at the implement. Dumbbell Shoulder Press and Band
// Shoulder Press are both tier2_compound vertical_push and scored
// IDENTICALLY — the winner was decided by the +/-0.3 tie-break jitter. A coin
// flip, 637 times across the sweep.
//
// THE THREE THINGS THIS GATE EXISTS TO PROTECT, in order of how easy each
// would be to break while making the headline number look better:
//
//   1. The rehab placements. Spanish Squat is a patellar-tendon rehab tool
//      and 352 of the sweep's band placements are the rehab pass doing its
//      job. A change that drove "bands in main slots" to zero by eating
//      those would read as success and be a straight regression.
//   2. The only-option case. A minimalist trainee whose only vertical_pull
//      is a band must keep the band. This is a PREFERENCE, not a ban.
//   3. Tier order. The penalty (12) has to stay below the 30-point gap
//      between mechanics tiers, or a tier1 band would fall behind a tier2
//      dumbbell and the fix would start restructuring sessions.
// ---------------------------------------------------------------------------

import { generateExercisePlan, getConstrainedPool, getFlaggedJoints, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry, isBandEquipped, isIndicatedFor, getMovementFamily } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { UserProfile, EquipmentAccess, TrainingExperience, FitnessGoal, SessionDuration } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
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

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const EXP: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
const SPLITS = ['upper_lower', 'full_body', 'push_pull_legs'] as const
const GOALS: FitnessGoal[] = ['hypertrophy', 'strength', 'fat_loss', 'conditioning']
const DUR: SessionDuration[] = ['30-45', '45-60', '60-90']
const INJURIES: string[][] = [[], ['knees'], ['shoulders']]

interface Tally {
  mainSlots: number
  tier3Slots: number
  bandWithFreePeer: number
  bandFamilyBlocked: number
  bandNoPeer: number
  bandIndicated: number
  bandTier3: number
  spanishSquatForKnees: number
  freePeerCases: string[]
}
const t: Tally = {
  mainSlots: 0, tier3Slots: 0, bandWithFreePeer: 0, bandFamilyBlocked: 0,
  bandNoPeer: 0, bandIndicated: 0, bandTier3: 0, spanishSquatForKnees: 0, freePeerCases: [],
}

for (const equipment_access of EQUIP)
  for (const training_experience of EXP)
    for (const workout_split_preference of SPLITS)
      for (const fitness_goal of GOALS)
        for (const session_duration_preference of DUR)
          for (const injuries of INJURIES) {
            const profile = buildProfile({
              equipment_access, training_experience, workout_split_preference,
              fitness_goal, session_duration_preference, injuries,
            } as Partial<UserProfile>)
            setRandomSource(seededRngFromKey(`bg:${equipment_access}:${training_experience}:${workout_split_preference}:${fitness_goal}:${session_duration_preference}:${injuries.join('+')}`))
            const d = console.debug, w = console.warn
            console.debug = () => {}; console.warn = () => {}
            let plan
            try { plan = generateExercisePlan(profile).plan }
            finally { console.debug = d; console.warn = w; resetRandomSource() }

            const flagged = getFlaggedJoints(injuries)
            const pool = getConstrainedPool(profile, [])
            const weekNames = new Set(plan.flatMap(day => day.exercises.map(x => x.name)))

            for (const day of plan) {
              const entries = day.exercises
                .map(x => getExerciseEntry(x.name))
                .filter(Boolean) as NonNullable<ReturnType<typeof getExerciseEntry>>[]
              const dayFamilies = new Set(entries.map(e => getMovementFamily(e)))

              for (const e of entries) {
                const isMain = e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound'
                if (e.mechanics_tier === 'tier3_isolation') {
                  t.tier3Slots++
                  if (isBandEquipped(e)) t.bandTier3++
                  continue
                }
                if (!isMain) continue
                t.mainSlots++
                if (!isBandEquipped(e)) continue

                if (e.name === 'Spanish Squat' && flagged.has('knee')) t.spanishSquatForKnees++
                if (isIndicatedFor(e, flagged)) { t.bandIndicated++; continue }

                // A loaded peer only counts as "was available" if it could
                // actually have taken this slot: same pattern, same tier, and
                // not already claimed by this day's movement-family guard or
                // used elsewhere in the week. Without those two exclusions the
                // count is dominated by peers that were never eligible.
                const peers = pool.filter(c =>
                  c.movement_pattern === e.movement_pattern &&
                  c.mechanics_tier === e.mechanics_tier &&
                  isExternallyLoaded(c) && !isBandEquipped(c)
                )
                if (peers.length === 0) { t.bandNoPeer++; continue }
                const free = peers.filter(c => !weekNames.has(c.name) && !dayFamilies.has(getMovementFamily(c)))
                if (free.length === 0) { t.bandFamilyBlocked++; continue }
                t.bandWithFreePeer++
                if (t.freePeerCases.length < 8) {
                  t.freePeerCases.push(`${equipment_access}/${training_experience}/${fitness_goal} ${e.name} vs ${free.map(x => x.name).join(', ')}`)
                }
              }
            }
          }

// ---------------------------------------------------------------------------
console.log('\n1. A band never beats an available weight for a main slot')
// ---------------------------------------------------------------------------
{
  // MEASURED at HEAD before the implement rule: 637 band placements in a
  // main/secondary slot had a loaded same-pattern/same-tier peer in the pool,
  // of which the overwhelming majority also had one genuinely FREE. The
  // ceiling is deliberately not 0 — the day's movement-family guard and the
  // week's freshness guard both run ahead of scoring, so a handful survive
  // for reasons that have nothing to do with the implement.
  check(`bands beating a genuinely free loaded peer: ${t.bandWithFreePeer} (was 637 with a peer at all)`,
    t.bandWithFreePeer <= 10, `${t.bandWithFreePeer}\n      ${t.freePeerCases.join('\n      ')}`)
  check('...and there are main slots to check, so this has teeth', t.mainSlots > 10000, String(t.mainSlots))
}

// ---------------------------------------------------------------------------
console.log('\n2. It is a preference, not a ban')
// ---------------------------------------------------------------------------
{
  // The over-fire check. Someone whose kit genuinely has no loaded option for
  // a pattern keeps the band — demoting the only thing left is not a fix.
  check(`a band with no loaded peer is still selected (${t.bandNoPeer} placements)`,
    t.bandNoPeer > 100, String(t.bandNoPeer))
  check(`bands still fill tier3 isolation slots (${t.bandTier3} of ${t.tier3Slots})`,
    t.bandTier3 > 0, `${t.bandTier3}/${t.tier3Slots}`)
}

// ---------------------------------------------------------------------------
console.log('\n3. Rehab placements survive untouched')
// ---------------------------------------------------------------------------
{
  // The one that would be easiest to break while making section 1 look
  // better, so the assertion is a FLOOR rather than an equality: what must
  // hold is that the exemption never eats rehab placements, not that the
  // count is frozen at one snapshot.
  //
  // Measured on this gate's own seeds: 348 at HEAD, 352 after. It went UP,
  // not down, and that is the expected direction — an indicated band is
  // exempt from the penalty, so it now outranks the non-indicated bands it
  // used to tie with. (report:band-slots reads 352 both before and after; it
  // sweeps the same grid under different seeds, so the two numbers are
  // independent samples of the same property, not a contradiction.)
  check(`rehab-indicated bands still reach main slots (${t.bandIndicated}, HEAD baseline 348)`,
    t.bandIndicated >= 348, String(t.bandIndicated))
  check(`a knee-injured trainee still gets Spanish Squat (${t.spanishSquatForKnees} placements)`,
    t.spanishSquatForKnees > 0, String(t.spanishSquatForKnees))
}

// ---------------------------------------------------------------------------
console.log('\n4. The penalty can never reorder the tiers')
// ---------------------------------------------------------------------------
{
  // Read out of the source rather than duplicated as a literal here, so
  // raising the constant past the tier gap fails this check instead of
  // silently restructuring every session that mixes tiers.
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '../src/lib/exercise-plan.ts'), 'utf8')
  const penalty = Number(/const BAND_WITHOUT_WEIGHT_PENALTY = (\d+)/.exec(src)?.[1] ?? NaN)
  const tiers = /tier1_compound: (\d+), tier2_compound: (\d+), tier3_isolation: (\d+)/.exec(src)
  const gap = tiers ? Math.min(Number(tiers[1]) - Number(tiers[2]), Number(tiers[2]) - Number(tiers[3])) : NaN
  check(`penalty (${penalty}) is smaller than the smallest tier gap (${gap})`, penalty < gap, `${penalty} vs ${gap}`)
  check('penalty is bigger than the tie-break jitter it exists to beat', penalty > 0.6, String(penalty))
}

console.log(failures === 0 ? '\nAll band-slot checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
