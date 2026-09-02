// ---------------------------------------------------------------------------
// DO THE REP RANGES MATCH THE PHASE NAMES?  A report, not a gate.
//
// Ashley's Full Program screen, 2 Sep 2026: weeks 5-6 read "Deadlifts 3x3-5"
// under a heading of "Hypertrophy" whose own description promises "moderate
// loads, higher volume". 3-5 is a strength range.
//
// The mechanism is simple and deliberate: PHASE_CONFIGS shifts each
// exercise's BASE rep range by rep_shift (adaptation +3, hypertrophy 0,
// strength -3, power -4, metabolic +4), and the base comes from the training
// STYLE per tier (combat main lifts are 3-5; bodybuilding 6-8; functional
// 5-8; hybrid 6-10) with the GOAL's repRangeShift on top (fat loss -2 on
// main lifts). So a hypertrophy block imposes no hypertrophy range — it
// leaves every exercise on whatever its style and goal already said. Whether
// that is a defect or a deliberate main-lift exception is a PRESCRIPTION
// decision, which is Ashley's, so this script measures and stops.
//
// It sweeps the same 9,216-plan grid test:quality uses, tabulates
// (phase, tier, rep range) across every non-deload week, and flags any slot
// whose whole range sits OUTSIDE what the phase's own focus text promises:
//
//   Hypertrophy  "moderate loads, higher volume"   -> a bottom below 6 is outside (her rule)
//   Strength     "lower reps ... high intensity"   -> a bottom above 8 is outside
//   Metabolic    "short rest, sustained output"    -> a bottom below 10 is outside (her rule)
//
// Adaptation and power make no rep promise in their focus text, so they are
// tabulated and never flagged. Deload weeks are excluded from the flags:
// their +2 is a recovery back-off, not the phase's prescription. Isolation
// work (tier 3) and primers/finishers are tabulated but not counted as
// offenders — 12-15 curls inside a strength block are ordinary programming;
// the question is about the lifts the block is named for.
//
// Usage:  npx tsx scripts/report-rep-ranges-by-phase.ts [--stride=N]
// --stride=16 samples every 16th combination for a quick look (~576 plans).
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference, MesocycleWeek,
} from '../src/lib/types'

// --- the quality sweep's grid, copied field for field -----------------------
// (run-quality-score.ts keeps these private; a second copy is acceptable for a
// one-off report, and the count printed at the top is the check that they
// still agree — it must read 9,216.)
const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const ALL_RECOVERY: RecoveryCapacity[] = ['low', 'moderate', 'high']
const ALL_CONDITIONING_PREF: ConditioningPreference[] = ['love', 'tolerate', 'avoid']

interface Combination {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  goal: FitnessGoal
  recovery: RecoveryCapacity
  conditioningPref: ConditioningPreference
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

function comboKey(c: Combination): string {
  return [c.equipment, c.injuries.join('+') || 'none', c.duration, c.style, c.experience, c.goal, c.recovery, c.conditioningPref].join('|')
}

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

// --- what each phase promises, read off its own focus text -----------------
type Verdict = 'inside' | 'outside' | 'unjudged'
function judge(phaseLabel: string, low: number, high: number): Verdict {
  switch (phaseLabel) {
    // Ashley's ruling, 2 Sep 2026: "Lift it to at least 6 reps." The first
    // version of this rule read the phase's focus text as "the top of the
    // range must reach 6", which let 4-6 through; hers is a floor on the
    // BOTTOM. Counts before and after that change are not comparable.
    case 'Hypertrophy': return low < 6 ? 'outside' : 'inside'
    case 'Maximal Strength': return low > 8 ? 'outside' : 'inside'
    // Ashley's second ruling, 2 Sep 2026: "Lift to at least 10 reps." The
    // first version read the focus text as "the top must reach 12"; hers is
    // a floor on the BOTTOM at 10. Counts under the two rules are not
    // comparable (7-9 was outside under both; 9-10 and 9-11 only under hers).
    case 'Metabolic Conditioning': return low < 10 ? 'outside' : 'inside'
    default: return 'unjudged'
  }
}
const PROMISE: Record<string, string> = {
  'Hypertrophy': 'bottom of range must be at least 6 (Ashley, 2 Sep 2026)',
  'Maximal Strength': 'bottom of range must not exceed 8',
  'Metabolic Conditioning': 'bottom of range must be at least 10 (Ashley, 2 Sep 2026)',
}

function parseReps(reps: string): { low: number; high: number } | null {
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) return { low: Number(range[1]), high: Number(range[2]) }
  const single = reps.match(/^(\d+)$/)
  if (single) return { low: Number(single[1]), high: Number(single[1]) }
  return null // holds, intervals, distances — not rep prescriptions
}

