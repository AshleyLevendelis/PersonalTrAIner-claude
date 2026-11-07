// ---------------------------------------------------------------------------
// MUAY THAI IS FUELLED (7 Nov 2026, Ashley: "yes, add the extra calories on
// sport days"). The real Nutrition tab, at phone size, with and without her
// Muay Thai (?muay=1):
//   1. Standard: the target is higher with the sport, by the week's sport
//      energy over seven days after the goal's adjustment, and "How your
//      targets are set" says why, in one sentence, on screen;
//   2. without the sport the sentence is absent and the number is the old one;
//   3. Dynamic: the sentence says it goes on the day itself.
// WHAT THIS CANNOT SEE: App.tsx's own target effect (no harness page boots
// App for Nutrition); test:sport-fuel holds the arithmetic and the readers.
// PORT 9487.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// THE ONE-PAGE HOME, NUTRITION AND EXERCISE, DRIVEN AT 390px (design 5c·5 / 5c·6 / 5c·4, 17 Oct 2026).
//
// Reads the numbers off the real screens and taps her three rulings of that day:
//   A. Home: the headline is the mean of the rings drawn; Steps in the key opens the steps entry, the other
//      rows and the rings open Nutrition; the pill says "in a row"; the next meal is the dish (and the kcal)
//      Nutrition's Up next card shows; the docked button names today's session and sits above the tab bar.
//   B. Nutrition: the day strip is above the calories; no rings; the bar is eaten over target; the water
//      cell opens the quick-add, +500 moves it by 0.5 L and Undo puts it back; Targets opens the sheet.
//   C. Exercise: the week line's count is the strip's; no rings, no Program card, the week number opens the
//      programme; the ⋯ menu still holds What happened?; "Start session" is docked. (Re-anchored 30 Oct 2026.)
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring (no harness page boots it); real.tsx passes Home the meals
// the way App does.
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

const PORT = 9487
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
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
const open = async (tab, q = '') => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${q}&n=${loads}#/tab/${tab}` })
  await wait(2500); await ev(`location.hash = '#/tab/${tab}'`); await wait(2000)
}
/** A real click at an element's centre (a dispatched element.click() can open and shut a row in one tick). */
const tap = async sel => {
  const r = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()`)
  if (!r) return false
  await wait(150)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 })
  await wait(700)
  return true
}
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)


const readSheet = async () => {
  await tap('[data-targets-row]')
  await wait(400)
  const r = await ev(`(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find(x => /How your targets are set/.test(x.innerText)); if (!d) return null
    const nums = [...d.querySelectorAll('.tabular-mono')].map(n => Number(n.innerText.replace(/[^0-9-]/g, '')))
    const note = d.querySelector('[data-testid="sport-fuel-note"]'); const b = note ? note.getBoundingClientRect() : null
    return { tdee: nums[1], target: nums[3], note: note ? note.innerText.trim() : null, inView: !!b && b.top >= 0 && b.bottom <= innerHeight } })()`)
  return r
}

console.log('\n1. Standard, with her Muay Thai')
await open('nutrition', 'muay=1')
const withSport = await readSheet()
check('1a. the sheet opens with its numbers', !!withSport && withSport.target > 0, withSport)
check('1b. it says what Muay Thai adds, and that it assumed an hour', /^Muay Thai adds about \d+ kcal a class \(taken as 60 minutes\), twice a week, spread across the week: \+\d+ kcal a day\.$/.test(withSport?.note ?? ''), withSport?.note)
check('1c. ...on screen', !!withSport?.inView, withSport)
await shoot('sport-fuel-standard')

console.log('\n2. Standard, without it')
await open('nutrition')
const without = await readSheet()
check('2a. no sentence without a sport', !!without && without.note === null, without)
const perDay = Number((withSport?.note ?? '').match(/\+(\d+) kcal a day/)?.[1] ?? NaN)
check('2b. the day\'s burn is higher by exactly what the sentence says', !!withSport && !!without && withSport.tdee - without.tdee === perDay, { with: withSport?.tdee, without: without?.tdee, perDay })
check('2c. ...and so is the target (after the goal\'s own adjustment)', !!withSport && !!without && withSport.target > without.target && withSport.target - without.target <= perDay * 1.25 + 10, { with: withSport?.target, without: without?.target })

console.log('\n3. Dynamic')
await open('nutrition', 'muay=1&macromode=dynamic')
const dyn = await readSheet()
check('3a. it says the extra goes on the day itself', /, on the day itself\.$/.test(dyn?.note ?? ''), dyn?.note)
await shoot('sport-fuel-dynamic')

console.log(`\n${ran} checks ran`)
ws.close(); chrome.kill(); server.close()
if (failures) console.error(`${failures} check(s) failed`)
else console.log('sport fuel: the sport is fuelled, on screen')
process.exit(failures === 0 ? 0 : 1)
