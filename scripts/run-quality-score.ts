import * as fs from 'fs'
import * as path from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  scorePlan, DIMENSION_KEYS, type DimensionKey, type PlanScoreResult,
} from '../src/lib/quality-score'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference,
} from '../src/lib/types'

// ---------------------------------------------------------------------------
// Plan quality scoring harness
// ---------------------------------------------------------------------------
// Reuses the constraint audit's combination dimensions (equipment x injuries
// x duration x style x experience — src/lib/dev-constraint-audit.ts) and adds
// fitness_goal as a further dimension, since "Goal alignment" scoring needs
// real goal variety to mean anything. recovery_capacity and
// conditioning_preference are NOT crossed in as full dimensions (that would
// multiply the grid by 9x, into the hundreds of thousands) — instead every
// combination gets one deterministically assigned via round-robin, so all
// three/three values still get real coverage across the run without an
// unreasonable runtime.

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
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: combo.goal,
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: combo.equipment,
    injuries: combo.injuries,
    training_style: combo.style,
    training_experience: combo.experience,
    session_duration_preference: combo.duration,
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
    exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: combo.recovery,
    conditioning_preference: combo.conditioningPref,
    // No `id` — keeps any Supabase-dependent code path (logged-history
    // lookups) untouched during a plain-Node scoring run.
  }
}

function comboKey(combo: Combination): string {
  return [
    combo.equipment, combo.injuries.join('+') || 'none', combo.duration, combo.style,
    combo.experience, combo.goal, combo.recovery, combo.conditioningPref,
  ].join('|')
}

function comboLabel(combo: Combination): string {
  return `${combo.equipment} / ${combo.injuries.join('+') || 'none'} / ${combo.duration} / ${combo.style} / ${combo.experience} / ${combo.goal} / recovery=${combo.recovery} / cardio=${combo.conditioningPref}`
}

function generateAllCombinations(): Combination[] {
  const injuryCombinations = getInjuryCombinations()
  const combos: Combination[] = []
  let rotationIndex = 0
  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            for (const goal of ALL_GOALS) {
              combos.push({
                equipment, injuries, duration, style, experience, goal,
                recovery: ALL_RECOVERY[rotationIndex % ALL_RECOVERY.length],
                conditioningPref: ALL_CONDITIONING_PREF[rotationIndex % ALL_CONDITIONING_PREF.length],
              })
              rotationIndex++
            }
          }
        }
      }
    }
  }
  return combos
}

interface ScoredCombo {
  combo: Combination
  label: string
  result: PlanScoreResult
}

function formatHistogram(scores: number[]): string {
  const buckets = new Array(11).fill(0) // 0-1, 1-2, ..., 9-10, and a top bucket for exactly 10
  for (const s of scores) {
    const bucket = Math.min(10, Math.floor(s))
    buckets[bucket]++
  }
  const lines: string[] = []
  for (let i = 0; i <= 9; i++) {
    const count = buckets[i] + (i === 9 ? buckets[10] : 0)
    const barLen = Math.round((count / scores.length) * 60)
    lines.push(`  [${i}-${i + 1}) ${'#'.repeat(barLen)} ${count}`)
  }
  return lines.join('\n')
}

function formatDeduction(d: { rule: string; detail: string; weekNumber?: number; day?: string; expected?: string; actual?: string }): string {
  const location = [d.weekNumber != null ? `wk${d.weekNumber}` : null, d.day ?? null].filter(Boolean).join(' ')
  const expectedActual = d.expected != null || d.actual != null ? ` (expected: ${d.expected ?? '-'}, actual: ${d.actual ?? '-'})` : ''
  return `    [${d.rule}]${location ? ` ${location}:` : ''} ${d.detail}${expectedActual}`
}

