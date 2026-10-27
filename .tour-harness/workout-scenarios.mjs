// ---------------------------------------------------------------------------
// WORKOUT CHANGES IN COMBINATION, ON THE REAL SCREEN — Ashley, 27 Oct 2026: "make sure that a user can just ...
// swap a day, miss a day, or change a workout ... not make mistakes, and not break."
//
// scripts/test-workout-scenarios.ts chains the changes against the real writers and readers. This holds what only a
// screen shows: what the day menu OFFERS on the days that used to go wrong, and that tapping it lands on the strip.
//
//   A. A PART-TRAINED DAY. Two working sets logged today, then "What happened?". The menu offered "missed", "rest"
//      and "move" — writes the strip ignores, because logged work outranks every note on a day — so Home said
//      "moved" while the strip said part-done. Now it offers only what acts on the rest of the session.
//   B. A PRESCRIBED WALK (?walker=1, the starting-out plan every beginner gets). The strip calls a walk missed, and
//      the menu said "No session was planned" on it: no way to miss it, rest it or move it. Now it can.
//
// Rows are seeded through window.__seedDb (INPUT only: rows as the database holds them). The clock is the
// harness's one anchor (.tour-harness/anchor.mjs).
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'
import { anchorDate, DAY_NAMES } from './anchor.mjs'

const b = await boot({ debugPort: 9681, passed: 'A part-trained day offers only what acts on what is left; a walk can be missed, rested and moved.' })
const { ev, check, finish, tapExpr, q, until, wait, load, beforeLoad, shoot, escape, J } = b

const TODAY_NAME = DAY_NAMES[anchorDate().getDay()]
const cell = day => ev(`(() => { const n = document.querySelector('[aria-label^="${day}:"]'); return n ? n.getAttribute('aria-label') : null })()`)
const untilCell = async (day, re) => { let c = await cell(day); for (let i = 0; i < 20 && !re.test(c || ''); i++) { await wait(300); c = await cell(day) } return c }
const verbs = () => ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
const sheetOpen = () => ev(`!!document.querySelector('[data-testid="what-happened-sheet"]')`)
const openSheet = async () => {
  if (await sheetOpen()) await escape()
  await tapExpr(q('button[aria-label="More options"]'))
  await wait(400)
  if (!(await ev(`!!document.querySelector('[data-testid="what-happened-item"]')`))) return 'no-menu-item'
  await tapExpr(q('[data-testid="what-happened-item"]'))
  await wait(600)
  return (await sheetOpen()) ? 'open' : 'no-sheet'
}
const untilClosed = async () => { for (let i = 0; i < 20 && await sheetOpen(); i++) await wait(250); return !(await sheetOpen()) }
const ready = async () => { await until(`document.querySelectorAll('[aria-label$=": due"], [aria-label$=": missed"], [aria-label$=": rest day"], [aria-label$=": partly done"]').length > 0`, 12000); await wait(900) }

console.log('\nWORKOUT CHANGES IN COMBINATION — on the screen\n')

// ---- A. A part-trained day --------------------------------------------------------------------------------------
console.log('  A. A PART-TRAINED DAY')
await beforeLoad(`window.__seedDb = undefined`)
await load('')
await ready()
const names = (await until(`(() => { const n = [...document.querySelectorAll('[data-exercise-name]')].map(c => c.getAttribute('data-exercise-name')); return n.length ? n : null })()`, 12000)) ?? []
check(`A0. today (${TODAY_NAME}) has a session to part-train`, names.length >= 2 && /: due$/.test(await cell(TODAY_NAME) || ''), { names, cell: await cell(TODAY_NAME) })
// The control first: before anything is logged, the same menu DOES offer move, rest and missed.
const opened0 = (await openSheet()) === 'open'
const v0 = await verbs()
check('A1. with nothing logged, the same menu offers move, rest and missed (the control)', opened0 && Array.isArray(v0) && ['move', 'rest', 'missed'].every(v => v0.includes(v)), v0)
await escape()
await beforeLoad(`window.__seedDb = (db, ctx) => {
  db.workout_sessions.push({ id: 'ws-part', profile_id: ctx.profileId, date: ctx.today, split_type: 'training', day: null, week_number: null, duration_minutes: 20, is_completed: false, started_at: ctx.today + 'T10:00:00' })
  for (let s = 1; s <= 2; s++) db.exercise_set_logs.push({ id: 'part-' + s, user_id: ctx.profileId, session_id: 'ws-part', date: ctx.today, exercise_name: ${J(names[0] ?? '')}, set_number: s, weight_kg: 10, reps_completed: 10, is_bodyweight: false, is_warmup: false, drop_index: 0, completed_at: ctx.today + 'T10:0' + s + ':00', created_at: ctx.today + 'T10:0' + s + ':00' })
}`)
await load('')
await ready()
check('A2. two sets logged: the strip calls today partly done', /: partly done$/.test(await untilCell(TODAY_NAME, /partly done/) || ''), await cell(TODAY_NAME))
check('A3. the day menu opens', (await openSheet()) === 'open')
const vPart = await verbs()
check('A4. IT DOES NOT OFFER "missed", "rest", "move" OR "something else" ON A DAY ALREADY TRAINED ON',
  Array.isArray(vPart) && !vPart.some(v => ['missed', 'rest', 'move', 'something_else'].includes(v)), vPart)
