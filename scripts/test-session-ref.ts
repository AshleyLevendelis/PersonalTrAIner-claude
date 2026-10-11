/**
 * Gate: an EDIT lands on the session the person is looking at (H15, H19).
 *
 * 9 Oct 2026. Monday's "Chest & Triceps" was moved to Friday. Every screen
 * that SHOWS Friday resolved it correctly (sessionForDate). Every EDIT passed
 * today's weekday name to the plan instead of the row that resolver returned,
 * and Friday's own row is empty:
 *
 *   "Friday is a rest day — there's nothing on it to swap."      (coach swap)
 *   "There's no session on Friday to shorten."                   (I'm short on time)
 *   "I couldn't find that exercise on that day."                 (Drop it → Today only)
 *
 * §1 REPRODUCES those three with the app's own functions, so this file fails
 * for the reason the bug exists if the lookup ever goes back.
 * §2-§4 hold the one resolver output (SessionRef) over moved, swapped,
 * skipped, rested and ordinary days, and every spelling the coach's tools use.
 * §5 runs the real edits through it, including the three-exercise floor,
 * whose refusal must name the day on screen.
 * §6 is the wiring, read from source: no edit on either surface is addressed
 * by a bare weekday any more. (A test: gate cannot prove a branch RUNS —
 * verify:moved-edit drives it.)
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle, resetRandomSource, setRandomSource, shortenDayTo } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { removeExerciseFromSession, MIN_EXERCISES_PER_SESSION } from '../src/lib/session-edit'
import { resolveSwapTarget, resolveExerciseOnSession } from '../src/lib/swap-target'
import { sessionForDate, type SessionMove } from '../src/lib/session-move'
import { classifyDay } from '../src/hooks/useTrainingWeek'
import { sessionRefFromCell, sessionRefForDayArg, sessionRefForPlanDay, editTarget, sayDayIn, type SessionRefCell, type SessionRef } from '../src/lib/session-ref'
import type { UserProfile, MesocycleWeek, WorkoutDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'build_muscle', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: false }, { day: 'Saturday', available: true }, { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

const quiet = console.log
console.log = () => {}
setRandomSource(seededRngFromKey('session-ref-fixture'))
const GENERATED = generateMesocycle(profile)
resetRandomSource()
console.log = quiet

// SAM'S MOVED SESSION HAD THREE EXERCISES, and that is the case the tracer
// warned about: once the lookup works, "Drop it" meets the never-below-three
// floor and its refusal has to name the right day too. So Monday is cut to
// three here — the input is chosen, the edits' output is the app's own.
//
// FRIDAY HAS A ROW OF ITS OWN WITH NOTHING TO LIFT ON IT, as Sam's did (the
// generator gives a recovery row to some free days and none to others; this
// profile's lands on Wednesday). It is the row every edit used to hit.
const MESO: MesocycleWeek[] = GENERATED.map(w => {
  const recovery = w.days.find(d => d.exercises.length === 0)!
  const days = w.days.map(d => d.day === 'Monday' ? { ...d, exercises: d.exercises.slice(0, MIN_EXERCISES_PER_SESSION) } : d)
  return { ...w, days: days.some(d => d.day === 'Friday') ? days : [...days, { ...recovery, day: 'Friday' }] }
})
const WEEK = MESO[0]
const PLAN: WorkoutDay[] = WEEK.days
const row = (name: string) => PLAN.find(d => d.day === name)

// The week of Mon 5 Oct 2026; today is Friday the 9th.
const DATES: Record<string, string> = {
  Monday: '2026-10-05', Tuesday: '2026-10-06', Wednesday: '2026-10-07', Thursday: '2026-10-08',
  Friday: '2026-10-09', Saturday: '2026-10-10', Sunday: '2026-10-11',
}
const TODAY = DATES.Friday
const MOVES: SessionMove[] = [{ fromDate: DATES.Monday, toDate: DATES.Friday }]

/** The seven cells exactly as useTrainingWeek's day loop builds them — same two functions, same order. */
function cells(moves: SessionMove[], flags: Record<string, { swapped_for_activity?: string; deliberate_rest?: boolean; marked_missed?: boolean; worked?: boolean }> = {}): SessionRefCell[] {
  return Object.entries(DATES).map(([dayName, date]) => {
    const f = flags[dayName]
    const dashboardDay = f ? {
      date,
      session: { is_completed: !!f.worked, swapped_for_activity: f.swapped_for_activity ?? null, deliberate_rest: !!f.deliberate_rest, marked_missed: !!f.marked_missed },
      workingLogs: f.worked ? [{ id: 'x' }] : [],
      cardioLogs: [],
    } : undefined
    const resolved = sessionForDate({ date, plan: PLAN, moves })
    return {
      date, dayName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state: classifyDay(dayName, date, TODAY, PLAN, dashboardDay as any, '2026-09-01', moves),
      swappedForActivity: f?.swapped_for_activity ?? null,
      markedMissed: !!f?.marked_missed,
      deliberateRest: !!f?.deliberate_rest,
      movedTo: resolved.movedTo,
      movedFrom: resolved.movedFrom,
      session: resolved.day,
    }
  })
}
const MOVED = cells(MOVES)
const ctx = (c: SessionRefCell[], followMove?: boolean) => ({ todayDate: TODAY, cells: c, weekNumber: WEEK.week_number, followMove })
const asRef = (r: SessionRef | { refusal: string }): SessionRef | null => ('refusal' in r ? null : r)

