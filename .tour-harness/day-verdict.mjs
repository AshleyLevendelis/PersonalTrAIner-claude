// ---------------------------------------------------------------------------
// THE NUTRITION HEADER SAYS WHAT THE MEAL ENGINE SAYS.
//
// 9 Oct 2026, the test log's L20: "ON THE NUMBER" at 179 g of protein against
// 164 g, "MACROS OFF" at 181 g. The header had its own rule beside the
// engine's. test:day-verdict holds the two to one answer over 10,800 days;
// this reads the answer off the real Nutrition tab at phone size, on three
// days — one on target, one far under, and the page as it normally loads —
// and compares each with what the engine's own function says about the
// numbers ON THAT SCREEN (worked out in a child process from the app's
// module, not retyped here).
//
// PORT 9653.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { spawn, execFileSync } from 'child_process'

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
const portBusy = await fetch('http://127.0.0.1:9653/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9653 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
// Its own profile directory: on the default one, a browser started while
// another driver's is up hands its window to THAT browser and exits.
const profileDir = mkdtempSync(join(tmpdir(), 'day-verdict-'))
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9653', `--user-data-dir=${profileDir}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const giveUp = why => { console.error(`    ✗ ${why}`); try { chrome.kill('SIGKILL') } catch {} ; process.exit(1) }
// A stopwatch on the run, not a clock: it never decides what "today" is.
const watchdog = setTimeout(() => giveUp('the driver did not finish in 150 seconds'), 150_000)
let finishing = false
chrome.once('exit', code => { if (!finishing) giveUp(`the browser exited mid-run (code ${code}) — something outside this driver stopped it; run it again`) })

let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9653/json/list').then(r => r.json())
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

/** The header as it is on screen: the planned figure, the target, the words beside it, and each macro with whether it is lit. */
const header = () => ev(`(() => {
  const line = [...document.querySelectorAll('span')].find(e => /^target \\d/.test((e.textContent || '').trim()) && e.children.length === 0)
  if (!line) return null
  const hero = line.closest('div')?.parentElement?.parentElement
  if (!hero) return null
  const text = (line.textContent || '').trim()
  const m = /^target (\\d+) · (.+)$/.exec(text)
  const planned = Number((hero.querySelector('.ds-num-mega')?.textContent || '').replace(/[^\\d]/g, ''))
  const macros = {}
  for (const span of hero.querySelectorAll('span')) {
    const mm = /^(\\d+) \\/ (\\d+) ([PCF])$/.exec((span.textContent || '').trim())
    if (mm) macros[mm[3]] = { actual: Number(mm[1]), target: Number(mm[2]), lit: /text-primary-text/.test(span.className) }
  }
  const r = line.getBoundingClientRect()
  return m && macros.P && macros.C && macros.F ? {
    text, label: m[2],
    totals: { calories: planned, protein: macros.P.actual, carbs: macros.C.actual, fat: macros.F.actual },
    targets: { calories: Number(m[1]), protein: macros.P.target, carbs: macros.C.target, fat: macros.F.target },
    proteinLit: macros.P.lit, onScreen: r.top >= 0 && r.bottom <= innerHeight,
  } : null
})()`)

/** What the engine says about a set of totals — from the app's own module, in a child process. */
const scriptPath = join(DIST, '__day-verdict.mts')
const engineSays = cases => {
  writeFileSync(scriptPath, `
import { dayVerdictLabel, dayVerdict, macroOnTarget } from ${JSON.stringify(join(ROOT, 'src/lib/meal-generation.ts'))}
const cases = ${JSON.stringify(cases)}
console.log(JSON.stringify(cases.map(c => ({ label: dayVerdictLabel(c.totals, c.targets), onTarget: dayVerdict(c.totals, c.targets).onTarget, protein: macroOnTarget('protein', c.totals.protein, c.targets.protein) }))))
`)
  return JSON.parse(execFileSync('npx', ['tsx', scriptPath], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop())
}

const load = async (query, n) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=${n}${query}#/tab/nutrition` })
  return until(header, v => !!v)
}

const days = [
  ['the plan sized to its own targets', '&refit=1&drift=1', 'day-verdict-on-target'],
  ['targets 60% above the plan', '&refit=1&drift=1.6', 'day-verdict-off-target'],
  // Targets 20% BELOW the plan: protein is 125% of its target, past the +15%
  // a correct day allows — the case where "at or above target" would light it.
  ['targets 20% below the plan', '&refit=1&drift=0.8', 'day-verdict-over-target'],
  ['the page as it normally loads', '', 'day-verdict-default'],
]
const seen = []
for (const [i, [name, query, shot]] of days.entries()) {
  const h = await load(query, i + 1)
  seen.push({ name, h })
  await wait(300)
  await shoot(shot)
}
const engine = engineSays(seen.map(s => s.h ? { totals: s.h.totals, targets: s.h.targets } : { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 0, protein: 0, carbs: 0, fat: 0 } }))

console.log('\n1. On each day, the header\'s words are the engine\'s\n')
for (const [i, { name, h }] of seen.entries()) {
  check(`1.${i + 1}a. ${name}: the header is on the Nutrition tab, on screen`, !!h && h.onScreen === true, h)
  check(`1.${i + 1}b. ...it says what the engine says about those numbers ("${engine[i].label}")`, !!h && h.label === engine[i].label, { screen: h?.label, engine: engine[i].label, totals: h?.totals, targets: h?.targets })
  check(`1.${i + 1}c. ...protein is lit exactly when the engine has protein on target`, !!h && h.proteinLit === engine[i].protein, { lit: h?.proteinLit, engine: engine[i].protein })
  check(`1.${i + 1}d. ...and neither old phrase is on the screen`, !!h && !/macros off|on the number/i.test(h.text), h?.text)
}

console.log('\n2. The days are not the same day (one candidate cannot test a choice)\n')
{
  const on = seen[0].h, off = seen[1].h
  check('2a. the plan sized to its own targets reads "on target"', on?.label === 'on target' && engine[0].onTarget === true, on)
  check('2b. with targets 60% higher the same plan is NOT on target', off?.label !== 'on target' && engine[1].onTarget === false, off)
  check('2c. ...and the header says by how much, in words with a number in them', !!off && /^\d+ (over|under)$|^(protein|carbs|fat) \d+ g (over|under)$/.test(off.label), off?.label)
  check('2d. the two headers really show different targets', !!on && !!off && on.targets.calories !== off.targets.calories, [on?.targets, off?.targets])
  const over = seen[2].h
  check('2e. on the day with too MUCH protein for its target, protein is above target and NOT lit', !!over && over.totals.protein > over.targets.protein * 1.15 && over.proteinLit === false && engine[2].protein === false, over)
  check('2f. ...while on the on-target day it is lit', on?.proteinLit === true && engine[0].protein === true, on)
}

console.log(`\n${ran} checks ran.`)
clearTimeout(watchdog)
finishing = true
await new Promise(r => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 5000) })
server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('The header and the engine give one answer.\n')
process.exit(0)