const tierName = (t: string | undefined): string => {
  switch (t) {
    case 'tier_1_primary': return 'main lift'
    case 'tier_2_secondary': return 'secondary'
    case 'tier_3_isolation': return 'isolation'
    case 'tier_0_primer': return 'primer'
    case 'tier_4_finisher': return 'finisher'
    default: return 'untiered'
  }
}
const JUDGED_TIERS = new Set(['main lift', 'secondary'])

// --- tallies ---------------------------------------------------------------
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n)

const stride = Math.max(1, Number((process.argv.find(a => a.startsWith('--stride=')) ?? '--stride=1').split('=')[1]) || 1)
const combos = generateAllCombinations()
const sampled = combos.filter((_, i) => i % stride === 0)
console.log(`Rep ranges by phase — ${combos.length} combinations in the grid, sweeping ${sampled.length}${stride > 1 ? ` (every ${stride}th)` : ''}\n`)

const rangeByPhaseTier = new Map<string, Map<string, number>>()   // phase|tier -> range -> slots
const slotsByPhaseTier = new Map<string, number>()
const outsideByPhaseTier = new Map<string, number>()
const offenders = new Map<string, number>()                         // phase|tier|name|range -> slots
const mainLiftHypertrophyByStyleGoal = new Map<string, Map<string, number>>() // style|goal -> range -> slots
const plansWithOutsideMainLift = new Map<string, number>()          // phase -> plans
let plansWithAnyOutside = 0
let deloadSlots = 0, judgedWeeks = 0

const start = performance.now()
sampled.forEach((combo, i) => {
  const key = comboKey(combo)
  setRandomSource(seededRngFromKey(key))
  // The generator logs its own set-trimming decisions; thousands of those
  // lines would bury the table, so they are swallowed for the duration.
  const realLog = console.log
  console.log = () => {}
  let meso: MesocycleWeek[]
  try { meso = generateMesocycle(buildProfile(combo)) } finally { console.log = realLog }
  resetRandomSource()

  const phasesOutsideHere = new Set<string>()
  let anyOutside = false
  for (const week of meso) {
    const phase = week.phase_label ?? 'unlabelled'
    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (ex.prescription_type && ex.prescription_type !== 'reps') continue
        const parsed = parseReps(ex.reps)
        if (!parsed) continue
        if (week.is_deload) { deloadSlots++; continue }
        const tier = tierName(ex.tier)
        const pt = `${phase}|${tier}`
        if (!rangeByPhaseTier.has(pt)) rangeByPhaseTier.set(pt, new Map())
        bump(rangeByPhaseTier.get(pt)!, ex.reps)
        bump(slotsByPhaseTier, pt)
        if (phase === 'Hypertrophy' && tier === 'main lift') {
          const sg = `${combo.style}|${combo.goal}`
          if (!mainLiftHypertrophyByStyleGoal.has(sg)) mainLiftHypertrophyByStyleGoal.set(sg, new Map())
          bump(mainLiftHypertrophyByStyleGoal.get(sg)!, ex.reps)
        }
        if (!JUDGED_TIERS.has(tier)) continue
        if (judge(phase, parsed.low, parsed.high) === 'outside') {
          bump(outsideByPhaseTier, pt)
          bump(offenders, `${phase}|${tier}|${ex.name}|${ex.reps}`)
          anyOutside = true
          if (tier === 'main lift') phasesOutsideHere.add(phase)
        }
      }
    }
    if (!week.is_deload) judgedWeeks++
  }
  if (anyOutside) plansWithAnyOutside++
  for (const p of phasesOutsideHere) bump(plansWithOutsideMainLift, p)

  if ((i + 1) % Math.max(1, Math.floor(sampled.length / 10)) === 0)
    console.log(`  ${i + 1}/${sampled.length} plans (${Math.round((performance.now() - start) / 1000)}s)`)
})

