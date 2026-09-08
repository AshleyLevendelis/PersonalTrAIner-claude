// ---------------------------------------------------------------------------
// THE DAY SHE SWAPPED, ON THE SCREEN SHE LOOKED AT.
//
// 8 Sep 2026: Ashley told the coach she had missed the morning session and
// done Muay Thai instead. Both writes landed and the week strip drew its swap
// glyph — and the panel underneath went on offering "Start workout" for the
// session she had just replaced. A source check can prove the code reads the
// field; only a browser can show that the screen stopped lying.
//
// Runs the REAL ExerciseTab at 390x844 with one workout_sessions row
// (?swapped=1 in real.tsx), and asserts both halves: the screen says what she
// did, and the primary action stops claiming the session is still ahead.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9352', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9352/json/list').then(r => r.json())
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
  const banner = document.querySelector('[data-testid="swapped-today"]')
  const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
  return {
    banner: banner ? banner.textContent.trim() : null,
    saysStartWorkout: buttons.includes('Start workout'),
    saysTrainAnyway: buttons.includes('Train it anyway'),
    hasExerciseList: /MAIN LIFT|ACCESSORY|PRIMER/i.test(text),
    sample: text.replace(/\s+/g, ' ').slice(0, 220),
  }
})()`)

// --- the day WITHOUT a swap: nothing changes -------------------------------
console.log('\nA DAY SHE SWAPPED — and an ordinary day, which must be untouched\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(2500); await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
let plain = await read()
for (let i = 0; i < 12 && !plain.saysStartWorkout; i++) { await wait(500); plain = await read() }
check('an ordinary training day still offers Start workout', plain.saysStartWorkout, plain)
check('...and shows no swap banner', plain.banner === null, plain.banner)

// --- the swapped day -------------------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&swapped=1#/tab/exercise` })
await wait(2500); await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
let swapped = await read()
for (let i = 0; i < 16 && swapped.banner === null; i++) { await wait(500); swapped = await read() }

check('1. the screen says she swapped, and names what she did', /Muay Thai/.test(swapped.banner ?? ''), swapped.banner)
check('2. the primary action stops claiming the session is still ahead', !swapped.saysStartWorkout, swapped)
check('3. ...and offers it as a choice instead', swapped.saysTrainAnyway, swapped)
check('4. the session itself is still there, not hidden', swapped.hasExerciseList, swapped)

await shoot('swapped-day')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA swapped day says so, and stops offering the workout.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
