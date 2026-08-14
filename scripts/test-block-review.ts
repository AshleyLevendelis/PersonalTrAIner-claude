/**
 * Step 4 gate — block-review.ts pure stall-detection + date-range logic.
 *
 * Exercises the two corrections Ashley made to the approved plan directly,
 * not just as incidental coverage: (1) more reps at the same weight must
 * count as real progress, not a stall; (2) a missing week must never count
 * toward a stall — fewer real sessions, not evidence of no progress. Also
 * covers the final approval correction (>= 3 real sessions required) and
 * getBlockDateRange's week-to-date-range arithmetic.
 */
import { didExerciseStallInBlock, getBlockDateRange } from '../src/lib/block-review'
import type { ExerciseHistorySession } from '../src/lib/exercise-history'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function session(date: string, weightKg: number, reps: number, extraSets: { weightKg: number; reps: number }[] = []): ExerciseHistorySession {
  const sets = [{ setNumber: 1, weightKg, repsCompleted: reps, rpe: null, isBodyweight: weightKg === 0 }]
  extraSets.forEach((s, i) => sets.push({ setNumber: i + 2, weightKg: s.weightKg, repsCompleted: s.reps, rpe: null, isBodyweight: s.weightKg === 0 }))
  return {
    sessionId: `s-${date}`,
    date,
    sets,
    topSetWeightKg: Math.max(0, ...sets.filter(s => !s.isBodyweight).map(s => s.weightKg)),
    topSetE1RM: 0,
  }
}

function main() {
  console.log('[1] Fewer than 3 real sessions never flags a stall, regardless of content')
  check('0 sessions', !didExerciseStallInBlock([]))
  check('1 session', !didExerciseStallInBlock([session('2026-01-01', 60, 8)]))
  check(
    '2 sessions, both non-improving (one comparison) — the exact single-bad-day case the 3-session floor exists to exclude',
    !didExerciseStallInBlock([session('2026-01-01', 60, 10), session('2026-01-08', 60, 8)])
  )

  console.log('[2] Ashley correction 1 — more reps at the same weight is real progress, not a stall')
  const repProgressOnly: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    session('2026-01-08', 60, 9),
    session('2026-01-15', 60, 11),
  ]
  check('3 sessions, weight flat but reps climbing every time — NOT a stall', !didExerciseStallInBlock(repProgressOnly))

  console.log('[3] Ashley correction 2 — a missed week (simply absent from the session list) never counts toward a stall')
  const withGap: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    // week 2 skipped entirely — no row, not a failed comparison
    session('2026-01-15', 62.5, 8),
    session('2026-01-22', 62.5, 10),
  ]
  check('3 real sessions around a skipped week, real progress across them — NOT a stall', !didExerciseStallInBlock(withGap))

  console.log('[4] Genuine stall — weight flat AND reps flat/down across most real comparisons')
  const genuineStall: ExerciseHistorySession[] = [
    session('2026-01-01', 80, 10),
    session('2026-01-08', 80, 9),
    session('2026-01-15', 80, 8),
  ]
  check('3 sessions, neither weight nor reps ever improve — IS a stall', didExerciseStallInBlock(genuineStall))

  console.log('[5] Majority rule — one bad comparison among several improving ones is not a stall')
  const oneBadApple: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    session('2026-01-08', 62.5, 8), // improved (weight up)
    session('2026-01-15', 62.5, 7), // dipped
    session('2026-01-22', 65, 8),   // improved (weight up)
  ]
  check('3 comparisons, 2 improved / 1 dipped — majority improved, NOT a stall', !didExerciseStallInBlock(oneBadApple))

  console.log('[6] Bodyweight exercise — reps-only comparison still works even though topSetWeightKg stays 0')
  const bodyweightStall: ExerciseHistorySession[] = [
    session('2026-01-01', 0, 12),
    session('2026-01-08', 0, 11),
    session('2026-01-15', 0, 10),
  ]
  check('bodyweight reps declining across every comparison — IS a stall', didExerciseStallInBlock(bodyweightStall))
  const bodyweightProgress: ExerciseHistorySession[] = [
    session('2026-01-01', 0, 8),
    session('2026-01-08', 0, 10),
    session('2026-01-15', 0, 12),
  ]
  check('bodyweight reps climbing across every comparison — NOT a stall', !didExerciseStallInBlock(bodyweightProgress))

  console.log('[7] Session order in the input array does not matter — the function sorts internally')
  const shuffled = [...genuineStall].reverse()
  check('reversed input still detects the same stall', didExerciseStallInBlock(shuffled))

  console.log('[8] getBlockDateRange — block 1 starts at the plan\'s own creation date, block 2 starts 4 weeks later')
  const planCreatedAt = '2026-01-01T00:00:00.000Z'
  const block1 = getBlockDateRange(planCreatedAt, 1)
  check('block 1 starts on plan creation day', block1.start === '2026-01-01', block1)
  check('block 1 ends exactly 4 weeks later (exclusive)', block1.end === '2026-01-29', block1)
  const block2 = getBlockDateRange(planCreatedAt, 2)
  check('block 2 starts where block 1 ended', block2.start === block1.end, { block1, block2 })
  check('block 2 ends 4 weeks after it starts', block2.end === '2026-02-26', block2)

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
