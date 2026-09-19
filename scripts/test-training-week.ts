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
import { partitionLogsByKind } from '../src/lib/daily-tracking'
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
  const completed = { session: { is_completed: true }, workingLogs: [{ id: 'x' }], warmupLogs: [] } as never
  const partial = { session: null, workingLogs: [{ id: 'x' }], warmupLogs: [] } as never
  // A completed flag with nothing logged — Start and Finish with no set
  // between — is not a session, and must not outrank a chosen rest day.
  const emptyCompleted = { session: { is_completed: true }, workingLogs: [], warmupLogs: [] } as never
  const emptyCompletedRest = { session: { is_completed: true, deliberate_rest: true }, workingLogs: [], warmupLogs: [] } as never
  // A session logged on a day that predates the plan is still real work. The
  // pre-plan check deliberately sits AFTER these, or the display would erase
  // what someone actually did to keep the calendar tidy.
  check('a completed pre-plan day reads done, not before_plan',
    classifyDay('Monday', MON, TODAY, PLAN, completed, PLAN_START) === 'done')
  check('a part-logged pre-plan day reads partial, not before_plan',
    classifyDay('Monday', MON, TODAY, PLAN, partial, PLAN_START) === 'partial')
  check('and a completed day counts toward the tally', countsTowardWeekTally('done'))
  check('a completed flag with nothing logged does not read done',
    classifyDay('Monday', MON, TODAY, PLAN, emptyCompleted, PLAN_START) !== 'done')
  check('...and a chosen rest day wins over it',
    classifyDay('Monday', MON, TODAY, PLAN, emptyCompletedRest, PLAN_START) === 'rest_chosen')
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
  const swapped = { session: { swapped_for_activity: 'Muay Thai' }, workingLogs: [], warmupLogs: [] } as never
  check('a past swapped day reads swapped, not missed',
    classifyDay('Monday', MON, TODAY, PLAN, swapped, undefined) === 'swapped')
  check('...and it drops out of the tally rather than counting against you',
    !countsTowardWeekTally('swapped'))

  // Logged work still outranks everything, exactly as it outranks before_plan.
  // Someone who announced a swap and then trained anyway has earned the tick.
  const swappedButTrained = {
    session: { swapped_for_activity: 'Muay Thai', is_completed: true }, workingLogs: [{ id: 'x' }], warmupLogs: [],
  } as never
  check('a swapped day they trained anyway reads done, not swapped',
    classifyDay('Monday', MON, TODAY, PLAN, swappedButTrained, undefined) === 'done')
  const swappedPartLogged = {
    session: { swapped_for_activity: 'Muay Thai' }, workingLogs: [{}], warmupLogs: [],
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

console.log('\n6b. A rest day you chose is not a missed one')
{
  // The plainer half of the swap above, caught live on 31 Aug 2026. Ashley
  // said "Rest day today"; the coach said "I will mark today as a rest day
  // for you" and could not — swap_session_for_activity needs an activity,
  // and resting is the answer with no activity in it. So the day would have
  // shown MISSED the next morning, which is the app telling her off for a
  // decision she made deliberately and announced at the time.
  const rested = { session: { deliberate_rest: true }, workingLogs: [], warmupLogs: [] } as never
  check('a past chosen rest day reads rest_chosen, not missed',
    classifyDay('Monday', MON, TODAY, PLAN, rested, undefined) === 'rest_chosen')
  check('...and it drops out of the tally rather than counting against you',
    !countsTowardWeekTally('rest_chosen'))

  // NOT collapsed into 'rest'. That state means the plan never asked for
  // anything that day; this means it did and they chose not to. Collapsing
  // them rewrites the plan's history into one where Monday was never a
  // training day.
  // Tuesday, which this plan doesn't contain at all — the state that means
  // "nothing was ever asked of you here". Caught by this check failing on
  // Sunday, which IS in the plan as a zero-exercise day and so classifies as
  // 'recovery': three states that all look like a quiet day and mean three
  // different things.
  check("...and is distinct from a day the plan never prescribed",
    classifyDay('Tuesday', '2026-08-18', TODAY, PLAN, undefined, undefined) === 'rest')
  check("...and from a prescribed day with no work in it",
    classifyDay('Sunday', '2026-08-16', TODAY, PLAN, undefined, undefined) === 'recovery')

  // Logged work still outranks it, exactly as it outranks a swap.
  const restedButTrained = { session: { deliberate_rest: true, is_completed: true }, workingLogs: [{ id: 'x' }], warmupLogs: [] } as never
  check('a rest day they trained anyway reads done, not rest_chosen',
    classifyDay('Monday', MON, TODAY, PLAN, restedButTrained, undefined) === 'done')
  const restedPartLogged = { session: { deliberate_rest: true }, workingLogs: [{}], warmupLogs: [] } as never
  check('a rest day with sets logged reads partial, not rest_chosen',
    classifyDay('Monday', MON, TODAY, PLAN, restedPartLogged, undefined) === 'partial')

  // A swap and a rest are different facts and must not shadow each other.
  const both = { session: { deliberate_rest: true, swapped_for_activity: 'Muay Thai' }, workingLogs: [], warmupLogs: [] } as never
  check('a day that is both reads swapped — work happened, and that outranks rest',
    classifyDay('Monday', MON, TODAY, PLAN, both, undefined) === 'swapped')

  // The over-fire check, same as the swap's: absence alone is still missed.
  check('an ordinary unlogged past day is still missed, not quietly rested',
    classifyDay('Monday', MON, TODAY, PLAN, undefined, undefined) === 'missed')
  check('a FUTURE day marked rested still reads rest_chosen, not due',
    classifyDay('Friday', '2026-08-28', TODAY, PLAN, rested, undefined) === 'rest_chosen')
}

console.log('\n7. Tally predicate')
const counted: DayGlyphState[] = ['done', 'partial', 'due', 'missed']
const skipped: DayGlyphState[] = ['rest', 'recovery', 'before_plan', 'swapped', 'rest_chosen']
for (const s of counted) check(`'${s}' counts`, countsTowardWeekTally(s))
for (const s of skipped) check(`'${s}' does not count`, !countsTowardWeekTally(s))

// The bail-out lives at the BOTTOM of this file, not here. Two sections were
// appended below it on 17 Sep 2026 and printed FAIL while the gate exited 0 —
// the identical defect found in test:slot-replacement the same day, made again
// by hand a few hours later. Appending to a gate is exactly when this happens,
// so there is one exit and everything runs before it.
console.log('\n8. A build-up is not training')
{
  // Ashley's 17 Sep 2026 ruling made warm-up rows REAL rows. This is the week
  // strip's half of that: tick three build-up boxes on a deadlift, walk out,
  // and the week must not say you trained. Before the split, `workoutLogs`
  // answered "every row logged today" and this guard — the one written FOR
  // Ashley's Thursday, a session marked complete with nothing in it — would
  // have been satisfied by a warm-up.
  //
  // THE RENAME IS THE FIX. These fixtures are cast `as never`, so TypeScript
  // could not have caught a reader left on the old field; a field that no
  // longer exists makes the gate CRASH instead, which is how this was found.
  const warmupOnly = { session: null, workingLogs: [], warmupLogs: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] } as never
  check('three build-up rows and nothing else is not "partial"', classifyDay('Monday', MON, TODAY, PLAN, warmupOnly, PLAN_START) !== 'partial', classifyDay('Monday', MON, TODAY, PLAN, warmupOnly, PLAN_START))

  const warmupThenWork = { session: null, workingLogs: [{ id: 's1' }], warmupLogs: [{ id: 'w1' }] } as never
  check('...but a working set after them IS', classifyDay('Monday', MON, TODAY, PLAN, warmupThenWork, PLAN_START) === 'partial', classifyDay('Monday', MON, TODAY, PLAN, warmupThenWork, PLAN_START))

  // The other half of Ashley's Thursday: a session FLAGGED complete with only
  // a build-up in it must not read as done either.
  const completedWarmupOnly = { session: { is_completed: true }, workingLogs: [], warmupLogs: [{ id: 'w1' }] } as never
  check('a session marked complete with only a build-up in it is not "done"',
    classifyDay('Monday', MON, TODAY, PLAN, completedWarmupOnly, PLAN_START) !== 'done', classifyDay('Monday', MON, TODAY, PLAN, completedWarmupOnly, PLAN_START))
}