check('A5. ...and still offers the changes that act on what is left', Array.isArray(vPart) && vPart.includes('shorten'), vPart)
check('A6. ...and does not offer to redraw a started session', Array.isArray(vPart) && !vPart.includes('rebuild') && !vPart.includes('kind'), vPart)
await shoot('workout-scenarios-part-trained')
await escape()

// ---- B. A prescribed walk ------------------------------------------------------------------------------------------
console.log('\n  B. A PRESCRIBED WALK')
await beforeLoad(`window.__seedDb = undefined`)
await load('walker=1')
await ready()
// The first day BEFORE today the strip calls missed: a walk that was prescribed and not logged.
const order = DAY_NAMES.slice(1).concat(DAY_NAMES[0])
const pastWalk = await ev(`(() => { const days = ${J(order)}; const t = days.indexOf(${J(TODAY_NAME)});
  for (let i = t - 1; i >= 0; i--) { const n = document.querySelector('[aria-label^="' + days[i] + ':"]'); if (n && /: missed$/.test(n.getAttribute('aria-label'))) return days[i] } return null })()`)
check('B0. a past walk the strip calls missed exists this week', typeof pastWalk === 'string', pastWalk)
check('B1. peeking it', await tapExpr(q(`[aria-label^="${pastWalk}:"]`)) && (await wait(700), true))
check('B2. ...and the day menu opens for THAT day', (await openSheet()) === 'open' && new RegExp(pastWalk ?? '^$').test(await ev(`document.querySelector('[data-testid="what-happened-sheet"] h2')?.innerText || ''`)),
  await ev(`document.querySelector('[data-testid="what-happened-sheet"]')?.innerText?.slice(0, 160)`))
const sheetText = await ev(`document.querySelector('[data-testid="what-happened-sheet"]')?.innerText || ''`)
const vWalk = await verbs()
check('B3. IT NO LONGER SAYS "No session was planned" ON A WALK DAY', !/no session was planned/i.test(sheetText), sheetText.slice(0, 200))
check('B4. ...it offers missed, move and rest', Array.isArray(vWalk) && ['missed', 'move', 'rest'].every(v => vWalk.includes(v)), vWalk)
check('B5. ...and not "I did it, not in the app", which asks for sets a walk does not have', Array.isArray(vWalk) && !vWalk.includes('did_elsewhere'), vWalk)
await shoot('workout-scenarios-walk-menu')
check('B6. "Make it a rest day" on the walk', await ev(`(() => { const n = ${q('[data-verb="rest"]')}; if (!n) return false; n.click(); return true })()`) && await untilClosed())
check('B7. ...the strip reads it as a rest day she chose', /rest day you chose/.test(await untilCell(pastWalk, /rest day you chose/) || ''), await cell(pastWalk))
check('B8. ...and the rest can be unsaid', (await openSheet()) === 'open'
  && await ev(`(() => { const n = ${q('button[aria-label="Undo the rest day"]')}; if (!n) return false; n.click(); return true })()`)
  && await untilClosed() && /: missed$/.test(await untilCell(pastWalk, /missed$/) || ''), await cell(pastWalk))
check('B9. a walk marked missed stays missed and says so', (await openSheet()) === 'open'
  && await ev(`(() => { const n = ${q('[data-verb="missed"]')}; if (!n) return false; n.click(); return true })()`)
  && (await until(`!!document.querySelector('[data-testid="what-happened-missed-recorded"]') || !document.querySelector('[data-testid="what-happened-sheet"]')`, 6000))
  && (await ev(`(window.__fakeDb?.workout_sessions ?? []).some(r => r.marked_missed === true)`)) === true,
  await ev(`(window.__fakeDb?.workout_sessions ?? []).map(r => ({ d: r.date, m: r.marked_missed }))`))
await escape()

finish()
