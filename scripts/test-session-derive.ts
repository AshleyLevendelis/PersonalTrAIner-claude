/**
 * P1 gate — session-derive.ts pure functions.
 *
 * filterLoggableSets is the sole source LAYOUT-DESIGN.md §5.2 designates for
 * checkmarks/counts/completion/off-plan detection. This asserts its filter
 * rules directly, without a store or a component: id-match (with a
 * name-fallback for legacy rows), warm-up exclusion, malformed-zero-weight
 * exclusion.
 */
import { filterLoggableSets } from '../src/lib/session-derive'
import type { ExerciseSetLog } from '../src/lib/types'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function makeLog(overrides: Partial<ExerciseSetLog>): ExerciseSetLog {
  return {
    user_id: 'u1',
    date: '2026-01-05',
    exercise_name: 'Barbell Bench Press',
    exercise_id: 'barbell-bench-press',
    set_number: 1,
    weight_kg: 60,
    reps_completed: 8,
    is_bodyweight: false,
    ...overrides,
  }
}

function main() {
  console.log('[1] id-match includes only the target exercise')
  const logs: ExerciseSetLog[] = [
    makeLog({ set_number: 1 }),
    makeLog({ set_number: 2 }),
    makeLog({ exercise_name: 'Incline DB Press', exercise_id: 'incline-db-press', set_number: 1 }),
  ]
  const bench = filterLoggableSets(logs, 'barbell-bench-press')
  check('returns exactly the 2 bench rows', bench.length === 2, bench)

  console.log('\n[2] warm-up rows are excluded')
  const withWarmup: ExerciseSetLog[] = [
    makeLog({ set_number: 1 }),
    makeLog({ set_number: 2, is_warmup: true }),
  ]
  const filtered = filterLoggableSets(withWarmup, 'barbell-bench-press')
  check('warm-up row dropped, 1 remains', filtered.length === 1 && filtered[0].set_number === 1, filtered)

  console.log('\n[3] malformed zero-weight rows are excluded')
  const withMalformed: ExerciseSetLog[] = [
    makeLog({ set_number: 1 }),
    makeLog({ set_number: 2, weight_kg: 0, is_bodyweight: false }),
  ]
  const filtered2 = filterLoggableSets(withMalformed, 'barbell-bench-press')
  check('malformed row dropped, 1 remains', filtered2.length === 1 && filtered2[0].set_number === 1, filtered2)

  console.log('\n[4] legitimate bodyweight zero-weight rows are kept')
  const withBodyweight: ExerciseSetLog[] = [
    makeLog({ exercise_name: 'Pull-Ups', exercise_id: 'pull-ups', set_number: 1, weight_kg: 0, is_bodyweight: true }),
  ]
  const filtered3 = filterLoggableSets(withBodyweight, 'pull-ups')
  check('bodyweight row kept', filtered3.length === 1, filtered3)

  console.log('\n[5] legacy rows with no exercise_id fall back to name match')
  const legacy: ExerciseSetLog[] = [
    { user_id: 'u1', date: '2026-01-05', exercise_name: 'Barbell Bench Press', set_number: 1, weight_kg: 60, reps_completed: 8, is_bodyweight: false },
  ]
  const filtered4 = filterLoggableSets(legacy, 'some-id-the-row-never-had', 'Barbell Bench Press')
  check('legacy row matched by name', filtered4.length === 1, filtered4)

  const legacyMiss = filterLoggableSets(legacy, 'some-id-the-row-never-had', 'Different Exercise')
  check('legacy row does not match a different name', legacyMiss.length === 0, legacyMiss)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll session-derive checks passed.')
}

main()