async function main() {
  console.log('Running Plan Quality Scoring Harness...')
  const combos = generateAllCombinations()
  console.log(`Scoring ${combos.length} combinations (equipment x injuries x duration x style x experience x goal)...`)
  console.log('')

  const scored: ScoredCombo[] = []
  const start = performance.now()
  let lastProgress = 0

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i]
    const key = comboKey(combo)
    const profile = buildProfile(combo)

    setRandomSource(seededRngFromKey(key))
    const mesocycle = generateMesocycle(profile)
    resetRandomSource()

    const result = scorePlan(profile, mesocycle, key)
    scored.push({ combo, label: comboLabel(combo), result })

    const percent = Math.round(((i + 1) / combos.length) * 100)
    if (percent % 10 === 0 && percent !== lastProgress) {
      console.log(`  Progress: ${i + 1}/${combos.length} (${percent}%)`)
      lastProgress = percent
    }
  }

  const elapsed = performance.now() - start

  const overallScores = scored.map(s => s.result.overall)
  const overallAvg = overallScores.reduce((a, b) => a + b, 0) / overallScores.length

  const dimensionAverages: Record<DimensionKey, number> = {} as Record<DimensionKey, number>
  for (const key of DIMENSION_KEYS) {
    const values = scored.map(s => s.result.dimensions[key].points)
    dimensionAverages[key] = values.reduce((a, b) => a + b, 0) / values.length
  }

  const worst10 = [...scored].sort((a, b) => a.result.overall - b.result.overall).slice(0, 10)
  const belowFloor = scored.filter(s => s.result.overall < 6.0)
  const dimensionsBelowFloor = DIMENSION_KEYS.filter(key => dimensionAverages[key] < 1.2)

  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push('PLAN QUALITY SCORE REPORT')
  lines.push('='.repeat(80))
  lines.push('')
  lines.push(`Combinations scored: ${scored.length}`)
  lines.push(`Runtime: ${(elapsed / 1000).toFixed(1)}s`)
  lines.push(`Overall average: ${overallAvg.toFixed(2)} / 10`)
  lines.push('')
  lines.push('Per-dimension averages (max 2.0 each):')
  for (const key of DIMENSION_KEYS) {
    const label = scored[0].result.dimensions[key].label
    const flag = dimensionAverages[key] < 1.2 ? '  <-- BELOW FLOOR (1.2)' : ''
    lines.push(`  ${label.padEnd(16)} ${dimensionAverages[key].toFixed(2)}${flag}`)
  }
  lines.push('')
  lines.push('Score distribution:')
  lines.push(formatHistogram(overallScores))
  lines.push('')
  lines.push(`Plans below the 6.0 floor: ${belowFloor.length} / ${scored.length}`)
  lines.push('')
  lines.push('-'.repeat(80))
  lines.push('10 WORST-SCORING PLANS')
  lines.push('-'.repeat(80))
  for (const s of worst10) {
    lines.push('')
    lines.push(`Score ${s.result.overall.toFixed(1)}/10 — ${s.label}`)
    for (const key of DIMENSION_KEYS) {
      const dim = s.result.dimensions[key]
      if (dim.deductions.length === 0) continue
      lines.push(`  ${dim.label} (${dim.points.toFixed(1)}/2):`)
      for (const d of dim.deductions) lines.push(formatDeduction(d))
    }
  }
  lines.push('')
  lines.push('='.repeat(80))

  const formatted = lines.join('\n')
  console.log('')
  console.log(formatted)

  const outputPath = path.join(process.cwd(), 'quality-report.txt')
  fs.writeFileSync(outputPath, formatted, 'utf-8')
  console.log(`\nReport saved to: ${outputPath}`)

  const failed = belowFloor.length > 0 || dimensionsBelowFloor.length > 0
  if (failed) {
    console.log('')
    if (belowFloor.length > 0) console.log(`FAIL: ${belowFloor.length} plan(s) scored below 6.0`)
    if (dimensionsBelowFloor.length > 0) console.log(`FAIL: dimension(s) below 1.2 average: ${dimensionsBelowFloor.join(', ')}`)
  }
  process.exit(failed ? 1 : 0)
}

main().catch(err => {
  console.error('Quality scoring failed:', err)
  process.exit(1)
})
