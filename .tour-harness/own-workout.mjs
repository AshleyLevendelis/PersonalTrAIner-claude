// ---------------------------------------------------------------------------
// YOUR OWN WORKOUT (his request 25 Nov 2026): "on a blank day ... you should just be able to start exercising ... add
// it ... put in the reps, put in the time ... start your own rest timer ... finish the rest time ... Likewise, you can
// log it after you've done it ... on a blank day, or even on a day that you've trained once." A SEPARATE workout, not
// sets added to the plan's ("The I also did button just adds sets to the existing workout").
//
// Drives the real Exercise tab at 390x844: a rest day today (start, search, a set, your own rest, another set, an
// Undo, cardio, a name, Finish, the day's card, the day marked trained), a second workout on the same day that never
// writes over the first's sets, the training day's "separate" wording that leaves the plan's day alone, a past day
// logged after the fact, and a workout opened and closed with nothing in it leaving no card.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const PORT = 9617
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}
let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 360)}` : ''}`) }
}
const until = async (expr, ms = 8000) => { for (let i = 0; i < ms / 250; i++) { const v = await ev(expr); if (v) return v; await wait(250) } return ev(expr) }
const q = s => `document.querySelector(${JSON.stringify(s)})`
const textOf = s => ev(`${q(s)}?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
// A dispatched click at the element's centre (a bare .click() can open and shut a row in one tick).
const tap = async sel => {
  const at = await ev(`(() => { const e = ${q(sel)}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!at) return false
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 })
  return true
}
const tapText = async (scope, re) => ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find(x => ${re}.test((x.textContent || '').trim())); if (!b) return false; b.click(); return true })()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let loads = 0
const load = async (extra, tab = 'exercise') => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=${loads}${extra}#/tab/${tab}` })
  await wait(4000)
}
const type = async (sel, value, nth = 0) => {
  await ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!e) return false; e.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await wait(150)
}
const tapNth = async (sel, nth) => ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!e) return false; e.click(); return true })()`)
const sets = date => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.date === ${JSON.stringify(date)} || (r.completed_at ?? '').startsWith(${JSON.stringify(date)})).map(r => ({ n: r.exercise_name, s: r.set_number, kg: Number(r.weight_kg), r: r.reps_completed, at: r.completed_at }))`)
const cardio = date => ev(`(window.__fakeDb?.cardio_logs ?? []).filter(r => r.date === ${JSON.stringify(date)}).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe, km: r.distance_km }))`)
const sessionDone = date => ev(`(window.__fakeDb?.workout_sessions ?? []).some(r => r.date === ${JSON.stringify(date)} && r.is_completed)`)

console.log('\nYOUR OWN WORKOUT\n')
await load('')
const rest = await ev('window.__restDayTarget ?? null')
const anchor = await ev(`document.querySelector('[data-exercise-strip] [aria-current="date"]')?.getAttribute('data-strip-date') ?? null`)
check('0. the fixture has a rest day and a training day today', !!rest?.date && !!anchor && rest.date !== anchor, { rest, anchor })

console.log('\n  A. A rest day: start your own workout')
await load(`&today=${rest?.date}`)
await until(q('[data-testid="own-start"]'))
check('A1. the rest day offers "Start your own workout"', (await textOf('[data-testid="own-start"]')) === 'Start your own workout', await textOf('[data-testid="own-start"]'))
await tap('[data-testid="own-start"]'); await until(`!!document.querySelector('[data-testid="own-choose-empty"]')`, 3000); await tap('[data-testid="own-choose-empty"]')
await until(q('[data-testid="own-workout"]'))
check('A2. it opens a workout of its own, full screen, with the search open', !!(await ev(`!!document.querySelector('[data-testid="own-search"]')`)) && /^Today · /i.test((await textOf('[data-testid="own-kicker"]')) ?? ''), await textOf('[data-testid="own-kicker"]'))
await type('[data-testid="own-search"]', 'bench')
await until(q('[data-testid="own-search-result"]'))
const first = await ev(`${q('[data-testid="own-search-result"]')}?.getAttribute('data-name') ?? null`)
check('A3. typing "bench" finds catalogue exercises', /bench/i.test(first ?? ''), first)
await tap('[data-testid="own-search-result"]'); await wait(400)
check('A4. picking one adds it with one empty set', (await ev(`document.querySelectorAll('[data-testid="own-lift"]').length`)) === 1 && (await ev(`document.querySelectorAll('[data-testid="own-set"]').length`)) === 1)
await type('[data-testid="own-weight"]', '60'); await type('[data-testid="own-reps"]', '8')
await tap('[data-testid="own-tick"]'); await wait(1500)
const a5 = await sets(rest?.date)
check('A5. ticking the set saves it, on that day, as set 1: 60 kg x 8', a5?.length === 1 && a5[0].n === first && a5[0].s === 1 && a5[0].kg === 60 && a5[0].r === 8, a5)
check('A6. ...and the tick shows it done', (await ev(`${q('[data-testid="own-set"]')}?.getAttribute('data-done')`)) === 'true')

