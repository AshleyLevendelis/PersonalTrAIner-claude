// ---------------------------------------------------------------------------
// NUTRITION PRINTS ONE CALORIE TARGET (runs 7-10, M58, 18 Oct 2026).
//
// Sam saw 1,689 at the top of Nutrition and "1684 kcal · TDEE 2105 −421" lower down: the top is worked out from the
// anchored 7-day weight, the row and the "how it's set" sheet were re-derived from the raw latest weigh-in. Driven
// with a weigh-in heavier than the anchor (?weighin=81.7, the anchor still 80 kg), the real Nutrition screen:
//   1. prints the same target at the top, on the "Targets & plan settings" row and in the sheet's Target cell;
//   2. and the sheet's chain names the weight the targets are worked out from (80 kg), not the morning's reading.
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
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9525', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9525/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

let ran = 0
const checkC = (name, ok, detail) => { ran++; check(name, ok, detail) }
console.log('\nONE CALORIE TARGET ON NUTRITION\n')
let loads = 0
const open = async (q) => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${q}&n=${loads}#/tab/nutrition` })
  await wait(2500); await ev(`location.hash = '#/tab/nutrition'`); await wait(2500)
}
const num = s => s == null ? null : Number(String(s).replace(/[^0-9]/g, ''))
async function read() {
  return ev(`(() => ({
    top: document.querySelector('[data-testid="kcal-target"]')?.innerText ?? null,
    row: document.querySelector('[data-testid="target-kcal"]')?.innerText ?? null,
  }))()`)
}
async function sheet() {
  await ev(`document.querySelector('[data-targets-row]')?.click()`); await wait(900)
  const s = await ev(`(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); if (!d) return null
    const cells = [...d.querySelectorAll('p')].map(p => p.innerText.trim())
    const i = cells.findIndex(t => /^target$/i.test(t))
    return { target: i > 0 ? cells[i - 1] : null, text: d.innerText } })()`)
  return s
}

await open('weighin=81.7')
const r = await read()
checkC('1a. a target at the top and on the row', num(r.top) > 0 && num(r.row) > 0, r)
checkC('1b. THE SAME TARGET: the row prints the number at the top', num(r.top) === num(r.row), r)
const s = await sheet()
checkC("1c. ...and so does the sheet's Target cell", !!s && num(s.target) === num(r.top), { top: r.top, sheet: s?.target })
checkC("2. the sheet says the weight the targets use (80 kg), not this morning's 81.7", !!s && /From 80 kg/.test(s.text) && !/From 81\.7 kg/.test(s.text), s?.text?.slice(0, 300))
await shoot('one-calorie-target')

// TARGETS THAT MOVE WITH THE TRAINING DAY: the top is today's target, and the row must print that one, not the
// week's static baseline the sheet's chain explains.
await open('weighin=81.7&macromode=dynamic')
const d = await read()
checkC("3. with targets that move by training day, the row still prints today's target, the one at the top", num(d.top) > 0 && num(d.top) === num(d.row), d)

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('Nutrition prints one calorie target.\n')