console.log('\n9. The split that feeds it, checked directly')
{
  // A MUTATION COLLAPSING THE PARTITION PASSED SECTION 7 ENTIRELY, because
  // section 7 builds its own fixtures and never exercises the code that
  // produces them. The behaviour was guarded and the thing producing it was
  // not — so the partition is now an exported pure function and checked here.
  const rows = [
    { date: '2026-09-17', is_warmup: true, set_number: 1 },
    { date: '2026-09-17', is_warmup: false, set_number: 1 },
    { date: '2026-09-17', is_warmup: false, set_number: 2 },
    { date: '2026-09-16', is_warmup: false, set_number: 1 },
  ] as never[]
  const split = partitionLogsByKind(rows, '2026-09-17')
  check('the day\'s working sets are kept', split.workingLogs.length === 2, String(split.workingLogs.length))
  check('...its build-up rows are kept SEPARATELY, not dropped', split.warmupLogs.length === 1, String(split.warmupLogs.length))
  check('...and another day\'s rows are in neither', split.workingLogs.length + split.warmupLogs.length === 3)
  // Proof it can still tell them apart: a day with no warm-ups must give an
  // empty second list rather than a copy of the first.
  const noWarmups = partitionLogsByKind(rows, '2026-09-16')
  check('a day with no build-up gives an empty list, not a duplicate',
    noWarmups.workingLogs.length === 1 && noWarmups.warmupLogs.length === 0)
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll training-week checks passed.')
