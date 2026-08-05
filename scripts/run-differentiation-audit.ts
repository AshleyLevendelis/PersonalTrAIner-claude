import * as fs from 'fs'
import * as path from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type {
  UserProfile, Exercise, WorkoutDay, MesocycleWeek,
  EquipmentAccess, TrainingStyle, FitnessGoal, TrainingExperience,
} from '../src/lib/types'

// ---------------------------------------------------------------------------
// Differentiation audit — READ-ONLY diagnostic, no fixes.
//
// The quality harness (run-quality-score.ts) scores one plan against
// absolute rubrics. It has never asked the complementary question: holding
// everything else fixed, does changing ONE profile input actually change
// the plan a user gets? A generator that is internally consistent but
// insensitive to its inputs would pass every existing gate while quietly
// giving two very different people the same program.
//
// Method: for each dimension, build matched profile PAIRS that differ in
// exactly one field, seed the RNG identically per profile (seededRngFromKey
// — mulberry32, deterministic), generate a full mesocycle for each, and
// measure concrete divergence: exercise-name overlap, movement-pattern mix,
// weekly set volume, rep-range profile, prescribed load on shared lifts,
// phase/block sequence, and conditioning volume.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Baseline profile + pair construction
// ---------------------------------------------------------------------------

function buildProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: 'full_gym',
    injuries: [],
    training_style: 'bodybuilding',
    training_experience: 'intermediate',
    session_duration_preference: '60-90',
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, // live DB column, not on UserProfile — kept for parity with every other harness's literal
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
    // No `id` — pure synchronous generation, no Supabase-dependent code path involved.
    ...overrides,
  } as UserProfile
}

interface Pair {
  dimension: string
  label: string
  profileA: UserProfile
  profileB: UserProfile
  labelA: string
  labelB: string
}

function pair(dimension: string, labelA: string, overridesA: Partial<UserProfile>, labelB: string, overridesB: Partial<UserProfile>): Pair {
  return {
    dimension,
    label: `${labelA} vs ${labelB}`,
    labelA, labelB,
    profileA: buildProfile(overridesA),
    profileB: buildProfile(overridesB),
  }
}

function pairwise<T extends string>(dimension: string, values: T[], toOverrides: (v: T) => Partial<UserProfile>): Pair[] {
  const pairs: Pair[] = []
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      pairs.push(pair(dimension, values[i], toOverrides(values[i]), values[j], toOverrides(values[j])))
    }
  }
  return pairs
}

const SCHEMA_NOTES: string[] = []

const EQUIPMENT_VALUES: EquipmentAccess[] = ['full_gym', 'home_gym', 'bodyweight']
const equipmentPairs = pairwise('equipment', EQUIPMENT_VALUES, v => ({ equipment_access: v }))

// The brief asks for "bodybuilding vs functional vs conditioning vs combat."
// TrainingStyle's real enum is 'functional' | 'bodybuilding' | 'combat' | 'hybrid'
// — there is no 'conditioning' training style (that string only exists as a
// FitnessGoal value). Substituted 'hybrid' as the 4th real value so the
// audit still covers every actual style option; flagged below.
SCHEMA_NOTES.push(
  `training_style has no 'conditioning' value (TrainingStyle = 'functional'|'bodybuilding'|'combat'|'hybrid'). ` +
  `'conditioning' exists only as a fitness_goal. Tested the 4 real style values (bodybuilding/functional/combat/hybrid) pairwise instead.`
)
const STYLE_VALUES: TrainingStyle[] = ['bodybuilding', 'functional', 'combat', 'hybrid']
const stylePairs = pairwise('training_style', STYLE_VALUES, v => ({ training_style: v }))

