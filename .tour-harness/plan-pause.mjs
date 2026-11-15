// ---------------------------------------------------------------------------
// A PLAN PAUSE (his ruling 14 Nov 2026, "Add a pause"), on the real Exercise tab at 390px. The page is given the
// pause date as INPUT (?paused=) and mirrors it into the app's one store as App.tsx does. It proves:
//   1. a paused plan's today card says "Plan paused", offers Resume, and no "Start session";
//   2. the week strip marks today paused, never due;
//   3. Resume brings the session back.
// What it cannot see: App.tsx's save (the database step), Home and Profile (held by test:plan-pause).
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9521', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9521/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
let loads = 0
const open = async (query, tab = 'exercise') => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${query}&n=${loads}#/tab/${tab}` })
  await wait(2500); await ev(`location.hash = '#/tab/${tab}'`); await wait(3000)
}
const has = sel => ev(`!!document.querySelector('${sel}')`)
const startButton = () => ev(`[...document.querySelectorAll('button')].some(b => /^\\s*Start session\\s*$/i.test(b.textContent || ''))`)
const todayCell = () => ev(`(() => { const c = document.querySelector('[data-strip-day="Wednesday"]'); return c ? (c.getAttribute('aria-label') + ' | ' + c.getAttribute('data-dot')) : null })()`)

await open('x=1')
console.log('\n1. Running plan (the fixture binds)\n')
check('1a. today offers "Start session"', await startButton())
check('1b. no paused card', !(await has('[data-testid="plan-paused-card"]')))
const runningCell = await todayCell()

console.log('\n2. Paused from today\n')
await open(`paused=2000-01-01`)
const card = await ev(`(() => { const c = document.querySelector('[data-testid="plan-paused-card"]'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { text: c.innerText, inView: r.top >= 0 && r.bottom <= 844 } })()`)
check('2a. today says "Plan paused", on screen', !!card && /Plan paused/.test(card.text) && card.inView, card)
check('2b. ...and offers Resume', /Resume my plan/.test(card?.text ?? ''))
check('2c. no "Start session"', !(await startButton()))
const pausedCell = await todayCell()
check('2d. the strip says today is paused, with no session dot (it had one while running)', /plan paused \| none$/.test(pausedCell ?? '') && / \| due$/.test(runningCell ?? ''), { runningCell, pausedCell })
await shoot('plan-pause-today')

console.log('\n3. Resume\n')
await ev(`document.querySelector('[data-testid="plan-resume"]')?.click()`)
await wait(1500)
check('3a. the paused card goes', !(await has('[data-testid="plan-paused-card"]')))
check('3b. the session is back: "Start session"', await startButton())

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('A paused plan owes nothing on the Exercise tab, and Resume brings the session back.\n')
