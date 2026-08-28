// ---------------------------------------------------------------------------
// DOES SENDING A MESSAGE THROW AWAY THE KEYBOARD?
//
// Ashley, from a real phone, twice now: "each time I enter an input and hit
// send the keyboard closes and I have to reopen it for the next message."
//
// The keyboard itself cannot be emulated headlessly. What CAN be measured is
// the thing that decides whether it stays up: WHERE FOCUS IS. A soft keyboard
// exists for exactly as long as a text input holds focus — so "is the input
// still document.activeElement one tick after send" is the same question,
// asked in a form a headless browser can answer.
//
// Two send paths, because they fail for different reasons and a fix for one
// is not a fix for the other:
//   TAP  — the 52px send button. A <button> takes focus on pointerdown, and
//          it also flips to `disabled` the instant setInput('') empties the
//          box. Either alone removes focus from the input.
//   ENTER— the phone keyboard's blue "Go" key, which is what the screenshot
//          shows her using.
//
// Real trusted events via CDP Input.*, not el.click() — a synthetic click
// does not move focus the way a tap does, so a JS-dispatched click would
// have shown this passing while the phone showed it failing.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.onb-harness/composer.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', '--remote-debugging-port=9347', '--no-sandbox', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 60; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9347/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = x => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then(r => r.result?.result?.value)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

/** Where focus is, described so a failure names the element rather than "false". */
const DESCRIBE = `(() => {
  const a = document.activeElement
  if (!a || a === document.body) return 'BODY (nothing focused — a phone closes the keyboard here)'
  const tag = a.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') return 'the text input (keyboard stays up)'
  return tag + (a.disabled ? ' [disabled]' : '') + ' — ' + (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 24)
})()`

const boxOf = sel => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return null
  const r = el.getBoundingClientRect()
  return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
})()`).then(v => v && JSON.parse(v))

async function tap(sel) {
  const b = await boxOf(sel)
  if (!b) throw new Error(`no element for ${sel}`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 })
  }
  await wait(120)
}

async function typeText(text) {
  await send('Input.insertText', { text })
  await wait(120)
}

const INPUT = 'input[placeholder]'
const SENDBTN = 'button:has(svg.lucide-send)'

let failures = 0
const check = (label, ok, extra) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${extra}` : ''}`) }
}

async function fresh() {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?state=card` })
  await wait(1800)
}

console.log('\n[1] TAP THE SEND BUTTON — does the input keep focus?')
{
  await fresh()
  await tap(INPUT)
  await typeText('bodybuilding')
  const before = await ev(DESCRIBE)
  check('the input has focus before sending (sanity check on the harness itself)',
    before.startsWith('the text input'), before)
  await tap(SENDBTN)
  await wait(200)
  const after = await ev(DESCRIBE)
  check('the input STILL has focus after tapping send', after.startsWith('the text input'), after)
  console.log(`      focus before: ${before}\n      focus after:  ${after}`)
}

console.log('\n[2] PRESS ENTER / the phone keyboard\'s "Go" key — same question')
{
  await fresh()
  await tap(INPUT)
  await typeText('bodybuilding')
  const before = await ev(DESCRIBE)
  check('the input has focus before sending', before.startsWith('the text input'), before)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await wait(300)
  const after = await ev(DESCRIBE)
  check('the input STILL has focus after Enter', after.startsWith('the text input'), after)
  console.log(`      focus before: ${before}\n      focus after:  ${after}`)
}

console.log('\n[3] The send button must never be the focused element when it goes disabled')
{
  await fresh()
  await tap(INPUT)
  await typeText('bodybuilding')
  await tap(SENDBTN)
  await wait(200)
  const btnState = await ev(`(() => {
    const b = document.querySelector(${JSON.stringify(SENDBTN)})
    return JSON.stringify({ disabled: !!b?.disabled, isActive: document.activeElement === b })
  })()`)
  const s = JSON.parse(btnState)
  check('send is not left holding focus while disabled', !(s.disabled && s.isActive), btnState)
  console.log(`      send button after tap: ${btnState}`)
}

console.log('\n[4] IS THE NEWEST MESSAGE ACTUALLY VISIBLE, or does the composer sit on top of it?')
{
  // "the conversation is not at the latest message and it cuts off the bottom
  // so I have to scroll down." The keyboard cannot be emulated, but this half
  // does not need it: the composer is a fixed overlay, so the scroll container
  // must reserve enough bottom padding to clear it. If it does not, the last
  // thing the coach said is underneath the composer at rest — which is what
  // the screenshot shows.
  await fresh()
  await ev(`(() => { const el = document.querySelector('[class*="overflow-y-auto"]'); if (el) el.scrollTo({ top: el.scrollHeight }); })()`)
  await wait(400)
  const geom = JSON.parse(await ev(`(() => {
    const scroller = document.querySelector('[class*="overflow-y-auto"]')
    const composer = document.querySelector('input[placeholder]').closest('div[style]')
    const content = scroller.firstElementChild
    const last = content.lastElementChild
    const cb = composer.getBoundingClientRect()
    const lb = last.getBoundingClientRect()
    return JSON.stringify({
      composerTop: Math.round(cb.top), composerHeight: Math.round(cb.height),
      lastBottom: Math.round(lb.bottom),
      clearance: Math.round(cb.top - lb.bottom),
      atBottom: Math.round(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight),
    })
  })()`))
  console.log(`      composer top ${geom.composerTop}px, height ${geom.composerHeight}px`)
  console.log(`      last message ends at ${geom.lastBottom}px -> clearance ${geom.clearance}px`)
  check('scrolled to the bottom really is the bottom', geom.atBottom <= 1, JSON.stringify(geom))
  check('the last message clears the composer rather than sitting under it',
    geom.clearance >= 0, JSON.stringify(geom))
}

chrome.kill(); server.close()
if (failures > 0) { console.error(`\n${failures} check(s) failed — the keyboard is being dropped on send.\n`); process.exit(1) }
console.log('\nFocus survives every send path.\n')