// Same mismatch on goal: brief asks "hypertrophy vs fat loss vs endurance vs
// maintain." FitnessGoal's real enum is 'fat_loss'|'hypertrophy'|'functional'|
// 'conditioning' — no 'endurance' or 'maintain' value exists at all.
SCHEMA_NOTES.push(
  `fitness_goal has no 'endurance' or 'maintain' value (FitnessGoal = 'fat_loss'|'hypertrophy'|'functional'|'conditioning'). ` +
  `Tested the 4 real goal values (hypertrophy/fat_loss/functional/conditioning) pairwise instead — 'conditioning' is the closest real analog to 'endurance', and nothing in the schema maps to a maintenance goal.`
)
const GOAL_VALUES: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'functional', 'conditioning']
const goalPairs = pairwise('fitness_goal', GOAL_VALUES, v => ({ fitness_goal: v }))

const experiencePair = pair('training_experience', 'beginner', { training_experience: 'beginner' as TrainingExperience }, 'advanced', { training_experience: 'advanced' as TrainingExperience })
const sexPair = pair('sex', 'male', { gender: 'male' }, 'female', { gender: 'female' })
const bodyweightPair = pair('bodyweight', '60kg', { weight_kg: 60 }, '90kg', { weight_kg: 90 })
const recoveryPair = pair('recovery_capacity', 'low', { recovery_capacity: 'low' }, 'high', { recovery_capacity: 'high' })
const sessionLengthPair = pair('session_duration_preference', '30-45', { session_duration_preference: '30-45' }, '60-90', { session_duration_preference: '60-90' })

const ALL_PAIRS: Pair[] = [
  ...equipmentPairs, ...stylePairs, ...goalPairs,
  experiencePair, sexPair, bodyweightPair, recoveryPair, sessionLengthPair,
]

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const REP_BUCKETS = ['strength(1-5)', 'hypertrophy(6-12)', 'endurance(13-20)', 'very_high(20+)'] as const
type RepBucket = typeof REP_BUCKETS[number]