// ---------------------------------------------------------------------------
console.log('\n0. The fixture is the tester\'s week')
// ---------------------------------------------------------------------------
check('Monday holds a three-exercise session', row('Monday')?.exercises.length === 3, row('Monday')?.exercises.length)
check('Friday\'s own plan row exists and is empty — the row every edit used to hit', !!row('Friday') && row('Friday')!.exercises.length === 0, row('Friday'))
check('Tuesday is a full session with room to lose one', (row('Tuesday')?.exercises.length ?? 0) > MIN_EXERCISES_PER_SESSION)

// ---------------------------------------------------------------------------
console.log('\n1. The bug, reproduced: the three sentences come from addressing the edit by today\'s weekday')
// ---------------------------------------------------------------------------
{
  const swap = resolveSwapTarget({ dayArg: 'today', exerciseArg: row('Monday')!.exercises[2].name, days: PLAN, todayName: 'Friday' })
  check('swap by weekday → "Friday is a rest day — there\'s nothing on it to swap."',
    !swap.ok && swap.message === "Friday is a rest day — there's nothing on it to swap.", swap)
  const shorten = shortenDayTo(WEEK, 'Friday', profile, 30)
  check('shorten by weekday → "There\'s no session on Friday to shorten."',
    !shorten.changed && shorten.refusal === "There's no session on Friday to shorten.", shorten.refusal)
  const remove = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK.week_number, dayName: 'Friday', exIndex: 2, scope: 'today' })
  check('remove by weekday → "I couldn\'t find that exercise on that day."',
    !remove.changed && remove.refusal === "I couldn't find that exercise on that day.", remove.refusal)
}