// --- report ----------------------------------------------------------------
const pct = (n: number, d: number) => d === 0 ? '–' : `${(100 * n / d).toFixed(1)}%`
const PHASE_ORDER = ['Anatomical Adaptation', 'Hypertrophy', 'Maximal Strength', 'Consolidation', 'Power & Expression', 'Metabolic Conditioning']
const TIER_ORDER = ['main lift', 'secondary', 'isolation', 'primer', 'finisher', 'untiered']

console.log(`\n${'='.repeat(78)}\n1. What each phase actually prescribes, by tier (non-deload weeks; slots = one exercise on one day)\n${'='.repeat(78)}`)
for (const phase of PHASE_ORDER) {
  const promise = PROMISE[phase] ? `  [promise: ${PROMISE[phase]}]` : '  [no rep promise in focus text — tabulated only]'
  console.log(`\n${phase}${promise}`)
  for (const tier of TIER_ORDER) {
    const pt = `${phase}|${tier}`
    const ranges = rangeByPhaseTier.get(pt)
    if (!ranges) continue
    const total = slotsByPhaseTier.get(pt) ?? 0
    const top = [...ranges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([r, n]) => `${r} ${pct(n, total)}`).join('   ')
    const out = outsideByPhaseTier.get(pt)
    const flag = JUDGED_TIERS.has(tier) && PROMISE[phase] ? `   OUTSIDE: ${out ?? 0} (${pct(out ?? 0, total)})` : ''
    console.log(`  ${tier.padEnd(10)} ${String(total).padStart(7)} slots   ${top}${flag}`)
  }
}

console.log(`\n${'='.repeat(78)}\n2. The main lift inside a HYPERTROPHY block, by training style × goal (the screenshot's case)\n${'='.repeat(78)}`)
console.log(`  ${'style'.padEnd(13)} ${'goal'.padEnd(13)} ranges seen (share of that style×goal's main-lift slots)`)
for (const style of ALL_STYLES) for (const goal of ALL_GOALS) {
  const ranges = mainLiftHypertrophyByStyleGoal.get(`${style}|${goal}`)
  if (!ranges) continue
  const total = [...ranges.values()].reduce((a, b) => a + b, 0)
  const line = [...ranges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, n]) => `${r} ${pct(n, total)}`).join('   ')
  console.log(`  ${style.padEnd(13)} ${goal.padEnd(13)} ${line}`)
}

console.log(`\n${'='.repeat(78)}\n3. Plans affected (of ${sampled.length} swept)\n${'='.repeat(78)}`)
console.log(`  plans with ANY main-lift or secondary slot outside its phase's promise: ${plansWithAnyOutside} (${pct(plansWithAnyOutside, sampled.length)})`)
for (const phase of PHASE_ORDER) {
  const n = plansWithOutsideMainLift.get(phase)
  if (n) console.log(`  plans whose MAIN LIFT sits outside the promise in a ${phase} block: ${n} (${pct(n, sampled.length)})`)
}
console.log(`  (deload slots excluded from every flag: ${deloadSlots}; non-deload weeks read: ${judgedWeeks})`)

console.log(`\n${'='.repeat(78)}\n4. The ten most common offenders (phase · tier · exercise · range · slots)\n${'='.repeat(78)}`)
const top10 = [...offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
if (top10.length === 0) console.log('  none')
for (const [k, n] of top10) {
  const [phase, tier, name, range] = k.split('|')
  console.log(`  ${phase.padEnd(24)} ${tier.padEnd(10)} ${name.padEnd(36)} ${range.padEnd(6)} ${n}`)
}
console.log(`\nDone in ${Math.round((performance.now() - start) / 1000)}s. This script changes nothing; the decision it informs is Ashley's.\n`)
