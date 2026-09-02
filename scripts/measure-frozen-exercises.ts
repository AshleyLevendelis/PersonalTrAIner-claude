// ---------------------------------------------------------------------------
// WHICH EXERCISES REPEAT IDENTICALLY, AND WHY.  A measurement, not a gate.
//
// test:quality prints its frozen-week findings but caps the list, and the
// last run had Russian Twist on 120 of the 216 lines it showed. That is a
// sample of a sample. This sweeps the same 9,216-plan grid, applies the
// SAME frozen_week rule quality-score.ts applies (consecutive non-deload
// weeks in a block, same day, same slot, same exercise, load unchanged —
// null counts as unchanged against null — and reps unchanged; primers and
// steady-state cardio exempt), and then does the thing the scorer does not:
// says WHY each frozen pair is frozen, by reading the catalogue entry.
//
//   tagged_loaded_no_kg  the equipment tag says "loaded" (medicine ball,
//                        backpack, dumbbell...) so exercise-plan.ts treats it
//                        as a weight-ramping exercise, but categorize() gives
//                        it no load anchor, so no kg is ever prescribed —
//                        nothing to ramp AND excluded from the rep ramp.
//                        This is the Russian Twist case.
//   bodyweight_no_kg     not tagged loaded, no kg, reps still did not move —
//                        the rep ramp applied and something swallowed it
//                        (the experience min_reps clamp under a negative
//                        phase shift is the known one).
//   loaded_kg_frozen     a kg is prescribed and it did not move, and neither
//                        did reps — the frozen-load rep bump declined or
//                        could not move the range (implement ceilings).
//
// Every 101st plan is also scored by quality-score's own scorePlan and its
// frozen_week deduction count compared with this script's count for the
// same plan. If the mirror drifts from the scorer, that comparison fails
// loudly rather than letting this report describe a rule the gate does not
// apply.
//
// Usage:  npx tsx scripts/measure-frozen-exercises.ts [--stride=N]
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { categorize, isExternallyLoaded } from '../src/lib/load-prescription'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference, MesocycleWeek, Exercise,
} from '../src/lib/types'

// --- the quality sweep's grid, copied field for field -----------------------
const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const ALL_RECOVERY: RecoveryCapacity[] = ['low', 'moderate', 'high']
const ALL_CONDITIONING_PREF: ConditioningPreference[] = ['love', 'tolerate', 'avoid']

interface Combination {
  equipment: EquipmentAccess; injuries: string[]; duration: SessionDuration; style: TrainingStyle
  experience: TrainingExperience; goal: FitnessGoal; recovery: RecoveryCapacity; conditioningPref: ConditioningPreference
}
function buildProfile(combo: Combination): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: combo.goal, preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: combo.equipment, injuries: combo.injuries,
    training_style: combo.style, training_experience: combo.experience,
    session_duration_preference: combo.duration, workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: combo.recovery, conditioning_preference: combo.conditioningPref,
  }
}
const comboKey = (c: Combination) => [c.equipment, c.injuries.join('+') || 'none', c.duration, c.style, c.experience, c.goal, c.recovery, c.conditioningPref].join('|')
function generateAllCombinations(): Combination[] {
  const combos: Combination[] = []
  let rotationIndex = 0
  for (const equipment of ALL_EQUIPMENT)
    for (const injuries of getInjuryCombinations())
      for (const duration of ALL_DURATIONS)
        for (const style of ALL_STYLES)
          for (const experience of ALL_EXPERIENCE)
            for (const goal of ALL_GOALS) {
              combos.push({
                equipment, injuries, duration, style, experience, goal,
                recovery: ALL_RECOVERY[rotationIndex % ALL_RECOVERY.length],
                conditioningPref: ALL_CONDITIONING_PREF[Math.floor(rotationIndex / ALL_RECOVERY.length) % ALL_CONDITIONING_PREF.length],
              })
              rotationIndex++
            }
  return combos
}

