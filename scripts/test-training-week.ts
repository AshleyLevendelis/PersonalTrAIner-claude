// ---------------------------------------------------------------------------
// Gate for the training-week day classification (src/hooks/useTrainingWeek.ts).
//
// Exists because the defect it locks down is invisible on most days of the
// week: a plan created today only has "days before the plan existed" if you
// happen to run on a Tuesday or later. Observed live before the fix — a
// profile created minutes earlier, opened on a Saturday, showed Mon/Wed/Fri
// all marked MISSED and "0 of 3 sessions done". The calendar can't be relied
// on to reproduce that, so it's asserted directly here.
//
// The other half matters just as much: the guard must not OVER-fire. A day
// that genuinely was skipped, after the plan started, still reads missed.
// ---------------------------------------------------------------------------

import { classifyDay, countsTowardWeekTally, type DayGlyphState } from '../src/hooks/useTrainingWeek'
import type { WorkoutDay } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const session = (day: string): WorkoutDay =>
  ({ day, focus: 'Full Body', exercises: [{ name: 'Squat' }] } as unknown as WorkoutDay)
const restDay = (day: string): WorkoutDay =>
  ({ day, focus: 'Recovery', exercises: [] } as unknown as WorkoutDay)

const PLAN = [session('Monday'), session('Wednesday'), session('Friday'), restDay('Sunday')]
// The scenario that produced the bug: onboarded Thursday, viewing Saturday.
const PLAN_START = '2026-08-20' // Thursday
const TODAY = '2026-08-22'      // Saturday
const MON = '2026-08-17'
const WED = '2026-08-19'
const FRI = '2026-08-21'

console.log('1. A plan cannot have been missed before it existed')
for (const [label, date] of [['Monday', MON], ['Wednesday', WED]] as [string, string][]) {
  const state = classifyDay(label, date, TODAY, PLAN, undefined, PLAN_START)
  check(`${label} (before the plan) is not 'missed'`, state !== 'missed', state)
  check(`${label} reads 'before_plan'`, state === 'before_plan', state)
  check(`${label} does not count toward the week tally`, !countsTowardWeekTally(state))
}

console.log('\n2. The guard must not over-fire — a real skip is still a skip')
{
  const state = classifyDay('Friday', FRI, TODAY, PLAN, undefined, PLAN_START)
  check("Friday (after the plan started, unlogged, past) is 'missed'", state === 'missed', state)
  check('and it DOES count toward the tally', countsTowardWeekTally(state))
}

console.log('\n3. Logged work always wins over any date reasoning')
{
  const completed = { session: { is_completed: true }, workoutLogs: [] } as never
  const partial = { session: null, workoutLogs: [{ id: 'x' }] } as never
  // A session logged on a day that predates the plan is still real work. The
  // pre-plan check deliberately sits AFTER these, or the display would erase
  // what someone actually did to keep the calendar tidy.
  check('a completed pre-plan day reads done, not before_plan',
    classifyDay('Monday', MON, TODAY, PLAN, completed, PLAN_START) === 'done')
  check('a part-logged pre-plan day reads partial, not before_plan',
    classifyDay('Monday', MON, TODAY, PLAN, partial, PLAN_START) === 'partial')
  check('and a completed day counts toward the tally', countsTowardWeekTally('done'))
}

console.log('\n4. Days at or after the plan start behave normally')
check('the plan-start day itself is not before_plan', classifyDay('Friday', PLAN_START, TODAY, PLAN, undefined, PLAN_START) !== 'before_plan')
check('a future training day is due', classifyDay('Friday', '2026-08-28', TODAY, PLAN, undefined, PLAN_START) === 'due')
check('a rest day is unaffected', classifyDay('Sunday', '2026-08-23', TODAY, PLAN, undefined, PLAN_START) === 'recovery')
check('an unplanned weekday is rest', classifyDay('Tuesday', '2026-08-18', TODAY, PLAN, undefined, PLAN_START) === 'rest')

console.log('\n5. Without a plan start date, behaviour is exactly as before')
check('past unlogged training day is missed', classifyDay('Monday', MON, TODAY, PLAN, undefined, undefined) === 'missed')
check('future training day is due', classifyDay('Friday', '2026-08-28', TODAY, PLAN, undefined, undefined) === 'due')

console.log('\n6. A day swapped for something else is not a day you failed')
{
  // Ashley told the coach in advance she was doing Muay Thai instead of
  // weights. It said "I'll make sure today is marked as a rest day" and could
  // not — no tool touched a day's status — so the day showed as MISSED the
  // next morning and the Muay Thai was recorded nowhere. Same shape as the
  // pre-plan bug above: the reward for telling the app was being told you
  // failed.
  const swapped = { session: { swapped_for_activity: 'Muay Thai' }, workoutLogs: [] } as never
  check('a past swapped day reads swapped, not missed',
    classifyDay('Monday', MON, TODAY, PLAN, swapped, undefined) === 'swapped')
  check('...and it drops out of the tally rather than counting against you',
    !countsTowardWeekTally('swapped'))

  // Logged work still outranks everything, exactly as it outranks before_plan.
  // Someone who announced a swap and then trained anyway has earned the tick.
  const swappedButTrained = {
    session: { swapped_for_activity: 'Muay Thai', is_completed: true }, workoutLogs: [],
  } as never
  check('a swapped day they trained anyway reads done, not swapped',
    classifyDay('Monday', MON, TODAY, PLAN, swappedButTrained, undefined) === 'done')
  const swappedPartLogged = {
    session: { swapped_for_activity: 'Muay Thai' }, workoutLogs: [{}],
  } as never
  check('a swapped day with sets logged reads partial, not swapped',
    classifyDay('Monday', MON, TODAY, PLAN, swappedPartLogged, undefined) === 'partial')

  // The over-fire check: an ordinary skipped day is still missed. A state
  // that swallowed every absence would be worse than the bug.
  check('an ordinary unlogged past day is still missed',
    classifyDay('Monday', MON, TODAY, PLAN, undefined, undefined) === 'missed')
  check('a FUTURE day marked swapped still reads swapped, not due',
    classifyDay('Friday', '2026-08-28', TODAY, PLAN, swapped, undefined) === 'swapped')
}

console.log('\n7. Tally predicate')
const counted: DayGlyphState[] = ['done', 'partial', 'due', 'missed']
const skipped: DayGlyphState[] = ['rest', 'recovery', 'before_plan', 'swapped']
for (const s of counted) check(`'${s}' counts`, countsTowardWeekTally(s))
for (const s of skipped) check(`'${s}' does not count`, !countsTowardWeekTally(s))

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll training-week checks passed.')
