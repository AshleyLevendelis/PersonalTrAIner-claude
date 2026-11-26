// ---------------------------------------------------------------------------
// A COUNTED WALK (his request 26 Nov 2026: "hit Start Walk ... it just immediately starts recording my heart rate and
// recording my steps. At the end ... 'Congratulations, you completed 3,000 steps. Your average heart rate was this.'";
// his ruling "Both" for the steps: the phone's sensor live, the health store at the end, the larger kept).
// Drives the real Exercise tab at 390x844 with a pretend step sensor, health store and strap: one tap starts it,
// steps and heart rate live, closing the screen keeps it, Finish gives his sentence with the walk's numbers, the effort
// tap saves it with its steps; then a phone that counts nothing, and End without saving.
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
const PORT = 9671
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

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
let loads = 0
const load = async extra => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=${loads}${extra}#/tab/exercise` })
  await wait(4000)
}
const has = sel => ev(`!!${q(sel)}`)
const cardio = date => ev(`(window.__fakeDb?.cardio_logs ?? []).filter(r => r.date === ${JSON.stringify(date)}).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe, steps: r.steps ?? null, avg: r.avg_heart_rate ?? null, max: r.max_heart_rate ?? null }))`)

console.log('\nA COUNTED WALK\n')
await load('')
const rest = await ev('window.__restDayTarget ?? null')
check('0. the fixture has a rest day', !!rest?.date, rest)
const day = rest?.date

console.log('\n  A. Start a walk: steps and heart rate from the tap')
await load(`&today=${day}&stepsensor=1&strap=1&strappaired=1&health=android&healthon=1&healthsteps=0`)
await ev('window.__strapConnect()'); await wait(300)
await until(q('[data-testid="own-start"]'))
await tap('[data-testid="own-start"]'); await until(q('[data-testid="own-choose-walk"]'), 3000)
check('A1. "Which workout?" offers a Walk that says it counts steps and heart rate', /^Walk\s*Starts now, counts your steps and heart rate$/.test((await textOf('[data-testid="own-choose-walk"]')) ?? ''), await textOf('[data-testid="own-choose-walk"]'))
await tap('[data-testid="own-choose-walk"]')
await until(q('[data-testid="walk-live"]'))
check('A2. one tap opens the walk, already running: no second Start', !!(await has('[data-testid="walk-live"]')) && /^Walk · Today · /i.test((await textOf('[data-testid="walk-kicker"]')) ?? ''), await textOf('[data-testid="walk-kicker"]'))
await wait(1300)
check('A3. the clock is running', /^0:0[1-9]$/.test((await textOf('[data-testid="walk-clock"]')) ?? ''), await textOf('[data-testid="walk-clock"]'))
// THE FIXTURE CHOOSES WHEN THE WALK BEGAN (half an hour ago), as a real walk would have, so its steps are believable.
await ev(`(() => { const w = JSON.parse(localStorage.getItem('fitplan_walk_v1')); w.startedAt = new Date(Date.now() - 30 * 60000).toISOString(); localStorage.setItem('fitplan_walk_v1', JSON.stringify(w)) })()`)
check('A4. the phone was asked about counting steps, and counting started', JSON.stringify(await ev('window.__stepCalls')) === JSON.stringify(['available', 'request', 'start']), await ev('window.__stepCalls'))
await ev('window.__stepSend(420)'); await wait(400)
check('A5. steps tick up as he walks', (await textOf('[data-testid="walk-steps"]')) === '420', await textOf('[data-testid="walk-steps"]'))
// The strap keeps one reading a second, as the real one sends.
for (const b of [110, 118]) { await ev(`window.__strapSend(${b})`); await wait(1100) }
check('A6. the strap\'s heart rate shows live', (await textOf('[data-testid="walk-heart"]')) === '118', await textOf('[data-testid="walk-heart"]'))
check('A7. nothing is saved while walking', (await cardio(day))?.length === 0, await cardio(day))
await shoot('walk-1-live')

console.log('\n  B. Closing the screen never ends the walk')
await tap('[data-testid="walk-close"]'); await wait(500)
check('B1. the day shows the walk in progress, with Continue', /Walk · in progress.*Continue/i.test((await textOf('[data-testid="own-day-walk"]')) ?? ''), await textOf('[data-testid="own-day-walk"]'))
await ev('window.__stepSend(1250)'); await wait(300)
await tap('[data-testid="own-day-walk"]'); await until(q('[data-testid="walk-live"]'))
check('B2. Continue opens the same walk, still counting', (await textOf('[data-testid="walk-steps"]')) === '1,250', await textOf('[data-testid="walk-steps"]'))
for (const b of [126, 141, 115]) { await ev(`window.__strapSend(${b})`); await wait(1100) }

