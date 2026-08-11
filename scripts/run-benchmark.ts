import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle } from '../src/lib/exercise-plan'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience, FitnessGoal,
} from '../src/lib/types'

// ---------------------------------------------------------------------------
// Generation-performance benchmark
// ---------------------------------------------------------------------------
// test:quality and test:audit both measure CORRECTNESS across the full
// combination grid and only incidentally report their own total runtime —
// neither treats wall-clock speed as the thing being tested, and neither
// breaks a slow run down into where the time actually went. This is a
// speed-only harness: how long does generateMesocycle() itself take, across
// a representative sample of the same equipment x injury x duration x style
// x experience grid the other two harnesses use, with percentile latency
// (not just a mean, which a handful of slow outliers can hide) and a
// written JSON artifact so a future run can be compared against this one
// without re-deriving what "normal" looked like.
//
// Deliberately NOT the full 9216-combo grid (that's a correctness sweep's
// job) — a fixed-size stratified sample keeps this fast enough to run
// often, which is the point of a benchmark.

const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const SAMPLE_SIZE = 500

interface Combo {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  goal: FitnessGoal
}

function buildProfile(combo: Combo): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', fitness_goal: combo.goal, preferred_time: 'morning',
    bmr: 1800, tdee: 2500,
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
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  }
}

function allCombos(): Combo[] {
  const injuryCombinations = getInjuryCombinations()
  const combos: Combo[] = []
  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            for (const goal of ALL_GOALS) {
              combos.push({ equipment, injuries, duration, style, experience, goal })
            }
          }
        }
      }
    }
  }
  return combos
}

/** Deterministic evenly-spaced sample across the full grid — every dimension still gets real coverage, not just the first N combos (which would all share one equipment tier). */
function sample<T>(all: T[], n: number): T[] {
  if (all.length <= n) return all
  const step = all.length / n
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(all[Math.floor(i * step)])
  return out
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function main() {
  const combos = sample(allCombos(), SAMPLE_SIZE)
  console.log(`Benchmarking generateMesocycle() across ${combos.length} sampled combinations (of ${allCombos().length} total)...\n`)

  const timingsMs: number[] = []
  const started = Date.now()
  for (const combo of combos) {
    const profile = buildProfile(combo)
    const t0 = Date.now()
    generateMesocycle(profile)
    timingsMs.push(Date.now() - t0)
  }
  const totalMs = Date.now() - started

  const sorted = [...timingsMs].sort((a, b) => a - b)
  const mean = timingsMs.reduce((a, b) => a + b, 0) / timingsMs.length
  const result = {
    timestamp: new Date().toISOString(),
    sampleSize: combos.length,
    gridSize: allCombos().length,
    totalMs,
    combosPerSecond: Math.round((combos.length / totalMs) * 1000 * 10) / 10,
    meanMs: Math.round(mean * 10) / 10,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p50Ms: percentile(sorted, 50),
    p90Ms: percentile(sorted, 90),
    p99Ms: percentile(sorted, 99),
  }

  console.log('='.repeat(60))
  console.log('GENERATION PERFORMANCE BENCHMARK')
  console.log('='.repeat(60))
  console.log(`Sample: ${result.sampleSize} of ${result.gridSize} combinations`)
  console.log(`Total: ${(result.totalMs / 1000).toFixed(2)}s  (${result.combosPerSecond} combos/sec)`)
  console.log(`Per-call latency: mean=${result.meanMs}ms  min=${result.minMs}ms  p50=${result.p50Ms}ms  p90=${result.p90Ms}ms  p99=${result.p99Ms}ms  max=${result.maxMs}ms`)

  const outPath = path.join(__dirname, '..', 'benchmark-report.json')
  let previous: typeof result | null = null
  if (fs.existsSync(outPath)) {
    try { previous = JSON.parse(fs.readFileSync(outPath, 'utf-8')) } catch { previous = null }
  }
  if (previous) {
    const deltaPct = ((result.meanMs - previous.meanMs) / previous.meanMs) * 100
    console.log(`\nPrevious run (${previous.timestamp}): mean=${previous.meanMs}ms`)
    console.log(`Change: ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`)
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\nWrote ${outPath} (compared against on the next run)`)
}

main()
