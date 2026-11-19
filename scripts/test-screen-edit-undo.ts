// ---------------------------------------------------------------------------
// Gate: an exercise changed on the Exercise screen can be put back (QA walk T7, 8 Nov 2026).
//
// verify:edit-undo drives the line on a real screen (move, remove, swap, add, each undone and saved). This holds the
// half no screen can construct: the put-back writes exactly the weeks the change wrote, from the plan before it, and
// refuses (writing nothing) once those weeks have changed again, after the coach's ten minutes, and says so when the
// save fails. The coach card's own rules and words (offer-still-holds, RECEIPTS_UNDONE).
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { recordScreenEdit, undoScreenEdit, screenEditText, dayWayBack, SCREEN_UNDO_WINDOW_MS } from '../src/lib/screen-edit-undo'
import { RECEIPTS_UNDONE } from '../src/lib/coach-voice'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

let ran = 0
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const PROFILE = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as UserProfile

setRandomSource(seededRngFromKey('screen-edit-undo'))
const BEFORE: MesocycleWeek[] = generateMesocycle(PROFILE)
resetRandomSource()
const clone = (m: MesocycleWeek[]): MesocycleWeek[] => JSON.parse(JSON.stringify(m))
const json = (x: unknown) => JSON.stringify(x)
const WEEK = BEFORE.find(w => w.week_number === 2)!
const DAY = WEEK.days.find(d => d.exercises.length > 3)!
// "Take the last one out", as the screen's removal would write it.
const dropLast = (m: MesocycleWeek[], weeks: number[]) => m.map(w => weeks.includes(w.week_number)
  ? { ...w, days: w.days.map(d => d.day === DAY.day ? { ...d, exercises: d.exercises.slice(0, -1) } : d) } : w)
const blockWeeks = BEFORE.filter(w => w.block_number === WEEK.block_number && w.week_number >= WEEK.week_number).map(w => w.week_number)
check('fixture: the block runs past this week, so "Whole block" and "Just today" differ', blockWeeks.length >= 2, blockWeeks)
const T0 = 1_000_000

/** A saver that records what it was asked to write, and can be told to fail. */
const saver = (fail = false) => {
  const wrote: MesocycleWeek[] = []
  return { wrote, save: async (w: MesocycleWeek) => { if (fail) throw new Error('offline'); wrote.push(w) } }
}

console.log('\n1. What it records')
const todayAfter = dropLast(BEFORE, [WEEK.week_number])
const rToday = recordScreenEdit(BEFORE, todayAfter, WEEK.week_number, 'today', 'Removed X.', T0)
check('"Just today" records this week only', json(rToday.weeks) === json([WEEK.week_number]), rToday.weeks)
const blockAfter = dropLast(BEFORE, blockWeeks)
const rBlock = recordScreenEdit(BEFORE, blockAfter, WEEK.week_number, 'permanent', 'Removed X.', T0)
check('"Whole block" records the rest of the block from this week', json(rBlock.weeks) === json(blockWeeks), rBlock.weeks)
check('two records are told apart', rToday.id !== rBlock.id)

console.log('\n2. The put-back')
{
  const s = saver()
  const out = await undoScreenEdit(rBlock, clone(blockAfter), T0 + 60_000, s.save)
  check('it goes ahead while the weeks read as the change left them', out.ok === true, out)
  check('...writes exactly the weeks the change wrote', json(s.wrote.map(w => w.week_number)) === json(blockWeeks), s.wrote.map(w => w.week_number))
  check('...each from the plan before the change', s.wrote.every(w => json(w) === json(BEFORE.find(b => b.week_number === w.week_number))))
  const m = out.ok ? out.mesocycle : []
  check('...and hands back the plan as it was before', json(m) === json(BEFORE))
}
{
  // A change to a week the Undo does NOT write (an earlier week) must not block it, and must survive it.
  const live = clone(todayAfter)
  const other = live.find(w => w.week_number === 1)!
  other.days[0].exercises = other.days[0].exercises.slice(0, -1)
  const s = saver()
  const out = await undoScreenEdit(rToday, live, T0 + 1000, s.save)
  check('a later change to a week it does not write does not block it', out.ok === true, out)
  check('...and that change is kept', out.ok && json(out.mesocycle.find(w => w.week_number === 1)) === json(other))
}

