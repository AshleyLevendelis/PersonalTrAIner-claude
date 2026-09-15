// ---------------------------------------------------------------------------
// "ANYTHING FEELING TIGHT?" ON A REAL SCREEN.
//
// Two things a source gate cannot hold, and they are the two that matter:
//
//   1. THE ANSWER REACHES THE WARM-UP. A gate proves tightnessWarmup returns
//      drills. Only a screen proves those drills are the ones she reads before
//      she starts — the code being there and never running is the failure mode
//      CLAUDE.md has a whole rule about.
//   2. IT CHANGES NOTHING ELSE. The plan's own warm-up, the exercises, the sets
//      and the weights are all still exactly what they were. That is a claim
//      about two moments in time on one screen, and source cannot see it.
//
// And the third, which is Ashley's ruling rather than a mechanism: saying it
// HURTS leaves the tightness path entirely and lands in the triage — sharp,
// one-sided or worsening names a professional and changes nothing.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9403', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9403/json/list').then(r => r.json())
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
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

console.log('\nSAYING SOMETHING FEELS TIGHT\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const openTight = () => ev(`(() => {
  const b = document.querySelector('[data-testid="tightness-open"]')
  if (!b) return false
  b.scrollIntoView(); b.click(); return true
})()`)

let ready = await ev(`!!document.querySelector('[data-testid="tightness-open"]')`)
for (let i = 0; i < 24 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('[data-testid="tightness-open"]')`) }
check('0. the question is on the Exercise screen, before the session', ready === true)

// THE BEFORE PICTURE. Everything this must not change, read once and compared
// after — the whole point of a driver over a source check.
const BEFORE = `(() => {
  const t = document.body.innerText
  const warm = document.querySelector('[data-testid="warmup-tightness"]')
  return {
    tightBlock: !!warm,
    // Every weight and every set count on screen, as one string. If a
    // tightness answer moves any of them this changes.
    numbers: (t.match(/\\d+(?:\\.\\d+)? ?kg|\\d+ × \\d+|\\d+ sets?/g) || []).join('|'),
    // THE EXERCISE ROWS THEMSELVES, by the control every row carries. The
    // first version counted capitalised lines, which counts the three added
    // DRILL NAMES as exercises — a proxy that measures the thing it is meant
    // to hold constant.
    rows: document.querySelectorAll('[data-exercise-name]').length,
  }
})()`
const before = await ev(BEFORE)
check('0b. nothing tight is showing yet', before.tightBlock === false, before)

check('1. it opens', await openTight())
await wait(700)
const areasUp = await ev(`!!document.querySelector('[data-testid="tight-areas"]')`)
check('1b. the eight areas are there to tap', areasUp === true)
const areaCount = await ev(`document.querySelectorAll('[data-testid="tight-areas"] [data-area]').length`)
check('1c. ...all eight of them', areaCount === 8, areaCount)
await shoot('tightness-areas')

// --- the ordinary answer -----------------------------------------------------
check('2. tapping hips', await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-areas"] [data-area="hips"]')
  if (!b) return false
  b.click(); return true
})()`))
await wait(300)
check('2b. saving it', await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-save"]')
  if (!b || b.disabled) return false
  b.click(); return true
})()`))
await wait(1200)

const READ = `(() => {
  const t = document.body.innerText
  return {
    tightBlock: !!document.querySelector('[data-testid="warmup-tightness"]'),
    heading: /For what feels tight/i.test(t),
    saysWhy: /you said felt tight/i.test(t),
    namesHips: /hips/i.test(t),
    drills: [...document.querySelectorAll('[data-testid="warmup-tightness"] .text-xs')].map(e => (e.textContent || '').trim()).filter(Boolean),
    numbers: (t.match(/\\d+(?:\\.\\d+)? ?kg|\\d+ × \\d+|\\d+ sets?/g) || []).join('|'),
    rows: document.querySelectorAll('[data-exercise-name]').length,
  }
})()`
let after = await ev(READ)
for (let i = 0; i < 30 && !after.tightBlock; i++) { await wait(400); after = await ev(READ) }

