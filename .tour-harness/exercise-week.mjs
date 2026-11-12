// ---------------------------------------------------------------------------
// EXERCISE WEEK, ON A REAL SCREEN (his Exercise Week handoff, approved 12 Nov 2026;
// docs/design/design_handoff_exercise_week/, docs/plans/exercise-week.md). What he sees at 390x844:
//
//   X1  today: "Program" and "Week" pills, the Monday-to-Sunday strip, a Today card holding only the kicker, the
//       time, the name and Start (no rings, no week counts), and NO week list ("only when you select to view the
//       week"). Every exercise row has its set bar (one segment per set, violet warm-ups then mint working sets), the
//       legend under it, and the load on the right with its blue swatch and a unit. Every row keeps its ⋮.
//   X1b logging: the open card's warm-ups fold into one row with "Log all N warm-ups"; the set rows are the weight
//       box with the plate button inside it, the reps box, the 44px tick; a ticked working set fills its segment and
//       puts the rest timer under that set; "Log set N" still floats.
//   XW3 the week: "Week" opens it in place of the day, one row per day Monday to Sunday, a rest day one quiet line,
//       a done day's ring full; a tap opens a day (ONE at a time) with its first exercises; "Week ▴" closes it.
//
// Screenshots: exercise-week-*.png beside this file.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9911, passed: 'Exercise Week: X1 today, X1b logging, XW3 the week view, at 390px.' })
const { ev, check, finish, until, wait, load, shoot, tapExpr, q, J } = b
const ready = async () => { await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 15000); await wait(1000) }
const card = name => `[...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${J(name)})`

console.log('\nEXERCISE WEEK\n')

// ---- X1. Today ---------------------------------------------------------------
console.log('  X1. TODAY')
await load('dock=1')
await ready()
const target = await ev('window.__rampTarget')
check('X0. the fixture names a day with a ramped, loaded lift', !!target?.date && !!target?.exercise, target)
await load(`dock=1&today=${target.date}`)
await ready()