// YOUR OWN REST: the length is his, Start runs it, Done ends it.
check('A7. after a set, your own rest is offered at 1:30', (await textOf('[data-testid="own-rest-length"]')) === '1:30', await textOf('[data-testid="own-rest-length"]'))
await tap('[data-testid="own-rest-plus"]'); await wait(200)
check('A8. + makes it 2 min', (await textOf('[data-testid="own-rest-length"]')) === '2 min', await textOf('[data-testid="own-rest-length"]'))
await tap('[data-testid="own-rest-start"]'); await wait(1200)
const left = await textOf('[data-testid="own-rest-left"]')
check('A9. Start runs it: the clock counts down from 2:00', /^1:5\d$|^2:00$/.test(left ?? ''), left)
await shoot('own-workout-rest')
await tap('[data-testid="own-rest-done"]')
await until(`!document.querySelector('[data-testid="own-rest-running"]') && !!document.querySelector('[data-testid="own-rest-start"]')`, 3000)
check('A10. Done ends it, and the Start is back', await ev(`!document.querySelector('[data-testid="own-rest-running"]') && !!document.querySelector('[data-testid="own-rest-start"]')`))

await tap('[data-testid="own-add-set"]'); await wait(300)
const prefill = await ev(`[...document.querySelectorAll('[data-testid="own-set"]')].map(r => [...r.querySelectorAll('input')].map(i => i.value).join('x'))`)
check('A11. Add set gives set 2, filled with set 1\'s numbers', JSON.stringify(prefill) === JSON.stringify(['60x8', '60x8']), prefill)
await tapNth('[data-testid="own-tick"]', 1); await wait(1500)
check('A12. ticked, it is set 2 in the log', (await sets(rest?.date))?.map(s => s.s).join() === '1,2', await sets(rest?.date))
await tapNth('[data-testid="own-tick"]', 1); await wait(1500)
check('A13. tapping the tick again takes set 2 back off the log', (await sets(rest?.date))?.map(s => s.s).join() === '1', await sets(rest?.date))

await tap('[data-testid="own-add-cardio"]'); await wait(300)
await tap('[data-testid="own-cardio-pick"]'); await wait(300)
await tapNth('[data-testid="own-cardio-effort"]', 2); await wait(200)
await tap('[data-testid="own-cardio-tick"]'); await wait(1500)
const c = await cardio(rest?.date)
check('A14. cardio: a chip, Hard, the tick saves it with its minutes and a hard effort', c?.length === 1 && c[0].m > 0 && c[0].rpe >= 7, c)
await type('[data-testid="own-name"]', 'Push day')
await shoot('own-workout-live')
await tap('[data-testid="own-finish"]')
await until(q('[data-testid="own-done"]'))
const doneLine = await textOf('[data-testid="own-done-line"]')
check('A15. Finish says what was saved: 1 exercise, 1 set, 1 cardio', doneLine === 'Saved · 1 exercise · 1 set · 1 cardio', doneLine)
check('A16. ...and the rest day is now marked trained', await sessionDone(rest?.date))
await tap('[data-testid="own-done-close"]'); await wait(600)
const card = await textOf('[data-testid="own-day-workout"]')
check('A17. the day shows it as a workout of its own, by name, with what was in it', /Push day/.test(card ?? '') && /1 exercise · 1 set · 1 cardio/.test(card ?? ''), card)

