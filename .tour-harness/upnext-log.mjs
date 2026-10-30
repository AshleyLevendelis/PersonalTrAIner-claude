// verify:upnext-log, runs 7-10 M55.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9617', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9617/json/list').then(r => r.json())
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
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// ---------------------------------------------------------------------------
// LOG IT MOVES "UP NEXT" ON (runs 7-10, M55, 20 Oct 2026). After "Log it" on breakfast the card still said
// "Up next · Breakfast · Log it", so it was easy to log twice. This taps the real card on the real MealPlan
// (real.tsx; App.tsx is not booted, so Home's row is not proven here) and reads what the screen says next.
// ---------------------------------------------------------------------------
const upNext = () => ev(`(() => { const a = document.querySelector('[data-upnext-actions]'); const row = a?.closest('[data-meal-row]'); return row ? row.getAttribute('data-meal-row') : null })()`)
// The Eaten section is drawn without row markers: read the slot labels between "EATEN" and the next section.
// RE-ANCHORED 30 Oct 2026: read off the rows' own markers, not the slot labels' letter case (no longer capitals).
const eatenRows = () => ev(`[...document.querySelectorAll('[data-meal-row][data-variant="eaten"]')].map(n => n.getAttribute('data-meal-row'))`)
const logButtons = () => ev(`document.querySelectorAll('[data-upnext-log]').length`)

console.log('\nLOG IT MOVES UP NEXT ON\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&leftovers=1#/tab/nutrition` })
for (let i = 0; i < 80; i++) { if (await upNext()) break; await wait(250) }
const first = await upNext()
check('0. Nutrition shows an up-next meal with Log it', !!first && (await logButtons()) === 1, { first })
await shoot('upnext-before')
await ev(`document.querySelector('[data-upnext-log]')?.click()`)
let next = first
for (let i = 0; i < 40; i++) { next = await upNext(); if (next !== first) break; await wait(100) }
check('1. straight after the tap, up next is a different meal', !!first && next !== first, { first, next })
check('2. ...the logged meal is under Eaten', (await eatenRows()).includes(first), await eatenRows())
check('3. ...and its card has no Log it left to tap twice', !(await ev(`!!document.querySelector('[data-meal-row="${first}"] [data-upnext-log]')`)))
await wait(800)
check('4. it stays moved on once the saved log is read back', (await upNext()) === next && (await eatenRows()).includes(first), { upNext: await upNext(), eaten: await eatenRows() })
await shoot('upnext-after')

console.log(failures === 0 ? '\nup next: all checks passed\n' : `\n${failures} check(s) FAILED.\n`)
try { chrome.kill() } catch {}
server.close()
process.exit(failures === 0 ? 0 : 1)
