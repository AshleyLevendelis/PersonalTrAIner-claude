// ---------------------------------------------------------------------------
// THE MAIN CHAT COMPOSER, WITH THE KEYBOARD UP.
//
// Ashley reported the onboarding composer covering the conversation. The same
// two defects were fixed in ChatAssistant BY PARITY and could not be measured,
// because real.tsx's chat tab was a stub div. This drives the REAL component
// in the REAL container App.tsx puts it in (.tour-harness/chat.tsx).
//
// WHAT IT FOUND, before anything was changed, at 390x844 with a 336px
// keyboard: the Card is `h-[600px]` (48-648) while the composer is fixed to
// the VIEWPORT. Keyboard shut they never meet (composer 704-780). Keyboard up
// the composer rides to 416 — 232px INSIDE the card — and the newest message,
// at 512-552, was entirely behind it. The scroller reserved a static 96px
// that never grew.
//
// TWO HEADLESS FACTS THIS HARNESS DEPENDS ON, both learned the hard way:
//   1. A headless page is NOT focused, so element.focus() sets activeElement
//      without dispatching focus events — measured, focusin fired 0 times.
//      useViewportInset gates isKeyboardOpen on a focused input, so without
//      Emulation.setFocusEmulationEnabled the layout never enters the state
//      under test and this file would have reported everything fine.
//   2. The keyboard itself cannot be emulated, but the two inputs the hook
//      actually reads can be: a focused input and a visualViewport shorter
//      than innerHeight.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0].split('#')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', '--remote-debugging-port=9365', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9365/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
async function call(fn, ...args) {
  const r = await send('Runtime.evaluate', { expression: `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}

let failures = 0
const check = (l, ok, extra) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(3500)

function armSpies() {
  window.__spy = { focusin: 0, vvresize: 0 }
  document.addEventListener('focusin', () => { window.__spy.focusin++ })
  window.visualViewport.addEventListener('resize', () => { window.__spy.vvresize++ })
  return true
}
function forceKeyboard(px) {
  const vv = window.visualViewport
  Object.defineProperty(vv, 'height', { get: () => window.innerHeight - px, configurable: true })
  Object.defineProperty(vv, 'offsetTop', { get: () => 0, configurable: true })
  document.querySelector('textarea').focus()
  vv.dispatchEvent(new Event('resize'))
  return { computedInset: window.innerHeight - vv.height, focused: document.activeElement.tagName, spy: window.__spy }
}
function measure() {
  const ta = document.querySelector('textarea')
  if (!ta) return { error: 'no chat composer rendered', err: window.__err || null }
  const scroller = [...document.querySelectorAll('*')].find(e => {
    const s = getComputedStyle(e); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > 200
  })
  if (!scroller) return { error: 'no scrolling message list found' }
  const composer = ta.closest('[class*="fixed"]')
  scroller.scrollTo({ top: scroller.scrollHeight })
  const last = scroller.firstElementChild ? scroller.firstElementChild.lastElementChild : null
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) } }
  return {
    scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
    padBottom: getComputedStyle(scroller).paddingBottom,
    composer: r(composer), lastMessage: r(last),
    // Positive means the composer is sitting ON TOP of the newest message.
    newestCoveredPx: last ? Math.round(last.getBoundingClientRect().bottom - composer.getBoundingClientRect().top) : null,
    tabBarPresent: !!document.querySelector('[data-slot="tab-bar"], nav'),
  }
}

await call(armSpies)

console.log('\n[1] Keyboard shut — a real conversation scrolls, and the newest message is visible')
const shut = await call(measure)
check('the real ChatAssistant mounted (sanity check on the harness)', !shut.error, shut)
check('a seeded conversation actually overflows the card, so this is not an empty thread',
  shut.scrollable === true, shut)
check('the newest message is not under the composer', shut.newestCoveredPx < 0, shut)
console.log(`      composer ${shut.composer?.top}-${shut.composer?.bottom}, newest message ends ${shut.lastMessage?.bottom}, pad ${shut.padBottom}`)

console.log('\n[2] Keyboard up — the state where the fixed composer rides into the fixed-height card')
const forced = await call(forceKeyboard, 336)
check('the app really believes a keyboard is open (else this whole section is vacuous)',
  forced.computedInset === 336 && forced.focused === 'TEXTAREA' && forced.spy.focusin > 0, forced)
await wait(900)
const open = await call(measure)
check('the tab bar gets out of the way', open.tabBarPresent === false, open.tabBarPresent)
check('the composer rides above the keyboard', open.composer.bottom <= 844 - 336, open.composer)
check('THE NEWEST MESSAGE IS STILL VISIBLE — the whole point', open.newestCoveredPx < 0, open)
check('...because the thread reserved room for the composer rather than a fixed 96px',
  parseInt(open.padBottom, 10) > 96, open.padBottom)
console.log(`      composer ${open.composer.top}-${open.composer.bottom}, newest message ends ${open.lastMessage?.bottom}, pad ${open.padBottom}`)

chrome.kill(); server.close()
if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe chat composer never covers the conversation.\n')