console.log('\n  B. A second workout the same day never writes over the first')
await tap('[data-testid="own-start"]'); await until(`!!document.querySelector('[data-testid="own-choose-empty"]')`, 3000); await tap('[data-testid="own-choose-empty"]')
await until(q('[data-testid="own-search"]'))
await type('[data-testid="own-search"]', 'bench')
await until(q('[data-testid="own-search-result"]'))
await ev(`[...document.querySelectorAll('[data-testid="own-search-result"]')].find(b => b.getAttribute('data-name') === ${JSON.stringify(first)})?.click()`); await wait(400)
await type('[data-testid="own-weight"]', '70'); await type('[data-testid="own-reps"]', '5')
await tap('[data-testid="own-tick"]'); await wait(1500)
const b1 = await sets(rest?.date)
check('B1. the same lift in a second workout is set 2; set 1 (60 x 8) is untouched', b1?.length === 2 && b1.find(s => s.s === 1)?.kg === 60 && b1.find(s => s.s === 2)?.kg === 70, b1)
await tap('[data-testid="own-finish"]'); await until(q('[data-testid="own-done"]'))
await tap('[data-testid="own-done-close"]'); await wait(600)
check('B2. the day lists both workouts', (await ev(`document.querySelectorAll('[data-testid="own-day-workout"]').length`)) === 2)

console.log('\n  C. Opened and closed with nothing in it, it leaves nothing')
await tap('[data-testid="own-start"]'); await until(`!!document.querySelector('[data-testid="own-choose-empty"]')`, 3000); await tap('[data-testid="own-choose-empty"]'); await until(q('[data-testid="own-search"]'))
await tap('[data-testid="own-close"]'); await wait(600)
check('C1. no empty card is left on the day', (await ev(`document.querySelectorAll('[data-testid="own-day-workout"]').length`)) === 2)

console.log('\n  D. A past day, logged after the fact')
await tap('[data-testid="strip-prev"]'); await wait(800)
const past = await ev(`(() => { const ds = [...document.querySelectorAll('[data-strip-date]')].map(e => e.getAttribute('data-strip-date')).filter(d => d < ${JSON.stringify(rest?.date)}).sort(); return ds[ds.length - 1] ?? null })()`)
await tap(`[data-strip-date="${past}"]`); await wait(1200)
check('D1. a past day offers "Log a workout you did"', (await textOf('[data-testid="own-start"]')) === 'Log a workout you did', { past, t: await textOf('[data-testid="own-start"]') })
await tap('[data-testid="own-start"]'); await until(`!!document.querySelector('[data-testid="own-choose-empty"]')`, 3000); await tap('[data-testid="own-choose-empty"]'); await until(q('[data-testid="own-search"]'))
check('D2. it opens as a log of that day, with no ticks and no timer', /^Logging · /i.test((await textOf('[data-testid="own-kicker"]')) ?? '') && !(await ev(`!!document.querySelector('[data-testid="own-elapsed"]')`)), await textOf('[data-testid="own-kicker"]'))
await type('[data-testid="own-search"]', 'leg press')
await until(q('[data-testid="own-search-result"]'))
const lp = await ev(`${q('[data-testid="own-search-result"]')}?.getAttribute('data-name') ?? null`)
await tap('[data-testid="own-search-result"]'); await wait(400)
check('D3. ...no tick on its set rows', !(await ev(`!!document.querySelector('[data-testid="own-tick"]')`)))
await type('[data-testid="own-weight"]', '120'); await type('[data-testid="own-reps"]', '10')
await tap('[data-testid="own-add-set"]'); await wait(300)
await type('[data-testid="own-reps"]', '9', 1)
await tap('[data-testid="own-save"]')
await until(q('[data-testid="own-done"]'), 8000)
const d4 = (await sets(past))?.filter(s => s.n === lp)
check('D4. Save writes both sets to that day, at its noon: 120 x 10 and 120 x 9', d4?.length === 2 && d4.every(s => s.kg === 120 && (s.at ?? '').includes(`${past}T`)) && d4.map(s => s.r).sort().join() === '10,9', d4)
check('D5. ...and says where it went', /^Saved to /.test((await textOf('[data-testid="own-done-line"]')) ?? ''), await textOf('[data-testid="own-done-line"]'))
await shoot('own-workout-after')
await tap('[data-testid="own-done-close"]'); await wait(600)

