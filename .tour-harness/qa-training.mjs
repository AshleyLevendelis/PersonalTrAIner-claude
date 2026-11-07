// ---------------------------------------------------------------------------
// THE TRAINING SCREENS, AS THE WHOLE-APP QA WALK FOUND THEM (7 Nov 2026, Ashley: "I want you to test and fix").
// Each section pins one defect the walk found and this build fixed, on the real screens at 390px.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9533', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9533/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })


const pointAt = async at => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
const tapTestId = async tid => {
  const at = await ev(`(() => { const n = document.querySelector('[data-testid="${tid}"]'); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
  if (at) { await pointAt(at); await wait(900) }
  return !!at
}
let load = 0
const open = async (query, tab) => {
  load++
  await ev(`(() => { try { localStorage.clear() } catch {} })()`).catch(() => {})
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=${load}${query ? '&' + query : ''}${tab ? '#/tab/' + tab : ''}` })
  await wait(4500)
}

// ---------------------------------------------------------------------------
// QA REGRESSIONS FROM THE WHOLE-APP WALK (7 Nov 2026), one section per finding fixed. Every section runs every
// check every time (a constant count), so a mutation that breaks one cannot hide it by skipping the rest.
// ---------------------------------------------------------------------------

console.log('\nT1. A day already finished, with no record on this phone, is not offered "Start session"\n')
await open('done=1', 'exercise')
const t1 = await ev(`(() => ({
  start: !!document.querySelector('[data-testid="hero-start"]'),
  finished: !!document.querySelector('[data-testid="session-finished"]'),
  minutes: (window.__fakeDb?.workout_sessions || []).filter(r => r.is_completed).map(r => r.duration_minutes),
}))()`)
check('T1a. the Exercise hero offers no "Start session" on a day the server holds closed', t1.start === false, t1)
check('T1b. ...it shows the day as finished instead', t1.finished === true, t1)
check('T1c. ...and the saved session keeps its time', t1.minutes.length > 0 && t1.minutes.every(m => m > 1), t1.minutes)
await shoot('qa-t1-done-day')

console.log('\nT9. A day she swapped for something else: Home says so and offers no Start\n')
await open('swapped=1', 'dashboard')
const t9 = await ev(`(() => ({
  title: document.querySelector('[data-home-title]')?.textContent ?? null,
  start: !!document.querySelector('[data-home-cta]'),
  strip: [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).find(t => /swapped for/.test(t || '')) ?? null,
}))()`)
check('T9a. Home names the swap, the same activity the strip names', !!t9.title && /^Swapped for /.test(t9.title) && !!t9.strip && t9.strip.endsWith(t9.title.replace(/^Swapped for /, '')), t9)
check('T9b. ...and does not invite her to start the session she replaced', t9.start === false, t9)
await shoot('qa-t9-swapped-home')
await open('', 'dashboard')
const t9b = await ev(`({ title: document.querySelector('[data-home-title]')?.textContent ?? null, start: !!document.querySelector('[data-home-cta]') })`)
check('T9c. an ordinary training day still offers Start (the fixture binds)', t9b.start === true && !/^Swapped/.test(t9b.title ?? ''), t9b)

console.log('\nT10. A day whose session moved away: the Exercise strip draws the dash, as Home does, not a session dot\n')
await open('moved=1', 'exercise')
const t10 = await ev(`(() => {
  const today = [...document.querySelectorAll('[data-exercise-strip] [aria-current="date"]')][0]
  const mark = today?.querySelector('[data-selected-dot]')
  return { label: today?.getAttribute('aria-label') ?? null, kind: mark?.getAttribute('data-selected-dot') ?? null, text: mark?.textContent?.trim() ?? null }
})()`)
check('T10a. today (moved away, on screen) carries the dash, never the session dot', t10.kind === 'away' && t10.text === '–', t10)
await open('', 'exercise')
const t10b = await ev(`(() => { const m = document.querySelector('[data-exercise-strip] [aria-current="date"] [data-selected-dot]'); return m?.getAttribute('data-selected-dot') ?? null })()`)
check('T10b. an ordinary training day on screen keeps its dot (the fixture binds)', t10b === 'plain', t10b)

console.log('\nT8. Home\'s "Start <session>" starts it, so Exercise does not ask again\n')
await open('', 'dashboard')
const t8tap = await ev(`(() => { const b = document.querySelector('[data-home-cta] button'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: b.textContent.trim() } })()`)
if (t8tap) { await pointAt(t8tap); await wait(1500) }
const t8 = await ev(`(() => ({
  hash: location.hash,
  start: !!document.querySelector('[data-testid="hero-start"]'),
  finish: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Finish session'),
}))()`)
check('T8a. Home offers Start on a due day', !!t8tap && /^Start /.test(t8tap.text), t8tap)
check('T8b. one tap opens Exercise with the session already running: Finish is there, Start is not', /exercise/.test(t8.hash) && t8.finish === true && t8.start === false, t8)

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? 'All QA training checks passed.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
