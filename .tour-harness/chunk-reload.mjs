// ---------------------------------------------------------------------------
// A SCREEN WHOSE FILE WAS DEPLOYED AWAY RELOADS THE APP ONCE — on a real screen.
//
// Run 7 (14 Oct 2026, H30): the app was open while a new version went live; the Exercise tab asked for its
// "What happened?" sheet by the old file name, the host no longer had it, and the whole app fell to the
// error screen until "Reload the app" was tapped. This serves the real Exercise tab (real.html) with that
// one file missing, the way a host does after a deploy, and watches what the app does:
//
//   A  the file is missing ONCE (an old page meeting a new deploy): the app reloads by itself, exactly once,
//      and the Exercise tab and its What happened sheet then work
//   B  the file is missing EVERY time (a deploy that is genuinely broken): one reload and no more, then the
//      error screen with "Reload the app", never a loop and never a "Try again" that cannot work
//
// The page wraps the harness in the app's own AppErrorBoundary, as main.tsx does. NOT PROVEN HERE: the
// `vite:preloadError` listener for plain import() calls (test:chunk-reload holds that it is installed).
//
// PORT 9472.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const MISSING = /^\/assets\/WhatHappenedSheet-[^/]+\.js$/
let mode = 'serve'          // 'once' | 'always' | 'serve'
let pageLoads = 0
let missingServed = 0
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  if (p === '/') pageLoads++
  if (MISSING.test(p) && (mode === 'always' || (mode === 'once' && missingServed === 0))) {
    missingServed++
    res.writeHead(404); res.end('gone'); return
  }
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const portBusy = await fetch('http://127.0.0.1:9472/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9472 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9472', '--no-sandbox', '--disable-gpu', '--disable-http-cache', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9472/json/list').then(r => r.json())
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

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const screen = () => ev(`({ crashed: /Something went wrong on this screen/.test(document.body?.innerText ?? ''), buttons: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 40), exercise: !!document.querySelector('button[aria-label="More options"]') })`)
const settle = async () => { for (let i = 0; i < 30; i++) { await wait(400); const s = await screen().catch(() => null); if (s && (s.crashed || s.exercise)) return s } return screen().catch(() => null) }

// Did the error screen EVER show, even for a moment before a reload? Recorded in sessionStorage, which a reload
// keeps, by a watcher installed on every page load. The screen's own reload hides the crash from her; the root
// error screen's reload would recover too, but only after flashing the crash at her first.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  new MutationObserver(() => {
    if (/Something went wrong on this screen/.test(document.body ? document.body.innerText : '')) { try { sessionStorage.setItem('saw-crash', '1') } catch {} }
  }).observe(document, { childList: true, subtree: true, characterData: true })
` })

console.log('\nA SCREEN WHOSE FILE WAS DEPLOYED AWAY RELOADS ONCE\n')

// --- A: missing once ------------------------------------------------------
mode = 'once'; pageLoads = 0; missingServed = 0
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=1#/tab/exercise` })
await wait(6000)
let a = await settle()
check('A1. the sheet\'s file really was missing on the first load (the fixture bites)', missingServed >= 1, { missingServed })
check('A2. THE APP RELOADED ITSELF, EXACTLY ONCE', pageLoads === 2, { pageLoads })
check('A3. ...and the Exercise tab is up, not the error screen', !!a && a.exercise === true && a.crashed === false, a)
await tap('button[aria-label="More options"]'); await wait(500)
await tap('[data-testid="what-happened-item"]'); await wait(800)
check('A4. ...and its What happened sheet opens (the file loaded on the reload)', await has('[data-testid="what-happened-sheet"]'))
check('A5. ...and the error screen never showed, not even for a moment before the reload', (await ev(`(() => { try { return sessionStorage.getItem('saw-crash') } catch { return 'unreadable' } })()`)) === null)
await shoot('chunk-reload-recovered')

// --- B: missing every time ----------------------------------------------
await ev(`(() => { try { sessionStorage.clear() } catch {} return true })()`)
mode = 'always'; pageLoads = 0; missingServed = 0
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=2#/tab/exercise` })
await wait(6000)
const b = await settle()
await wait(4000)
const loadsAfterWait = pageLoads
check('B1. a deploy that stays broken reloads once and then STOPS (no loop)', loadsAfterWait === 2, { pageLoads: loadsAfterWait })
// SINCE 10 NOV 2026 (a gym with no signal) a part that cannot be fetched no longer takes the whole app: it used to
// stop at the error screen here. Now the Exercise tab stays up and usable, nothing is said about a sheet nobody has
// opened, and opening it says the part did not load and offers the one thing that can fetch it. The old B3 stands:
// no "Try again" that could never work.
check('B2. ...and the Exercise tab is UP and usable, not the error screen', !!b && b.crashed === false && b.exercise === true && b.buttons.includes('Start session'), b)
check('B2b. ...with no notice floating over it for a sheet nobody opened', (await has('[data-testid="part-not-loaded"]')) === false)
await tap('button[aria-label="More options"]'); await wait(500)
await tap('[data-testid="what-happened-item"]'); await wait(900)
const said = await ev(`(() => { const n = document.querySelector('[data-testid="part-not-loaded"]'); return n ? { text: n.innerText, buttons: [...n.querySelectorAll('button')].map(x => x.textContent.trim()) } : null })()`)
check('B2c. asked for, the sheet says it did not load, in place', !!said && /didn't load/.test(said.text) && /everything you log is saved/i.test(said.text), said)
check('B3. ...offering "Reload the app", without a "Try again" that could never work (the failed file stays failed)', !!said && said.buttons.includes('Reload the app') && !said.buttons.includes('Try again'), said?.buttons)
await shoot('chunk-reload-broken-deploy')
const loadsBeforeTap = pageLoads
await ev(`[...document.querySelectorAll('[data-testid="part-not-loaded"] button')].find(x => x.textContent.trim() === 'Reload the app')?.click()`)
await wait(5000)
check('B4. her tap reloads the app, inside the twenty seconds the automatic reload is refused for', pageLoads === loadsBeforeTap + 1, { before: loadsBeforeTap, after: pageLoads })
check('B5. ...and that reload does not start a loop', await (async () => { await wait(4000); return pageLoads === loadsBeforeTap + 1 })(), { pageLoads })

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'A missing file reloads once; a broken deploy leaves the app usable and says so where the part was asked for.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