console.log('\n  E. A training day: a SEPARATE workout, and the plan\'s day stays the plan\'s')
await load('')
await until(q('[data-testid="own-start"]'))
check('E1. beside the plan\'s session it reads "Start a separate workout"', (await textOf('[data-testid="own-start"]')) === 'Start a separate workout', await textOf('[data-testid="own-start"]'))
await tap('[data-testid="own-start"]'); await until(`!!document.querySelector('[data-testid="own-choose-empty"]')`, 3000); await tap('[data-testid="own-choose-empty"]'); await until(q('[data-testid="own-search"]'))
await type('[data-testid="own-search"]', 'curl'); await until(q('[data-testid="own-search-result"]'))
await tap('[data-testid="own-search-result"]'); await wait(400)
await type('[data-testid="own-weight"]', '12'); await type('[data-testid="own-reps"]', '12')
await tap('[data-testid="own-tick"]'); await wait(1500)
await tap('[data-testid="own-finish"]'); await until(q('[data-testid="own-done"]'))
check('E2. finishing it does not mark the plan\'s day done (the plan\'s session is still to do)', !(await sessionDone(anchor)))
await tap('[data-testid="own-done-close"]'); await wait(600)
check('E3. the plan\'s session is still on the card, Start and all, with his workout listed under it', await ev(`!!document.querySelector('[data-testid="hero-start"]') && !!document.querySelector('[data-testid="own-day-workout"]')`))

console.log('\n  F. A day ahead: plan one, never start or log one')
const ahead = await ev(`(() => { const ds = [...document.querySelectorAll('[data-strip-date]')].map(e => e.getAttribute('data-strip-date')).filter(d => d > ${JSON.stringify(anchor)}).sort(); return ds[0] ?? null })()`)
await tap(`[data-strip-date="${ahead}"]`); await wait(1200)
check('F1. a day ahead offers to PLAN one, never to start or log one (nothing to log ahead of time)', !!ahead && (await textOf('[data-testid="own-start"]')) === 'Plan a workout', { ahead, t: await textOf('[data-testid="own-start"]') })

console.log('\n  G. My workouts: build one ahead, put it on a day, start it there')
const plansRows = () => ev(`(window.__fakeDb?.own_workouts ?? []).map(r => ({ name: r.name, on: r.on_dates, deleted: !!r.deleted, items: (r.items ?? []).length }))`)
await load('')
await until(`!!document.querySelector('[data-strip-date="${ahead}"]')`)
await tap(`[data-strip-date="${ahead}"]`); await wait(1200)
check('G1. a day ahead offers "Plan a workout"', (await textOf('[data-testid="own-start"]')) === 'Plan a workout', await textOf('[data-testid="own-start"]'))
await tap('[data-testid="own-start"]'); await wait(400)
check('G2. ...a choice with no empty workout (nothing to log ahead) and "Build a new workout"', await ev(`!document.querySelector('[data-testid="own-choose-empty"]') && !!document.querySelector('[data-testid="own-choose-build"]')`))
await tap('[data-testid="own-choose-build"]'); await until(`!!document.querySelector('[data-testid="own-plan-editor"]')`)
await type('[data-testid="own-plan-name"]', 'Push')
await until(`!!document.querySelector('[data-testid="own-search"]')`)
await type('[data-testid="own-search"]', 'bench'); await until(`!!document.querySelector('[data-testid="own-search-result"]')`)
await tap('[data-testid="own-search-result"]'); await wait(400)
check('G3. an exercise goes in at 3 sets of 8-10 with 90 s rest', (await textOf('[data-testid="own-plan-sets"]')) === '3 sets' && (await ev(`document.querySelector('[data-testid="own-plan-reps"]')?.value`)) === '8-10' && (await textOf('[data-testid="own-plan-rest"]')) === '1:30')
await tap('[data-testid="own-plan-sets-plus"]'); await wait(150)
await type('[data-testid="own-plan-reps"]', '6'); await type('[data-testid="own-plan-weight"]', '60')
await tap('[data-testid="own-plan-rest-plus"]'); await wait(150)
await tap('[data-testid="own-plan-add-cardio"]'); await wait(300)
await tap('[data-testid="own-plan-cardio-pick"]'); await wait(300)
await shoot('own-workout-build')
await tap('[data-testid="own-plan-save"]'); await wait(1200)
const planned = await textOf('[data-testid="own-day-planned"]')
check('G4. saved from that day, it is on that day: "Push · 1 exercise · 4 sets · 1 cardio"', /Push/.test(planned ?? '') && /1 exercise · 4 sets · 1 cardio/.test(planned ?? ''), planned)
const r1 = await plansRows()
check('G5. ...and sent to the table with the day on it', r1?.length === 1 && r1[0].name === 'Push' && (r1[0].on ?? []).includes(ahead) && r1[0].items === 2, r1)
await tap('[data-testid="own-day-unplan"]'); await wait(800)
check('G6. "Take off" takes it off the day (it stays in your workouts)', await ev(`!document.querySelector('[data-testid="own-day-planned"]')`) && (await plansRows())?.[0]?.on?.length === 0, await plansRows())
await tap('[data-testid="own-start"]'); await wait(300)
await tap('[data-testid="own-choose-plan-go"]'); await wait(800)
check('G7. picking it from your workouts puts it back on the day', /Push/.test((await textOf('[data-testid="own-day-planned"]')) ?? ''))

