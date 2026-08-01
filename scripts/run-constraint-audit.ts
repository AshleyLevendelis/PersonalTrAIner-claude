import { runFullConstraintAudit } from '../src/lib/dev-constraint-audit'
import type { AuditReport } from '../src/lib/dev-constraint-audit'
import { generateMesocycle } from '../src/lib/exercise-plan'
import type { UserProfile, FitnessGoal } from '../src/lib/types'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Comprehensive constraint audit runner
 * Tests all combinations of Equipment × Injuries × Duration × Style
 * Validates that no plan violates the 5-stage pipeline constraints
 */

function formatReport(report: AuditReport): string {
  const lines: string[] = []

  lines.push('=' .repeat(80))
  lines.push('EXERCISE ENGINE CONSTRAINT AUDIT REPORT')
  lines.push('=' .repeat(80))
  lines.push('')

  // Summary
  lines.push(`Total Combinations Tested: ${report.totalCombinations}`)
  lines.push(`Passed: ${report.passed} (${(report.passed / report.totalCombinations * 100).toFixed(1)}%)`)
  lines.push(`Failed: ${report.failed} (${(report.failed / report.totalCombinations * 100).toFixed(1)}%)`)
  lines.push(`Total Runtime: ${report.runTimeMs.toFixed(0)}ms (${(report.runTimeMs / 1000).toFixed(2)}s)`)
  lines.push('')

  // Failure breakdown
  if (report.failed > 0) {
    const failuresByCheck = new Map<string, number>()
    for (const result of report.results) {
      if (!result.passed) {
        for (const failure of result.failures) {
          const count = failuresByCheck.get(failure.check) || 0
          failuresByCheck.set(failure.check, count + 1)
        }
      }
    }

    lines.push('FAILURE BREAKDOWN:')
    lines.push('-' .repeat(80))
    for (const [check, count] of failuresByCheck) {
      lines.push(`  ${check}: ${count} failure(s)`)
    }
    lines.push('')

    // Failed combinations
    lines.push('FAILED COMBINATIONS:')
    lines.push('-' .repeat(80))
    const failedCombos = report.results.filter(r => !r.passed)
    for (const combo of failedCombos) {
      lines.push(`\n  Combination: ${combo.equipment} / ${combo.injuries.length > 0 ? combo.injuries.join('+') : 'none'} / ${combo.duration} / ${combo.style}`)
      for (const failure of combo.failures) {
        lines.push(`    ✗ [${failure.check}] ${failure.details}`)
        if (failure.exercise) {
          lines.push(`      Exercise: ${failure.exercise}`)
        }
      }
    }
    lines.push('')
  } else {
    lines.push('✓ ALL TESTS PASSED!')
    lines.push('')
  }

  // Stats
  lines.push('STATISTICS:')
  lines.push('-' .repeat(80))
  const allExerciseCounts = report.results.map(r => r.totalExercises)
  const allDurations = report.results.map(r => r.estimatedDurationSec / 60)

  lines.push(`  Avg exercises per plan: ${(allExerciseCounts.reduce((a, b) => a + b, 0) / report.totalCombinations).toFixed(1)}`)
  lines.push(`  Min exercises: ${Math.min(...allExerciseCounts)}`)
  lines.push(`  Max exercises: ${Math.max(...allExerciseCounts)}`)
  lines.push(`  Avg session duration: ${(allDurations.reduce((a, b) => a + b, 0) / report.totalCombinations).toFixed(0)}min`)
  lines.push(`  Max session duration: ${Math.max(...allDurations).toFixed(0)}min`)
  lines.push('')

  lines.push('=' .repeat(80))

  return lines.join('\n')
}

/**
 * One profile per goal, otherwise identical, so goal-driven differences are
 * the only variable. Prints Monday across weeks 1-4 of block 1 for each —
 * loads should ramp within the block, sets should hold, accessories should
 * rotate at the week-3 boundary, and the four goals should visibly differ
 * from each other (volume, phases, conditioning, coach note).
 */
function buildGoalSampleReport(): string {
  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push('GOAL SAMPLE — Monday, Block 1, Weeks 1-4 (same profile otherwise)')
  lines.push('='.repeat(80))

  const goals: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']

  for (const goal of goals) {
    const profile: UserProfile = {
      age: 30, gender: 'male', height_cm: 180, weight_kg: 85,
      activity_level: 'moderate', fitness_goal: goal,
      training_days: [
        { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
        { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
        { day: 'Friday', available: false }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
      ],
      preferred_time: 'evening', dietary_preferences: [], session_duration_preference: '60-90',
      workout_split_preference: 'upper_lower', macro_calculation_mode: 'STANDARD_STATIC',
      equipment_access: 'full_gym', training_style: 'hybrid', training_experience: 'intermediate',
      coaching_persona: 'analytical', injuries: [],
      recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    }

    const meso = generateMesocycle(profile)
    const block1 = meso.filter(w => w.block_number === 1).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))

    lines.push('')
    lines.push(`--- ${goal} ---`)
    lines.push(`phases: ${[...new Set(meso.map(w => w.phase_label))].join(' -> ')}`)
    lines.push(`block 1 coach note: ${block1[0]?.coach_note ?? ''}`)

    for (const week of block1) {
      const monday = week.days.find(d => d.day === 'Monday')
      if (!monday) continue
      lines.push(`  week_in_block ${week.week_in_block} (${week.is_deload ? 'deload' : 'loading'}):`)
      for (const ex of monday.exercises) {
        const loadStr = ex.suggested_load_kg != null ? `${ex.suggested_load_kg}kg` : (ex.suggested_load ?? '-')
        lines.push(`    ${ex.tier?.padEnd(16) ?? ''} ${ex.name.padEnd(28)} sets=${ex.sets} reps=${ex.reps.padEnd(8)} load=${loadStr}`)
      }
    }
  }

  lines.push('')
  lines.push('='.repeat(80))
  return lines.join('\n')
}

async function main() {
  console.log('Running Exercise Engine Constraint Audit...')
  console.log('This tests all combinations of equipment, injuries, duration, and style')
  console.log('')

  let lastProgress = 0
  const report = runFullConstraintAudit((done, total) => {
    const percent = Math.round((done / total) * 100)
    if (percent % 10 === 0 && percent !== lastProgress) {
      console.log(`  Progress: ${done}/${total} (${percent}%)`)
      lastProgress = percent
    }
  })

  console.log('')
  const formatted = formatReport(report)
  console.log(formatted)

  const goalSample = buildGoalSampleReport()
  console.log('\n' + goalSample)

  // Save to file
  const outputPath = path.join(process.cwd(), 'audit-report.txt')
  fs.writeFileSync(outputPath, formatted + '\n\n' + goalSample, 'utf-8')
  console.log(`\nReport saved to: ${outputPath}`)

  // Exit with error code if any tests failed
  process.exit(report.failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})