console.log('\n3. It refuses, writing nothing')
{
  const live = clone(todayAfter)
  live.find(w => w.week_number === WEEK.week_number)!.days.find(d => d.day === DAY.day)!.exercises.reverse()
  const s = saver()
  const out = await undoScreenEdit(rToday, live, T0 + 1000, s.save)
  check('once the week was changed again: the coach card\'s "changed since" words, button kept',
    !out.ok && out.refusal === RECEIPTS_UNDONE.changedSince && out.keep === true, out)
  check('...and nothing was written', s.wrote.length === 0, s.wrote.length)
}
{
  const s = saver()
  const out = await undoScreenEdit(rToday, clone(todayAfter), T0 + SCREEN_UNDO_WINDOW_MS + 1, s.save)
  check('after ten minutes: "too late", no button, nothing written', !out.ok && out.refusal === RECEIPTS_UNDONE.tooLate && out.keep === false && s.wrote.length === 0, out)
  const ok = await undoScreenEdit(rToday, clone(todayAfter), T0 + SCREEN_UNDO_WINDOW_MS - 1000, saver().save)
  check('...while just inside ten minutes it still works (the window binds)', ok.ok === true, ok)
  check('the window is the coach\'s ten minutes', SCREEN_UNDO_WINDOW_MS === 10 * 60 * 1000)
}
{
  const out = await undoScreenEdit(rToday, clone(todayAfter), T0 + 1000, saver(true).save)
  check('a save that fails says so, and keeps the button', !out.ok && out.refusal === RECEIPTS_UNDONE.failed && out.keep === true, out)
}

console.log('\n3b. QA round 2 (8 Nov 2026): a set logged since, and a put-back that fails midway')
{
  const s = saver()
  const out = await undoScreenEdit(rToday, clone(todayAfter), T0 + 1000, s.save, true)
  check('a set logged since the change refuses, in its own words, no button, nothing written',
    !out.ok && out.refusal === RECEIPTS_UNDONE.loggedSince && out.keep === false && s.wrote.length === 0, out)
  const ok = await undoScreenEdit(rToday, clone(todayAfter), T0 + 1000, saver().save, false)
  check('...while with nothing logged since it goes ahead (the flag binds)', ok.ok === true, ok)
}
{
  // The second week's save fails: the first week, already put back, is written again as the change left it.
  const wrote: MesocycleWeek[] = []
  let calls = 0
  const save = async (w: MesocycleWeek) => { calls++; if (calls === 2) throw new Error('offline'); wrote.push(w) }
  const live = clone(blockAfter)
  const out = await undoScreenEdit(rBlock, live, T0 + 1000, save)
  const first = blockWeeks[0]
  const lastWrite = [...wrote].reverse().find(w => w.week_number === first)
  check('a "Whole block" put-back that fails midway says nothing was changed, button kept',
    !out.ok && out.refusal === RECEIPTS_UNDONE.failed && out.keep === true, out)
  check('...and that is TRUE: the week already put back is written again as the change left it',
    !!lastWrite && json(lastWrite) === json(live.find(w => w.week_number === first)), wrote.map(w => w.week_number))
}
{
  let calls = 0
  const save = async (_w: MesocycleWeek) => { calls++; if (calls >= 2) throw new Error('offline') }
  const out = await undoScreenEdit(rBlock, clone(blockAfter), T0 + 1000, save)
  check('...and when even that fails, it says only part went back', !out.ok && out.refusal === RECEIPTS_UNDONE.halfDone, out)
}

