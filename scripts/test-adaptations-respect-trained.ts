/**
 * ADAPTATIONS RESPECT THE WEEK ALREADY TRAINED.
 * docs/plans/adaptations-respect-the-week-already-trained.md — test log H11,
 * H5, H17, M25 (9 Oct 2026).
 *
 * Every section reproduces a thing the tester saw, on his own plan (seed
 * `sam:2`), and holds the rule that replaced it:
 *
 *   1  a day already trained is never a target (the guard itself)
 *   2  a window is the dates asked for, across however many plan weeks
 *   3  an adaptation changes every date in its window and nothing else
 *   4  rows come out in week, day, position order
 *   5  an automatic pick stays on-pattern and on-style when it can
 *   6  ending puts back what the adaptation changed and keeps later edits
 *   7  one "effective constraints" value: pools, the coach line, the screens
 *   8  every rebuild leaves trained days alone
 *   9  removing an injury offers a rebuild
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { generateMesocycle, getFlaggedJoints, getConstrainedPool, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { EXERCISE_DATABASE, getExerciseEntry, isContraindicatedFor } from '../src/lib/exercise-db'
import {
  substituteForInjury, substituteForEquipment, rebuildAgainstProfile, rebuildForInjury, rebuildForWeightBasis,
  revertAdaptationChanges, adaptationConflictTest, dayChangesBetween, untrainedPlanContext,
  type AdaptationRecord, type PlanEditContext,
} from '../src/lib/plan-adaptations'
import { buildDayGuard, planDaysInWindow, planRowsOnDate, comparePlanDays, describeDateSpan, NOTHING_TRAINED, type PlanCalendar } from '../src/lib/plan-guard'
import { effectiveConstraints, constraintProfile, describeActiveAdaptation, NO_ACTIVE_ADAPTATIONS, type ActiveAdaptationLike } from '../src/lib/effective-constraints'
import { getReplacementCandidates, pickAutomaticReplacement, banExerciseFromMesocycle } from '../src/lib/mesocycle-edit'
import { getAdditionCandidates } from '../src/lib/exercise-add-candidates'
import { detectPlanInvalidation, rebuildFromCurrentWeek, REMOVED_INJURY_OFFER } from '../src/lib/plan-invalidation'
import { buildCoachInjuriesSummary } from '../src/lib/injuries-context'
import { addDays } from '../src/lib/session-move'
import type { MesocycleWeek, UserProfile, WorkoutDay } from '../src/lib/types'

let failures = 0
let checks = 0
function check(label: string, condition: boolean, extra?: unknown) {
  checks++
  if (condition) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const quiet = console.log
const loud = console.warn
function silently<T>(fn: () => T): T { console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = quiet; console.warn = loud } }
async function silentlyAsync<T>(fn: () => Promise<T>): Promise<T> { console.log = () => {}; console.warn = () => {}; try { return await fn() } finally { console.log = quiet; console.warn = loud } }

const sam = {
  id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', fitness_goal: 'fat_loss',
  preferred_time: 'evening', bmr: 1800, tdee: 2500, equipment_access: 'minimalist', injuries: ['shoulders'],
  training_style: 'bodybuilding', training_experience: 'intermediate', session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation', max_dumbbell_kg: 24,
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

setRandomSource(seededRngFromKey('sam:2'))
const plan: MesocycleWeek[] = silently(() => generateMesocycle(sam))
resetRandomSource()

// The plan starts with Monday 5 Oct 2026; the tester reported his knee on
// Thursday 8 Oct, after finishing that day's session. (A plan made later in
// the day has a weekday served by two plan weeks; section 2 covers that.)
const CREATED = new Date(2026, 9, 5, 0, 0, 0).toISOString()
const THU = '2026-10-08'
const calendar = (today: string, moves: PlanCalendar['moves'] = [], planCreatedAt = CREATED): PlanCalendar => ({ planCreatedAt, today, moves })
const contextOn = (today: string, logged: string[] = [], extra: Partial<PlanEditContext> = {}, planCreatedAt = CREATED): PlanEditContext => {
  const cal = calendar(today, [], planCreatedAt)
  return {
    isProtected: buildDayGuard(plan, { ...cal, loggedDates: logged, closedDates: [] }),
    constraints: NO_ACTIVE_ADAPTATIONS, calendar: cal, constrainedUntil: null, ...extra,
  }
}
const dayOf = (m: MesocycleWeek[], week: number, day: string): WorkoutDay | undefined => m.find(w => w.week_number === week)?.days.find(d => d.day === day)
const namesOf = (m: MesocycleWeek[], week: number, day: string) => (dayOf(m, week, day)?.exercises ?? []).map(e => e.name)
const kneeJoints = getFlaggedJoints(['knees'])
const loadsKnee = (name: string) => { const e = getExerciseEntry(name); return !!e && isContraindicatedFor(e, kneeJoints) }
const key = (w: number, d: string) => `${w}|${d}`

async function main() {
  // -------------------------------------------------------------------------
  console.log('\n1. A day already trained is never a target')
  // -------------------------------------------------------------------------
  {
    const open = buildDayGuard(plan, { ...calendar(THU), loggedDates: [], closedDates: [] })
    check('a day before today is protected', open(1, 'Monday') && open(1, 'Tuesday'))
    check('today is open while nothing is logged on it', !open(1, 'Thursday'))
    check('a day ahead is open', !open(1, 'Saturday') && !open(2, 'Monday') && !open(5, 'Thursday'))
    const logged = buildDayGuard(plan, { ...calendar(THU), loggedDates: [THU], closedDates: [] })
    check('today is protected once a set is logged on it', logged(1, 'Thursday'))
    check('...and that protects today only', !logged(1, 'Saturday') && !logged(2, 'Thursday'))
    const rested = buildDayGuard(plan, { ...calendar(THU), loggedDates: [], closedDates: [THU] })
    check('a day marked missed, rested or swapped for an activity is protected', rested(1, 'Thursday'))
    // Tuesday's session moved to Friday: it is judged on the day it is run.
    const moved = buildDayGuard(plan, { ...calendar(THU, [{ fromDate: '2026-10-06', toDate: '2026-10-09' }]), loggedDates: [], closedDates: [] })
    check('a session moved to a day still ahead is open, though its own weekday has passed', !moved(1, 'Tuesday'))
    const movedDone = buildDayGuard(plan, { ...calendar(THU, [{ fromDate: '2026-10-10', toDate: THU }]), loggedDates: [THU], closedDates: [] })
    check('a session moved onto today and logged is protected, though its own weekday is ahead', movedDone(1, 'Saturday'))
    const later = buildDayGuard(plan, { ...calendar('2026-10-20'), loggedDates: [], closedDates: [] })
    check('every day of an earlier plan week is protected', later(1, 'Saturday') && later(2, 'Saturday') && later(3, 'Monday') && !later(3, 'Tuesday'))
  }

  // -------------------------------------------------------------------------
  console.log('\n2. A window is the dates asked for')
  // -------------------------------------------------------------------------
  {
    const fortnight = planDaysInWindow(plan, calendar(THU), 14)
    const rows = fortnight.map(d => key(d.weekNumber, d.dayName))
    check('14 days from Thursday 8 Oct ends on Wednesday 21 Oct', fortnight.every(d => d.date >= THU && d.date <= '2026-10-21'), fortnight.map(d => d.date))
    check('...so it reaches the Monday and Tuesday of week 3 (days 12 and 13)', rows.includes('3|Monday') && rows.includes('3|Tuesday'), rows)
    check('...and does not reach back to the Monday and Tuesday already past', !rows.includes('1|Monday') && !rows.includes('1|Tuesday'), rows)
    check('...nor forward to Thursday 22 Oct, which is day 15', !rows.includes('3|Thursday'), rows)
    check('the rows come out in date order', fortnight.every((d, i) => i === 0 || fortnight[i - 1].date <= d.date))
    check('7 days from Saturday reaches next week\'s leg day (the old "this plan week" stopped on Sunday)',
      planDaysInWindow(plan, calendar('2026-10-10'), 7).some(d => d.weekNumber === 2 && d.dayName === 'Thursday'))
    const toEnd = planDaysInWindow(plan, calendar(THU))
    check('with no length it runs from today to the end of the plan', toEnd[0].date === THU && toEnd.some(d => d.weekNumber === plan.length) && !toEnd.some(d => d.date < THU))
    // A moved session is in the window on the day it is RUN.
    const withMove = planDaysInWindow(plan, calendar(THU, [{ fromDate: '2026-10-06', toDate: '2026-10-09' }]), 3)
    check('a session moved into the window is part of it', withMove.some(d => d.weekNumber === 1 && d.dayName === 'Tuesday' && d.date === '2026-10-09'), withMove)
    // The weekday the plan was made on is served by two plan weeks (before and
    // after the time of day it was made). Both are covered.
    const evening = new Date(2026, 9, 5, 20, 0, 0).toISOString()
    const boundary = planRowsOnDate(plan, calendar(THU, [], evening), '2026-10-12').map(d => d.weekNumber)
    check('on the weekday the plan was made, both plan weeks that can show are covered', boundary.includes(1) && boundary.includes(2), boundary)
    check('the card names the dates', describeDateSpan(THU, 14) === 'Thu 8 Oct – Wed 21 Oct' && describeDateSpan(THU, 1) === 'Thu 8 Oct', describeDateSpan(THU, 14))
  }

  // -------------------------------------------------------------------------
  console.log('\n3. An adaptation changes every date in its window, and nothing else')
  // -------------------------------------------------------------------------
  // The tester's own case first: Thursday of week 1 is finished.
  const samContext = contextOn(THU, [THU])
  const samTargets = planDaysInWindow(plan, samContext.calendar, 14)
  const knee = await silentlyAsync(() => substituteForInjury({ mesocycle: plan, profile: sam, injuryCode: 'knees', targetDays: samTargets, exclusions: [], context: samContext }))
  check('the fixture has knee work on the finished Thursday', namesOf(plan, 1, 'Thursday').some(loadsKnee), namesOf(plan, 1, 'Thursday'))
  check('the finished Thursday is the SAME day object afterwards', dayOf(knee.mesocycle, 1, 'Thursday') === dayOf(plan, 1, 'Thursday'), namesOf(knee.mesocycle, 1, 'Thursday'))
  check('...and so are the Monday and Tuesday before it', dayOf(knee.mesocycle, 1, 'Monday') === dayOf(plan, 1, 'Monday') && dayOf(knee.mesocycle, 1, 'Tuesday') === dayOf(plan, 1, 'Tuesday'))
  check('no row on the card names a trained day', !knee.touchedSlots.some(s => s.weekNumber === 1 && ['Monday', 'Tuesday', 'Thursday'].includes(s.dayName)), knee.touchedSlots.filter(s => s.weekNumber === 1).map(s => s.dayName))
  check('something was changed (the check below is not vacuous)', knee.touchedSlots.length >= 6, knee.touchedSlots.length)

  let datesChecked = 0, kneeDaysSeen = 0, outsideCompared = 0
  const stillLoaded: string[] = []
  const strayed: string[] = []
  for (const start of ['2026-10-06', '2026-10-08', '2026-10-10', '2026-10-13']) {
    for (const days of [7, 14]) {
      const context = contextOn(start)
      const targets = planDaysInWindow(plan, context.calendar, days)
      const out = await silentlyAsync(() => substituteForInjury({ mesocycle: plan, profile: sam, injuryCode: 'knees', targetDays: targets, exclusions: [], context }))
      const inWindow = new Set(targets.map(t => key(t.weekNumber, t.dayName)))
      for (let i = 0; i < days; i++) {
        const date = addDays(start, i)
        for (const row of planRowsOnDate(plan, context.calendar, date)) {
          datesChecked++
          if (namesOf(plan, row.weekNumber, row.dayName).some(loadsKnee)) kneeDaysSeen++
          const left = namesOf(out.mesocycle, row.weekNumber, row.dayName).filter(loadsKnee)
          if (left.length > 0) stillLoaded.push(`${start}+${days}: ${date} ${left.join(', ')}`)
        }
      }
      for (const week of plan) for (const day of week.days) {
        if (inWindow.has(key(week.week_number, day.day))) continue
        outsideCompared++
        if (dayOf(out.mesocycle, week.week_number, day.day) !== day) strayed.push(`${start}+${days}: week ${week.week_number} ${day.day}`)
      }
    }
  }
  check(`every date in the window is clear of knee work (4 start days x 7 and 14 days, ${datesChecked} session dates, ${kneeDaysSeen} of them leg days)`, stillLoaded.length === 0 && kneeDaysSeen >= 12, stillLoaded.slice(0, 4))
  check(`no day outside the window is touched (${outsideCompared} days compared, same object)`, strayed.length === 0 && outsideCompared > 400, strayed.slice(0, 4))
  {
    // The case that failed: 14 days from a Saturday reaches Thursday of week 3.
    const context = contextOn('2026-10-10')
    const out = await silentlyAsync(() => substituteForInjury({ mesocycle: plan, profile: sam, injuryCode: 'knees', targetDays: planDaysInWindow(plan, context.calendar, 14), exclusions: [], context }))
    check('14 days from Saturday adapts the leg day in the THIRD plan week (day 13)', namesOf(plan, 3, 'Thursday').some(loadsKnee) && !namesOf(out.mesocycle, 3, 'Thursday').some(loadsKnee), namesOf(out.mesocycle, 3, 'Thursday'))
  }

  // -------------------------------------------------------------------------
  console.log('\n4. Rows are in week, day, position order')
  // -------------------------------------------------------------------------
  {
    const order = knee.touchedSlots.map(s => ({ weekNumber: s.weekNumber, dayName: s.dayName, position: s.position }))
    const sorted = [...order].sort(comparePlanDays)
    check('the rows span at least two weeks and two days (so order is a real choice)', new Set(order.map(o => o.weekNumber)).size >= 2 && new Set(order.map(o => o.dayName)).size >= 2, order.length)
    check('they are already sorted as produced', JSON.stringify(order) === JSON.stringify(sorted), order.map(o => `${o.weekNumber}:${o.dayName}:${o.position}`))
    check('Saturday of week 1 comes before Thursday of week 2', knee.touchedSlots.findIndex(s => s.weekNumber === 1 && s.dayName === 'Saturday') < knee.touchedSlots.findIndex(s => s.weekNumber === 2 && s.dayName === 'Thursday'))
    check('the stored changes are in the same order', JSON.stringify(knee.changes.map(c => key(c.weekNumber, c.dayName))) === JSON.stringify([...knee.changes].sort(comparePlanDays).map(c => key(c.weekNumber, c.dayName))))
  }

  // -------------------------------------------------------------------------
  console.log('\n5. An automatic pick stays on-pattern and on-style when it can')
  // -------------------------------------------------------------------------
  {
    // Search the catalogue for the case the swap list's own ordering creates:
    // its first option is outside the person's style while an on-style option
    // of the same movement exists (loaded options are listed first whatever
    // their style — a ruling about what is SHOWN).
    const functional = { ...sam, equipment_access: 'full_gym', training_style: 'functional', injuries: [] } as unknown as UserProfile
    let cases = 0
    const wrong: string[] = []
    for (const e of EXERCISE_DATABASE) {
      const list = getReplacementCandidates(e.name, functional, [])
      if (list.length === 0 || !list[0].offStyle) continue
      if (!list.some(c => !c.offStyle && c.exercise.movement_pattern === e.movement_pattern)) continue
      cases++
      const pick = pickAutomaticReplacement(e.name, functional, [], new Set())
      if (!pick || pick.kind !== 'same' || pick.exercise.movement_pattern !== e.movement_pattern || list.find(c => c.exercise.name === pick.exercise.name)?.offStyle) wrong.push(`${e.name} -> ${pick?.exercise.name} (${pick?.kind})`)
    }
    check(`where the swap list leads with an off-style option, the automatic pick is on-style and on-pattern (${cases} lifts)`, cases >= 5 && wrong.length === 0, { cases, wrong: wrong.slice(0, 4) })

    // Off-style only when the style has nothing for that movement, and said so.
    let offCases = 0
    const unsaid: string[] = []
    for (const style of ['functional', 'hybrid', 'bodybuilding']) for (const tier of ['full_gym', 'home_gym', 'minimalist', 'bodyweight']) {
      const p = { ...sam, equipment_access: tier, training_style: style, injuries: [] } as unknown as UserProfile
      for (const e of EXERCISE_DATABASE) {
        const list = getReplacementCandidates(e.name, p, []).filter(c => c.exercise.movement_pattern === e.movement_pattern)
        if (list.length === 0 || list.some(c => !c.offStyle)) continue
        offCases++
        const pick = pickAutomaticReplacement(e.name, p, [], new Set())
        if (pick?.kind !== 'off_style') unsaid.push(`${style}/${tier}: ${e.name} -> ${pick?.exercise.name} (${pick?.kind})`)
      }
    }
    check(`where the style has nothing for the movement, the pick is marked as outside it (${offCases} cases across 12 profiles)`, offCases >= 1 && unsaid.length === 0, { offCases, unsaid: unsaid.slice(0, 4) })

    // H17: the tester's travel card. Bodyweight, shoulder flag, knees eased off.
    const travelling = { ...constraintProfile(sam, { temporaryInjuries: ['knees'], temporaryEquipment: null }), equipment_access: 'bodyweight' } as UserProfile
    const triceps = pickAutomaticReplacement('Band Tricep Kickback', travelling, [], new Set())
    check('a triceps slot with nothing related left is DROPPED, not filled with a squat', triceps === null || triceps.exercise.movement_pattern.startsWith('isolation') || triceps.exercise.movement_pattern === 'horizontal_push', triceps?.exercise.name)
    const press = pickAutomaticReplacement('Dumbbell Floor Press', travelling, [], new Set())
    check('a compound slot the injury has emptied still takes different work, and the row says why', !!press && press.kind === 'cross' && press.note.length > 10, { name: press?.exercise.name, kind: press?.kind, note: press?.note })
    check('...and that work is not something the eased-off knee rules out', !!press && !loadsKnee(press.exercise.name), press?.exercise.name)

    // A substitute already used this week is avoided when a fresh one exists.
    const first = pickAutomaticReplacement('Walking Lunges', constraintProfile(sam, { temporaryInjuries: ['knees'], temporaryEquipment: null }) as UserProfile, [], new Set())
    const second = first && pickAutomaticReplacement('Walking Lunges', constraintProfile(sam, { temporaryInjuries: ['knees'], temporaryEquipment: null }) as UserProfile, [], new Set(), new Set([first.exercise.name]))
    const alternatives = getReplacementCandidates('Walking Lunges', constraintProfile(sam, { temporaryInjuries: ['knees'], temporaryEquipment: null }) as UserProfile, []).filter(c => !c.offStyle && c.exercise.movement_pattern === 'single_leg').length
    check('a substitute used elsewhere this week is passed over when another fits', !!first && !!second && (alternatives < 2 || second.exercise.name !== first.exercise.name), { first: first?.exercise.name, second: second?.exercise.name, alternatives })
    check('...and a repeat is taken rather than dropping the slot when it is the only one', !!first && pickAutomaticReplacement('Walking Lunges', constraintProfile(sam, { temporaryInjuries: ['knees'], temporaryEquipment: null }) as UserProfile, [], new Set(), new Set(EXERCISE_DATABASE.map(e => e.name))) !== null)

    // The whole travel proposal, over an active knee adaptation.
    const today = contextOn(THU, [THU], { constraints: { temporaryInjuries: ['knees'], temporaryEquipment: null } })
    const travel = await silentlyAsync(() => substituteForEquipment({ mesocycle: knee.mesocycle, profile: sam, equipmentTier: 'bodyweight', targetDays: planDaysInWindow(plan, today.calendar, 5), exclusions: [], context: today }))
    check('the travel card makes changes (not vacuous)', travel.touchedSlots.length >= 3, travel.touchedSlots.length)
    check('it never brings in an exercise the knee adaptation rules out', !travel.touchedSlots.some(s => s.after && loadsKnee(s.after)), travel.touchedSlots.filter(s => s.after && loadsKnee(s.after)).map(s => `${s.before} -> ${s.after}`))
    check('...Box Squat in particular', !travel.touchedSlots.some(s => s.after === 'Box Squat (Bodyweight)'))
    check('it does not touch the Thursday already trained', dayOf(travel.mesocycle, 1, 'Thursday') === dayOf(knee.mesocycle, 1, 'Thursday'))
    const crossed = travel.touchedSlots.filter(s => {
      if (!s.after) return false
      const from = getExerciseEntry(s.before)!, to = getExerciseEntry(s.after)!
      return from.movement_pattern.startsWith('isolation') && !to.movement_pattern.startsWith('isolation') && to.movement_pattern !== 'horizontal_push' && to.movement_pattern !== 'horizontal_pull' && to.movement_pattern !== 'vertical_push' && to.movement_pattern !== 'vertical_pull'
    })
    check('no isolation slot is filled from unrelated work', crossed.length === 0, crossed.map(s => `${s.before} -> ${s.after}`))
    check('a dropped isolation slot says why on its row', travel.touchedSlots.filter(s => s.after === null && getExerciseEntry(s.before)!.movement_pattern.startsWith('isolation')).every(s => !!s.note))
  }

  // -------------------------------------------------------------------------
  console.log('\n6. Ending puts back what the adaptation changed, and keeps later edits')
  // -------------------------------------------------------------------------
  {
    const record: AdaptationRecord = { version: 2, days: samTargets, changes: knee.changes }
    // The person bans an exercise while the adaptation is running (Run 2).
    const banned = await silentlyAsync(() => banExerciseFromMesocycle({ mesocycle: knee.mesocycle, profile: sam, bannedName: 'Band Tricep Kickback', exclusions: ['Band Tricep Kickback'] }))
    const hadKickback = plan.slice(0, 3).some(w => w.days.some(d => d.exercises.some(e => e.name === 'Band Tricep Kickback')))
    check('the fixture has the banned exercise inside the window', hadKickback)
    // ...and swaps one of the adaptation's own replacements for something else.
    const swapped = knee.touchedSlots.find(s => s.weekNumber === 2 && s.dayName === 'Thursday' && s.after)!
    const edited = banned.map(w => w.week_number !== 2 ? w : {
      ...w, days: w.days.map(d => d.day !== 'Thursday' ? d : { ...d, exercises: d.exercises.map(e => e.name === swapped.after ? { ...e, name: 'Wall Sit' } : e) }),
    })
    // "End now" on Saturday 10 Oct, nothing logged that day.
    const guard = buildDayGuard(plan, { ...calendar('2026-10-10'), loggedDates: [], closedDates: [] })
    const ended = silently(() => revertAdaptationChanges(edited, record, [1, 2, 3], guard, sam, adaptationConflictTest('injury', 'knees', null), ['Band Tricep Kickback']))
    const all = (m: MesocycleWeek[]) => m.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name)))
    check('the ban made during the adaptation survives its ending', !all(ended.mesocycle).includes('Band Tricep Kickback'))
    check('a day nobody touched since goes back exactly as it was (same object)', dayOf(ended.mesocycle, 1, 'Saturday') === dayOf(plan, 1, 'Saturday') && dayOf(ended.mesocycle, 2, 'Saturday') === dayOf(plan, 2, 'Saturday'), namesOf(ended.mesocycle, 1, 'Saturday'))
    check('on the day the person edited, their swap stays', namesOf(ended.mesocycle, 2, 'Thursday').includes('Wall Sit') && !namesOf(ended.mesocycle, 2, 'Thursday').includes(swapped.before), namesOf(ended.mesocycle, 2, 'Thursday'))
    const others = knee.touchedSlots.filter(s => s.weekNumber === 2 && s.dayName === 'Thursday' && s !== swapped)
    check('...and every other slot the adaptation changed that day is put back', others.length >= 1 && others.every(s => namesOf(ended.mesocycle, 2, 'Thursday').includes(s.before) && (!s.after || !namesOf(ended.mesocycle, 2, 'Thursday').includes(s.after))), { others: others.map(s => `${s.before}/${s.after}`), now: namesOf(ended.mesocycle, 2, 'Thursday') })
    check('it reports the kept edit', ended.keptEdits >= 1 && ended.restoredDays >= 2, { kept: ended.keptEdits, restored: ended.restoredDays })
    // The same ending a week later: week 2 is now in the past.
    const lateGuard = buildDayGuard(plan, { ...calendar('2026-10-20'), loggedDates: [], closedDates: [] })
    const late = silently(() => revertAdaptationChanges(knee.mesocycle, record, [1, 2, 3], lateGuard, sam, adaptationConflictTest('injury', 'knees', null)))
    check('a day already trained is not rewritten by an ending either', dayOf(late.mesocycle, 2, 'Thursday') === dayOf(knee.mesocycle, 2, 'Thursday') && dayOf(late.mesocycle, 1, 'Saturday') === dayOf(knee.mesocycle, 1, 'Saturday'))
    // At expiry every day of the window is behind us: nothing is rewritten.
    const expiryGuard = buildDayGuard(plan, { ...calendar('2026-10-22'), loggedDates: [], closedDates: [] })
    const expired = silently(() => revertAdaptationChanges(knee.mesocycle, record, [1, 2, 3], expiryGuard, sam, adaptationConflictTest('injury', 'knees', null)))
    check('at expiry the whole window is history, so no week is rewritten', expired.changedWeeks.length === 0, expired.changedWeeks)

    // THE OLD STORED SHAPE: whole weeks. Built the way the old code built it —
    // every day of plan weeks 1 and 2, trained or not.
    const everyDay = [1, 2].flatMap(w => plan[w - 1].days.map(d => ({ weekNumber: w, dayName: d.day })))
    const oldStyle = await silentlyAsync(() => substituteForInjury({ mesocycle: plan, profile: sam, injuryCode: 'knees', targetDays: everyDay, exclusions: [], context: untrainedPlanContext(calendar(THU)) }))
    const oldBanned = await silentlyAsync(() => banExerciseFromMesocycle({ mesocycle: oldStyle.mesocycle, profile: sam, bannedName: 'Band Tricep Kickback', exclusions: ['Band Tricep Kickback'] }))
    const trained = buildDayGuard(plan, { ...calendar('2026-10-10'), loggedDates: [], closedDates: [] })
    const oldEnded = silently(() => revertAdaptationChanges(oldBanned, plan.filter(w => w.week_number <= 2), [1, 2], trained, sam, adaptationConflictTest('injury', 'knees', null), ['Band Tricep Kickback']))
    check('OLD stored shape: the ban still survives', !all(oldEnded.mesocycle.slice(0, 2)).includes('Band Tricep Kickback'))
    check('OLD stored shape: the knee work comes back on days still ahead', oldStyle.touchedSlots.filter(s => s.weekNumber === 2 && s.dayName === 'Thursday').every(s => namesOf(oldEnded.mesocycle, 2, 'Thursday').includes(s.before)), namesOf(oldEnded.mesocycle, 2, 'Thursday'))
    check('OLD stored shape: the Thursday already trained stays as it now reads', dayOf(oldEnded.mesocycle, 1, 'Thursday') === dayOf(oldBanned, 1, 'Thursday'))
  }

  // -------------------------------------------------------------------------
  console.log('\n7. One answer to "what must this plan avoid right now"')
  // -------------------------------------------------------------------------
  {
    const now = new Date(2026, 9, 9, 10, 0, 0)
    const kneeRow: ActiveAdaptationLike = { id: 'a1', kind: 'injury', status: 'active', injury_code: 'knees', equipment_override: null, starts_at: new Date(2026, 9, 8, 18, 0, 0).toISOString(), expires_at: new Date(2026, 9, 22, 18, 0, 0).toISOString() }
    const kitRow: ActiveAdaptationLike = { id: 'a2', kind: 'equipment', status: 'active', injury_code: null, equipment_override: 'bodyweight', starts_at: new Date(2026, 9, 8, 19, 0, 0).toISOString(), expires_at: new Date(2026, 9, 13, 19, 0, 0).toISOString() }
    const c = effectiveConstraints(sam, [kneeRow], now)
    check('an active knee adaptation is a temporary injury', JSON.stringify(c.temporaryInjuries) === '["knees"]' && c.temporaryEquipment === null, c)
    check('an ended one is not', effectiveConstraints(sam, [{ ...kneeRow, status: 'ended_early' }], now).temporaryInjuries.length === 0)
    check('one past its end date is not, even if nothing has swept it yet', effectiveConstraints(sam, [kneeRow], new Date(2026, 9, 23)).temporaryInjuries.length === 0)
    check('an area already on the profile is not listed twice', effectiveConstraints(sam, [{ ...kneeRow, injury_code: 'shoulders' }], now).temporaryInjuries.length === 0)
    check('an active kit change is the kit for now', effectiveConstraints(sam, [kneeRow, kitRow], now).temporaryEquipment === 'bodyweight')
    const pool = constraintProfile(sam, c)
    check('the pool profile carries both, and the saved profile is untouched', pool.injuries.includes('knees') && pool.injuries.includes('shoulders') && JSON.stringify(sam.injuries) === '["shoulders"]')
    check('with nothing running it is the SAME object (no behaviour change for anyone else)', constraintProfile(sam, NO_ACTIVE_ADAPTATIONS) === sam && constraintProfile(sam, effectiveConstraints(sam, [], now)) === sam)

    // The swap list, add-an-exercise, and a ban's replacement.
    const offered = new Set<string>()
    for (const name of new Set(plan.slice(0, 2).flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))) {
      for (const cand of getReplacementCandidates(name, pool, [])) offered.add(cand.exercise.name)
    }
    check(`no swap list during the adaptation offers knee work (${offered.size} options)`, offered.size > 20 && ![...offered].some(loadsKnee), [...offered].filter(loadsKnee).slice(0, 5))
    const before = new Set<string>()
    for (const name of namesOf(plan, 1, 'Thursday')) for (const cand of getReplacementCandidates(name, sam, [])) before.add(cand.exercise.name)
    check('...and on the saved profile alone it did (the hole this closes)', [...before].some(loadsKnee))
    const legDay = dayOf(knee.mesocycle, 2, 'Thursday')!
    const adds = getAdditionCandidates(legDay, pool, [])
    check(`add-an-exercise suggests no knee work during it (${adds.length} suggestions)`, adds.length > 0 && !adds.some(a => loadsKnee(a.exercise.name)), adds.filter(a => loadsKnee(a.exercise.name)).map(a => a.exercise.name))

    // The coach.
    const line = buildCoachInjuriesSummary(sam, [kneeRow], now)
    check('the coach is told what is being eased off, and until when', /Knees \(until 22 Oct\)/.test(line) && /Shoulders/.test(line), line)
    const noLasting = buildCoachInjuriesSummary({ injuries: [] }, [kneeRow], now)
    check('...and is never told "No injuries" while one is running', !/No injuries/.test(noLasting) && /Knees/.test(noLasting), noLasting)
    check('with nothing running the line is exactly what it was', buildCoachInjuriesSummary({ injuries: [] }) === 'No injuries or sore areas currently on file.' && buildCoachInjuriesSummary(sam, [{ ...kneeRow, status: 'expired' }], now) === buildCoachInjuriesSummary(sam))
    console.log(`     coach line: "${line}"`)

    // The screens.
    check('Profile and the Exercise tab say it in one sentence', describeActiveAdaptation(kneeRow) === 'Easing off your knees until 22 Oct', describeActiveAdaptation(kneeRow))
    check('a kit change reads as one too', describeActiveAdaptation(kitRow, () => 'Bodyweight') === 'Training with bodyweight until 13 Oct', describeActiveAdaptation(kitRow, () => 'Bodyweight'))

    const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const app = strip(readFileSync('src/App.tsx', 'utf8'))
    const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    const tab = strip(readFileSync('src/components/exercise/ExerciseTab.tsx', 'utf8'))
    const profileScreen = strip(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
    check('App builds the pool profile from the active adaptations', /const poolProfile = useMemo\(\s*\(\) => \(profile \? constraintProfile\(profile, effectiveConstraints\(profile, activeAdaptations, getAppNow\(profile\.id\)\)\) : null\)/.test(app))
    check('the Exercise tab (swap list, add, session rebuild, warm-up) is handed the pool profile', /<ExerciseTab[\s\S]{0,400}profile=\{poolProfile \?\? profile \?\? undefined\}/.test(app))
    check('...and the saved one separately, for anything that writes', /storedProfile=\{profile \?\? undefined\}/.test(app) && /const saved = storedProfile \?\? profile/.test(tab))
    // TWO HOPS since the ban moved into screen-ban.ts: App hands the pool profile to banOnScreen, and
    // banOnScreen hands ITS profile to the ban. Both halves, or the property is not held.
    const screenBan = strip(readFileSync('src/lib/screen-ban.ts', 'utf8'))
    check('a ban\'s replacement is picked from the pool profile',
      /banOnScreen\(\{[\s\S]{0,200}profile: poolProfile \?\? profile,/.test(app)
        && /banExerciseFromMesocycle\(\{\s*mesocycle, profile, bannedName/.test(screenBan))
    check('the coach is handed the pool profile and the adaptations', /<ChatAssistant[\s\S]{0,200}poolProfile=\{poolProfile \?\? profile\}\s*activeAdaptations=\{activeAdaptations\}/.test(app))
    check('the coach\'s add, session rebuild and ban use it', /resolveAdditionRequest\(item, poolProfile, exerciseExclusions\)/.test(chat) && /rebuildDayAroundMainLift\(\{\s*mesocycle, profile: poolProfile,/.test(chat) && /executeSessionRebuild\(poolProfile,/.test(chat) && /executeExerciseBan\(poolProfile,/.test(chat) && /executeExerciseAdd\(poolProfile,/.test(chat))
    check('the coach\'s context line is built with the adaptations', /buildCoachInjuriesSummary\(profile, activeAdaptations, getAppNow\(profile\.id\)\)/.test(chat))
    check('a profile write in the coach still uses the saved profile', /executeLastingInjury\(profile, mesocycle, payload,/.test(chat) && /executeInjuryRecovered\(profile, payload\)/.test(chat) && !/onProfileChanged\(\{ injuries: [^}]*poolProfile/.test(chat))
    check('Profile lists active adaptations under Injuries, with End now', /<h3 className="ds-label">Injuries<\/h3>[\s\S]{0,700}<ActiveAdaptationLines[\s\S]{0,200}onEnd=\{onEndAdaptation\}/.test(profileScreen))
    check('the Exercise tab shows the same line above today\'s session', /<ActiveAdaptationLines[\s\S]{0,260}onEnd=\{onEndAdaptation\}[\s\S]{0,120}<TodayPanel/.test(tab))
    check('"End now" is wired to endAdaptationEarly', /const handleEndAdaptation = async[\s\S]{0,500}endAdaptationEarly\(profile\.id, adaptationId, \{/.test(app))
    check('the coach\'s "recovered" card ends a running adaptation through the same handler', /payload\.endAdaptationId\)[\s\S]{0,400}onEndAdaptation\(payload\.endAdaptationId\)/.test(chat))
    check('...and offers the rebuild through the same function Profile uses', /const offer = detectPlanInvalidation\(profile, \{ injuries: nextInjuries \}\)[\s\S]{0,120}if \(offer\) onPlanInvalidated\?\.\(offer\)/.test(chat) && /onPlanInvalidated=\{setPlanInvalidation\}/.test(app))

    // Nothing that changes a live plan may opt out of the guard.
    const offenders: string[] = []
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !/plan-guard\.ts$|plan-adaptations\.ts$/.test(p)) { if (/NOTHING_TRAINED|untrainedPlanContext/.test(strip(readFileSync(p, 'utf8')))) offenders.push(p) } } }
    walk('src')
    check('no file under src/ uses the "nothing trained" stand-in', offenders.length === 0, offenders)
  }

  // -------------------------------------------------------------------------
  console.log('\n8. Every rebuild leaves trained days alone')
  // -------------------------------------------------------------------------
  {
    const cleared = { ...sam, injuries: [] } as UserProfile
    const context = contextOn(THU, [THU])
    const forward = plan.map(w => w.week_number)
    const sameDay = (m: MesocycleWeek[], w: number, d: string) => dayOf(m, w, d) === dayOf(plan, w, d)
    const rebuilt = await silentlyAsync(() => rebuildAgainstProfile(cleared, [], plan, forward, context))
    check('rebuildAgainstProfile: Monday, Tuesday and the finished Thursday are the same objects', sameDay(rebuilt, 1, 'Monday') && sameDay(rebuilt, 1, 'Tuesday') && sameDay(rebuilt, 1, 'Thursday'), namesOf(rebuilt, 1, 'Monday'))
    check('...and the days ahead ARE rebuilt', !sameDay(rebuilt, 1, 'Saturday') && !sameDay(rebuilt, 2, 'Monday'))
    check('...with week numbers and labels kept', rebuilt.every((w, i) => w.week_number === plan[i].week_number && w.label === plan[i].label && w.block_number === plan[i].block_number))
    const offer = await silentlyAsync(() => rebuildFromCurrentWeek(cleared, [], plan, 1, context))
    check('rebuildFromCurrentWeek (every Profile and coach rebuild offer): the same', !!offer.mesocycle && sameDay(offer.mesocycle, 1, 'Monday') && sameDay(offer.mesocycle, 1, 'Tuesday') && sameDay(offer.mesocycle, 1, 'Thursday') && !sameDay(offer.mesocycle, 1, 'Saturday'))
    const weighed = await silentlyAsync(() => rebuildForWeightBasis({ profile: sam, basisWeightKg: 95, exclusions: [], mesocycle: plan, weekNumbers: forward, context }))
    check('rebuildForWeightBasis: the same', sameDay(weighed, 1, 'Monday') && sameDay(weighed, 1, 'Tuesday') && sameDay(weighed, 1, 'Thursday'))
    const lasting = await silentlyAsync(() => rebuildForInjury({ profile: sam, injuryCode: 'knees', exclusions: [], mesocycle: plan, targetDays: planDaysInWindow(plan, context.calendar), context }))
    check('rebuildForInjury (lasting): the same', sameDay(lasting, 1, 'Monday') && sameDay(lasting, 1, 'Tuesday') && sameDay(lasting, 1, 'Thursday') && !sameDay(lasting, 2, 'Thursday'))
    const bounded = await silentlyAsync(() => rebuildForInjury({ profile: sam, injuryCode: 'knees', exclusions: [], mesocycle: plan, targetDays: planDaysInWindow(plan, context.calendar, 14), context }))
    check('rebuildForInjury (14 days): nothing outside the window moves', sameDay(bounded, 1, 'Thursday') && sameDay(bounded, 3, 'Thursday') && sameDay(bounded, 4, 'Monday') && !sameDay(bounded, 2, 'Thursday'))
    check('...and what it stores to undo it names only the days it changed', dayChangesBetween(plan, bounded).every(c => !context.isProtected(c.weekNumber, c.dayName)) && dayChangesBetween(plan, bounded).length >= 4, dayChangesBetween(plan, bounded).map(c => key(c.weekNumber, c.dayName)))
    const everything = await silentlyAsync(() => rebuildAgainstProfile(cleared, [], plan, forward, { ...context, isProtected: NOTHING_TRAINED }))
    check('without the guard it WOULD rewrite them (the check above is not vacuous)', !sameDay(everything, 1, 'Monday') || !sameDay(everything, 1, 'Thursday'))

    // H5: what saying yes gives back.
    const presses = (m: MesocycleWeek[], w: number) => (dayOf(m, w, 'Monday')?.exercises ?? []).filter(e => { const x = getExerciseEntry(e.name); return x?.movement_pattern === 'horizontal_push' || x?.movement_pattern === 'vertical_push' }).length
    check('with the shoulder flag cleared, next Monday has more pressing than the plan built around it', presses(rebuilt, 2) > presses(plan, 2), { before: presses(plan, 2), after: presses(rebuilt, 2) })

    // A rebuild while a knee adaptation is running keeps those weeks clear.
    const easing = contextOn(THU, [THU], { constraints: { temporaryInjuries: ['knees'], temporaryEquipment: null }, constrainedUntil: '2026-10-22' })
    const during = await silentlyAsync(() => rebuildAgainstProfile(cleared, [], plan, forward, easing))
    const kneeIn = (w: number) => (during.find(x => x.week_number === w)?.days ?? []).filter(d => !easing.isProtected(w, d.day)).flatMap(d => d.exercises.map(e => e.name)).filter(loadsKnee)
    check('a rebuild during a knee adaptation puts no knee work in the weeks it reaches', kneeIn(1).length === 0 && kneeIn(2).length === 0 && kneeIn(3).length === 0, [...kneeIn(1), ...kneeIn(2), ...kneeIn(3)].slice(0, 4))
    check('...and the weeks after it ends train legs normally', kneeIn(4).length > 0 && kneeIn(6).length > 0, { week4: kneeIn(4).length })
    const pool = getConstrainedPool(constraintProfile(cleared, easing.constraints) as UserProfile, [])
    check('(the cautious pool itself holds no knee work)', pool.length > 20 && !pool.some(e => loadsKnee(e.name)))
  }

  // -------------------------------------------------------------------------
  console.log('\n9. Removing an injury offers a rebuild')
  // -------------------------------------------------------------------------
  {
    const removed = detectPlanInvalidation(sam, { injuries: [] })
    check('removing the shoulder flag raises the offer', removed === REMOVED_INJURY_OFFER && removed.field === 'injuries', removed)
    check('it says what comes back, what it costs and what is kept', /from today/.test(removed?.detail ?? '') && /exercises ahead will change/.test(removed?.detail ?? '') && /already logged/.test(removed?.detail ?? '') && /already done/.test(removed?.detail ?? ''), removed?.detail)
    check('no "undefined", "null" or "NaN" in it', !/undefined|null|NaN/.test(`${removed?.title} ${removed?.detail}`))
    const added = detectPlanInvalidation(sam, { injuries: ['shoulders', 'knees'] })
    check('adding one still raises its own, different offer', !!added && added !== REMOVED_INJURY_OFFER && /Rebuild your plan around this\?/.test(added.title))
    check('swapping one for another is described as the addition', detectPlanInvalidation(sam, { injuries: ['knees'] })?.title === 'Rebuild your plan around this?')
    check('re-saving the same list raises nothing', detectPlanInvalidation(sam, { injuries: ['shoulders'] }) === null)
    const legacy = { ...sam, injuries: ['shoulders', 'tennis elbow'] } as UserProfile
    check('clearing an old free-text entry the plan never acted on raises nothing', detectPlanInvalidation(legacy, { injuries: ['shoulders'] }) === null)
    console.log(`     says: "${removed?.title}" / "${removed?.detail}"`)
  }

  console.log(failures === 0 ? `\nAll ${checks} checks passed.` : `\n${failures} of ${checks} checks FAILED.`)
  if (failures > 0) process.exit(1)
}
main().catch(err => { console.error(err); process.exit(1) })
