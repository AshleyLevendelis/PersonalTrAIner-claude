// ---------------------------------------------------------------------------
// A WEIGHT SHE DID NOT LIFT, ON THE SCREEN SHE TYPES IT INTO.
//
// Ashley, 8 Sep 2026: logging 500kg against a 24kg equipment ceiling should
// not silently become data, and her ruling on what to do about it was "warn,
// second tap logs it." A source check can prove handleSaveSet calls the
// verdict function. Only a browser can show that the first tap really does
// not save, that the sentence explaining why is on screen and inside the
// phone, and that the second tap really does.
//
// Runs the REAL ExerciseTab at 390x844 with ?absurd=1 (see real.tsx): a
// stated 24kg dumbbell ceiling and one dumbbell movement seeded as Additional
// Work — the SetGrid parent that reaches the check through a different route
// from the plan rows, and the one that would silently lose it.
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

// Everything below addresses the Additional Work section only, found by its
// own heading rather than by an exercise name — the seeded movement varies
// with the weekday (whichever dumbbell lift is not already in the session).
const SECTION = `(() => {
  const head = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Additional work')
  return head ? head.parentElement : null
})()`

const setValue = `(el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

const read = setNumber => ev(`(() => {
  const sec = ${SECTION}
  if (!sec) return { found: false }
  const warn = sec.querySelector('[data-testid="weight-warning"]')
  const err = [...sec.querySelectorAll('p')].find(p => p.className.includes('text-destructive'))
  const save = [...sec.querySelectorAll('button')].find(b => /^(Save set ${setNumber}|Set ${setNumber} saved)$/.test(b.getAttribute('aria-label') || ''))
  const r = warn ? warn.getBoundingClientRect() : null
  return {
    found: true,
    exercise: window.__absurdExercise ?? null,
    warning: warn ? warn.textContent.trim() : null,
    warningFitsThePhone: r ? (r.left >= 0 && r.right <= 390) : null,
    error: err ? err.textContent.trim() : null,
    saved: save ? /saved$/.test(save.getAttribute('aria-label')) : null,
    receipt: (sec.innerText.match(/Set ${setNumber}: [^\\n]*/) || [null])[0],
  }
})()`)

const type = (setNumber, value) => ev(`(() => {
  const sec = ${SECTION}
  const el = sec.querySelector('input[id$="-${setNumber}"][id^="setgrid-weight-"]')
  if (!el) return false
  ;(${setValue})(el, '${value}')
  return true
})()`)

const tapSave = setNumber => ev(`(() => {
  const sec = ${SECTION}
  const b = [...sec.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Save set ${setNumber}')
  if (!b) return false
  b.click()
  return true
})()`)

/** The section sits well below the fold — a screenshot of the top of the page proves nothing. */
const scrollToSection = () => ev(`(() => { const s = ${SECTION}; if (s) s.scrollIntoView({ block: 'center' }); return !!s })()`)

console.log('\nA WEIGHT SHE DID NOT LIFT — warn, then obey\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&absurd=1#/tab/exercise` })
await wait(2500); await ev(`location.hash = '#/tab/exercise'`); await wait(1500)

let state = await read(1)
for (let i = 0; i < 16 && !state.found; i++) { await wait(500); state = await read(1) }
check('0. the Additional Work row is on screen', state.found, state)

// --- 240kg against a stated 24kg: warned, not stored ------------------------
check('1a. typing 240 into the weight box', await type(1, '240'))
check('1b. tapping the tick', await tapSave(1))
await wait(400)
state = await read(1)
check('1c. the app says something rather than storing it', !!state.warning, state)
check('1d. ...and quotes the 24kg SHE told it, not a table of its own', /24kg/.test(state.warning ?? ''), state.warning)
check('1e. ...and says what a second tap will do', /again/i.test(state.warning ?? ''), state.warning)
check('1f. ...inside the width of the phone', state.warningFitsThePhone === true, state)
check('1g. THE SET IS NOT LOGGED on that first tap', state.saved === false, state)
await scrollToSection(); await wait(300); await shoot('absurd-weight-warned')

// --- the second tap is the answer ------------------------------------------
check('2a. tapping the tick again', await tapSave(1))
await wait(400)
state = await read(1)
check('2b. it logs it — she is the authority on her own garage', state.saved === true, state)
check('2c. ...at the number she typed', /240kg/.test(state.receipt ?? ''), state.receipt)
check('2d. ...and the warning is gone', state.warning === null, state.warning)

// --- 900kg: no second tap exists -------------------------------------------
check('3a. typing 900 into the next set', await type(2, '900'))
check('3b. tapping the tick', await tapSave(2))
await wait(400)
let two = await read(2)
check('3c. it is refused, not offered a confirmation', !!two.error && two.warning === null, two)
check('3d. ...and not logged', two.saved === false, two)
check('3e. tapping again does not talk it round', await tapSave(2))
await wait(400)
two = await read(2)
check('3f. ...still not logged', two.saved === false, two)
await scrollToSection(); await wait(300); await shoot('absurd-weight-refused')

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nIt warns, it waits, and it obeys.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
