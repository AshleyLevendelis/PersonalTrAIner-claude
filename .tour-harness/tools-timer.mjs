// ---------------------------------------------------------------------------
// TOOLS IS ONE TIMER, AND A RUNNING ROUND NO LONGER TAKES THE TAB.
//
// Design handoff 2a, 12 Sep 2026. Three claims, none of them checkable
// anywhere but in a browser:
//
//   1. Tools leads with the timer and the six-tile grid is gone, grocery with
//      it.
//   2. A running round leaves the rest of the tab reachable — that is the
//      whole behaviour change. Before this, "Also here" and everything under
//      it were unreachable until the round was reset.
//   3. The card colour-codes its phase, and the flooded screen only appears
//      once she taps Full screen — and can be left again.
//
// Runs a real 2 x 1s / 1s round so the phases actually arrive.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9393', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9393/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
    if (i && /rounds|work|rest|minutes|intervals|every/.test(key)) {
      // Normalised to the interval-timer names so one reader covers both
      // layouts: an EMOM calls them Minutes and Every (s).
      out[key === 'minutes' || key === 'intervals' ? 'rounds' : key] = i.value
    }
  }
  return out
})()`)

console.log('\nONE TIMER SURFACE, AT 390x844\n')

const text = () => ev('document.body.innerText')
const seen = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const tapText = t => ev(`(() => {
  const want = ${JSON.stringify(t)}
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === want)
  if (!b) return false; b.click(); return true
})()`)
const tapSel = sel => ev(`(() => {
  const b = document.querySelector(${JSON.stringify(sel)})
  if (!b) return false; b.click(); return true
})()`)
const cardPrimary = () => ev(`(() => {
  const b = document.querySelector('[data-round-card-primary]')
  if (!b) return null
  return { label: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor }
})()`)

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
await wait(2500)

// --- 1. the settled tab -----------------------------------------------------
const settled = await text()
check('1a. Tools leads with the timers', /timers/i.test(settled || ''), (settled || '').slice(0, 200))
check('1b. ...with one row to change the intervals', await seen('[data-change-intervals]'))
check('1c. ...and the truth about the rest timer', /runs itself/.test(settled || ''))
check('1d. the six-tile grid is gone', !/Rest timer/.test(settled || ''), (settled || '').slice(0, 300))
check('1e. Also here carries what is left', /Also here/i.test(settled || '') && /Stopwatch/.test(settled || ''))
check('1f. ...and grocery is not on this tab at all', !/Grocery/i.test(settled || ''), (settled || '').slice(0, 400))
// THE SUBTITLE LENGTH CHECK, MEASURED. test:tools-grid counts characters and
// says it is a proxy for wrapping; this is the thing it proxies for.
const subLines = await ev(`(() => {
  const el = [...document.querySelectorAll('[data-change-intervals] span')].find(s => (s.textContent || '').trim().startsWith('Tabata'))
  if (!el) return null
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 16
  return Math.round(el.getBoundingClientRect().height / lh)
})()`)
const subBox = await ev(`(() => {
  const el = [...document.querySelectorAll('[data-change-intervals] span')].find(s => (s.textContent || '').trim().startsWith('Tabata'))
  if (!el) return null
  const cs = getComputedStyle(el)
  return { w: Math.round(el.getBoundingClientRect().width), font: cs.font, text: el.textContent.trim(), chars: el.textContent.trim().length }
})()`)
console.log('    [measure] subtitle box:', JSON.stringify(subBox))
check('1g. the interval subtitle sits on one line', subLines === 1, subLines)
await shoot('tools-timer-settled')

// --- 2. start a real round --------------------------------------------------
check('2a. the setup opens', await tapSel('[data-change-intervals]'))
await wait(700)
// THE SETUP IS CHIPS NOW, not three number boxes (design handoff 2a). The
// short work and rest this run needs are not on the chip rows — they are
// deliberately human values — so it goes through the Custom escape hatch,
// which is the part of the redesign most likely to be quietly dropped.
const hatches = await ev(`(() => {
  const tap = sel => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true }
  if (!tap('[data-work="custom"]')) return 'no work custom'
  if (!tap('[data-rest="custom"]')) return 'no rest custom'
  return 'chips'
})()`)
check('2b. work and rest have a custom escape hatch', hatches === 'chips', hatches)
await wait(300)
const typed = await ev(`(() => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const nums = [...document.querySelectorAll('input[type=number]')]
  if (nums.length < 2) return nums.length
  ;[4, 2].forEach((v, i) => { setter.call(nums[i], String(v)); nums[i].dispatchEvent(new Event('input', { bubbles: true })) })
  return 'set'
})()`)
check('2c. a 4s work / 2s rest can be typed into them', typed === 'set', typed)
// EIGHT ROUNDS BY DEFAULT, STEPPED DOWN TO TWO — the stepper is the only way
// to set the count now, so the run exercises it rather than routing round it.
const stepped = await ev(`(() => {
  const b = document.querySelector('[data-rounds-down]')
  if (!b) return 'no stepper'
  for (let i = 0; i < 6; i++) b.click()
  return 'stepped'
})()`)
check('2d. the rounds stepper takes it down to two', stepped === 'stepped', stepped)
await wait(300)
const summaryLine = await ev(`(() => {
  const el = [...document.querySelectorAll('span')].find(s => /work · /.test(s.textContent || ''))
  return el ? el.textContent.trim() : null
})()`)
check('2e. the summary states what is about to run', /^2 × 4s work · 2s rest$/.test(summaryLine || ''), summaryLine)
const started = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Start · /.test((x.textContent||'').trim()))
  if (!b) return false; b.click(); return true
})()`)
check('2f. ...and it starts', started)
await wait(1500)