const head = await ev(`(() => ({ program: document.querySelector('[data-testid="program-pill"]')?.textContent?.trim() ?? null, week: document.querySelector('[data-testid="week-pill"]')?.textContent?.trim() ?? null, weekOpen: document.querySelector('[data-testid="week-pill"]')?.getAttribute('aria-expanded') ?? null, strip: document.querySelectorAll('[data-exercise-strip] [data-strip-day]').length }))()`)
check('X1. the header has "Program" and "Week" pills (Week closed) over a seven-day strip', head.program === 'Program' && head.week === 'Week' && head.weekOpen === 'false' && head.strip === 7, head)
const stripDays = await ev(`[...document.querySelectorAll('[data-exercise-strip] [data-strip-day]')].map(n => n.getAttribute('data-strip-day'))`)
check('X2. the strip runs Monday to Sunday', JSON.stringify(stripDays) === JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']), stripDays)
const hero = await ev(`(() => { const h = document.querySelector('[data-exercise-hero]'); if (!h) return null; return { kicker: /^Today · \\w+day/i.test(h.innerText.trim()), length: h.querySelector('[data-testid="hero-length"]')?.textContent?.trim() ?? null, focus: h.querySelector('[data-testid="hero-focus"]')?.textContent ?? '', start: !!h.querySelector('[data-testid="hero-start"]'), rings: [...h.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().width > 30).length, meta: !!h.querySelector('[data-testid="hero-meta"]'), meter: !!document.querySelector('[data-testid="week-meter"]') } })()`)
check('X3. the Today card is the kicker, the time, the name and Start, and nothing else: no rings, no meta line, no week counts', !!hero && hero.kicker && /^~?\d+ min$/.test(hero.length ?? '') && hero.focus.length > 2 && hero.start && hero.rings === 0 && !hero.meta && !hero.meter, hero)
check('X4. no week list on the day view', !(await ev(`!!${q('[data-testid="exercise-week"]')}`)))
const rows = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => { const bar = c.querySelector('[data-set-bar]'); const badge = c.querySelector('[data-load-badge]'); return { name: c.getAttribute('data-exercise-name'), open: c.hasAttribute('data-exercise-open'), menu: !!c.querySelector('[aria-label="Exercise options"]'), segs: bar ? bar.querySelectorAll('[data-seg]').length : 0, warm: bar ? bar.querySelectorAll('[data-seg="warmup"]').length : 0, work: bar ? bar.querySelectorAll('[data-seg="working"],[data-seg="easy"]').length : 0, legend: c.querySelector('[data-set-legend]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null, load: badge ? badge.innerText.replace(/\\s+/g, ' ').trim() : null, swatch: !!badge?.querySelector('[data-swatch]') } })`)
check('X5. every row has its own ⋮', rows.length >= 3 && rows.every(r => r.menu), rows.map(r => [r.name, r.menu]))
const closedRows = rows.filter(r => !r.open)
check('X6. every row has a set bar, and every closed row the legend under it', rows.every(r => r.segs > 0) && closedRows.length >= 3 && closedRows.every(r => !!r.legend), rows.map(r => [r.name, r.open, r.segs, r.legend]))
const withLoad = rows.filter(r => r.load)
check('X7. every load on a row has its blue swatch and says its unit or kind ("kg", "BW", "Band")', withLoad.length >= 2 && withLoad.every(r => r.swatch && /(\d\s*kg|^BW|Band|bodyweight)/i.test(r.load)), withLoad.map(r => [r.name, r.load]))
const ramped = rows.find(r => r.name === target.exercise)
check('X8. the ramped lift\'s bar has its warm-ups (violet) before its working sets, and the legend counts both', !!ramped && ramped.warm >= 2 && ramped.work >= 2 && new RegExp(`^${ramped.warm} warm-up .+ working$`).test(ramped.legend ?? ''), ramped)
await ev('window.scrollTo(0, 0)'); await wait(300)
await shoot('exercise-week-x1')

// ---- XW3. The week -----------------------------------------------------------
console.log('\n  XW3. THE WEEK')
check('W1. "Week" opens the week view', (await tapExpr(q('[data-testid="week-pill"]'))) && !!(await until(`!!${q('[data-testid="exercise-week"]')}`, 4000)))
const wk = await ev(`(() => { const w = ${q('[data-testid="exercise-week"]')}; const days = w ? [...w.querySelectorAll('[data-week-day]')] : []; return { pill: document.querySelector('[data-testid="week-pill"]')?.getAttribute('aria-expanded'), n: days.length, rest: days.filter(d => d.getAttribute('data-week-day-kind') === 'rest').length, restBtn: days.filter(d => d.getAttribute('data-week-day-kind') === 'rest' && d.querySelector('button')).length, strip: !!document.querySelector('[data-exercise-strip]'), hero: !!document.querySelector('[data-exercise-hero]'), dayRows: document.querySelectorAll('[data-exercise-name]').length, line: document.querySelector('[data-testid="week-view-line"]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null, range: document.querySelector('[data-testid="week-view-range"]')?.textContent?.trim() ?? null, start: !!document.querySelector('[data-testid="start-bar"]') } })()`)
check('W2. seven days, the day\'s workout, strip and Start gone from the screen while the week is open', wk.n === 7 && !wk.strip && !wk.hero && wk.dayRows === 0 && !wk.start && wk.pill === 'true', wk)
check('W3. a rest day is one quiet line, not a tappable row', wk.rest >= 1 && wk.restBtn === 0, wk)
check('W4. the week line says sessions done of planned, and the kicker the dates', /^\d+ of \d+ sessions done/.test(wk.line ?? '') && /\d+ .*[A-Z][a-z]{2}/.test(wk.range ?? ''), { line: wk.line, range: wk.range })
const sessionDays = (await ev(`[...document.querySelectorAll('[data-week-day][data-week-day-kind="session"]')].map(d => ({ date: d.getAttribute('data-week-day'), mins: d.querySelector('[data-week-day-minutes]')?.textContent ?? '', line: d.querySelector('[data-week-day-line]')?.textContent ?? '', title: d.querySelector('[data-week-day-title]')?.textContent ?? '' }))`)) ?? []
check('W5. each session row names its focus and main lift with its weight, and its minutes', sessionDays.length >= 2 && sessionDays.every(d => /^\d+$/.test(d.mins) && d.title.includes(' · ') && d.line.length > 2), sessionDays)
await shoot('exercise-week-xw3')
const openDay = i => tapExpr(`[...document.querySelectorAll('[data-week-day][data-week-day-kind="session"] > button')][${i}]`)
await openDay(0); await wait(400)
const open1 = await ev(`[...document.querySelectorAll('[data-week-day][data-week-day-open="yes"]')].map(d => ({ date: d.getAttribute('data-week-day'), list: d.querySelectorAll('[data-week-day-exercises] [aria-label="Exercise options"]').length, total: Number(d.querySelector('[data-week-day-exercises]')?.getAttribute('data-week-day-total') ?? NaN), bars: d.querySelectorAll('[data-set-bar]').length, more: d.querySelector('[data-testid="week-day-more"]')?.textContent?.trim() ?? null }))`)
check('W6. a tap opens that day in place, with its first exercises (each with its ⋮ and set bar) and a way to the rest', open1.length === 1 && open1[0].date === sessionDays[0]?.date && open1[0].list >= 1 && open1[0].list < open1[0].total && open1[0].bars === open1[0].list && open1[0].more === `${open1[0].total - open1[0].list} more exercise${open1[0].total - open1[0].list === 1 ? '' : 's'}`, open1)
await openDay(1); await wait(400)
const open2 = await ev(`[...document.querySelectorAll('[data-week-day][data-week-day-open="yes"]')].map(d => d.getAttribute('data-week-day'))`)
check('W7. opening another day closes the first: ONE open at a time', open2.length === 1 && open2[0] === sessionDays[1]?.date, open2)
await shoot('exercise-week-xw3-open')
await openDay(1); await wait(300)
check('W8. tapping the open day again closes it', (await ev(`document.querySelectorAll('[data-week-day][data-week-day-open="yes"]').length`)) === 0)
check('W9. "Week ▴" closes the week and today\'s workout is back', (await tapExpr(q('[data-testid="week-pill"]'))) && !!(await until(`!${q('[data-testid="exercise-week"]')} && !!document.querySelector('[data-exercise-hero]') && document.querySelectorAll('[data-exercise-name]').length > 0`, 4000)))

// ---- X1b. Logging ------------------------------------------------------------
console.log('\n  X1b. LOGGING')
const X = target.exercise
check('L0. Start starts the session', (await tapExpr(q('[data-testid="hero-start"]'))) && !!(await until(`/in progress/i.test(document.querySelector('[data-exercise-hero]')?.innerText ?? '') && !!${q('[data-testid="hero-sets"]')}`, 5000)))
if (!(await ev(`${card(X)}?.hasAttribute('data-exercise-open')`))) { await tapExpr(`${card(X)}?.querySelector('[role="button"]')`); await wait(700) }
const fold = await ev(`(() => { const c = ${card(X)}; const t = c?.querySelector('[data-testid="warmup-caption"]'); return { caption: t ? t.innerText.replace(/\\s+/g, ' ').trim() : null, all: c?.querySelector('[data-testid="log-all-warmups"]')?.textContent?.trim() ?? null, open: t?.getAttribute('aria-expanded') } })()`)
check('L1. the warm-ups are one folded row, and "Log all N warm-ups" is there while it is open', /WARM-UP/i.test(fold.caption ?? '') && fold.open === 'true' && /^Log all \d+ warm-ups$/.test(fold.all ?? ''), fold)
const row = await ev(`(() => { const r = ${card(X)}?.querySelectorAll('[data-testid="working-row"]')[0]; if (!r) return null; const tick = r.querySelector('button[aria-label^="Save"]')?.getBoundingClientRect(); const box = r.querySelector('input')?.getBoundingClientRect(); const plate = r.querySelector('[data-testid="row-plate-calc"]')?.getBoundingClientRect(); return { tick: tick ? [Math.round(tick.width), Math.round(tick.height)] : null, plateIn: !!plate && !!box && plate.left >= box.left && plate.right <= box.right, kg: !!r.querySelector('[data-unit="kg"]'), reps: r.querySelectorAll('input').length >= 2 } })()`)
check('L2. a set row: weight box with the plate button inside it and its unit, a reps box, a 44px tick', !!row && row.plateIn && row.kg && row.reps && row.tick?.[0] >= 44 && row.tick?.[1] >= 44, row)
const filled = () => ev(`${card(X)}?.querySelectorAll('[data-set-bar] [data-seg="working"][data-seg-done="yes"]').length ?? -1`)
const f0 = await filled()
await ev(`${card(X)}?.querySelector('[data-testid="warmup-caption"]')?.scrollIntoView({ block: 'start' })`); await wait(400)
await shoot('exercise-week-x1b')
await b.tick(X, 0); await wait(600)
const f1 = await filled()
check('L3. ticking working set 1 fills ONE working segment of the bar', f0 === 0 && f1 === 1, { f0, f1 })
const rest = await ev(`(() => { const c = ${card(X)}; const r = c?.querySelector('[data-testid="inline-rest"]'); const rows = [...(c?.querySelectorAll('[data-testid="working-row"]') ?? [])]; if (!r || rows.length < 2) return null; return { after1: !!(rows[0].compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING), before2: !!(r.compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING) } })()`)
check('L4. ...and puts the rest timer right under set 1', !!rest && rest.after1 && rest.before2, rest)
const nextSet = await ev(`document.querySelector('[data-next-set-button]')?.textContent?.trim() ?? null`)
check('L5. the "Log set" button still floats above the tab bar (here the next row is a warm-up)', /^Log (set|warm-up) \d+ · /.test(nextSet ?? ''), nextSet)
await ev(`${card(X)}?.querySelector('[data-testid="inline-rest"]')?.scrollIntoView({ block: 'center' })`); await wait(500)
await shoot('exercise-week-x1b-rest')

// ---- XW3 again: a finished day ------------------------------------------------
console.log('\n  XW3. A FINISHED DAY')
const { byText, escape } = b
await ev('window.scrollTo(0, 0)'); await wait(250)
check('D0. Finish session (and "Finish" with sets left) ends the day', (await tapExpr(byText('Finish session'))) && !!(await until(`!!${q('[data-testid="finish-anyway"]')}`, 4000)) && (await tapExpr(q('[data-testid="finish-anyway"]'))) && !!(await until(`[...document.querySelectorAll('[role="dialog"] h2')].some(h => /^Session (complete|saved)$/.test(h.textContent))`, 8000)))
await escape(); await wait(500)
await tapExpr(q('[data-testid="week-pill"]')); await until(`!!${q('[data-testid="exercise-week"]')}`, 4000); await wait(400)
const days = await ev(`[...document.querySelectorAll('[data-week-day]')].map(d => ({ date: d.getAttribute('data-week-day'), kind: d.getAttribute('data-week-day-kind'), done: d.getAttribute('data-week-day-done'), ring: d.querySelector('[data-day-ring]')?.getAttribute('data-day-ring') ?? null, label: d.querySelector('[data-week-day-status="done"]')?.textContent ?? null }))`)
const todayRow = days.find(d => d.date === target.date)
check('D1. today\'s row is done: its ring full, "Done" in place of the chevron', !!todayRow && todayRow.done === 'yes' && todayRow.ring === 'full' && todayRow.label === 'Done', todayRow)
check('D2. and a day still to come has an empty ring and no "Done"', days.some(d => d.kind === 'session' && d.date > target.date && d.ring === 'empty' && d.label === null), days)
const line = await ev(`document.querySelector('[data-testid="week-view-line"] > span')?.textContent ?? ''`)
check('D3. the week line counts it: "1 of N sessions done"', /^1 of \d+ sessions done/.test(line.replace(/\s+/g, ' ').trim()), line)
await ev('window.scrollTo(0, 0)'); await wait(300)
await shoot('exercise-week-xw3-done')

finish()