function repMidpoint(reps: string): number | null {
  const nums = [...reps.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
function repBucket(mid: number): RepBucket {
  if (mid <= 5) return 'strength(1-5)'
  if (mid <= 12) return 'hypertrophy(6-12)'
  if (mid <= 20) return 'endurance(13-20)'
  return 'very_high(20+)'
}

const MOVEMENT_PATTERNS = ['push', 'pull', 'hinge', 'squat', 'carry', 'rotation', 'isolation'] as const

interface WeekSnapshot {
  exerciseNames: Set<string>
  totalSets: number
  setsByPattern: Record<string, number>
  setsByRepBucket: Record<string, number>
  loadByName: Map<string, number>
  conditioningMinutes: number
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function snapshotWeek(days: WorkoutDay[]): WeekSnapshot {
  const exerciseNames = new Set<string>()
  const setsByPattern: Record<string, number> = {}
  const setsByRepBucket: Record<string, number> = {}
  const loadByName = new Map<string, number>()
  let totalSets = 0
  let conditioningMinutes = 0

  for (const day of days) {
    conditioningMinutes += day.recommendedCardio?.duration ?? 0
    for (const ex of day.exercises) {
      const key = normalizeName(ex.name)
      exerciseNames.add(key)
      const sets = ex.sets || 0
      totalSets += sets

      const pattern = ex.movement_pattern ?? 'isolation'
      setsByPattern[pattern] = (setsByPattern[pattern] ?? 0) + sets

      // Rep-range buckets only make sense for actual rep prescriptions —
      // time/distance-load/interval strings ("30-45" seconds) would
      // otherwise get silently misread as a 30-45 REP range.
      if (!ex.prescription_type || ex.prescription_type === 'reps') {
        const mid = repMidpoint(ex.reps)
        if (mid != null) {
          const bucket = repBucket(mid)
          setsByRepBucket[bucket] = (setsByRepBucket[bucket] ?? 0) + sets
        }
      }

      if (ex.suggested_load_kg != null && ex.suggested_load_kg > 0) {
        loadByName.set(key, ex.suggested_load_kg)
      } else if (ex.per_set_load && ex.per_set_load.length > 0 && ex.per_set_load[0].load_kg > 0) {
        loadByName.set(key, ex.per_set_load[0].load_kg)
      }
    }
  }

  return { exerciseNames, totalSets, setsByPattern, setsByRepBucket, loadByName, conditioningMinutes }
}

/** Total variation distance between two set-weighted distributions over the same category space, as a 0-100 percentage. */
function tvd(a: Record<string, number>, b: Record<string, number>): number {
  const totalA = Object.values(a).reduce((s, v) => s + v, 0)
  const totalB = Object.values(b).reduce((s, v) => s + v, 0)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let sum = 0
  for (const k of keys) {
    const pa = totalA > 0 ? (a[k] ?? 0) / totalA : 0
    const pb = totalB > 0 ? (b[k] ?? 0) / totalB : 0
    sum += Math.abs(pa - pb)
  }
  return (sum / 2) * 100
}

function jaccardOverlapPct(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 100
  const intersection = [...a].filter(x => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 100 : (intersection / union) * 100
}

function pctDelta(a: number, b: number): number {
  const denom = (a + b) / 2
  if (denom === 0) return 0
  return (Math.abs(a - b) / denom) * 100
}

interface LoadRatioEntry { name: string; loadA: number; loadB: number; ratio: number }

function phaseSequence(weeks: MesocycleWeek[]): string[] {
  return weeks.map(w => w.phase_label ?? `block${w.block_number ?? '?'}/w${w.week_in_block ?? '?'}${w.is_deload ? '(deload)' : ''}`)
}

interface PairResult {
  pair: Pair
  overlapPct: number
  patternTVD: number
  repRangeTVD: number
  setsA: number
  setsB: number
  setsDeltaPct: number
  loadRatios: LoadRatioEntry[]
  meanLoadDeviationPct: number | null
  phaseSeqIdentical: boolean
  firstDivergentWeek: number | null
  conditioningA: number
  conditioningB: number
  conditioningDeltaPct: number
  patternsA: Record<string, number>
  patternsB: Record<string, number>
  repBucketsA: Record<string, number>
  repBucketsB: Record<string, number>
}

function generateSeeded(profile: UserProfile, seedKey: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seedKey))
  // exercise-plan.ts's internal weekly-pattern-balance logging fires via
  // console.debug on every generation call (gated on NODE_ENV, which npm
  // scripts don't reliably set cross-platform) — silenced here rather than
  // relying on an env var, so `npm run test:differentiation` is quiet
  // regardless of shell.
  const originalDebug = console.debug
  console.debug = () => {}
  try {
    return generateMesocycle(profile)
  } finally {
    console.debug = originalDebug
    resetRandomSource()
  }
}

function evaluatePair(p: Pair): PairResult {
  // Both sides of a pair MUST share one seed. If A and B were seeded
  // differently, shuffle()'s random reordering of an otherwise-identical
  // candidate pool would itself look like "the profile change did
  // something" — e.g. sex/bodyweight change nothing about which exercises
  // are eligible, only the load prescribed on them, so a shared seed
  // should (and, once fixed, does) drive exercise-name overlap to ~100%
  // for those pairs, isolating the real effect from RNG noise.
  const seedKey = `${p.dimension}:${p.label}`
  const mesoA = generateSeeded(p.profileA, seedKey)
  const mesoB = generateSeeded(p.profileB, seedKey)

  const week1A = mesoA[0]?.days ?? []
  const week1B = mesoB[0]?.days ?? []
  const snapA = snapshotWeek(week1A)
  const snapB = snapshotWeek(week1B)

  const loadRatios: LoadRatioEntry[] = []
  for (const [name, loadA] of snapA.loadByName) {
    const loadB = snapB.loadByName.get(name)
    if (loadB != null && loadA > 0) loadRatios.push({ name, loadA, loadB, ratio: loadB / loadA })
  }
  const meanLoadDeviationPct = loadRatios.length > 0
    ? (loadRatios.reduce((s, r) => s + Math.abs(r.ratio - 1), 0) / loadRatios.length) * 100
    : null

  const seqA = phaseSequence(mesoA)
  const seqB = phaseSequence(mesoB)
  const minLen = Math.min(seqA.length, seqB.length)
  let firstDivergentWeek: number | null = null
  for (let i = 0; i < minLen; i++) {
    if (seqA[i] !== seqB[i]) { firstDivergentWeek = i + 1; break }
  }
  const phaseSeqIdentical = firstDivergentWeek === null && seqA.length === seqB.length

  return {
    pair: p,
    overlapPct: jaccardOverlapPct(snapA.exerciseNames, snapB.exerciseNames),
    patternTVD: tvd(snapA.setsByPattern, snapB.setsByPattern),
    repRangeTVD: tvd(snapA.setsByRepBucket, snapB.setsByRepBucket),
    setsA: snapA.totalSets,
    setsB: snapB.totalSets,
    setsDeltaPct: pctDelta(snapA.totalSets, snapB.totalSets),
    loadRatios,
    meanLoadDeviationPct,
    phaseSeqIdentical,
    firstDivergentWeek,
    conditioningA: snapA.conditioningMinutes,
    conditioningB: snapB.conditioningMinutes,
    conditioningDeltaPct: pctDelta(snapA.conditioningMinutes, snapB.conditioningMinutes),
    patternsA: snapA.setsByPattern,
    patternsB: snapB.setsByPattern,
    repBucketsA: snapA.setsByRepBucket,
    repBucketsB: snapB.setsByRepBucket,
  }
}

// ---------------------------------------------------------------------------
// Divergence classification
// ---------------------------------------------------------------------------

type Bucket = 'zero' | 'small' | 'large'

function classify(value: number, smallAt: number, largeAt: number): Bucket {
  if (value >= largeAt) return 'large'
  if (value >= smallAt) return 'small'
  return 'zero'
}

function bucketSymbol(b: Bucket): string {
  return b === 'large' ? '●●●' : b === 'small' ? '●●·' : '●··'
}

interface MetricBuckets {
  overlap: Bucket       // measured as (100 - overlapPct)
  pattern: Bucket
  sets: Bucket
  reps: Bucket
  load: Bucket
  phase: Bucket
  conditioning: Bucket
}

function classifyPair(r: PairResult): MetricBuckets {
  return {
    overlap: classify(100 - r.overlapPct, 10, 40),           // <10% name-swap = zero, >=40% = large
    pattern: classify(r.patternTVD, 5, 20),
    sets: classify(r.setsDeltaPct, 5, 15),
    reps: classify(r.repRangeTVD, 5, 20),
    load: classify(r.meanLoadDeviationPct ?? 0, 5, 20),
    phase: r.phaseSeqIdentical ? 'zero' : 'large',
    conditioning: classify(r.conditioningDeltaPct, 10, 30),
  }
}

function worstBucket(buckets: Bucket[]): Bucket {
  if (buckets.includes('large')) return 'large'
  if (buckets.includes('small')) return 'small'
  return 'zero'
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits)
}

function main() {
  const lines: string[] = []
  const push = (s = '') => lines.push(s)

  push('='.repeat(100))
  push('DIFFERENTIATION AUDIT — does changing one profile input actually change the plan?')
  push('Read-only diagnostic. No fixes applied. All plans seeded deterministically (mulberry32 via seededRngFromKey).')
  push('='.repeat(100))

  const results: PairResult[] = ALL_PAIRS.map(evaluatePair)

  // ---- Per-pair detail ------------------------------------------------------
  push('\n' + '-'.repeat(100))
  push('PER-PAIR DETAIL')
  push('-'.repeat(100))

  for (const r of results) {
    const p = r.pair
    push(`\n[${p.dimension}] ${p.label}`)
    push(`  exercise-name overlap: ${fmt(r.overlapPct)}%  (Jaccard over week-1's exercise set)`)
    push(`  movement-pattern TVD:  ${fmt(r.patternTVD)}%   A=${JSON.stringify(r.patternsA)}  B=${JSON.stringify(r.patternsB)}`)
    push(`  rep-range TVD:         ${fmt(r.repRangeTVD)}%   A=${JSON.stringify(r.repBucketsA)}  B=${JSON.stringify(r.repBucketsB)}`)
    push(`  weekly sets:           A=${r.setsA}  B=${r.setsB}  (delta ${fmt(r.setsDeltaPct)}%)`)
    if (r.loadRatios.length > 0) {
      const ratioSummary = r.loadRatios.slice(0, 6).map(x => `${x.name}: ${fmt(x.loadA)}kg->${fmt(x.loadB)}kg (x${fmt(x.ratio, 2)})`).join('; ')
      push(`  shared-lift load ratio: mean deviation ${fmt(r.meanLoadDeviationPct ?? 0)}%  [${r.loadRatios.length} shared lifts]  e.g. ${ratioSummary}`)
    } else {
      push(`  shared-lift load ratio: no shared loaded lifts between the two plans (0 overlap on externally-loaded exercises)`)
    }
    push(`  phase/block sequence:  ${r.phaseSeqIdentical ? 'IDENTICAL across the full mesocycle' : `diverges at week ${r.firstDivergentWeek}`}`)
    push(`  conditioning volume:   A=${r.conditioningA}min/wk  B=${r.conditioningB}min/wk  (delta ${fmt(r.conditioningDeltaPct)}%)`)
  }

  // ---- Matrix -----------------------------------------------------------
  push('\n' + '-'.repeat(100))
  push('DIVERGENCE MATRIX  (●·· zero   ●●· small   ●●● large)')
  push('-'.repeat(100))
  const header = ['dimension'.padEnd(28), 'pair'.padEnd(24), 'overlap', 'pattern', 'sets', 'reps', 'load', 'phase', 'cardio'].join(' | ')
  push(header)
  push('-'.repeat(header.length))
  for (const r of results) {
    const b = classifyPair(r)
    push([
      r.pair.dimension.padEnd(28),
      r.pair.label.padEnd(24),
      bucketSymbol(b.overlap), bucketSymbol(b.pattern), bucketSymbol(b.sets),
      bucketSymbol(b.reps), bucketSymbol(b.load), bucketSymbol(b.phase), bucketSymbol(b.conditioning),
    ].join(' | '))
  }

  // ---- Per-dimension rollup + plain-English verdict --------------------
  push('\n' + '-'.repeat(100))
  push('PER-DIMENSION ROLLUP + PLAIN-ENGLISH VERDICT')
  push('-'.repeat(100))

  const dimensions = [...new Set(ALL_PAIRS.map(p => p.dimension))]
  const deadDimensions: string[] = []

  for (const dim of dimensions) {
    const dimResults = results.filter(r => r.pair.dimension === dim)
    const dimBuckets = dimResults.map(classifyPair)
    const rollup: MetricBuckets = {
      overlap: worstBucket(dimBuckets.map(b => b.overlap)),
      pattern: worstBucket(dimBuckets.map(b => b.pattern)),
      sets: worstBucket(dimBuckets.map(b => b.sets)),
      reps: worstBucket(dimBuckets.map(b => b.reps)),
      load: worstBucket(dimBuckets.map(b => b.load)),
      phase: worstBucket(dimBuckets.map(b => b.phase)),
      conditioning: worstBucket(dimBuckets.map(b => b.conditioning)),
    }
    const allZero = Object.values(rollup).every(b => b === 'zero')
    const anyLarge = Object.values(rollup).some(b => b === 'large')

    push(`\n${dim}  (${dimResults.length} pair${dimResults.length > 1 ? 's' : ''}, worst-case across sub-pairs)`)
    push(`  overlap=${rollup.overlap} pattern=${rollup.pattern} sets=${rollup.sets} reps=${rollup.reps} load=${rollup.load} phase=${rollup.phase} cardio=${rollup.conditioning}`)

    const METRIC_LABEL: Record<keyof MetricBuckets, string> = {
      overlap: 'exercise selection', pattern: 'movement-pattern mix', sets: 'weekly volume',
      reps: 'rep-range profile', load: 'prescribed load', phase: 'phase/deload timing', conditioning: 'conditioning dosage',
    }
    const metricKeys = Object.keys(rollup) as (keyof MetricBuckets)[]
    const largeMetrics = metricKeys.filter(k => rollup[k] === 'large').map(k => METRIC_LABEL[k])
    const zeroMetrics = metricKeys.filter(k => rollup[k] === 'zero').map(k => METRIC_LABEL[k])
    // The resistance-training "core" is selection+pattern+sets+reps+load —
    // phase timing and conditioning dosage are a separate axis. Calling
    // this out explicitly is the whole point of the audit: a dimension can
    // look "clearly visible" on the matrix while leaving the actual
    // strength program untouched (fitness_goal is exactly this case).
    const coreKeys: (keyof MetricBuckets)[] = ['overlap', 'pattern', 'sets', 'reps', 'load']
    const coreAllZero = coreKeys.every(k => rollup[k] === 'zero')

    let verdict: string
    if (allZero) {
      verdict = `NOT visible to a user — every measured metric is at zero divergence across all ${dimResults.length} sub-pair(s). This input is collected but provably does not change the plan.`
      deadDimensions.push(dim)
    } else if (coreAllZero && !allZero) {
      verdict = `The resistance-training core (${coreKeys.map(k => METRIC_LABEL[k]).join(', ')}) is IDENTICAL across all ${dimResults.length} sub-pair(s) — only ${largeMetrics.concat(metricKeys.filter(k => rollup[k] === 'small').map(k => METRIC_LABEL[k])).join(' and ')} differ. A user comparing the actual lifting program side by side would see no difference; they would only notice the conditioning/phase framing around it.`
    } else if (anyLarge) {
      verdict = `Clearly visible — large divergence on: ${largeMetrics.join(', ')}.${zeroMetrics.length > 0 ? ` (Unchanged: ${zeroMetrics.join(', ')}.)` : ''}`
    } else {
      verdict = `Marginally visible — only small divergences (on: ${metricKeys.filter(k => rollup[k] === 'small').map(k => METRIC_LABEL[k]).join(', ')}); a user comparing plans side by side might notice but would not describe them as different programs.`
    }
    push(`  VERDICT: ${verdict}`)
  }

  // ---- Dead-dimension flag + schema notes --------------------------------
  push('\n' + '-'.repeat(100))
  push('FLAGGED: dimensions the app collects that provably change nothing (in this audit)')
  push('-'.repeat(100))
  if (deadDimensions.length === 0) {
    push('None — every tested dimension produced at least small divergence on at least one metric.')
  } else {
    for (const d of deadDimensions) push(`  - ${d}`)
  }

  push('\n' + '-'.repeat(100))
  push('SCHEMA NOTES (requested labels that do not exist in the app\'s enums)')
  push('-'.repeat(100))
  for (const note of SCHEMA_NOTES) push(`  - ${note}`)

  push('\n' + '='.repeat(100))
  push(`Pairs evaluated: ${results.length}. Dimensions: ${dimensions.length}. Dead dimensions: ${deadDimensions.length}.`)
  push('='.repeat(100))

  const report = lines.join('\n')
  console.log(report)
  const outPath = path.join(process.cwd(), 'differentiation-audit-report.txt')
  fs.writeFileSync(outPath, report, 'utf-8')
  console.log(`\nReport saved to: ${outPath}`)
}

main()
