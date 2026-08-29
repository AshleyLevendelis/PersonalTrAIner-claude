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
import { getExerciseEntry, isBandEquipped, isIndicatedFor, getMovementFamily, EXERCISE_DATABASE } from '../src/lib/exercise-db'
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
  /**
   * Per-injury rehab coverage, tallied inside the sweep rather than by a
   * second pass. The sweep ALREADY generates a full-grid plan for each of
   * knees and shoulders, so counting coverage here costs nothing and raises
   * the denominator from the 48 profiles the old dedicated loop used to all
   * 432 per injury.
   */
  rehab: Record<string, { profiles: number; covered: number; mainSlot: number; missing: string[] }>
}
const t: Tally = {
  mainSlots: 0, tier3Slots: 0, bandWithFreePeer: 0, bandFamilyBlocked: 0,
  bandNoPeer: 0, bandIndicated: 0, bandTier3: 0, spanishSquatForKnees: 0, freePeerCases: [],
  rehab: {},
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

            // Coverage for the joint this trainee actually reported. Recorded
            // per PROFILE, which is the unit that matters: a trainee either
            // got rehab for their joint or did not. Totals cannot express
            // that — 318 placements reads the same whether every trainee got
            // one or half of them got two.
            if (injuries.length === 1 && flagged.size > 0) {
              const code = injuries[0]
              const r = (t.rehab[code] ??= { profiles: 0, covered: 0, mainSlot: 0, missing: [] })
              r.profiles++
              const hits = plan
                .flatMap(day => day.exercises)
                .map(x => getExerciseEntry(x.name))
                .filter((e): e is NonNullable<typeof e> => e != null && isIndicatedFor(e, flagged))
              if (hits.length === 0) {
                if (r.missing.length < 6) r.missing.push(`${equipment_access}/${training_experience}/${workout_split_preference}/${fitness_goal}/${session_duration_preference}`)
              } else {
                r.covered++
                if (hits.some(e => e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound')) r.mainSlot++
              }
            }

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
  // WHAT THIS SECTION USED TO ASSERT, AND WHY IT KEPT GOING RED.
  //
  // It froze a raw total — "rehab-indicated bands in main slots >= 335" — and
  // that number has now drifted three times (348 -> 340 -> 318), each time
  // for a benign reason, each time re-breaking the gate. A permanently red
  // check cannot signal anything, so it was renumbered once and then broke
  // again. Renumbering it a third time would just schedule the fourth.
  //
  // THE 318 IS ROOT-CAUSED, not waved through. Bisected across main: it held
  // at 340 through a1b894e and dropped to 318 at 987531f ("Prefer the best
  // tool the trainee owns"). isEquipmentQualityExempt spares a rehab band the
  // -1 penalty, but an exemption only zeroes the band's OWN factor — it does
  // not stop a barbell rival collecting +1. So 22 placements lost a main slot
  // to a better implement. Every one of them was Spanish Squat; no other
  // exercise in this population moved at all.
  //
  // AND IT COST NOBODY THEIR REHAB. Measured per profile on the full grid:
  // 432 of 432 knee-injured profiles get a knee-indicated exercise, and 432
  // of 432 get one in a main slot. The drop is weeks that carried Spanish
  // Squat twice now carrying it once. That is a ranking change, not a
  // suppression, which is exactly the distinction the old total could not
  // make: 318 reads identically whether every trainee got one or half of
  // them got two.
  //
  // SO THE ASSERTION IS NOW THE PROPERTY, NOT THE TOTAL. Coverage is a share
  // of profiles, so it does not move when the catalogue grows — which is the
  // whole reason the total kept drifting. SCALE CHANGE, stated loudly: the
  // headline number below is a percentage of profiles, not a placement count.
  // It is not comparable to the 348/340/318 series above, and the old floor
  // of 335 no longer exists.
  //
  // Denominator also went UP, not down. The old dedicated coverage loop ran
  // 48 profiles over one injury; this reads the sweep, which is 432 profiles
  // per injury across both.
  const REHAB_JOINTS = [...new Set(EXERCISE_DATABASE.flatMap(e => e.indicated_joints ?? []))].sort()

  for (const [code, r] of Object.entries(t.rehab).sort()) {
    check(`every ${code}-injured profile gets something indicated for it (${r.covered}/${r.profiles})`,
      r.profiles > 0 && r.covered === r.profiles, `${r.profiles - r.covered} without: ${r.missing.join(', ')}`)
  }
  // "0 without" also passes when the loop never ran. Say the denominator.
  const injuriesChecked = Object.values(t.rehab).reduce((a, r) => a + r.profiles, 0)
  check(`...and there were profiles to check (${injuriesChecked})`, injuriesChecked > 400, String(injuriesChecked))

  // Kept as a REPORTED number rather than an assertion. It is a real
  // property of the plans and worth watching, but it is a fact about one
  // exercise's tier, not about the penalty: Spanish Squat is tier2_compound,
  // so every placement of it counts as a main slot, while all nine shoulder
  // rehab exercises are tier3_isolation and none ever will. Asserting a
  // floor on it is what produced three false alarms.
  for (const [code, r] of Object.entries(t.rehab).sort())
    console.log(`    (reported, not asserted) ${code}: rehab reaches a main slot in ${r.mainSlot}/${r.profiles} profiles`)
  // 348 -> 340 (nine new catalogue entries) -> 318 (987531f, the
  // equipment-quality preference) -> 315 (four new hip/back rehab entries).
  // The fourth move is the same benign mechanism as the second: a bigger pool
  // reshuffles ranked selection. It is REPORTED rather than asserted for
  // exactly this reason — under the old >= 335 floor this drift would have
  // turned the gate red a fourth time, while the coverage checks above show
  // no profile lost anything.
  console.log(`    (reported, not asserted) rehab-indicated bands in main slots: ${t.bandIndicated} — 348 -> 340 -> 318 -> 315, all four moves benign`)

  check(`a knee-injured trainee still gets Spanish Squat (${t.spanishSquatForKnees} placements)`,
    t.spanishSquatForKnees > 0, String(t.spanishSquatForKnees))

  // A COLLAPSE DETECTOR, not a drift detector. The exemption exists because
  // its absence was measured at a 90% drop (1637 -> 162 appearances). That
  // is the failure this catches, and it is an order of magnitude away from
  // the +/-22 ranking noise that broke the old floor. Deliberately loose:
  // the coverage checks above are the ones with teeth.
  check(`rehab bands have not collapsed out of main slots (${t.bandIndicated}, collapse floor 160)`,
    t.bandIndicated >= 160, String(t.bandIndicated))

  // THE GAP THIS GATE CAN SEE AND SHOULD NOT HIDE. Frozen as a list so it is
  // impossible to leave un-noticed in either direction. This is a RECORD OF A
  // GAP, NOT A TARGET: if adding rehab for a new joint turns this red, the fix
  // is to add the joint here, not to question the work.
  //
  // It did exactly that once already, on purpose. It read ['knee','shoulder']
  // when six of the eight injuries got subtraction and no rehab; hips and the
  // lower back have since been filled — three activation primers written for
  // the hip, Dead Bug / Side Plank / Bird Dog tagged for the back — and this
  // line went red as designed and was updated deliberately.
  //
  // It then did it a SECOND time, on 29 Aug 2026, when ankles, wrists and
  // elbows were filled — nine primer-tier entries, bands and isometrics and
  // mobility only, nothing bearing weight on the injured joint.
  //
  // ONE STILL HAS NOTHING: the neck, and it is now the only one, deliberately.
  // Ashley ruled it out of scope because "my neck bothers me" spans a stiff
  // desk neck and a nerve problem that must not be loaded, and the app cannot
  // tell which — so it says so rather than prescribing, per VISION.md's
  // "never claims a capability it doesn't have".
  //
  // That changes what a red here MEANS, and the standing instruction above no
  // longer covers every case. Adding an eighth joint to this list is only the
  // right fix for a joint Ashley has put in scope. If `neck` appears, the fix
  // is NOT to add it here — it is that somebody started prescribing neck work
  // against an explicit ruling, and that needs her.
  check(`joints that have rehab at all: ${REHAB_JOINTS.join(', ')} — only the neck still has none, deliberately`,
    JSON.stringify(REHAB_JOINTS) === JSON.stringify(['ankle', 'elbow', 'hip', 'knee', 'lower_back_axial', 'shoulder', 'wrist']), REHAB_JOINTS.join(', '))
  check('...and the neck is not among them',
    !REHAB_JOINTS.includes('neck'), REHAB_JOINTS.join(', '))
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
