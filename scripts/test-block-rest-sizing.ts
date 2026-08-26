/**
 * Unit tests for sizeBlockToRestBudget (exercise-plan.ts) — the per-block
 * structural fit-check that closes the trim-magnitude bug. Verifies it
 * actually trims when a block's real rest makes a day too big, that it
 * NEVER writes an adjusted rest value back (only structure changes), that
 * required/protected exercises survive, and that a day already within
 * budget is left untouched.
 */
import { sizeBlockToRestBudget } from '../src/lib/exercise-plan'
import { getGoalPolicy } from '../src/lib/goal-policies'
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

function ex(name: string, sets: number, rest: string, reps = '8-10'): Exercise {
  return { name, sets, reps, rest, substitution: '' }
}

// A 7-exercise day, deliberately oversized — mirrors the live-traced worst
// combo's shape (main lift + 5 accessory/isolation + a primer).
function bigDay(): WorkoutDay {
  return {
    day: 'Monday',
    focus: 'Push & Press',
    exercises: [
      ex('Prone Y-T Raises', 2, '20s'),
      ex('Barbell Bench Press', 3, '90s'),
      ex('Dumbbell Shoulder Press', 3, '75s'),
      ex('Cable Lateral Raises', 3, '60s'),
      ex('Overhead Tricep Extension', 3, '60s'),
      ex('Cable Woodchops', 3, '60s'),
      ex('Pec Deck Machine', 3, '75s'),
    ],
  }
}

const DAY_BUDGET_SECONDS = 45 * 60 // ~a 45-60min session's working-set budget

function main() {
  console.log('[1] a day within budget at real rest is untouched')
  const fine = sizeBlockToRestBudget([bigDay()], -15, DAY_BUDGET_SECONDS * 3, new Set(), getGoalPolicy('hypertrophy'), [])
  check('exercise count unchanged', fine[0].exercises.length === bigDay().exercises.length)
  check('no block_size_note when nothing was removed', fine[0].block_size_note === undefined)
  check('sets unchanged', JSON.stringify(fine[0].exercises.map(e => e.sets)) === JSON.stringify(bigDay().exercises.map(e => e.sets)))

  console.log('[2] moderate overage trims sets before removing anything')
  const trimLog1: any[] = []
  const trimmed = sizeBlockToRestBudget([bigDay()], 45, DAY_BUDGET_SECONDS, new Set(), getGoalPolicy('hypertrophy'), trimLog1)
  const originalCount = bigDay().exercises.length
  check('set-trim events were logged', trimLog1.some(e => e.reason.includes('sets trimmed')), trimLog1)

  console.log('[3] rest values are NEVER mutated — only structure changes')
  const before = bigDay()
  const after = trimmed[0]
  for (const origEx of before.exercises) {
    const survived = after.exercises.find(e => e.name === origEx.name)
    if (survived) {
      check(`"${origEx.name}" rest unchanged (${origEx.rest})`, survived.rest === origEx.rest, survived.rest)
    }
  }

  console.log('[4] a severe overage removes whole exercises, protected names survive')
  const protectedNames = new Set(['Barbell Bench Press'])
  const trimLog2: any[] = []
  const severe = sizeBlockToRestBudget([bigDay()], 200, DAY_BUDGET_SECONDS, protectedNames, getGoalPolicy('hypertrophy'), trimLog2)
  check('exercise count dropped', severe[0].exercises.length < originalCount, severe[0].exercises.length)
  check('protected main lift survived', severe[0].exercises.some(e => e.name === 'Barbell Bench Press'))
  check('block_size_note set when an exercise was actually removed', severe[0].block_size_note === 'Fewer exercises this block — heavier lifts need longer rest between sets.')
  check('a structure-stage trimLog entry exists for the removal', trimLog2.some(e => e.stage === 'structure'), trimLog2)
  check('never trims below 3 exercises', severe[0].exercises.length >= 3, severe[0].exercises.length)

  console.log('[5] cardio-tier exercises are never touched by this pass')
  const cardioDay: WorkoutDay = {
    day: 'Thursday', focus: 'Conditioning & Core',
    exercises: [ex('Barbell Squats', 3, '90s'), ex('Cycling Intervals', 6, '45s', '45s')],
  }
  const cardioResult = sizeBlockToRestBudget([cardioDay], 200, 1, new Set(), getGoalPolicy('hypertrophy'), []) // budget=1s forces max trimming
  const cardioSurvivor = cardioResult[0].exercises.find(e => e.name === 'Cycling Intervals')
  check('cardio exercise survives even under an impossible budget', !!cardioSurvivor)
  check('cardio sets unchanged', cardioSurvivor?.sets === 6, cardioSurvivor?.sets)

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