await load(`&today=${ahead}`)
await until(`!!document.querySelector('[data-testid="own-day-planned-start"]')`)
check('G8. on the day itself it has a Start', (await textOf('[data-testid="own-day-planned-start"]')) === 'Start')
await tap('[data-testid="own-day-planned-start"]'); await until(`!!document.querySelector('[data-testid="own-workout"]')`)
const pre = await ev(`[...document.querySelectorAll('[data-testid="own-set"]')].map(r => [...r.querySelectorAll('input')].map(i => i.value).join('x'))`)
check('G9. Start opens it ready: named Push, 4 sets of 60 x 6 in the boxes', (await ev(`document.querySelector('[data-testid="own-name"]')?.value`)) === 'Push' && JSON.stringify(pre) === JSON.stringify(['60x6', '60x6', '60x6', '60x6']), pre)
check('G10. ...a cardio waiting, and nothing logged yet', (await ev(`document.querySelectorAll('[data-testid="own-cardio"]').length`)) === 1 && (await sets(ahead))?.length === 0)
await tap('[data-testid="own-tick"]'); await wait(1500)
await tap('[data-testid="own-rest-start"]'); await wait(1000)
check('G11. his rest from the plan: 2 min', /^1:5\d$|^2:00$/.test((await textOf('[data-testid="own-rest-left"]')) ?? ''), await textOf('[data-testid="own-rest-left"]'))
await tap('[data-testid="own-rest-done"]'); await wait(300)
check('G12. the ticked set is logged on that day as 60 x 6', (await sets(ahead))?.length === 1 && (await sets(ahead))[0].kg === 60 && (await sets(ahead))[0].r === 6, await sets(ahead))
await tap('[data-testid="own-finish"]'); await until(`!!document.querySelector('[data-testid="own-done"]')`)
await tap('[data-testid="own-done-close"]'); await wait(600)
check('G13. done, the day shows the workout done and no longer "Planned"', /Push/.test((await textOf('[data-testid="own-day-workout"]')) ?? '') && (await ev(`!document.querySelector('[data-testid="own-day-planned"]')`)))

await tap('[data-testid="own-start"]'); await wait(300)
check('G14. Start offers the empty workout and his saved ones', await ev(`!!document.querySelector('[data-testid="own-choose-empty"]') && document.querySelectorAll('[data-testid="own-choose-plan"]').length === 1`))
await tap('[data-testid="own-choose-plan-edit"]'); await until(`!!document.querySelector('[data-testid="own-plan-editor"]')`)
await type('[data-testid="own-plan-name"]', 'Push A')
await tap('[data-testid="own-plan-save"]'); await wait(800)
check('G15. edited, it is renamed in the list and the table', /Push A/.test((await textOf('[data-testid="own-choose-plan"]')) ?? '') && (await plansRows())?.[0]?.name === 'Push A', await plansRows())
await tap('[data-testid="own-choose-plan-edit"]'); await until(`!!document.querySelector('[data-testid="own-plan-delete"]')`)
await tap('[data-testid="own-plan-delete"]'); await wait(200)
await tap('[data-testid="own-plan-delete-yes"]'); await wait(800)
check('G16. deleted, it leaves the list, and the table keeps it only as removed', await ev(`document.querySelectorAll('[data-testid="own-choose-plan"]').length === 0`) && (await plansRows())?.[0]?.deleted === true, await plansRows())

const txt = await ev('document.body.innerText')
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(txt ?? ''))

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('Your own workout starts on any day, saves as it goes, keeps its own rest, and never writes over the plan.\n')
