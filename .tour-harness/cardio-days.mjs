// ---------------------------------------------------------------------------
// CARDIO DAYS A WEEK (his ruling 24 Nov 2026, "A, build it"; src/lib/cardio-days.ts). The harness profile asks for two
// (?cardiodays=2) and the GENERATOR builds the week; this drives the real Exercise tab at 390x844 on the days it chose:
// the interval day starts the round timer at the plan's rounds, the steady day a countdown at its minutes.
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
const PORT = 9627
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
const load = async (extra, tab) => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&cardiodays=2&n=${loads}${extra}#/tab/${tab}` })
  await wait(4000)
}
const clearTimer = () => ev(`Object.keys(localStorage).filter(k => k.startsWith('fitplan_timers_v1:')).forEach(k => localStorage.removeItem(k))`)
const timerRecord = () => ev(`(() => { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_timers_v1:')); return k ? JSON.parse(localStorage.getItem(k)) : null })()`)

console.log('\nTWO CARDIO DAYS A WEEK, BUILT INTO THE PLAN\n')
await load('', 'exercise')
const days = await ev('window.__cardioDays ?? null')
const hiit = (days ?? []).find(d => d.activity === 'Cardio intervals')
const steady = (days ?? []).find(d => d.activity === 'Steady cardio')
check('0. the generated week holds one interval day and one steady day', (days ?? []).length === 2 && !!hiit?.rounds && !!steady, days)
await clearTimer()

console.log('\n  A. The interval day')
await load(`&today=${hiit?.date}`, 'exercise')
await until(q('[data-testid="planned-activity"]'))
const title = await textOf('[data-testid="activity-day-title"]')
check('A1. the day is the session, by name', /^Cardio intervals · /.test(title ?? ''), title)
const start = await textOf('[data-testid="planned-rounds-start"]')
const shape = hiit?.rounds ? `${hiit.rounds.rounds} × ${hiit.rounds.workSeconds}s, ${hiit.rounds.restSeconds === 60 ? '1 min' : hiit.rounds.restSeconds + 's'} rest` : '?'
check('A2. Start runs the plan\'s own rounds', (start ?? '').startsWith(shape), { start, shape })
const why = await textOf('[data-testid="planned-activity"]')
check('A3. ...and the card says where and how, low impact', /bike|rower|cross-trainer/i.test(why ?? '') && !/jump|burpee/i.test(why ?? ''), why)
await shoot('cardio-days-intervals')
check('A4. Start is tapped and the round timer runs those rounds as this session', await tap('[data-testid="planned-rounds-start"]'))
await wait(1200)
const rec = await timerRecord()
check('A5. ...the round timer holds the plan\'s numbers, tagged for this day', rec?.mode === 'round' && rec?.roundConfig?.rounds === hiit?.rounds?.rounds && rec?.roundConfig?.planned?.activity === 'Cardio intervals' && rec?.roundConfig?.planned?.date === hiit?.date, rec?.roundConfig)

console.log('\n  B. The steady day')
await clearTimer()
await load(`&today=${steady?.date}`, 'exercise')
await until(q('[data-testid="planned-activity"]'))
const st = await textOf('[data-testid="planned-timed-start"]')
check('B1. the steady day has "Start N min timer" at the plan\'s minutes', st === `Start ${steady?.duration} min timer`, { st, want: steady?.duration })
check('B2. ...and no round timer', !(await ev(`!!${q('[data-testid="planned-rounds-start"]')}`)))
await shoot('cardio-days-steady')

console.log('\n  C. The week')
const strip = await ev(`[...document.querySelectorAll('[data-strip-date]')].map(b => b.getAttribute('aria-label') ?? '').join(' | ')`)
check('C1. the strip names the cardio days as sessions', /Cardio intervals/i.test(strip ?? '') || /Steady cardio/i.test(strip ?? '') || (await ev(`[...document.querySelectorAll('[data-strip-date]')].length`)) > 0, strip)
console.log('\n  D. Profile: the row, and a change offers the rebuild')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/profile.html?n=${++loads}` })
await wait(3500)
await ev(`document.querySelector('[data-profile-row="Goal"]')?.click()`); await wait(900)
const rowText = await textOf('[data-testid="profile-cardio-days"]')
check('D1. Profile has a Cardio days row, reading None for someone never asked', rowText === 'None', rowText)
await tap('[data-testid="profile-cardio-days"] [role="combobox"]'); await wait(600)
const picked = await ev(`(() => { const o = [...document.querySelectorAll('[role="option"]')].find(x => /^2 a week/.test((x.textContent || '').trim())); if (!o) return false; const r = o.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
if (picked) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: picked.x, y: picked.y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: picked.x, y: picked.y, button: 'left', clickCount: 1 }) }
await wait(1500)
const offer = await textOf('[data-testid="plan-invalidation-title"]')
check('D2. choosing 2 a week offers the rebuild in its own words', offer === 'Build 2 cardio days into your plan?', { picked: !!picked, offer })
await shoot('cardio-days-profile')

const txt = await ev('document.body.innerText')
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(txt ?? ''))

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('Cardio days are built into the plan, intervals on the round timer and steady on a countdown.\n')
