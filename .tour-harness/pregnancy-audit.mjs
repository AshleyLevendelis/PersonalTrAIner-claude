// ---------------------------------------------------------------------------
// THE PREGNANCY AUDIT'S FIXES ON SCREEN (his "A, and build fixes 2 and 3", 22 Nov 2026), the real Exercise tab at 390px.
// The page is given the Pregnant tick and a due date as INPUT (?pregnant=1&due=) and mirrors the due-date pause as App.tsx
// does (the same function). It proves:
//   1. on face-down work (a Copenhagen plank) an opened row says "Stop if your stomach domes down the middle", and a
//      squat on the same day does not;
//   2. nobody who is not pregnant sees the line;
//   3. from the due date, today says her due date is here, to start again after her postnatal check, with that button
//      and no "Start session"; the day before it, the session is there as usual.
// What it cannot see: App.tsx's save of the pause and its resume (held by test:pregnancy-rules §12).
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9541', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9541/json/list').then(r => r.json())
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

const openAll = async () => {
  const n = await ev(`document.querySelectorAll('[data-exercise-name]').length`)
  for (let i = 0; i < n; i++) {
    await ev(`(() => { const c = document.querySelectorAll('[data-exercise-name]')[${i}]; if (c && !c.hasAttribute('data-exercise-open')) { const t = c.querySelector('[role="button"]'); t && t.click() } })()`)
    await wait(400)
  }
  return n
}
const cues = () => ev(`[...document.querySelectorAll('[data-testid="doming-cue"]')].map(c => ({ ex: c.closest('[data-exercise-name]')?.getAttribute('data-exercise-name'), text: c.textContent.trim() }))`)
const cueOn = async name => {
  // Open just this row (the tab keeps one open), then read its line.
  await ev(`(() => { const c = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(name)}); if (c && !c.hasAttribute('data-exercise-open')) { const t = c.querySelector('[role="button"]'); t && t.click() } })()`)
  await wait(800)
  return ev(`(() => { const c = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(name)}); if (!c) return 'no row'; const q = c.querySelector('[data-testid="doming-cue"]'); if (!q) return null; q.scrollIntoView({ block: 'center' }); const r = q.getBoundingClientRect(); return { text: q.textContent.trim(), inView: r.top >= 0 && r.bottom <= 844 } })()`)
}

console.log('\n1. Pregnant (due 30 Dec): the first day of the week the page names that holds a face-down row\n')
await open('pregnant=1&due=2026-12-30')
const dom = await ev('window.__domingTarget')
check('1. the page names the week\u2019s days', (dom?.candidates?.length ?? 0) === 7, dom)
let day = null, shown = [], rowCount = 0
for (const c of dom?.candidates ?? []) {
  await open(`pregnant=1&due=2026-12-30&today=${c}`)
  rowCount = await openAll()
  shown = await cues()
  if (shown.length > 0) { day = c; break }
}
const first = shown[0] ? await cueOn(shown[0].ex) : null
check(`1a. a face-down row says to stop if her stomach domes, on screen (${day}, ${shown[0]?.ex})`, !!first && first.text === 'Stop if your stomach domes down the middle' && first.inView, first)
await shoot('pregnancy-doming')
check('1b. the same day\u2019s other rows do not (fewer lines than rows, every line the same words)', shown.length > 0 && shown.length < rowCount && shown.every(x => x.text === 'Stop if your stomach domes down the middle'), { rowCount, shown })

console.log('\n2. Not pregnant, the same day\n')
await open(`x=1&today=${day}`)
const rows = await openAll()
const none = await cues()
check('2a. no row carries the line (every row opened)', rows > 3 && none.length === 0, { rows, none })

console.log('\n3. Her due date\n')
await open('pregnant=1&due=2026-09-17')
check('3a. the day before her due date the session is there as usual', await startButton() && !(await has('[data-testid="plan-paused-card"]')))
await open('pregnant=1&due=2026-09-16')
const card = await ev(`(() => { const c = document.querySelector('[data-testid="plan-paused-card"]'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { text: c.innerText, inView: r.top >= 0 && r.bottom <= 844 } })()`)
check('3b. on it, today says her due date is here, on screen', !!card && /Your due date is here/.test(card.text) && card.inView, card)
check('3c. ...to start again after her 6-8 week postnatal check', /6-8 week postnatal check with your GP/.test(card?.text ?? ''))
check('3d. ...with that button, never "Resume my plan"', /I've had my check, start again/.test(card?.text ?? '') && !/Resume my plan/.test(card?.text ?? ''))
check('3e. no "Start session"', !(await startButton()))
await shoot('pregnancy-due-date')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('While pregnant, face-down work says when to stop, and her due date pauses the plan.\n')
