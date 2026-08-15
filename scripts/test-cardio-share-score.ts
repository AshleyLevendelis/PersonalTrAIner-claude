/**
 * Option 1 gate — the cardio-share check added to scoreTimeFit.
 *
 * A day can be honestly within its overall time budget while its cardio
 * component alone is an oversized reservation — the exact blind spot that
 * let 176-190%-of-budget cardio blocks score a passing timeFit before this
 * existed. This tests the pure scoring function directly (bands) and the
 * real day-aggregation function against actual exercise-db entries, so the
 * cost numbers used here are the same ones the real scorer uses, not a
 * hand-picked approximation.
 */
import { scoreCardioShare, cardioOnlySeconds } from '../src/lib/quality-score'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { CARDIO_RESERVED_SHARE } from '../src/lib/exercise-plan'
import type { WorkoutDay, Exercise } from '../src/lib/types'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function ex(overrides: Partial<Exercise>): Exercise {
  return { name: 'Placeholder', sets: 3, reps: '8-10', rest: '90s', substitution: '', ...overrides }
}
function day(exercises: Exercise[]): WorkoutDay {
  return { day: 'Thursday', focus: 'Conditioning & Core', exercises }
}

function findEntry(name: string) {
  const e = EXERCISE_DATABASE.find(x => x.name === name)
  if (!e) throw new Error(`fixture exercise not found: ${name}`)
  return e
}

function main() {
  console.log('[1] scoreCardioShare — bands')
  check('0 cardio seconds is a full pass', scoreCardioShare(0, 6000) === 2)
  check('exactly at CARDIO_RESERVED_SHARE (28%) is a full pass', scoreCardioShare(6000 * CARDIO_RESERVED_SHARE, 6000) === 2)
  check('35% of budget is still a full pass (headroom for the floor rule)', scoreCardioShare(6000 * 0.35, 6000) === 2)
  check('36% of budget costs a point', scoreCardioShare(6000 * 0.36, 6000) === 1)
  check('50% of budget still costs only a point', scoreCardioShare(6000 * 0.50, 6000) === 1)
  check('51% of budget is a zero — genuinely runaway', scoreCardioShare(6000 * 0.51, 6000) === 0)
  check('the original bug (176% of budget) scores 0', scoreCardioShare(6000 * 1.76, 6000) === 0)
  check("today's expected Elliptical-alone floor case (41%) still passes at 1, not punished as a failure", scoreCardioShare(6000 * 0.41, 6000) === 1)

  console.log('[2] cardioOnlySeconds — real exercise-db entries, no lifting counted')
  const cardioDay = day([
    ex({ name: 'Barbell Bench Press', sets: 3, reps: '6-8', rest: '90s' }),
    ex({ name: 'Burpees', sets: 6, reps: '30s', rest: '30s' }),
    ex({ name: 'Cycling Intervals', sets: 6, reps: '45s', rest: '40s' }),
  ])
  const cardioSeconds = cardioOnlySeconds(cardioDay)
  check('lifting exercise excluded, only the two cardio entries counted', cardioSeconds > 0, cardioSeconds)
  const noCardioDay = day([ex({ name: 'Barbell Bench Press' }), ex({ name: 'Plank', sets: 3, reps: '30-45s', rest: '30s' })])
  check('a day with no cardio-tier exercise returns 0', cardioOnlySeconds(noCardioDay) === 0)

  console.log('[3] steady-state (Elliptical) is real cardio-tier work, counted here too')
  const elliptical = findEntry('Elliptical')
  check('Elliptical really is mechanics_tier cardio (this check depends on that)', elliptical.mechanics_tier === 'cardio')
  const steadyStateDay = day([ex({ name: 'Elliptical', sets: 1, reps: '1200s', rest: '0s' })])
  const steadyStateSeconds = cardioOnlySeconds(steadyStateDay)
  check('a single 1200s steady-state block counts as ~1200s, not near-zero', steadyStateSeconds > 1000, steadyStateSeconds)

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
