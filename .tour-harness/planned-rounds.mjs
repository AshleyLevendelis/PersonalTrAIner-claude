// ---------------------------------------------------------------------------
// AN INTERVAL SESSION ON THE PLAN STARTS THE ROUND TIMER AND IS LOGGED WHEN IT ENDS (Ashley, 23 Nov 2026, option A).
//
// His report: "Wednesday: Assault Bike Rounds, 16 minutes." was all the day showed, nothing to start, nothing to log.
// This drives the real Exercise and Tools tabs at 390x844 on a plan whose rest day carries the session the coach
// writes (?rounds=1): the card, Start, the running state, the end of the round (time moved on in the timer's own
// record, which is all a finished round is), the one effort tap, the log, the day read back as done, the round
// timer's own log sheet, and another day's preview.
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
const PORT = 9593
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
let kind = '1'
const load = async (extra, tab) => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&rounds=${kind}&n=${loads}${extra}#/tab/${tab}` })
  await wait(4000)
}
// TIME PASSES, in the one place the round reads it: the anchor in the timer's own record moves back.
const ageRound = minutes => ev(`(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_timers_v1:'))
  if (!k) return null
  const r = JSON.parse(localStorage.getItem(k))
  if (!r.startedAtIso) return null
  r.startedAtIso = new Date(new Date(r.startedAtIso).getTime() - ${minutes} * 60000).toISOString()
  localStorage.setItem(k, JSON.stringify(r))
  return r.roundConfig ?? r.countdownMs ?? null
})()`)
const timerRecord = () => ev(`(() => { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_timers_v1:')); return k ? JSON.parse(localStorage.getItem(k)) : null })()`)
const clearTimer = () => ev(`Object.keys(localStorage).filter(k => k.startsWith('fitplan_timers_v1:')).forEach(k => localStorage.removeItem(k))`)
const logs = () => ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe, notes: r.notes, date: r.date }))`)

console.log('\nAN INTERVAL SESSION ON THE PLAN STARTS THE ROUND TIMER\n')
await load('', 'exercise')
const target = await ev('window.__roundsTarget ?? null')
check('0. the fixture has a rest day carrying the coach\'s interval session', !!target?.date, target)
await clearTimer()

console.log('\n  A. The day\'s card')
await load(`&today=${target?.date}`, 'exercise')
await until(q('[data-testid="planned-activity"]'))
const title = await textOf('[data-testid="activity-day-title"]')
check('A1. the card is the session, by name', /Assault Bike Rounds/.test(title ?? ''), title)
const row = await textOf('[data-testid="planned-activity"]')
check('A2. ...with its rounds under the name', /4 × 3 min, 1 min rest/.test(row ?? ''), row)
const start = await textOf('[data-testid="planned-rounds-start"]')
check('A3. ...and a Start that says what it runs and the countdown', /4 × 3 min, 1 min rest/.test(start ?? '') && /countdown|Start now/.test(start ?? ''), start)
const startBox = await ev(`(() => { const r = ${q('[data-testid="planned-rounds-start"]')}?.getBoundingClientRect(); return r ? { h: Math.round(r.height), w: Math.round(r.width) } : null })()`)
check('A4. ...a full 44px target', (startBox?.h ?? 0) >= 44, startBox)
const order = await ev(`(() => { const a = ${q('[data-testid="cardio-prescription"]')}?.getBoundingClientRect().top, b = ${q('[data-testid="planned-rounds-start"]')}?.getBoundingClientRect().top; return a != null && b != null ? b > a : null })()`)
check('A5. ...under the session\'s name, not above it', order === true, order)
await shoot('planned-rounds-card')

console.log('\n  B. Start runs the round timer with those numbers')
check('B1. Start is tapped', await tap('[data-testid="planned-rounds-start"]'))
await wait(1200)
const rec = await timerRecord()
check('B2. the round timer is running 4 × 180s work, 60s rest', rec?.mode === 'round' && rec?.running === true && rec?.roundConfig?.rounds === 4 && rec?.roundConfig?.workSeconds === 180 && rec?.roundConfig?.restSeconds === 60, rec?.roundConfig)
check('B3. ...as this session, on this date', rec?.roundConfig?.planned?.activity === 'Assault Bike Rounds' && rec?.roundConfig?.planned?.date === target?.date, rec?.roundConfig?.planned)
check('B4. ...and the timer is open on Tools, full screen', /#\/tab\/tools/.test(await ev('location.hash')) && !!(await until(`[...document.querySelectorAll('[aria-label]')].some(e => /^Get ready/.test(e.getAttribute('aria-label')))`, 4000)), await ev('location.hash'))
await shoot('planned-rounds-running')

console.log('\n  C. Back on the day while it runs')
await ev(`location.hash = '#/tab/exercise'`)
await wait(1500)
const running = await textOf('[data-testid="planned-rounds-open"]')
check('C0. while it runs, no second way to log it on the card', await ev(`document.querySelectorAll('[data-testid="planned-activity"] [role="radiogroup"]').length`) === 0, await ev(`document.querySelectorAll('[data-testid="planned-activity"] [role="radiogroup"]').length`))
check('C1. the card says it is running and opens it, never restarts it', /Round timer running · Open it/.test(running ?? '') && !(await ev(`!!${q('[data-testid="planned-rounds-start"]')}`)), running)

console.log('\n  D. The rounds end: one tap logs the session')
check('D0. sixteen minutes pass', !!(await ageRound(16)))
await load(`&today=${target?.date}`, 'exercise')
await until(q('[data-testid="planned-rounds-effort"]'))
const ask = await textOf('[data-testid="planned-rounds-effort"]')
check('D1. the card asks how hard it was', /How hard was it\?/.test(ask ?? '') && /Easy/.test(ask ?? '') && /Hard/.test(ask ?? ''), ask)
check('D1b. ...with one effort picker, not two', await ev(`document.querySelectorAll('[data-testid="planned-activity"] [role="radiogroup"]').length`) === 1, await ev(`document.querySelectorAll('[data-testid="planned-activity"] [role="radiogroup"]').length`))
check('D2. ...and nothing is logged before the tap', (await logs()).length === 0, await logs())
await shoot('planned-rounds-done')
check('D3. "Hard" is tapped', await tap('[data-testid="planned-rounds-effort"] [data-effort="hard"]'))
await wait(1500)
const after = await logs()
check('D4. the session is logged under its own name, the timer\'s minutes, its rounds, at the plan\'s effort',
  after.length === 1 && after[0].a === 'Assault Bike Rounds' && after[0].m === 15 && after[0].notes === '4 × 3 min, 1 min rest' && after[0].rpe === 8 && after[0].date === target?.date, after)
check('D5. ...the round is released once it is written', (await timerRecord())?.roundConfig == null, (await timerRecord())?.roundConfig)
const back = await textOf('[data-testid="planned-activity"]')
check('D6. the card reads it back as done, and offers nothing more to start', !!(await ev(`!!${q('[data-testid="planned-activity"] [data-testid="cardio-readback"]')}`)) && /4 × 3 min, 1 min rest/.test(back ?? '')
  && !(await ev(`!!${q('[data-testid="planned-rounds-start"]')} || !!${q('[data-testid="planned-rounds-effort"]')}`)), back)
const strip = await ev(`${q(`[data-strip-date="${target?.date}"]`)}?.getAttribute('aria-label') ?? null`)
check('D7. ...and the day on the strip says done', /done/i.test(strip ?? ''), strip)
await ev(`location.hash = '#/tab/dashboard'`); await wait(2500); await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const strip2 = await ev(`${q(`[data-strip-date="${target?.date}"]`)}?.getAttribute('aria-label') ?? null`)
console.log('      (after a tab round trip, the strip reads:', strip2, ')')
await shoot('planned-rounds-logged')

console.log('\n  E. Ended on the round timer itself: its log sheet is the same one tap')
await clearTimer()
await load(`&today=${target?.date}`, 'exercise')
await until(q('[data-testid="planned-rounds-start"]'))
await tap('[data-testid="planned-rounds-start"]')
await wait(1200)
await ageRound(16)
await load(`&today=${target?.date}`, 'tools')
const logBtn = await until(`[...document.querySelectorAll('button')].some(b => /^Log session$/.test((b.textContent || '').trim()))`, 6000)
check('E1. the finished round offers Log session', !!logBtn)
await tapText('button', '/^Log session$/')
await wait(800)
const sheet = await textOf('[data-testid="planned-round-log"]')
check('E2. the sheet names the session and asks how hard, never "what was this block?"', /Assault Bike Rounds · 4 × 3 min, 1 min rest/.test(sheet ?? '') && /How hard was it\?/.test(sheet ?? '') && !/What was this block/.test(await ev('document.body.innerText')), sheet)
await shoot('planned-rounds-tools-sheet')
await tap('[data-testid="planned-round-log"] [data-effort="easy"]')
await wait(1500)
const fromTools = await logs()
check('E3. one tap logs it as the session, at the effort chosen', fromTools.length === 1 && fromTools[0].a === 'Assault Bike Rounds' && fromTools[0].rpe <= 4 && fromTools[0].notes === '4 × 3 min, 1 min rest', fromTools)
check('E4. ...and Tools says so', /Logged · Assault Bike Rounds · 4 × 3 min, 1 min rest/.test(await ev('document.body.innerText')))

console.log('\n  F. Another day shows the session, not a line of words')
await clearTimer()
const dayBefore = await ev(`(() => { const d = new Date(${JSON.stringify(target?.date ?? '')} + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()`)
await load(`&today=${dayBefore}`, 'exercise')
await until(q(`[data-strip-date="${target?.date}"]`))
await tap(`[data-strip-date="${target?.date}"]`)
const peek = await until(`${q('[data-testid="peek-planned-activity"]')}?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`, 5000)
check('F1. tomorrow\'s session is a preview with its name, effort, rounds and reason', /Assault Bike Rounds/.test(peek ?? '') && /Hard/.test(peek ?? '') && /4 × 3 min hard/.test(peek ?? '') && /1 min rest/.test(peek ?? '') && /Muay Thai/.test(peek ?? ''), peek)
// DRAWN AS A WEIGHT DAY IS (his request 24 Nov 2026): the day, the title, the meta line and an X; a row with its tag,
// the effort where a lift's weight sits, and one bar segment per round.
const card = await ev(`(() => { const c = document.querySelector('[data-testid="peek-planned-activity"]'); if (!c) return null; return {
  meta: c.querySelector('[data-testid="hero-meta"]')?.textContent?.trim() ?? null,
  close: !!c.querySelector('button[aria-label="Close"]'),
  tag: c.querySelector('[data-testid="peek-planned-label-tag"]')?.textContent?.trim() ?? null,
  badge: c.querySelector('[data-load-badge]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  segments: c.querySelectorAll('[data-set-bar] [data-seg]').length,
  start: !!c.querySelector('[data-testid="planned-rounds-start"]'),
} })()`)
check('F3. the card is drawn like a weight day: "4 rounds · 16 min", a Close, the Intervals tag, Hard effort on the right', card?.meta === '4 rounds · 16 min' && card?.close === true && card?.tag === 'Intervals' && /Hard/.test(card?.badge ?? '') && /effort/i.test(card?.badge ?? ''), card)
check('F4. ...one bar segment per round, and no Start a day early (his "Keep it as is")', card?.segments === 4 && card?.start === false, card)
await tap('[data-testid="peek-planned-close"]')
const closed = await until(`!document.querySelector('[data-testid="peek-planned-activity"]')`, 3000)
check('F5. its X closes it', closed === true, closed)
await tap(`[data-strip-date="${target?.date}"]`)
await until(q('[data-testid="peek-planned-activity"]'), 3000)
check('F2. ...not the old one sentence', !/Assault Bike Rounds, 16 minutes\./.test(await ev('document.body.innerText')))
await shoot('planned-rounds-peek')

console.log('\n  G. His Wednesday: the numbers only in the coach\'s reason (24 Nov 2026)')
await clearTimer()
await load(`&roundsInReason=1&today=${target?.date}`, 'exercise')
await until(q('[data-testid="planned-activity"]'))
const gStart = await until(`${q('[data-testid="planned-rounds-start"]')}?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`, 5000)
check('G1. the day has a Start running 4 × 3 min, 1 min rest', /4 × 3 min, 1 min rest/.test(gStart ?? ''), gStart)
const gRow = await textOf('[data-testid="planned-activity"]')
check('G2. ...and the rounds under the name', /Assault Bike Rounds/.test(gRow ?? '') && /4 × 3 min, 1 min rest/.test(gRow ?? ''), gRow)
await shoot('planned-rounds-reason-day')
await load(`&roundsInReason=1&today=${dayBefore}`, 'exercise')
await until(q(`[data-strip-date="${target?.date}"]`))
await tap(`[data-strip-date="${target?.date}"]`)
const gPeek = await until(`${q('[data-testid="peek-planned-shape"]')}?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`, 5000)
check('G3. the day before, its preview shows the rounds', /4 × 3 min hard/.test(gPeek ?? '') && /1 min rest/.test(gPeek ?? ''), gPeek)
await shoot('planned-rounds-reason-peek')

console.log('\n  H. A 30-minute jog runs on a 30-minute timer and logs in one tap (24 Nov 2026)')
kind = 'jog'
await clearTimer()
await load(`&today=${target?.date}`, 'exercise')
const jogStart = await until(`${q('[data-testid="planned-timed-start"]')}?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`, 6000)
check('H1. the jog has "Start 30 min timer"', jogStart === 'Start 30 min timer', jogStart)
check('H1b. ...and no round timer Start', !(await ev(`!!${q('[data-testid="planned-rounds-start"]')}`)))
const jogBox = await ev(`(() => { const r = ${q('[data-testid="planned-timed-start"]')}?.getBoundingClientRect(); return r ? Math.round(r.height) : 0 })()`)
check('H1c. ...a 44px target', jogBox >= 44, jogBox)
await shoot('planned-timed-card')
check('H2. Start is tapped', await tap('[data-testid="planned-timed-start"]'))
await wait(1500)
const jrec = await timerRecord()
check('H3. a 30-minute countdown runs, tagged as this session on this date', jrec?.mode === 'countdown' && jrec?.running === true && jrec?.countdownMs === 1800000 && jrec?.countdownPlanned?.activity === 'Easy jog' && jrec?.countdownPlanned?.date === target?.date, jrec)
check('H4. ...and the countdown is open on Tools', /#\/tab\/tools/.test(await ev('location.hash')) && !!(await until(`/Timer/.test(document.querySelector('[role="dialog"]')?.innerText ?? '')`, 4000)))
await shoot('planned-timed-running')
await ev(`location.hash = '#/tab/exercise'`)
await wait(1500)
check('H5. back on the day: running, with Open it and Finish, and no boxes', /Timer running · Open it/.test((await textOf('[data-testid="planned-timed-open"]')) ?? '') && !!(await ev(`!!${q('[data-testid="planned-timed-finish"]')}`))
  && await ev(`document.querySelectorAll('[data-testid="planned-activity"] [role="radiogroup"]').length`) === 0)
check('H6a. twenty-two minutes pass', !!(await ageRound(22)))
await load(`&today=${target?.date}`, 'exercise')
await until(q('[data-testid="planned-timed-finish"]'))
check('H6. he taps Finish', await tap('[data-testid="planned-timed-finish"]'))
await wait(1200)
const jask = await textOf('[data-testid="planned-timed-effort"]')
check('H7. the card asks how hard, with the 22 minutes it ran', /^22 min · Done\. How hard was it\?/.test(jask ?? '') && /Keep going/.test(jask ?? ''), jask)
check('H8. ...nothing logged before the tap', (await logs()).length === 0, await logs())
await shoot('planned-timed-ask')
await tap('[data-testid="planned-timed-effort"] [data-effort="steady"]')
await wait(1500)
const jlogs = await logs()
check('H9. logged as the jog, 22 minutes, Steady, on its date', jlogs.length === 1 && jlogs[0].a === 'Easy jog' && jlogs[0].m === 22 && jlogs[0].rpe >= 5 && jlogs[0].rpe <= 6 && jlogs[0].date === target?.date, jlogs)
check('H10. ...the timer released, and the card reads it back as done', (await timerRecord())?.countdownPlanned == null && !!(await ev(`!!${q('[data-testid="planned-activity"] [data-testid="cardio-readback"]')}`)) && !(await ev(`!!${q('[data-testid="planned-timed-start"]')}`)))
await shoot('planned-timed-logged')

console.log('\n  I. A countdown that runs to zero asks on Tools too')
await clearTimer()
await ev(`window.__fakeDb && (window.__fakeDb.cardio_logs = [])`)
await load(`&today=${target?.date}`, 'exercise')
await until(q('[data-testid="planned-timed-start"]'))
await tap('[data-testid="planned-timed-start"]')
await wait(1200)
await ageRound(31)
await load(`&today=${target?.date}`, 'tools')
await ev(`[...document.querySelectorAll('button')].find(b => /Timer/.test(b.textContent || '') && /Counts down/.test(b.textContent || ''))?.click()`)
const toolsAsk = await until(`${q('[data-testid="planned-timed-effort"]')}?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`, 6000)
check('I1. under the finished countdown: "30 min · Done. How hard was it?", no Keep going', /^30 min · Done\. How hard was it\?/.test(toolsAsk ?? '') && !/Keep going/.test(toolsAsk ?? ''), toolsAsk)
await shoot('planned-timed-tools')

const txt = await ev('document.body.innerText')
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(txt ?? ''))

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('An interval session starts the round timer, is logged in one tap when it ends, and reads back as done.\n')
