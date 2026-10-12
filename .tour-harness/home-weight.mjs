// ---------------------------------------------------------------------------
// HOME'S WEIGHT PANEL SHOWS THE LATEST WEIGH-IN, NEVER A STORED DATE, AND MEASURES THE CHANGE FROM WHERE
// SHE STARTED, NOT FROM A WEIGH-IN MADE BEFORE THE PLAN.
//
// REPLACED 12 Oct 2026, not re-anchored: the 10 Oct layout pass (design 2a, shown to her and merged on her
// "Merge") redrew the tile as a Weight panel with the figure and "+x.x since you started", and no recency
// word or "since week 1" line. The two user-test findings it held still apply to what is drawn now.
//
// User test, 8 Oct 2026: #22 the tile printed the stored date ("80.0 kg · 2026-09-16") whenever
// the last weigh-in was not today; #23 "-0.6 kg since week 1" was measured from a weigh-in made
// weeks before the plan began, even in week 1. The harness plan began nine days before the anchor,
// and its fixture holds a weigh-in on the anchor (80.0) and one on 21 Aug (80.6, before the plan).
// ?weighins=1 adds one inside the plan, three days before the anchor (80.4).
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring (no harness page boots it).
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9503', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9503/json/list').then(r => r.json())
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
const open = async query => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${query}&n=${loads}#/tab/dashboard` })
  await wait(2500); await ev(`location.hash = '#/tab/dashboard'`); await wait(1500)
}
/** The weight panel's header (figure and change) and the whole panel's text. */
const readTile = () => ev(`(() => {
  const box = document.querySelector('[data-home-weight]')
  const btn = box ? box.querySelector('button[aria-expanded]') : null
  return { figure: btn ? btn.textContent.replace(/\\s+/g, ' ').trim() : null, box: box ? box.innerText.replace(/\\s+/g, ' ').trim() : null }
})()`)
const tileReady = async () => { let t = await readTile(); for (let i = 0; i < 20 && !t.figure; i++) { await wait(500); t = await readTile() } return t }
const plusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

console.log('\nA. On the day of the weigh-in')
await open('')
const a = await tileReady()
// The weigh-in's own date, read off the page (test:harness-clock): every other day is counted from it.
const weighInDate = await ev('window.__weighInTarget?.date ?? null')
check('0. the page names the weigh-in date it was seeded with', /^\d{4}-\d{2}-\d{2}$/.test(weighInDate ?? ''), weighInDate)
check('1. the panel shows the latest weigh-in, 80.0 kg', /^Weight 80\.0 ?kg\b/.test(a.box ?? ''), a)
check('2. ...and never the stored date', !!a.box && !/\d{4}-\d{2}-\d{2}/.test(a.box), a.box)

console.log('\nB. Days and a week later: still the latest figure, still no stored date')
for (const [n, label] of [[1, '3'], [2, '4'], [9, '5']]) {
  await open(`today=${plusDays(weighInDate, n)}`)
  const t = await tileReady()
  check(`${label}. ${n} day(s) after: 80.0 kg, and no stored date anywhere on the panel`, /^Weight 80\.0 ?kg\b/.test(t.box ?? '') && !!t.box && !/\d{4}-\d{2}-\d{2}/.test(t.box), t)
}
await shoot('home-weight-dated')

console.log('\nC. With a weigh-in inside the plan, and one weeks before it')
await open('weighins=1')
const d = await tileReady()
// Started at 80 (setup), weighs 80.0 now; the 21 Aug weigh-in (80.6) predates the plan. "Since you started" is
// measured from the setup weight, so the change is 0.0, never the -0.6 the old "since week 1" line printed (#23).
check('6. the change is measured from where she started (0.0), not from a weigh-in before the plan (-0.6)', /\b0\.0 kg since you started/.test(d.box ?? '') && !/-0\.6/.test(d.box ?? ''), d)
await shoot('home-weight-since')

const err = await ev('window.__err ?? null')
check('7. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nThe weight panel shows the latest figure, no stored date, and the change from where she started.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