// ---------------------------------------------------------------------------
console.log('\n2. One cell in, one reference out')
// ---------------------------------------------------------------------------
{
  const fri = sessionRefFromCell(MOVED.find(c => c.dayName === 'Friday')!, WEEK.week_number)
  check('the receiving day SAYS Friday', fri.sayDay === 'Friday', fri.sayDay)
  check('...and WRITES to Monday\'s row', fri.planDayName === 'Monday', fri.planDayName)
  check('...is a session, carrying Monday\'s exercises', fri.kind === 'session' && fri.session?.exercises.length === 3, { kind: fri.kind })
  check('...and remembers where it came from', fri.movedFrom?.dayName === 'Monday' && fri.movedTo === null)
  check('...on the date being looked at', fri.date === TODAY && fri.weekNumber === WEEK.week_number)

  const mon = sessionRefFromCell(MOVED.find(c => c.dayName === 'Monday')!, WEEK.week_number)
  check('the origin is "moved away" with no session on it', mon.kind === 'moved_away' && mon.session === null && mon.movedTo?.dayName === 'Friday', mon)

  const tue = sessionRefFromCell(MOVED.find(c => c.dayName === 'Tuesday')!, WEEK.week_number)
  check('an ordinary day says and writes the same word', tue.kind === 'session' && tue.sayDay === 'Tuesday' && tue.planDayName === 'Tuesday')

  const wed = sessionRefFromCell(MOVED.find(c => c.dayName === 'Wednesday')!, WEEK.week_number)
  check('a rest day is "rest", keyed to its own weekday', wed.kind === 'rest' && wed.planDayName === 'Wednesday', wed.kind)

  const swapped = cells([], { Tuesday: { swapped_for_activity: 'Football' } })
  const sw = sessionRefFromCell(swapped.find(c => c.dayName === 'Tuesday')!, WEEK.week_number)
  check('a day swapped for football is "swapped", and names the activity', sw.kind === 'swapped' && sw.swappedFor === 'Football', sw.kind)

  const lifted = cells([], { Tuesday: { swapped_for_activity: 'Football', worked: true } })
  const li = sessionRefFromCell(lifted.find(c => c.dayName === 'Tuesday')!, WEEK.week_number)
  check('...but logged work outranks the flag: said football, lifted anyway → an editable session', li.kind === 'session', li.kind)

  const rested = cells([], { Thursday: { deliberate_rest: true } })
  check('a day rested on purpose is "rest_chosen"', sessionRefFromCell(rested.find(c => c.dayName === 'Thursday')!, WEEK.week_number).kind === 'rest_chosen')

  const missed = cells([], { Tuesday: { marked_missed: true } })
  check('a day SAID missed is "missed"', sessionRefFromCell(missed.find(c => c.dayName === 'Tuesday')!, WEEK.week_number).kind === 'missed')

  const lookedMissed = cells([])
  const lm = sessionRefFromCell(lookedMissed.find(c => c.dayName === 'Tuesday')!, WEEK.week_number)
  check('a past day that merely LOOKS missed is still a session (nobody said so)', lookedMissed.find(c => c.dayName === 'Tuesday')!.state === 'missed' && lm.kind === 'session', lm.kind)

  const borrowed = sessionRefForPlanDay({ date: TODAY, planDayName: 'Tuesday', session: row('Tuesday'), weekNumber: WEEK.week_number })
  check('a borrowed day is a plain plan-row reference', borrowed.kind === 'session' && borrowed.planDayName === 'Tuesday' && borrowed.sayDay === 'Tuesday')
}

// ---------------------------------------------------------------------------
console.log('\n3. However the coach\'s tools name the day')
// ---------------------------------------------------------------------------
for (const arg of ['today', 'Today', '', 'Friday', 'friday', 'Fri']) {
  const r = asRef(sessionRefForDayArg(arg, ctx(MOVED)))
  check(`"${arg}" → Friday's screen, Monday's row`, r?.sayDay === 'Friday' && r?.planDayName === 'Monday' && r?.kind === 'session', r && { say: r.sayDay, plan: r.planDayName, kind: r.kind })
}
{
  const byOrigin = asRef(sessionRefForDayArg('Monday', ctx(MOVED)))
  check('"Monday" — the session\'s old name — is the SAME session, said as Friday', byOrigin?.sayDay === 'Friday' && byOrigin?.planDayName === 'Monday' && byOrigin?.kind === 'session', byOrigin)
  const theSlot = asRef(sessionRefForDayArg('Monday', ctx(MOVED, false)))
  check('...unless the caller means the calendar slot: then it is "moved away"', theSlot?.kind === 'moved_away' && theSlot?.sayDay === 'Monday', theSlot)
  const tomorrow = asRef(sessionRefForDayArg('tomorrow', ctx(MOVED)))
  check('"tomorrow" from Friday is Saturday', tomorrow?.sayDay === 'Saturday' && tomorrow?.planDayName === 'Saturday', tomorrow?.sayDay)
  const sundayCtx = { todayDate: DATES.Sunday, cells: MOVED, weekNumber: WEEK.week_number }
  const wrap = asRef(sessionRefForDayArg('tomorrow', sundayCtx))
  check('"tomorrow" from Sunday still finds Monday\'s session rather than nothing', wrap?.planDayName === 'Monday', wrap?.sayDay)
  const nope = sessionRefForDayArg('Funday', ctx(MOVED))
  check('a day that is not a day is refused in words, never guessed', 'refusal' in nope && /Funday/.test(nope.refusal), nope)
  const t = asRef(sessionRefForDayArg('T', ctx(MOVED)))
  check('an ambiguous prefix ("T") picks nothing', t === null, t)
}