check('3. THE WARM-UP GAINED MOVEMENT FOR IT', after.tightBlock === true, after)
check('3b. ...under its own heading', after.heading === true, after)
check('3c. ...saying why it is there', after.saysWhy === true && after.namesHips === true, after)
check('3d. ...with at least one real drill named', after.drills.length > 0, after.drills)
// SCROLL TO THE THING BEFORE PHOTOGRAPHING IT. A screenshot of the part of
// the page that did not change is not evidence about the part that did.
await ev(`document.querySelector('[data-testid="warmup-tightness"]')?.scrollIntoView({ block: 'center' })`)
await wait(500)
await shoot('tightness-warmup')

// THE OTHER HALF OF THE PROMISE.
check('4. NOT ONE WEIGHT OR SET CHANGED', after.numbers === before.numbers,
  { before: before.numbers.slice(0, 120), after: after.numbers.slice(0, 120) })
check('4b. ...and no exercise came or went', after.rows === before.rows && before.rows > 0,
  { before: before.rows, after: after.rows })

// --- clearing it -------------------------------------------------------------
check('5. reopening shows her own answer back', await openTight())
await wait(700)
const stillOn = await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-areas"] [data-area="hips"]')
  return b ? b.getAttribute('aria-pressed') === 'true' : null
})()`)
check('5b. ...with hips still selected', stillOn === true, stillOn)
check('5c. clearing it', await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-all-good"]')
  if (!b) return false
  b.click(); return true
})()`))
await wait(1200)
let cleared = await ev(READ)
for (let i = 0; i < 20 && cleared.tightBlock; i++) { await wait(400); cleared = await ev(READ) }
check('5d. ...and the drills go', cleared.tightBlock === false, cleared)

// --- the branch that must never change anything ------------------------------
check('6. reopening to say it hurts', await openTight())
await wait(700)
check('6b. "it actually hurts" is there, apart from the areas', await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-hurts"]')
  if (!b) return false
  b.click(); return true
})()`))
await wait(600)
const kinds = await ev(`[...document.querySelectorAll('[data-testid="tight-hurt-kind"] [data-hurt]')].map(b => b.getAttribute('data-hurt'))`)
check('6c. THE THREE KINDS, not a softer version of them',
  Array.isArray(kinds) && kinds.length === 3 && kinds.includes('red_flag'), kinds)

check('7. choosing the one that needs a person', await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-hurt-kind"] [data-hurt="red_flag"]')
  if (!b) return false
  b.click(); return true
})()`))
await wait(600)
const red = await ev(`(() => {
  const el = document.querySelector('[data-testid="tight-red-flag"]')
  return { shown: !!el, text: el ? el.textContent : '' }
})()`)
check('7b. it names a professional', red.shown === true && /physio|doctor|professional/i.test(red.text), red.text?.slice(0, 160))
check('7c. ...and offers no way to change the plan from here',
  !/warm-up|add these|rest day|lighter|shorten/i.test(red.text ?? ''), red.text?.slice(0, 200))
await shoot('tightness-red-flag')

check('8. acknowledging it', await ev(`(() => {
  const b = document.querySelector('[data-testid="tight-red-flag-ack"]')
  if (!b) return false
  b.click(); return true
})()`))
await wait(1200)
const post = await ev(READ)
check('8b. THE RED FLAG CHANGED NOTHING — no drills added', post.tightBlock === false, post)
check('8c. ...and not a weight or set either', post.numbers === before.numbers,
  { before: before.numbers.slice(0, 120), after: post.numbers.slice(0, 120) })

const err = await ev('window.__err ?? null')
check('9. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nTightness adds warm-up. Pain goes to the triage. Nothing else moves.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
