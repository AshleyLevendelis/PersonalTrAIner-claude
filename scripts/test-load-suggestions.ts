/**
 * Step 6 gate — load-suggestions.ts pure comparator + "only propose up" logic.
 *
 * The overachievement comparator is the stall check's own comparator,
 * aggregated the other way — this exercises Ashley's own final correction
 * directly: MOST comparisons must improve (not literally every one), same
 * MIN_SESSIONS_TO_JUDGE floor as the stall check. shouldSuggestBump proves
 * the "never suggest down, only up" invariant the whole feature depends on.
 */
import { didExerciseOverachieveInBlock, shouldSuggestBump } from '../src/lib/load-suggestions'
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

function session(date: string, weightKg: number, reps: number): ExerciseHistorySession {
  const sets = [{ setNumber: 1, weightKg, repsCompleted: reps, rpe: null, isBodyweight: weightKg === 0 }]
  return { sessionId: `s-${date}`, date, sets, topSetWeightKg: weightKg, topSetE1RM: 0 }
}

function main() {
  console.log('[1] Fewer than 3 real sessions never triggers, regardless of content')
  check('0 sessions', !didExerciseOverachieveInBlock([]))
  check('1 session', !didExerciseOverachieveInBlock([session('2026-01-01', 60, 8)]))
  check(
    '2 sessions, both improving (one comparison) — same 3-session floor as the stall check',
    !didExerciseOverachieveInBlock([session('2026-01-01', 60, 8), session('2026-01-08', 65, 8)])
  )

  console.log('[2] Ashley\'s final correction — MOST comparisons must improve, not literally every one')
  const majorityImproved: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    session('2026-01-08', 65, 8),  // improved
    session('2026-01-15', 65, 7),  // dipped
    session('2026-01-22', 70, 8),  // improved
  ]
  check('3 comparisons, 2 improved / 1 dipped — majority improved, DOES trigger', didExerciseOverachieveInBlock(majorityImproved))

  console.log('[3] An even split or majority-flat does NOT trigger')
  const evenSplit: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    session('2026-01-08', 65, 8),  // improved
    session('2026-01-15', 65, 8),  // flat
  ]
  check('2 comparisons, 1 improved / 1 flat — not a majority, does NOT trigger', !didExerciseOverachieveInBlock(evenSplit))

  console.log('[4] Genuine consistent overachievement — every comparison improves')
  const everyComparison: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    session('2026-01-08', 62.5, 8),
    session('2026-01-15', 65, 8),
  ]
  check('3 sessions, every comparison improves — DOES trigger', didExerciseOverachieveInBlock(everyComparison))

  console.log('[5] Rep-only improvement counts too (double progression\'s own definition)')
  const repsOnly: ExerciseHistorySession[] = [
    session('2026-01-01', 60, 8),
    session('2026-01-08', 60, 10),
    session('2026-01-15', 60, 12),
  ]
  check('same weight, climbing reps every session — DOES trigger', didExerciseOverachieveInBlock(repsOnly))

  console.log('[6] shouldSuggestBump — only ever proposes UP')
  check('real weight higher than formula\'s own number — suggest', shouldSuggestBump(85, 80))
  check('real weight equal to formula\'s own number — no suggestion', !shouldSuggestBump(80, 80))
  check('real weight LOWER than formula\'s own number — no suggestion (never forced up on its behalf)', !shouldSuggestBump(75, 80))

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