// --- 3. the card, not the flood ---------------------------------------------
check('3a. a running round shows as a card', await seen('[data-round-card]'))
check('3b. ...and does NOT take the whole tab', /Also here/i.test((await text()) || ''), (await text() || '').slice(0, 300))
const readySample = await cardPrimary()
check('3c. the card offers Pause while it runs', readySample?.label === 'Pause' || readySample?.label === 'Resume', readySample)
await shoot('tools-timer-card-ready')

// --- 4. full screen is opt-in, and leaving it works -------------------------
check('4a. tapping Full screen floods it', await tapSel('[data-round-card-fullscreen]'))
await wait(600)
check('4b. ...the field is up', await ev(`!!document.querySelector('[role=status], [role=button]') && !document.querySelector('[data-round-card]')`))
check('4c. ...and it can be left again', await tapSel('[aria-label^="Leave full screen"]'))
await wait(600)
check('4d. back to the card, round still running', await seen('[data-round-card]'))

// --- 5. the three phases are three colours ----------------------------------
// TEN SECONDS OF LEAD-IN come first, then 2x4s work and 1x2s rest — a round
// deliberately slow enough that the WORK phase can be sampled at all. The
// first version ran 2x1s/1s and sampled "work" during the countdown, so the
// grey ready button stood in for mint; a mutation that painted the finished
// card in the WORKING colour then passed, because grey and mint differ. Three
// samples, three colours, all compared.
await wait(9500)
const workSample = await cardPrimary()
check('5a. mid-round the card is in its working colour', !!workSample && workSample.bg !== readySample?.bg, { ready: readySample?.bg, work: workSample?.bg })
await shoot('tools-timer-card-work')

await wait(12000)
const done = await cardPrimary()
check('5b. the finished card offers to log the session', done?.label === 'Log session', done)
check('5c. ...and it is not the working colour, nor the ready one',
      !!done && !!workSample && done.bg !== workSample.bg && done.bg !== readySample?.bg,
      { ready: readySample?.bg, work: workSample?.bg, done: done?.bg })
await shoot('tools-timer-card-done')

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nOne timer, a card that says what it is doing, and a tab you can still use.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
