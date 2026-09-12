// ---------------------------------------------------------------------------
// THE PRESETS THAT WERE ON THE TILE BEFORE THEY WERE IN THE APP.
//
// Ashley, 12 Sep 2026, from the live app: "under rest timers the app shows
// emom and tabata but these timers dont exist". Measured — the round tab had
// three number inputs and nothing else. She chose to have them built.
//
// scripts/test-round-presets.ts holds the table, the arithmetic and the
// agreement between the tile and what is behind it. This holds the half no
// source check can: that the buttons are on the real screen at phone size,
// that tapping Tabata puts 8 / 20 / 10 into the REAL inputs, and that it
// fills them rather than launching four minutes of work from one mis-tap.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9437', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9437/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()`)
// REAL POINTER EVENTS. Radix and several controls in this app ignore a bare
// .click(), which is a pass that proves nothing — recorded in the harness README.
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickText = re => ev(`(() => { const n = [...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim())); if (!n) return false; n.click(); return true })()`)
/** The three number inputs, read off the screen by their own labels. */
const fields = () => ev(`(() => {
  const out = {}
  for (const l of document.querySelectorAll('label')) {
    const key = l.textContent.replace(/\\s*\\(s\\)/, '').trim().toLowerCase()
    const i = l.querySelector('input')
    if (i && /rounds|work|rest/.test(key)) out[key] = i.value
  }
  return out
})()`)

console.log('\nONE-TAP PRESETS, ON THE REAL SCREEN\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
await wait(4000)

check('0. the Tools tile no longer advertises EMOM',
  !/EMOM/i.test(await ev(`document.body.innerText`)), (await ev(`document.body.innerText`)).match(/Rounds & intervals[^\n]*\n[^\n]*/)?.[0])
check('1. the rounds tile opens', await clickText('/Rounds & intervals/'))
await wait(900)

const text = await ev(`document.body.innerText`)
check('2. Tabata is on the screen as a button', /Tabata/.test(text), text.slice(0, 200))
check('3. ...with its numbers under it, so nothing is opaque', /8 × 20s \/ 10s/.test(text),
  (text.match(/Tabata[^\n]*\n[^\n]*/) || ['not found'])[0])

const before = await fields()
await shoot('round-presets')

check('4. tapping Tabata registers', await tap('[data-preset="tabata"]'))
await wait(600)
const after = await fields()
check('5. ...and it filled the real inputs with 8 / 20 / 10',
  after.rounds === '8' && after.work === '20' && after.rest === '10', { before, after })

// THE THING THAT WOULD BE WORST TO GET WRONG. A preset that STARTS on tap
// runs four minutes of work from one mis-tap, with the numbers never shown.
check('6. ...without starting the timer — the setup form is still up',
  await ev(`!!document.querySelector('input[type="number"]')`)
  && !(await ev(`/GET READY|Round 1 of/i.test(document.body.innerText)`)), null)

check('7. a second preset overwrites the first rather than merging with it',
  await tap('[data-preset="boxing"]'))
await wait(600)
const boxing = await fields()
check('8. ...boxing rounds reads 3 / 180 / 60',
  boxing.rounds === '3' && boxing.work === '180' && boxing.rest === '60', boxing)

// ONE-HANDED ON A GYM FLOOR. 44px is the floor the rest of this app is held to.
const small = await ev(`(() => [...document.querySelectorAll('[data-preset]')]
  .map(n => ({ p: n.getAttribute('data-preset'), h: Math.round(n.getBoundingClientRect().height), w: Math.round(n.getBoundingClientRect().width) }))
  .filter(x => x.h < 44 || x.w < 44))()`)
check('9. every preset button is big enough to hit', Array.isArray(small) && small.length === 0, small)

await shoot('round-presets-tabata')
const err = await ev(`window.__lastError ?? null`)
check('no uncaught error on the page', err === null || err === undefined, err)

console.log(failures === 0 ? '\nEvery preset the tile names is a button that fills the timer.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