// --- the frozen_week rule, mirrored from quality-score.ts ------------------
interface FrozenPair { name: string; reps: string; kg: number | null; weekA: number; weekB: number; hold?: string; bump?: string }
export function frozenPairs(mesocycle: MesocycleWeek[]): FrozenPair[] {
  const out: FrozenPair[] = []
  for (let block = 1; block <= 4; block++) {
    const blockWeeks = mesocycle.filter(w => w.block_number === block).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
    const pairs: [MesocycleWeek | undefined, MesocycleWeek | undefined][] = [[blockWeeks[0], blockWeeks[1]], [blockWeeks[1], blockWeeks[2]]]
    for (const [wa, wb] of pairs) {
      if (!wa || !wb || wa.is_deload || wb.is_deload) continue
      for (const dayA of wa.days) {
        const dayB = wb.days.find(d => d.day === dayA.day)
        if (!dayB) continue
        dayA.exercises.forEach((exA: Exercise, i: number) => {
          const exB = dayB.exercises[i]
          if (!exB || exB.name !== exA.name) return
          if (exA.tier === 'tier_0_primer' || exA.prescription_type === 'steady_state') return
          const loadFrozen = exA.suggested_load_kg == null ? exB.suggested_load_kg == null : exA.suggested_load_kg === exB.suggested_load_kg
          if (loadFrozen && exA.reps === exB.reps) out.push({ name: exA.name, reps: exA.reps, kg: exA.suggested_load_kg ?? null, weekA: wa.week_number, weekB: wb.week_number, hold: exB.load_hold, bump: exB.rep_bump })
        })
      }
    }
  }
  return out
}

// The loaded class is split by what the generator itself recorded on week B
// (Exercise.load_hold / rep_bump) — `loaded:<hold>/<bump>`. A bar held at the
// standards ceiling with the rep bump at its cap is held BY DESIGN; one where
// no permitted bump can change the rep range is a floor decision (Ashley's);
// a band decline is a safety refusal; 'matched' is the one-target/one-weight
// per-lift rules pinning a slot to its sibling; a carry at its distance cap
// is its own thing.
type Cause = string
const byName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
export function causeOf(p: FrozenPair): Cause {
  const entry = byName.get(p.name)
  if (!entry) return 'unknown_exercise'
  if (p.kg != null) {
    if (entry.movement_pattern === 'carry') return 'loaded_carry'
    return `loaded:${p.hold ?? 'nohold'}/${p.bump ?? '-'}`
  }
  if (isExternallyLoaded(entry) && categorize(entry) == null) return 'tagged_loaded_no_kg'
  return 'bodyweight_no_kg'
}

// --- sweep -----------------------------------------------------------------
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n)
const stride = Math.max(1, Number((process.argv.find(a => a.startsWith('--stride=')) ?? '--stride=1').split('=')[1]) || 1)
const combos = generateAllCombinations()
const sampled = combos.filter((_, i) => i % stride === 0)
console.log(`Frozen exercises — ${combos.length} combinations in the grid, sweeping ${sampled.length}${stride > 1 ? ` (every ${stride}th)` : ''}\n`)

const pairsByCause = new Map<string, number>()
const pairsByName = new Map<string, number>()
const causeByName = new Map<string, Cause>()
const plansByCause = new Map<string, number>()
const plansByGoalCause = new Map<string, number>()
const plansByName = new Map<string, number>()
let plansWithAny = 0, totalPairs = 0, mismatches = 0, crossChecked = 0
const start = performance.now()
const realLog = console.log

