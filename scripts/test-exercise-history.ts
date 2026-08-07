/**
 * Part 3 gate — exercise-history.ts pure functions (groupSetsBySession,
 * deriveStrengthTrend/hasEnoughTrendData, derivePRHistory, sumVolumeAndSets).
 * Same hand-rolled check() pattern as test-session-derive.ts — no test
 * framework, no network calls, every fixture built inline.
 */
import {
  groupSetsBySession,
  deriveStrengthTrend,
  hasEnoughTrendData,
  derivePRHistory,
  sumVolumeAndSets,
  type ExerciseHistorySession,
} from '../src/lib/exercise-history'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function main() {
  console.log('[1] groupSetsBySession: cross-session grouping, newest-first, correct top-set picks')
  const rows = [
    { session_id: 's1', date: '2026-01-01', set_number: 1, weight_kg: 50, reps_completed: 8, rpe: 7, is_bodyweight: false },
    { session_id: 's1', date: '2026-01-01', set_number: 2, weight_kg: 55, reps_completed: 6, rpe: 8, is_bodyweight: false },
    { session_id: 's2', date: '2026-01-08', set_number: 1, weight_kg: 60, reps_completed: 5, rpe: null, is_bodyweight: false },
  ]
  const grouped = groupSetsBySession(rows)
  check('groups into 2 sessions', grouped.length === 2, grouped)
  check('newest session first', grouped[0].date === '2026-01-08', grouped)
  const s1 = grouped.find(s => s.sessionId === 's1')!
  check('top set weight is the max within the session', s1.topSetWeightKg === 55, s1)
  check('sets within a session are sorted by set number', s1.sets[0].setNumber === 1 && s1.sets[1].setNumber === 2, s1.sets)

  const rowsWithMalformed = [
    { session_id: 's3', date: '2026-01-15', set_number: 1, weight_kg: 0, reps_completed: 10, rpe: null, is_bodyweight: false },
  ]
  const groupedMalformed = groupSetsBySession(rowsWithMalformed)
  check('a 0kg non-bodyweight set (not pre-filtered) still groups but contributes 0 to top-set (caller filters malformed rows before calling)', groupedMalformed[0].topSetWeightKg === 0, groupedMalformed)

  console.log('\n[2] deriveStrengthTrend / hasEnoughTrendData')
  const oneSessionOnly: ExerciseHistorySession[] = [{ sessionId: 's1', date: '2026-01-01', sets: [], topSetWeightKg: 50, topSetE1RM: 60 }]
  check('0 sessions -> not enough data', !hasEnoughTrendData(deriveStrengthTrend([])))
  check('1 session -> not enough data', !hasEnoughTrendData(deriveStrengthTrend(oneSessionOnly)))
  const twoPlusSessions: ExerciseHistorySession[] = [
    { sessionId: 's2', date: '2026-01-08', sets: [], topSetWeightKg: 55, topSetE1RM: 65 },
    { sessionId: 's1', date: '2026-01-01', sets: [], topSetWeightKg: 50, topSetE1RM: 60 },
  ]
  const trend = deriveStrengthTrend(twoPlusSessions)
  check('2+ sessions -> enough data', hasEnoughTrendData(trend))
  check('trend output is oldest-first regardless of input order', trend[0].date === '2026-01-01' && trend[1].date === '2026-01-08', trend)

  console.log('\n[3] derivePRHistory: a chronological weight sequence produces PR moments only where a new max is set')
  const prSessions: ExerciseHistorySession[] = [
    { sessionId: 'a', date: '2026-01-01', sets: [], topSetWeightKg: 50, topSetE1RM: 50 },
    { sessionId: 'b', date: '2026-01-08', sets: [], topSetWeightKg: 55, topSetE1RM: 55 },
    { sessionId: 'c', date: '2026-01-15', sets: [], topSetWeightKg: 52, topSetE1RM: 52 }, // regression, no PR
    { sessionId: 'd', date: '2026-01-22', sets: [], topSetWeightKg: 60, topSetE1RM: 60 },
  ]
  const prMoments = derivePRHistory(prSessions)
  check('exactly 3 PR moments (50, 55, 60) — the 52 regression is not one', prMoments.length === 3, prMoments)
  check('no PR moment at the regression session', !prMoments.some(m => m.sessionId === 'c'), prMoments)
  check('newest-first for display', prMoments[0].sessionId === 'd', prMoments)

  const bothKindSessions: ExerciseHistorySession[] = [
    { sessionId: 'x', date: '2026-01-01', sets: [], topSetWeightKg: 50, topSetE1RM: 50 },
    { sessionId: 'y', date: '2026-01-08', sets: [], topSetWeightKg: 60, topSetE1RM: 70 }, // beats both weight and e1rm
  ]
  const bothMoments = derivePRHistory(bothKindSessions)
  const yMoment = bothMoments.find(m => m.sessionId === 'y')
  check('a session beating both weight and e1rm classifies as "both"', yMoment?.kind === 'both', yMoment)

  const e1rmOnlySessions: ExerciseHistorySession[] = [
    { sessionId: 'p', date: '2026-01-01', sets: [], topSetWeightKg: 60, topSetE1RM: 60 },
    { sessionId: 'q', date: '2026-01-08', sets: [], topSetWeightKg: 55, topSetE1RM: 70 }, // lower weight, higher e1rm (more reps)
  ]
  const e1rmMoments = derivePRHistory(e1rmOnlySessions)
  const qMoment = e1rmMoments.find(m => m.sessionId === 'q')
  check('a session with a lower weight but higher e1rm classifies as "e1rm"', qMoment?.kind === 'e1rm', qMoment)

  console.log('\n[4] sumVolumeAndSets')
  const volSets = [{ weightKg: 60, repsCompleted: 8 }, { weightKg: 60, repsCompleted: 8 }, { weightKg: 0, repsCompleted: 10 }]
  const { totalVolumeKg, totalSets } = sumVolumeAndSets(volSets)
  check('volume is sets x reps x load, summed (0kg contributes 0)', totalVolumeKg === 60 * 8 * 2, totalVolumeKg)
  check('totalSets is a raw count', totalSets === 3, totalSets)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll exercise-history checks passed.')
}

main()
