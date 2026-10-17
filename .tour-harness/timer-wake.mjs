// ---------------------------------------------------------------------------
// THE SCREEN STAYS AWAKE WHILE A TIMER RUNS — on the real Tools tab (17 Oct 2026).
//
// Ashley: "When I use the round timer in the app, the phone screen times out and turns off while I'm in the
// middle of training." The app asked the phone to stay awake only while a workout session ran on Exercise; the
// round timer lives on Tools, outside it. This drives the real round timer at phone size and watches what the
// app asks of the phone's screen-awake API, which is stubbed at that boundary (input only: it counts what the
// app requests and releases, and decides nothing):
//
//   1  nothing running: the screen is not held
//   2  a round started: held, once
//   3  paused: let go (a paused timer must not drain the battery)
//   4  started again: held again; reset: let go
//
// NOT PROVEN HERE: that a given phone honours the request (iOS needs 16.4+, and a home-screen app on iPhone
// needs a newer iOS); a browser can only be asked. PORT 9476.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const portBusy = await fetch('http://127.0.0.1:9476/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9476 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9476', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9476/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0, ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

// The phone's screen-awake API, counted. A request returns a sentinel the app can release.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__wl = { requests: 0, held: 0 }
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
    request: async type => {
      window.__wl.requests++; window.__wl.held++
      const s = { type, released: false, onrelease: null, addEventListener() {}, removeEventListener() {},
        release: async () => { if (!s.released) { s.released = true; window.__wl.held-- } } }
      return s
    },
  } })
` })
const wl = () => ev('({ ...window.__wl })')
const clickText = re => ev(`(() => { const n = [...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim())); if (!n) return false; n.click(); return true })()`)
const buttons = () => ev(`[...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 60)`)
const until = async (fn, tries = 20) => { let v = await fn(); for (let i = 0; i < tries && !v; i++) { await wait(250); v = await fn() } return v }

console.log('\nTHE SCREEN STAYS AWAKE WHILE A TIMER RUNS\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=1#/tab/tools` })
await wait(4000)
check('0. the stand-in for the phone\'s screen-awake API is in place (the fixture bites)', (await wl())?.requests === 0)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Timers/.test((x.innerText || '').trim())); if (b) b.click(); return !!b })()`)
await wait(700)
await ev(`(() => { const b = document.querySelector('[data-timer-choice="round"]'); if (b) b.click(); return !!b })()`)
await wait(700)
check('1. NOTHING RUNNING: the screen is not held', (await wl())?.held === 0, await wl())

await ev(`(() => { const b = document.querySelector('[data-protocol="tabata"]'); if (b) b.click(); return !!b })()`)
await wait(400)
check('2. a round is started', await ev(`(() => { const b = document.querySelector('[data-round-sheet-start]'); if (!b) return false; b.click(); return true })()`))
const held = await until(async () => (await wl())?.held === 1)
check('3. A ROUND RUNNING: the screen is held awake, once', !!held && (await wl())?.held === 1, await wl())
await shoot('timer-wake-running')

const paused = await clickText('/^Pause$/')
check('4. Pause is pressed', paused, await buttons())
const let1 = await until(async () => (await wl())?.held === 0)
check('5. PAUSED: the screen is let go, so a paused timer does not drain the battery', !!let1, await wl())

check('6. Resume', await clickText('/^(Resume|Start|Continue)$/'), await buttons())
const again = await until(async () => (await wl())?.held === 1)
check('7. RUNNING AGAIN: held again', !!again, await wl())
check('8. Reset', await clickText('/^Reset$/'), await buttons())
const let2 = await until(async () => (await wl())?.held === 0)
check('9. RESET: let go', !!let2, await wl())
check('10. ...and it asked exactly twice in all (no request storm)', (await wl())?.requests === 2, await wl())

const err = await ev('window.__err ?? null')
check('11. no uncaught error on the page', err === null, err)
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'A running timer keeps the screen awake, and a stopped one lets it sleep.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