// ---------------------------------------------------------------------------
console.log('\n4. Which references may be edited — and what the refusal says')
// ---------------------------------------------------------------------------
{
  const ok = editTarget(asRef(sessionRefForDayArg('today', ctx(MOVED)))!)
  check('the moved-in session is editable, under Monday\'s key and Friday\'s name', ok.ok && ok.planDayName === 'Monday' && ok.sayDay === 'Friday', ok)
  check('a rest day passes through (the edits refuse an empty day in their own words; cardio goes ON one)', editTarget(asRef(sessionRefForDayArg('Wednesday', ctx(MOVED)))!).ok)

  const away = editTarget(asRef(sessionRefForDayArg('Monday', ctx(MOVED, false)))!)
  check('the emptied origin is refused, naming both days', !away.ok && /Monday/.test(away.refusal) && /Friday/.test(away.refusal), away)

  const sw = editTarget(asRef(sessionRefForDayArg('Tuesday', ctx(cells([], { Tuesday: { swapped_for_activity: 'Football' } }))))!)
  check('a day swapped for football is refused, naming the day and the activity', !sw.ok && /Tuesday/.test(sw.refusal) && /Football/.test(sw.refusal), sw)
  const re = editTarget(asRef(sessionRefForDayArg('Thursday', ctx(cells([], { Thursday: { deliberate_rest: true } }))))!)
  check('a chosen rest day is refused, naming the day', !re.ok && /Thursday/.test(re.refusal) && /rest day/.test(re.refusal), re)
  const mi = editTarget(asRef(sessionRefForDayArg('Tuesday', ctx(cells([], { Tuesday: { marked_missed: true } }))))!)
  check('a day said missed is refused, naming the day', !mi.ok && /Tuesday/.test(mi.refusal) && /missed/.test(mi.refusal), mi)
  for (const r of [away, sw, re, mi]) {
    check(`no refusal leaks "undefined" or "null": ${!r.ok ? r.refusal : ''}`, !r.ok && !/undefined|null|NaN/.test(r.refusal))
  }
}

// ---------------------------------------------------------------------------
console.log('\n5. The real edits, through the reference')
// ---------------------------------------------------------------------------
{
  const ref = asRef(sessionRefForDayArg('today', ctx(MOVED)))!
  const target = editTarget(ref)
  const key = target.ok ? target.planDayName : 'NO-KEY'
  const kick = row('Monday')!.exercises[2].name

  const swap = resolveExerciseOnSession({ exerciseArg: kick, sayDay: ref.sayDay, planDayName: key, exercises: ref.session!.exercises })
  check('the swap FINDS the exercise on the moved session', swap.ok && swap.dayName === 'Monday' && swap.exIndex === 2, swap)
  const miss = resolveExerciseOnSession({ exerciseArg: 'Zercher Carry', sayDay: ref.sayDay, planDayName: key, exercises: ref.session!.exercises })
  check('a swap that cannot match says FRIDAY has these, not Monday', !miss.ok && /on Friday\. It has:/.test(miss.message) && !/Monday/.test(miss.message), miss)

  const shorten = shortenDayTo(WEEK, key, profile, 20)
  check('shorten no longer says there is no session', shorten.refusal !== "There's no session on Friday to shorten." && shorten.refusal !== `There's no session on ${key} to shorten.`, shorten.refusal)
  check('...and whatever it says, said through the reference, names Friday and never Monday',
    shorten.refusal == null || (!/Monday/.test(sayDayIn(shorten.refusal, ref)) ), shorten.refusal && sayDayIn(shorten.refusal, ref))

  const remove = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK.week_number, dayName: key, exIndex: 2, scope: 'today' })
  check('removing from a three-exercise session meets the FLOOR, not "couldn\'t find"', !remove.changed && /fewer than 3 exercises/.test(remove.refusal ?? ''), remove.refusal)
  const said = sayDayIn(remove.refusal ?? '', ref)
  check('the floor\'s refusal names the day on screen: "That would leave Friday with fewer than 3 exercises…"',
    said === 'That would leave Friday with fewer than 3 exercises. Take the whole day off instead, or swap this one for something easier.', said)
  check('...and never the plan row', !/Monday/.test(said), said)

  // An ordinary day is untouched by any of this.
  const tue = asRef(sessionRefForDayArg('Tuesday', ctx(MOVED)))!
  const tueKey = editTarget(tue)
  const tueRemove = removeExerciseFromSession({ mesocycle: MESO, profile, weekNumber: WEEK.week_number, dayName: tueKey.ok ? tueKey.planDayName : 'NO-KEY', exIndex: row('Tuesday')!.exercises.length - 1, scope: 'today' })
  check('an ordinary day still edits exactly as before', tueRemove.changed, tueRemove.refusal)
  check('sayDayIn is a no-op where the two names agree', sayDayIn('Tuesday goes from 14 sets to 12.', tue) === 'Tuesday goes from 14 sets to 12.')
  check('sayDayIn renames whole words only', sayDayIn('Mondays and Monday', { planDayName: 'Monday', sayDay: 'Friday' }) === 'Mondays and Friday')
  check('sayDayIn passes null through', sayDayIn(null, ref) === null)
}