console.log('\n  C. Finish: his congratulations, then one tap to save')
// The phone's health app has caught up past the sensor by Finish: the larger is kept.
await ev('window.__healthSteps = 3120')
await tap('[data-testid="walk-finish"]'); await until(q('[data-testid="walk-result"]'))
const said = await textOf('[data-testid="walk-summary"]')
check('C1. "Congratulations, you completed 3,120 steps in 30 minutes. Your average heart rate was 122, and your highest was 141."',
  /^Congratulations, you completed 3,120 steps in 30 minutes\. Your average heart rate was 122, and your highest was 141\.$/.test(said ?? ''), said)
check('C2. the four figures', (await textOf('[data-testid="walk-final-steps"]')) === '3,120' && (await textOf('[data-testid="walk-final-time"]')) === '30 min'
  && (await textOf('[data-testid="walk-final-avg"]')) === '122' && (await textOf('[data-testid="walk-final-max"]')) === '141')
check('C3. the sensor was stopped', ((await ev('window.__stepCalls')) ?? []).includes('stop'), await ev('window.__stepCalls'))
check('C4. still nothing saved: the effort tap saves it', (await cardio(day))?.length === 0)
const effortInView = await ev(`(() => { const r = ${q('[data-testid="walk-effort-easy"]')}?.getBoundingClientRect(); return !!r && r.bottom <= innerHeight && r.top >= 0 })()`)
check('C5. the effort buttons are on screen without scrolling', effortInView)
await shoot('walk-2-result')
await tap('[data-testid="walk-effort-easy"]'); await until(q('[data-testid="walk-saved"]'))
check('C6. saved, and it reads back with its steps', (await textOf('[data-testid="walk-readback"]')) === '✓ Walk · 30 min · Easy · 3,120 steps', await textOf('[data-testid="walk-readback"]'))
await until(`(window.__fakeDb?.cardio_logs ?? []).some(r => r.activity_name === 'Walk')`, 6000)
const saved = await cardio(day)
check('C7. one walk on that day, Easy, with its steps and its average and highest heart rate',
  saved?.length === 1 && saved[0].a === 'Walk' && saved[0].rpe === 3 && saved[0].steps === 3120 && saved[0].avg === 122 && saved[0].max === 141, saved)
await shoot('walk-3-saved')
await tap('[data-testid="walk-done"]'); await wait(500)
check('C8. Done closes it, and the day no longer shows a walk in progress', !(await has('[data-testid="walk-sheet"]')) && !(await has('[data-testid="own-day-walk"]')))

console.log('\n  D. No step counting on this phone, then End without saving')
// The health app's steps switch was left on by section A's page; this phone has none.
await ev("localStorage.removeItem('fitplan_health_steps_connected')")
await load(`&today=${day}&stepsensor=1&stepsdenied=1`)
await until(q('[data-testid="own-start"]'))
await tap('[data-testid="own-start"]'); await until(q('[data-testid="own-choose-walk"]'), 3000)
await tap('[data-testid="own-choose-walk"]'); await until(q('[data-testid="walk-live"]'))
await until(q('[data-testid="walk-steps-note"]'), 3000)
check('D1. he said no and has no health app steps: it says so, and the walk still runs',
  /isn't counting steps for the app/.test((await textOf('[data-testid="walk-steps-note"]')) ?? '') && (await textOf('[data-testid="walk-steps"]')) === '—', await textOf('[data-testid="walk-steps-note"]'))
check('D2. no heart rate without a strap: a dash, never a number', (await textOf('[data-testid="walk-heart"]')) === '—', await textOf('[data-testid="walk-heart"]'))
await shoot('walk-4-no-sensor')
await tap('[data-testid="walk-discard"]'); await until(q('[data-testid="walk-discard-confirm"]'), 2000)
check('D3. End without saving asks first', /End this walk without saving it\?/.test((await textOf('[data-testid="walk-discard-confirm"]')) ?? ''))
await tap('[data-testid="walk-discard-yes"]'); await wait(600)
check('D4. ended: the screen closes, nothing is saved, no walk is left on the day',
  !(await has('[data-testid="walk-sheet"]')) && !(await has('[data-testid="own-day-walk"]')) && (await cardio(day))?.length === 0, await cardio(day))

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('One tap starts a walk that counts its steps and heart rate, and Finish says what it was.')