console.log('\n4. The words')
check('a coach receipt\'s bare title is not "Swapped was taken back" (QA round 2)', RECEIPTS_UNDONE.detail('Swapped') === 'That change was taken back. Everything is as it was before.', RECEIPTS_UNDONE.detail('Swapped'))
check('...while a sentence names the change', RECEIPTS_UNDONE.detail('Removed Face Pull.') === 'Removed Face Pull was taken back. Everything is as it was before.')
check('swap', screenEditText('swap', 'Lat Pulldown', 'Seated Cable Row') === 'Swapped Lat Pulldown for Seated Cable Row.')
check('remove', screenEditText('remove', 'Face Pull') === 'Removed Face Pull.')
check('add', screenEditText('add', 'Face Pull') === 'Added Face Pull.')
check('move', screenEditText('reorder', 'Face Pull', 'earlier') === 'Moved Face Pull earlier.')

console.log('\n5. Who files a record (source; the driver proves the line on screen)')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const swapSrc = strip(readFileSync('src/lib/screen-swap.ts', 'utf8'))
const saveAt = swapSrc.indexOf('await saveScopedEdit(')
const pubAt = swapSrc.indexOf('publishScreenEdit(')
const catchAt = swapSrc.indexOf('} catch (err)')
check('the screen swap files its record only after the save, inside the success path', saveAt > 0 && pubAt > saveAt && catchAt > pubAt, { saveAt, pubAt, catchAt })
const panel = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
for (const kind of ['remove', 'reorder', 'add']) {
  check(`today's card files a record for "${kind}"`, panel.includes(`screenEditText('${kind}'`))
}
const applyAt = panel.indexOf('const applySessionEdit')
const applyBody = panel.slice(applyAt, panel.indexOf('weekTrain.refresh()', applyAt))
check('...and only after its save succeeded', applyBody.indexOf('publishScreenEdit(') > applyBody.indexOf('await saveScopedEdit('), applyBody.slice(0, 80))

