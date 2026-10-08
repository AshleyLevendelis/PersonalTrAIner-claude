// ---------------------------------------------------------------------------
// HOME'S WEIGHT TILE SAYS WHEN, IN WORDS, AND COUNTS "SINCE WEEK 1" FROM INSIDE THE PLAN.
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
/** The weight tile's text, found by its own "kg" figure button, plus the "since week 1" line if any. */
const readTile = () => ev(`(() => {
  const btn = [...document.querySelectorAll('button[aria-expanded]')].find(b => /kg ·|log one/.test(b.textContent || ''))
  const box = btn ? btn.parentElement : null
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
check('1. the tile reads "today" on the day of the weigh-in', /80\.0 ?kg · today/.test(a.figure ?? ''), a)
check('2. one in-plan weigh-in: no "since week 1" line (the 21 Aug one predates the plan)', !!a.box && !/since week 1/.test(a.box), a.box)

console.log('\nB. The day after')
await open(`today=${plusDays(weighInDate, 1)}`)
const b = await tileReady()
check('3. the day after, it says "yesterday"', /80\.0 ?kg · yesterday$/.test(b.figure ?? ''), b)
check('4. ...and never the stored date', !/\d{4}-\d{2}-\d{2}/.test(b.box ?? ''), b.box)

console.log('\nC. Two days after')
await open(`today=${plusDays(weighInDate, 2)}`)
const c = await tileReady()
check('5. two days after, it names the weekday', c.figure === `80.0kg · ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${weighInDate}T12:00:00Z`).getUTCDay()]}`, c)
check('6. ...and never the stored date', !/\d{4}-\d{2}-\d{2}/.test(c.box ?? ''), c.box)
await shoot('home-weight-dated')

console.log('\nC2. Over a week after')
await open(`today=${plusDays(weighInDate, 9)}`)
const c2 = await tileReady()
check('5b. over a week after, it names the date', c2.figure === `80.0kg · ${Number(weighInDate.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(weighInDate.slice(5, 7)) - 1]}`, c2)

console.log('\nD. With a weigh-in inside the plan')
await open('weighins=1')
const d = await tileReady()
check('7. "since week 1" counts from the first weigh-in since the plan began: -0.4, not -0.6', /-0\.4 kg since week 1/.test(d.box ?? ''), d.box)
await shoot('home-weight-since')

const err = await ev('window.__err ?? null')
check('8. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nThe weight tile says when in words and counts from inside the plan.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
