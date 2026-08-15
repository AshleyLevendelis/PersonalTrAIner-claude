import * as fs from 'fs'
import * as path from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference, ConstraintTraceEntry,
} from '../src/lib/types'

// ---------------------------------------------------------------------------
// Trim-magnitude distribution report
// ---------------------------------------------------------------------------
// Report only — no threshold is picked here, no score is affected. Runs the
// same combo grid run-quality-score.ts does, collects every rest-cut
// trimWeekRestForBudget makes (via generateMesocycle's new trimLog
// out-parameter) across all 9216 combos, and prints the real distribution:
// how often trimming happens at all, and how much it cuts when it does. A
// threshold for turning this into a scored check gets picked from these
// numbers, not guessed in advance.

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
  } as UserProfile
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

interface ComboTrimSummary {
  label: string
  eventCount: number
  totalSecondsCut: number
}

async function main() {
  console.log('Running trim-magnitude distribution report (report only, no threshold set)...')
  const combos = generateAllCombinations()
  console.log(`Sweeping ${combos.length} combinations...\n`)

  const perCombo: ComboTrimSummary[] = []
  const perEventSecondsCut: number[] = []
  let combosWithAnyTrim = 0
  const start = performance.now()
  let lastProgress = 0

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i]
    const key = comboKey(combo)
    const profile = buildProfile(combo)
    const trimLog: ConstraintTraceEntry[] = []

    setRandomSource(seededRngFromKey(key))
    generateMesocycle(profile, undefined, [], trimLog)
    resetRandomSource()

    if (trimLog.length > 0) {
      combosWithAnyTrim++
      const totalSecondsCut = trimLog.reduce((sum, e) => sum + (e.secondsCut ?? 0), 0)
      perCombo.push({ label: comboLabel(combo), eventCount: trimLog.length, totalSecondsCut })
      for (const e of trimLog) perEventSecondsCut.push(e.secondsCut ?? 0)
    }

    const percent = Math.round(((i + 1) / combos.length) * 100)
    if (percent % 10 === 0 && percent !== lastProgress) {
      console.log(`  Progress: ${i + 1}/${combos.length} (${percent}%)`)
      lastProgress = percent
    }
  }

  const elapsed = performance.now() - start

  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push('TRIM-MAGNITUDE DISTRIBUTION REPORT')
  lines.push('(report only -- no threshold set, no score affected)')
  lines.push('='.repeat(80))
  lines.push('')
  lines.push(`Combinations swept: ${combos.length}`)
  lines.push(`Runtime: ${(elapsed / 1000).toFixed(1)}s`)
  lines.push('')
  lines.push(`Combos with at least one rest-trim event: ${combosWithAnyTrim} / ${combos.length} (${((combosWithAnyTrim / combos.length) * 100).toFixed(1)}%)`)
  lines.push(`Total trim events across all combos: ${perEventSecondsCut.length}`)
  lines.push('')

  if (perCombo.length > 0) {
    const totalCutSorted = perCombo.map(c => c.totalSecondsCut).sort((a, b) => a - b)
    const eventCountSorted = perCombo.map(c => c.eventCount).sort((a, b) => a - b)
    const perEventSorted = [...perEventSecondsCut].sort((a, b) => a - b)

    lines.push('-'.repeat(80))
    lines.push('PER-COMBO TOTAL SECONDS CUT (summed across every trim event in that combo\'s whole mesocycle)')
    lines.push('-'.repeat(80))
    lines.push(`  min:    ${totalCutSorted[0]}s`)
    lines.push(`  p50:    ${percentile(totalCutSorted, 50)}s`)
    lines.push(`  p75:    ${percentile(totalCutSorted, 75)}s`)
    lines.push(`  p90:    ${percentile(totalCutSorted, 90)}s`)
    lines.push(`  p95:    ${percentile(totalCutSorted, 95)}s`)
    lines.push(`  p99:    ${percentile(totalCutSorted, 99)}s`)
    lines.push(`  max:    ${totalCutSorted[totalCutSorted.length - 1]}s`)
    lines.push('')

    lines.push('-'.repeat(80))
    lines.push('PER-COMBO TRIM EVENT COUNT (how many individual rest-cuts in that combo\'s whole mesocycle)')
    lines.push('-'.repeat(80))
    lines.push(`  min:    ${eventCountSorted[0]}`)
    lines.push(`  p50:    ${percentile(eventCountSorted, 50)}`)
    lines.push(`  p75:    ${percentile(eventCountSorted, 75)}`)
    lines.push(`  p90:    ${percentile(eventCountSorted, 90)}`)
    lines.push(`  p95:    ${percentile(eventCountSorted, 95)}`)
    lines.push(`  p99:    ${percentile(eventCountSorted, 99)}`)
    lines.push(`  max:    ${eventCountSorted[eventCountSorted.length - 1]}`)
    lines.push('')

    lines.push('-'.repeat(80))
    lines.push('PER-EVENT SECONDS CUT (one exercise, one 15s-step trim pass)')
    lines.push('-'.repeat(80))
    lines.push(`  min:    ${perEventSorted[0]}s`)
    lines.push(`  p50:    ${percentile(perEventSorted, 50)}s`)
    lines.push(`  p90:    ${percentile(perEventSorted, 90)}s`)
    lines.push(`  max:    ${perEventSorted[perEventSorted.length - 1]}s`)
    lines.push('')

    const worst10 = [...perCombo].sort((a, b) => b.totalSecondsCut - a.totalSecondsCut).slice(0, 10)
    lines.push('-'.repeat(80))
    lines.push('10 WORST COMBOS BY TOTAL SECONDS CUT')
    lines.push('-'.repeat(80))
    for (const c of worst10) {
      lines.push(`  ${(c.totalSecondsCut / 60).toFixed(1)}min cut across ${c.eventCount} events — ${c.label}`)
    }
    lines.push('')
  } else {
    lines.push('No trim events recorded across the entire grid.')
    lines.push('')
  }

  lines.push('='.repeat(80))

  const formatted = lines.join('\n')
  console.log('')
  console.log(formatted)

  const outputPath = path.join(process.cwd(), 'trim-magnitude-report.txt')
  fs.writeFileSync(outputPath, formatted, 'utf-8')
  console.log(`\nReport saved to: ${outputPath}`)
}

main().catch(err => {
  console.error('Trim-magnitude report failed:', err)
  process.exit(1)
})
