// ---------------------------------------------------------------------------
// A MISSED DAY SAYS SO, WITH THE COACH'S THREE CHOICES — on the real Exercise tab (run 7, 15 Oct 2026, M52).
//
// Sam's Monday and Tuesday were missed. The strip's small warning dot vanished the moment the day was tapped,
// and the day showed its planned session exactly like one still to come. The coach says "it didn't happen —
// run it today, mark it missed, or was it a rest day?". This drives the screen's half:
//
//   A  ?freetoday=1 (yesterday trained, today is free): the peeked day keeps its warning dot, says it didn't
//      happen, dims the plan, offers the three; "Mark it missed" is recorded and then not offered again;
//      "Do it today" moves the session onto today
//   B  the default week (today has its own session): a missed day earlier in the week offers the next FREE day
//      by name, never "today"; "It was a rest day" turns the day into a chosen rest
//
// The fixture only shapes the week; every write goes through the app's own writers into the fake store.
// PORT 9474.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { anchorDate, DAY_NAMES } from './anchor.mjs'

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
const DEBUG_PORT = 9474
const portBusy = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then(() => true, () => false)
if (portBusy) { console.error(`    ✗ port ${DEBUG_PORT} already has a browser on it — another run of this driver is still alive`); process.exit(1) }
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 420)}` : ''}`) }
}

const dayAt = n => { const d = anchorDate(); d.setDate(d.getDate() + n); return DAY_NAMES[d.getDay()] }
const TODAY_NAME = dayAt(0), FROM_NAME = dayAt(-1)

const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const clickText = (scope, re) => ev(`(() => { const root = document.querySelector(${JSON.stringify(scope)}) || document; const n = [...root.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim())); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = () => ev(`document.body.innerText`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const cell = day => ev(`(() => { const n = document.querySelector('[aria-label^="${day}:"]'); return n ? n.getAttribute('aria-label') : null })()`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const until = async (fn, tries = 24) => { let v = await fn(); for (let i = 0; i < tries && !v; i++) { await wait(300); v = await fn() } return v }
const untilGone = sel => until(async () => !(await has(sel)))


const lead = () => ev(`document.querySelector('[data-testid="peek-missed"]')?.innerText ?? null`)
const btns = () => ev(`[...document.querySelectorAll('[data-testid="peek-missed"] button')].map(b => b.textContent.trim())`)
// What the dot under a tapped day LOOKS like: its fill, against the warning colour the theme defines.
const selectedDot = day => ev(`(() => {
  const n = document.querySelector('[aria-label^="${day}:"] [data-selected-dot]'); if (!n) return null
  const probe = document.createElement('span'); probe.style.background = 'var(--role-warn)'; document.body.appendChild(probe)
  const warn = getComputedStyle(probe).backgroundColor; probe.remove()
  return getComputedStyle(n).backgroundColor === warn ? 'missed' : getComputedStyle(n).backgroundColor
})()`)

// --- A: yesterday missed, today free -------------------------------------
const YEST = dayAt(-1)
console.log(`\nA MISSED DAY SAYS SO — ${YEST} (yesterday), with today free\n`)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&freetoday=1&n=1#/tab/exercise` })
await wait(4500)
check(`A0. the fixture bites: ${YEST} is a missed training day`, /: missed$/.test(await until(() => cell(YEST)) || ''), await cell(YEST))
await tap(`[aria-label^="${YEST}:"]`); await wait(900)
const a1 = await until(lead)
check('A1. THE DAY SAYS IT DID NOT HAPPEN, naming the session', new RegExp(`^${YEST}'s .+ didn't happen\\.`).test(a1 || ''), a1)
check('A2. ...with the coach\'s three choices, today first', JSON.stringify(await btns()) === JSON.stringify(['Do it today', 'Mark it missed', 'It was a rest day']), await btns())
check('A3. the strip keeps the warning dot on the day you tapped', (await selectedDot(YEST)) === 'missed', await selectedDot(YEST))
check('A4. ...and the plan below is dimmed: it is what was planned, not what is coming', await ev(`document.querySelector('[data-testid="peek-plan"]')?.className.includes('opacity-60') ?? false`))
await shoot('missed-day-a')
check('A5. "Mark it missed"', await clickSel('[data-testid="peek-missed-mark"]'))
const a6 = await until(async () => { const l = await lead(); return l && /^You marked /.test(l) ? l : null })
check('A6. IT IS RECORDED: "You marked … as missed", and not offered again', new RegExp(`^You marked ${YEST}'s .+ as missed\\.`).test(a6 || '') && !(await btns()).includes('Mark it missed'), { a6, btns: await btns() })
check('A7. "Do it today"', await clickSel('[data-testid="peek-missed-run"]'))
// A day she MARKED missed stays missed after the work moves (her 10 Sep ruling: moving changes where it is owed,
// not whether the day was missed), so the proof is today gaining the session and the day saying where it went.
const a8 = await until(async () => /: due$/.test(await cell(TODAY_NAME) || '') ? cell(TODAY_NAME) : null)
check(`A8. THE SESSION MOVED: today (${TODAY_NAME}) now has it, and ${YEST} says it is on today`, /: due$/.test(a8 || '') && !!(await until(() => has('[data-testid="peek-moved-away"]'))), { a8, yest: await cell(YEST) })
check(`A9. ...and ${YEST} is still a missed day, as she said`, /: missed$/.test(await cell(YEST) || ''), await cell(YEST))
await shoot('missed-day-a-moved')

// --- B: today has its own session ----------------------------------------
console.log('\nB TODAY IS ALREADY TAKEN\n')
let MISSED = null
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=2#/tab/exercise` })
await wait(4500)
for (let n = -1; n >= -6 && !MISSED; n--) { const c = await until(() => cell(dayAt(n)), 6); if (/: missed$/.test(c || '')) MISSED = dayAt(n) }
check('B0. the fixture bites: an earlier day this week is missed, and today trains', !!MISSED && !/(rest|recovery)/.test(await cell(TODAY_NAME) || ''), { MISSED, today: await cell(TODAY_NAME) })
await tap(`[aria-label^="${MISSED}:"]`); await wait(900)
const b = await until(btns)
check('B1. "Do it today" is NOT offered while today has its own session', !!b && !b.includes('Do it today'), b)
check('B2. ...the next free day is, by name', !!b && /^Do it (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(b[0] || '') || !!(await has('[data-testid="peek-missed-no-day"]')), b)
await shoot('missed-day-b')
check('B3. "It was a rest day"', await clickSel('[data-testid="peek-missed-rest"]'))
const b4 = await until(async () => /rest/.test(await cell(MISSED) || '') ? cell(MISSED) : null)
check(`B4. IT IS RECORDED: ${MISSED} is a chosen rest now, and the banner is gone`, /rest/.test(b4 || '') && !(await until(async () => !(await has('[data-testid="peek-missed"]')))) === false, { b4 })

const err = await ev('window.__err ?? null')
check('C. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'A missed day says so, and its three choices each do what they say.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