console.log('\n6. A whole-day change can be put back too: "I\'m short of time" and "a different session" (19 Nov 2026)')
{
  // The first change (a shortening: the last exercise goes), then a second on top (the order reversed).
  const first = dropLast(BEFORE, [WEEK.week_number])
  const second = first.map(w => w.week_number === WEEK.week_number
    ? { ...w, days: w.days.map(d => d.day === DAY.day ? { ...d, exercises: [...d.exercises].reverse() } : d) } : w)
  const one = dayWayBack(null, BEFORE, first, WEEK.week_number, '', 0, T0)
  check('a first change goes back to the plan as it found it, this week only',
    one.chained === false && one.record.before === BEFORE && json(one.record.weeks) === json([WEEK.week_number]), { chained: one.chained, weeks: one.record.weeks })
  {
    const s = saver()
    const out = await undoScreenEdit(one.record, clone(first), T0 + 1000, s.save)
    check('...and its put-back hands back the planned day', out.ok === true && json(out.ok ? out.mesocycle : null) === json(BEFORE) && s.wrote.length === 1)
  }
  // A SECOND CHANGE WHILE THE FIRST CAN STILL BE PUT BACK GOES BACK PAST IT.
  const two = dayWayBack({ record: one.record, loggedAt: 0 }, first, second, WEEK.week_number, 'Rebuilt today.', 0, T0 + 60_000)
  check('a second change straight after goes back to the PLAN, not to the first change', two.chained === true && two.record.before === BEFORE, two.chained)
  {
    const s = saver()
    const out = await undoScreenEdit(two.record, clone(second), T0 + 61_000, s.save)
    check('...its put-back hands back the planned day in one tap', out.ok === true && json(out.ok ? out.mesocycle : null) === json(BEFORE))
    check('...and its ten minutes run from the second change', two.record.at === T0 + 60_000)
  }
  // ...BUT ONLY WHILE THE FIRST COULD STILL BE PUT BACK. Each of the three reasons it could not, one at a time.
  const late = dayWayBack({ record: one.record, loggedAt: 0 }, first, second, WEEK.week_number, '', 0, T0 + SCREEN_UNDO_WINDOW_MS + 1)
  check('after the first change\'s ten minutes, the second goes back only to the day it found', late.chained === false && late.record.before === first)
  const edge = dayWayBack({ record: one.record, loggedAt: 0 }, first, second, WEEK.week_number, '', 0, T0 + SCREEN_UNDO_WINDOW_MS - 1000)
  check('...while just inside them it still goes back to the plan (the window binds)', edge.chained === true && edge.record.before === BEFORE)
  const logged = dayWayBack({ record: one.record, loggedAt: 0 }, first, second, WEEK.week_number, '', 1, T0 + 60_000)
  check('once a set was logged after the first change, the second goes back only to the day it found', logged.chained === false && logged.record.before === first, logged.chained)
  // Something else changed the week in between (a swap, say): the first change's "after" no longer describes the day.
  const between = first.map(w => w.week_number === WEEK.week_number
    ? { ...w, days: w.days.map(d => d.day === DAY.day ? { ...d, exercises: d.exercises.slice(1) } : d) } : w)
  const moved = dayWayBack({ record: one.record, loggedAt: 0 }, between, second, WEEK.week_number, '', 0, T0 + 60_000)
  check('once the week was changed some other way in between, the second goes back only to the day it found', moved.chained === false && moved.record.before === between)
  check('...while with the same sets logged as then it still goes back to the plan (the count binds)', dayWayBack({ record: one.record, loggedAt: 3 }, first, second, WEEK.week_number, '', 3, T0 + 60_000).chained === true)
}
{
  // Source: the two day verbs keep a way back only after their save, and the button is drawn only while it can work.
  const shortenAt = panel.indexOf('const shortenToday')
  const shortenBody = panel.slice(shortenAt, panel.indexOf('const rebuildToday', shortenAt))
  const rebuildAt = panel.indexOf('const rebuildToday')
  const rebuildBody = panel.slice(rebuildAt, panel.indexOf('const keepWayBack', rebuildAt))
  check('"I\'m short of time" keeps a way back, after its save', shortenBody.indexOf("keepWayBack('shorten'") > shortenBody.indexOf('await applySessionEdit('), shortenBody.indexOf("keepWayBack('shorten'"))
  check('"a different session" keeps a way back, after its save', rebuildBody.indexOf("keepWayBack('rebuild'") > rebuildBody.indexOf('await applySessionEdit(') && rebuildBody.indexOf('await applySessionEdit(') > 0, rebuildBody.indexOf("keepWayBack('rebuild'"))
  check('...and a failed save returns before it', /const failed = await applySessionEdit\([^\n]*\n\s*if \(failed\) return failed/.test(shortenBody) && /const saved = await applySessionEdit\([^\n]*\n\s*if \(saved\) return saved/.test(rebuildBody))
  check('the way back is worked out by the shared function', /dayWayBack\(/.test(panel.slice(panel.indexOf('const keepWayBack'), panel.indexOf('const dayEditUndo'))))
  const undoBody = panel.slice(panel.indexOf('const dayEditUndo'), panel.indexOf('const dayEditUndo') + 900)
  check('the put-back runs the screen\'s own Undo, told whether a set was logged since', /undoScreenEdit\(dayEdit\.record, mesocycle, Date\.now\(\), saveWeekFor\(profileId\), loggedWorkingToday > dayEdit\.loggedAt\)/.test(undoBody))
  check('...and a refusal is shown, the button kept only while a second tap could work', /setDayEditError\(out\.refusal\)/.test(undoBody) && /if \(!out\.keep\)/.test(undoBody))
  check('the button is drawn only while it can work: not after a set is logged, not after its ten minutes',
    /dayEdit\.canUndo && loggedWorkingToday <= dayEdit\.loggedAt && \(\s*<Button[^>]*data-testid="day-edit-undo"/.test(panel) && /dayEdit\.record\.at \+ SCREEN_UNDO_WINDOW_MS - Date\.now\(\)/.test(panel))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1) }
console.log('\nALL PASSED')
