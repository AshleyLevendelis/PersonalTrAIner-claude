// ---------------------------------------------------------------------------
// "I'LL DO IT TOMORROW", ON THE TWO SCREENS THAT ANSWER "WHAT IS TODAY?"

//
// scripts/test-session-move.ts proves the rules and classifyDay's verdicts.
// What it cannot prove is that a real mount, reading a real row through
// useTrainingWeek, ends up drawing the right thing on both tabs — which is
// exactly the split that shipped on 8 Sep 2026, when the week strip drew its
// swap glyph correctly while the panel underneath went on offering "Start
// workout" for a session Ashley had already replaced.
//
// One workout_sessions row (?moved=1 in real.tsx): today's session moved to
// tomorrow, which in this fixture is a free day. Asserts three things on the
// Exercise tab and one on Home, plus the ordinary day being untouched.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9357', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9357/json/list').then(r => r.json())
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

const read = () => ev(`(() => {
  const text = document.body.innerText
  const away = document.querySelector('[data-testid="moved-away"]')
  const inb = document.querySelector('[data-testid="moved-in"]')
  const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
  return {
    movedAway: away ? away.textContent.trim() : null,
    movedIn: inb ? inb.textContent.trim() : null,
    saysStartWorkout: buttons.includes('Start workout'),
    saysTrainAnyway: buttons.includes('Train it anyway'),
    hasExerciseList: /MAIN LIFT|ACCESSORY|PRIMER/i.test(text),
    strip: text,
    sample: text.replace(/\s+/g, ' ').slice(0, 240),
  }
})()`)

const tomorrowName = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'long' })

console.log('\nA SESSION MOVED TO ANOTHER DAY — and an ordinary day, which must be untouched\n')

// --- the ordinary day: nothing about this feature may change it ------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(2500); await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
let plain = await read()
for (let i = 0; i < 12 && !plain.saysStartWorkout; i++) { await wait(500); plain = await read() }
check('an ordinary training day still offers Start workout', plain.saysStartWorkout, plain)
check('...and shows no move banner either way', plain.movedAway === null && plain.movedIn === null, plain)

// --- the moved day ---------------------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&moved=1#/tab/exercise` })
await wait(2500); await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
let moved = await read()
for (let i = 0; i < 16 && moved.movedAway === null; i++) { await wait(500); moved = await read() }

check('1. the Exercise tab says the session moved, and names the day',
  new RegExp(tomorrowName).test(moved.movedAway ?? ''), moved.movedAway)
check('2. the primary action stops claiming the session is still ahead today',
  !moved.saysStartWorkout, moved)
check('3. ...and offers it as a choice instead', moved.saysTrainAnyway, moved)
check('4. the session itself is still there, not hidden', moved.hasExerciseList, moved)
check('5. and it is NOT reported as a swap for another activity',
  !/swapped today for/i.test(moved.strip), moved.sample)

await shoot('session-move-exercise')

// --- Home, which must agree with it ---------------------------------------
await ev(`location.hash = '#/tab/dashboard'`); await wait(2500)
let home = await ev(`document.body.innerText`)
for (let i = 0; i < 16 && !/Moved to /.test(home); i++) { await wait(500); home = await ev(`document.body.innerText`) }
check('6. Home says the same thing, on the same day',
  new RegExp(`Moved to ${tomorrowName}`).test(home), home.replace(/\s+/g, ' ').slice(0, 300))
check('7. ...and does NOT call it a rest day', !/Rest day/.test(home), home.replace(/\s+/g, ' ').slice(0, 300))
// THE STRIP, read the way a screen reader reads it. Its glyphs are not all
// plain text (today's cell is drawn, not written), so innerText cannot see
// them — and the aria-label is the more useful assertion anyway: it is the
// sentence a person using VoiceOver actually hears.
const stripLabels = await ev(`(() => [...document.querySelectorAll('[aria-label]')]
  .map(n => n.getAttribute('aria-label'))
  .filter(l => /rest day|missed|due|done|moved|swapped|recovery/i.test(l)))()`)
check('8. the week strip says the day moved, rather than that it is due or missed',
  Array.isArray(stripLabels) && stripLabels.some(l => /moved to another day/i.test(l)), stripLabels)

await shoot('session-move-home')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA moved session says so, on both screens.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
