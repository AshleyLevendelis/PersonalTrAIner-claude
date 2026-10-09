// ---------------------------------------------------------------------------
// "BEHIND" IS SAID BY THE CLOCK — ON THE REAL NUTRITION AND HOME TABS.
//
// 9 Oct 2026, the test log's L28 and L8: "Protein is behind — 162g to go"
// before breakfast, an amber "no meals logged yet" at 07:01, and "about 1850ml
// behind on water" seconds after signing up. test:pace-clock and
// test:dashboard §8 hold the rules; this reads the lines off the real tabs at
// phone size, on the harness's one fixed day, at different times of it.
//
// THE TIME COMES FROM THE APP'S OWN CLOCK (?clock=HH:MM sets the dev clock's
// time; ?joined=today makes today the account's first day). Nothing here, and
// nothing it loads, asks the machine what time it is.
//
// PORT 9660.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname
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

const wait = ms => new Promise(r => setTimeout(r, ms))
const portBusy = await fetch('http://127.0.0.1:9660/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9660 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
// Its own profile directory: on the default one, a browser started while
// another driver's is up hands its window to THAT browser and exits.
const profileDir = mkdtempSync(join(tmpdir(), 'pace-clock-'))
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9660', `--user-data-dir=${profileDir}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const giveUp = why => { console.error(`    ✗ ${why}`); try { chrome.kill('SIGKILL') } catch {} ; process.exit(1) }
// A stopwatch on the run, not a clock: it never decides what "today" is.
const watchdog = setTimeout(() => giveUp('the driver did not finish in 150 seconds'), 150_000)
let finishing = false
chrome.once('exit', code => { if (!finishing) giveUp(`the browser exited mid-run (code ${code}) — something outside this driver stopped it; run it again`) })

let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9660/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const until = async (fn, pred, tries = 40) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })


/** The coach's one line on the tab that is open: its words, and whether it is inside the viewport after being scrolled to. */
const nudge = () => ev(`(() => {
  const el = document.querySelector('main [data-testid="trainer-nudge"]')
  if (!el) return { present: false, text: '', onScreen: false }
  el.scrollIntoView({ block: 'center' })
  const r = el.getBoundingClientRect()
  return { present: true, text: (el.textContent || '').replace(/\\s+/g, ' ').trim(), onScreen: r.height > 0 && r.top >= 0 && r.bottom <= innerHeight }
})()`)
const pageText = () => ev(`(document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ')`)
/** True once the tab has drawn its numbers, so "no line" is a settled page and not a loading one. */
const settled = tab => ev(tab === 'nutrition'
  ? `[...document.querySelectorAll('span')].some(e => /^target \\d/.test((e.textContent || '').trim()))`
  : `!!document.querySelector('main') && !/Loading/.test(document.querySelector('main').innerText) && /\\d/.test(document.querySelector('main').innerText)`)

let loads = 0
const open = async (tab, query) => {
  // Its own address every time: the same URL twice is a jump to a #fragment, not a load.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=${++loads}${query}#/tab/${tab}` })
  await until(() => settled(tab), v => v === true)
  await wait(900)
  return { nudge: await nudge(), text: await pageText() }
}

const BEHIND = /\bis behind — \d+(g|ml) to go\./

console.log('\n1. Nutrition: one empty day, read at three times\n')
const n0700 = await open('nutrition', '&clock=07:00')
await shoot('pace-clock-nutrition-0700')
const n1200 = await open('nutrition', '&clock=12:00')
await shoot('pace-clock-nutrition-1200')
const n2000 = await open('nutrition', '&clock=20:00')
await shoot('pace-clock-nutrition-2000')
check('1a. 07:00, nothing logged: the coach says nothing about pace', n0700.nudge.present === false, n0700.nudge)
check('1b. ...and the word "behind" is nowhere on the tab', !/\bbehind\b/i.test(n0700.text), n0700.text.match(/.{0,40}behind.{0,40}/i))
check('1c. 12:00, nothing logged: breakfast\'s time has passed and the line says so', n1200.nudge.present && BEHIND.test(n1200.nudge.text), n1200.nudge)
check('1d. ...where she can see it', n1200.nudge.onScreen === true, n1200.nudge)
check('1e. 20:00, nothing logged: behind', n2000.nudge.present && BEHIND.test(n2000.nudge.text) && n2000.nudge.onScreen === true, n2000.nudge)
check('1f. no leaked NaN / undefined in any of the three', ![n0700, n1200, n2000].some(x => /NaN|undefined|\[object/.test(x.nudge.text)), [n1200.nudge.text, n2000.nudge.text])

console.log('\n2. Nutrition: the day the account was made is quiet at every hour\n')
const first = []
for (const t of ['07:00', '12:00', '20:00']) first.push([t, await open('nutrition', `&joined=today&clock=${t}`)])
await shoot('pace-clock-nutrition-first-day')
for (const [t, x] of first) check(`2. joined today, ${t}: no pace line, and no "behind" on the tab`, x.nudge.present === false && !/\bbehind\b/i.test(x.text), x.nudge)
// The contrast that makes section 2 a test of the first day and not of the fixture.
check('2d. the same 20:00 for somebody nine days in DID speak (so the silence is the first day\'s)', BEHIND.test(n2000.nudge.text) && first[2][1].nudge.present === false, [n2000.nudge.text, first[2][1].nudge])

console.log('\n3. Home: "no meals logged yet" waits for a meal to be due\n')
const h0701 = await open('dashboard', '&clock=07:01')
await shoot('pace-clock-home-0701')
const h1200 = await open('dashboard', '&clock=12:00')
await shoot('pace-clock-home-1200')
const h2153 = await open('dashboard', '&clock=21:53')
const hFirst = await open('dashboard', '&joined=today&clock=21:53')
await shoot('pace-clock-home-first-day')
const NO_MEALS = /no meals logged yet/
const WATER = /behind on water/
check('3a. 07:01: Home does not say "no meals logged yet"', !NO_MEALS.test(h0701.text), h0701.nudge)
check('3b. ...or anything about being behind on water', !WATER.test(h0701.text), h0701.nudge)
check('3c. 12:00: it does', NO_MEALS.test(h1200.text) && NO_MEALS.test(h1200.nudge.text), h1200.nudge)
check('3d. 21:53, nine days in: it does', NO_MEALS.test(h2153.text), h2153.nudge)
check('3e. 21:53 on the day the account was made: neither line', !NO_MEALS.test(hFirst.text) && !WATER.test(hFirst.text), hFirst.nudge)
check('3f. Home drew its numbers in every one of those (a blank page would pass 3a and 3e)', [h0701, h1200, h2153, hFirst].every(x => /\d/.test(x.text) && x.text.length > 200), [h0701.text.length, hFirst.text.length])

console.log(`\n${ran} checks ran.`)
clearTimeout(watchdog)
finishing = true
await new Promise(r => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 5000) })
server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('The pace lines read the app\'s clock.\n')
process.exit(0)