sampled.forEach((combo, i) => {
  const key = comboKey(combo)
  setRandomSource(seededRngFromKey(key))
  console.log = () => {}
  let meso: MesocycleWeek[]
  try { meso = generateMesocycle(buildProfile(combo)) } finally { console.log = realLog }
  resetRandomSource()

  const pairs = frozenPairs(meso)
  totalPairs += pairs.length
  if (pairs.length > 0) plansWithAny++
  const causesHere = new Set<Cause>(), namesHere = new Set<string>()
  for (const p of pairs) {
    const cause = causeOf(p)
    bump(pairsByCause, cause); bump(pairsByName, p.name); causeByName.set(p.name, cause)
    causesHere.add(cause); namesHere.add(p.name)
  }
  for (const c of causesHere) { bump(plansByCause, c); bump(plansByGoalCause, `${combo.goal}|${c}`) }
  for (const n of namesHere) bump(plansByName, n)

  if (i % 101 === 0) {
    crossChecked++
    const scored = scorePlan(buildProfile(combo), meso, key)
    const scorerCount = scored.dimensions.progression.deductions.filter(d => d.rule === 'frozen_week').length
    if (scorerCount !== pairs.length) { mismatches++; console.error(`  MIRROR MISMATCH ${key}: scorer ${scorerCount} vs mirror ${pairs.length}`) }
  }
  if ((i + 1) % Math.max(1, Math.floor(sampled.length / 10)) === 0)
    console.log(`  ${i + 1}/${sampled.length} plans (${Math.round((performance.now() - start) / 1000)}s)`)
})

const pct = (n: number, d: number) => d === 0 ? '–' : `${(100 * n / d).toFixed(1)}%`
console.log(`\n${'='.repeat(78)}\n1. How many plans carry a frozen exercise (of ${sampled.length})\n${'='.repeat(78)}`)
console.log(`  plans with at least one frozen pair: ${plansWithAny} (${pct(plansWithAny, sampled.length)});  frozen pairs in total: ${totalPairs}`)
for (const c of [...new Set([...plansByCause.keys(), ...pairsByCause.keys()])].sort((a, b) => (pairsByCause.get(b) ?? 0) - (pairsByCause.get(a) ?? 0))) {
  const pl = plansByCause.get(c) ?? 0, pr = pairsByCause.get(c) ?? 0
  if (pl === 0 && pr === 0) continue
  console.log(`  ${c.padEnd(30)} plans ${String(pl).padStart(5)} (${pct(pl, sampled.length).padStart(5)})   pairs ${String(pr).padStart(6)} (${pct(pr, totalPairs)} of all frozen pairs)`)
}

console.log(`\n${'='.repeat(78)}\n2. By goal — which goals' plans carry each cause\n${'='.repeat(78)}`)
const perGoal = sampled.length / ALL_GOALS.length
for (const g of ALL_GOALS) {
  const parts = ['tagged_loaded_no_kg', 'bodyweight_no_kg', 'loaded_carry', 'loaded:ceiling/range_fixed', 'loaded:ceiling/capped', 'loaded:matched/-'].map(c => `${c} ${pct(plansByGoalCause.get(`${g}|${c}`) ?? 0, perGoal)}`)
  console.log(`  ${g.padEnd(13)} ${parts.join('   ')}`)
}

console.log(`\n${'='.repeat(78)}\n3. The exercises, by frozen pairs (plans = plans containing that exercise frozen at least once)\n${'='.repeat(78)}`)
const names = [...pairsByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
for (const [n, pairs] of names)
  console.log(`  ${n.padEnd(34)} ${String(pairs).padStart(6)} pairs   ${String(plansByName.get(n) ?? 0).padStart(5)} plans   ${causeByName.get(n)}`)

console.log(`\n${'='.repeat(78)}\n4. Mirror check against quality-score's own scorer\n${'='.repeat(78)}`)
console.log(`  ${crossChecked} plans scored both ways; mismatches: ${mismatches}${mismatches === 0 ? ' — the rule above is the gate\'s rule' : '  <<< THIS REPORT DESCRIBES A DIFFERENT RULE FROM THE GATE'}`)
console.log(`\nDone in ${Math.round((performance.now() - start) / 1000)}s. Measurement only; nothing changed.\n`)
if (mismatches > 0) process.exit(1)