// ---------------------------------------------------------------------------
console.log('\n6. Wiring: no edit is addressed by a bare weekday (source, comments stripped)')
// ---------------------------------------------------------------------------
{
  const today = code('src/components/exercise/TodayPanel.tsx')
  const chat = code('src/components/ChatAssistant.tsx')
  const browse = code('src/components/exercise/ProgramBrowse.tsx')
  const tools = code('src/components/ToolsTab.tsx')
  const sheet = code('src/components/exercise/WhatHappenedSheet.tsx')

  // Prove the detector on something that should fail it, so it cannot go vacuous.
  const bad = /(removeExerciseFromSession|moveExerciseInSession|addExerciseToSession|rebuildDayAroundMainLift|executeCardioSession)\([\s\S]{0,300}?dayName:\s*(effectiveDayName|todayName)\b/
  check('(detector) the old shape is recognised', bad.test('removeExerciseFromSession({ mesocycle, dayName: effectiveDayName, exIndex })'))
  check('(detector) ...and the cardio shape, which spans lines', bad.test('executeCardioSession(profile, mesocycle, {\n      weekNumber: liveWeek,\n      dayName: todayName,'))

  check('Exercise tab: no edit passes effectiveDayName / todayName as its day', !bad.test(today), today.match(bad)?.[0])
  check('Exercise tab: shorten and settle are not keyed by effectiveDayName', !/(shortenDayTo|settleWeek)\([^)]*effectiveDayName/.test(today))
  check('Exercise tab: no plan row is looked up by effectiveDayName for an edit', !/d\.day === effectiveDayName\s*\?/.test(today) && !/week\?\.days\.find\(d => d\.day === effectiveDayName\)/.test(today))
  check('Exercise tab: the edits go through editTarget(', /\beditTarget\(/.test(today))
  check('Exercise tab: refusals are said through sayDayIn(', /\bsayDayIn\(/.test(today))
  check('Exercise tab: the peek opens a swap with a reference, not the peeked weekday', !/onOpenSwap\(peekDay,/.test(today))

  check('Programme view: a swap is opened with the row the session lives in', !/onOpenSwap\(\{ weekNumber: browseWeek, dayName, exIndex/.test(browse) && /sayDay/.test(browse))

  check('Coach: no builder resolves the day through the raw plan rows', !/\bresolveSwapTarget\(/.test(chat))
  check('Coach: no builder defaults its day to activeSession.dayName', !/\|\|\s*activeSession\.dayName/.test(chat) && !/:\s*activeSession\.dayName\s*\n\s*const day = week\.days\.find/.test(chat))
  check('Coach: no builder looks the day up by weekday in week.days', !/week\.days\.find\(d => d\.day\.toLowerCase\(\) === (wanted|dayArg)\.toLowerCase\(\)\)/.test(chat))
  check('Coach: the edits go through editTarget( and sessionRefForDayArg(', /\beditTarget\(/.test(chat) && /\bsessionRefForDayArg\(/.test(chat))
  check('Coach: logging reads today\'s session from the reference, not exercisePlan by weekday', !/exercisePlan\.find\(d => d\.day === activeSession\.dayName\)/.test(chat))

  check('Tools tab: today\'s conditioning is not looked up by weekday', !/\.find\(\(?d\)? => d\.day === (todayName|dayName)\)/.test(tools), tools.match(/\.find\(\(?d\)? => d\.day === \w+\)/)?.[0])
  check('"What happened?": the shorten choices come from the session on that date', !/plan\.find\(d => d\.day === target\?\.dayName\)/.test(sheet))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`\n${failures} session-ref check(s) FAILED.`); process.exit(1) }
console.log('All session-ref checks pass.')
