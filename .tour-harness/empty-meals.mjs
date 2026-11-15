import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p === '/grocery' ? '/.tour-harness/grocery.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const PORT = 9811
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())
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
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let ran = 0
let failures = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol
const num = t => (t == null ? NaN : Number(String(t).replace(/,/g, '')))
const fmt = v => Math.round(v).toLocaleString('en-GB')

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const open = async (path, ready) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${path}` })
  for (let i = 0; i < 75; i++) { if (await ev(`!!document.querySelector(${JSON.stringify(ready)})`)) break; await wait(200) }
  await wait(900)
}

// verify:empty-meals (15 Nov 2026, the coeliac nurse): three meals a day chosen, lunch and dinner never saved a dish.
// Nutrition must draw both, say why in its own sentence, and offer Try again; with every meal present, nothing is drawn.
console.log('\n[E1] Lunch and dinner with no dishes are drawn and said')
await open('/?tour=off&emptymeals=1#/tab/nutrition', '[data-testid="meal-day-strip"]')
const rows = await ev(`[...document.querySelectorAll('[data-testid="empty-meal"]')].map(r => ({ slot: r.dataset.slot, text: r.innerText.replace(/\\s+/g, ' ').trim(), retry: !!r.querySelector('button') }))`)
check('E1a. one row each for lunch and dinner', Array.isArray(rows) && rows.map(r => r.slot).join() === 'lunch,dinner', rows)
check('E1b. ...each says what it had to fit, never the diet as something to loosen', Array.isArray(rows) && rows.every(r => /yet\. Nothing we tried fitted .*your targets/.test(r.text) && !/loosen/i.test(r.text)), rows)
check('E1c. ...with Try again', Array.isArray(rows) && rows.every(r => r.retry), rows)
const firstInView = await ev(`(() => { const r = document.querySelector('[data-testid="empty-meal"]'); if (!r) return false; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight })()`)
check('E1d. ...on screen where he can read it', firstInView === true)
await shoot('empty-meals-1')

console.log('\n[E2] The control: every meal present, nothing drawn')
await open('/?tour=off#/tab/nutrition', '[data-testid="meal-day-strip"]')
check('E2a. no empty-meal row when every meal has dishes', (await ev(`document.querySelectorAll('[data-testid="empty-meal"]').length`)) === 0)

console.log(`\n${ran} checks ran`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
chrome.kill(); server.close(); ws.close()
process.exit(failures ? 1 : 0)
