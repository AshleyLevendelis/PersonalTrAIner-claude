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
    if (i && /rounds|work|rest|minutes|intervals|every/.test(key)) {
      // Normalised to the interval-timer names so one reader covers both
      // layouts: an EMOM calls them Minutes and Every (s).
      out[key === 'minutes' || key === 'intervals' ? 'rounds' : key] = i.value
    }
  }
  return out
})()`)

console.log('\nONE-TAP PRESETS, ON THE REAL SCREEN\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
await wait(4000)

// The tile says EMOM again — and now there is one. Checked as "says it AND
// has it", so deleting the preset while leaving the word fails here too.
// RE-ANCHORED 12 Sep 2026 (design handoff 2a). The six-tile grid became one
// timer surface and the three number inputs became chips, so every read below
// that used to go through `fields()` now goes through the SUMMARY LINE — the
// one place the chosen numbers appear together, and the line she actually
// reads before tapping Start. The properties are unchanged: a preset fills
// the setup without starting it, a second preset replaces the first, and the
// words on the tab name only protocols that exist.
// THE SUMMARY ROW, by its own marker. Matching on the text instead found the
// EMOM PRESET CHIP — describeRoundPreset writes "10 × every 60s" too — so the
// reader returned the button it was about to tap rather than the state that
// tap produced, and three checks compared a string with itself.
const setupSummary = () => ev(`(() => {
  const el = document.querySelector('[data-round-summary]')
  return el ? el.textContent.trim() : null
})()`)
const rowText = (await ev(`document.body.innerText`)).match(/Change the intervals[^\n]*\n[^\n]*/)?.[0] ?? ''
check('0. the Tools interval row names EMOM', /EMOM/.test(rowText), rowText)
check('1. the round setup opens', await tap('[data-change-intervals]'))
await wait(900)

const text = await ev(`document.body.innerText`)
check('2. Tabata is on the screen as a button', /Tabata/.test(text), text.slice(0, 200))
check('3. ...with its numbers under it, so nothing is opaque', /8 × 20s \/ 10s/.test(text),
  (text.match(/Tabata[^\n]*\n[^\n]*/) || ['not found'])[0])

const before = await setupSummary()
await shoot('round-presets')

check('4. tapping Tabata registers', await tap('[data-preset="tabata"]'))
await wait(600)
const after = await setupSummary()
check('5. ...and it filled the setup with 8 / 20s / 10s',
  after === '8 × 20s work · 10s rest', { before, after })

// THE THING THAT WOULD BE WORST TO GET WRONG. A preset that STARTS on tap
// runs four minutes of work from one mis-tap, with the numbers never shown.
check('6. ...without starting the timer — the setup is still up',
  await ev(`!!document.querySelector('[data-preset]')`)
  && !(await ev(`/GET READY|Round 1 of/i.test(document.body.innerText)`)), null)

check('7. a second preset overwrites the first rather than merging with it',
  await tap('[data-preset="boxing"]'))
await wait(600)
const boxing = await setupSummary()
check('8. ...boxing rounds reads 3 × 3 min / 1 min',
  boxing === '3 × 3 min work · 1 min rest', boxing)

// ONE-HANDED ON A GYM FLOOR. 44px is the floor the rest of this app is held to.
const small = await ev(`(() => [...document.querySelectorAll('[data-preset]')]
  .map(n => ({ p: n.getAttribute('data-preset'), h: Math.round(n.getBoundingClientRect().height), w: Math.round(n.getBoundingClientRect().width) }))
  .filter(x => x.h < 44 || x.w < 44))()`)
check('9. every preset button is big enough to hit', Array.isArray(small) && small.length === 0, small)

await shoot('round-presets-tabata')

// --- EMOM, THE ONE THAT WAS ADVERTISED AND ABSENT ---------------------------
// Run for real against the wall clock. No dev clock: getAppNow returns a
// FROZEN noon whenever an override is set, so a pinned harness would show a
// countdown that never moves and prove nothing (the lead-in driver records
// the same trap).
console.log('\n  EMOM')
check('10. there is an EMOM button now', await tap('[data-preset="emom"]'))
await wait(600)
const emomSummary = await setupSummary()
check('11. ...and it is ten sixty-second intervals', emomSummary === '10 × every 1 min', emomSummary)
// AN EMOM HAS NO REST TO FILL IN, and with chips that is "None is the one
// selected" rather than "the box is absent".
const restChip = await ev(`(() => {
  const el = document.querySelector('[data-rest="0"]')
  return el ? { label: el.textContent.trim(), on: el.getAttribute('aria-pressed') } : null
})()`)
check('12. ...with None chosen on the rest row, because an EMOM has no rest',
  restChip?.label === 'None' && restChip?.on === 'true', restChip)
const emomText = await ev(`document.body.innerText`)
check('13. the form counts them in MINUTES, not rounds',
  /\bminutes\b/i.test(emomText) && !/Work \(s\)/.test(emomText),
  (emomText.match(/Minutes[\s\S]{0,60}/) || ['not found'])[0])
check('14. ...and says plainly what the protocol is',
  /whatever is left is your rest/i.test(emomText), null)
await shoot('round-presets-emom')

// A ten-minute EMOM with a ten-second lead-in: start it, skip the countdown,
// and read what the running screen calls the interval.
check('15. Start is pressed', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Start · /.test((x.textContent||'').trim())); if (!b) return false; b.click(); return true })()`))
await wait(1200)
check('16. it counts you in first, same as any round', await ev(`/GET READY/i.test(document.body.innerText)`),
  (await ev(`document.body.innerText`)).slice(0, 120))
await tap('[data-round-card-fullscreen]')
await wait(500)
check('17. tapping skips the countdown', await tap('[role="button"][aria-label^="Get ready"]'))
await wait(1200)
const running = await ev(`(() => { const n = document.querySelector('[role="status"][aria-label*="inute"], [role="status"][aria-label*="Round"]'); return n ? n.getAttribute('aria-label') : document.body.innerText.slice(0, 200) })()`)
check('18. the running screen says MINUTE, not Round', /Minute 1 of 10/.test(running ?? ''), running)
check('19. ...and never shows a REST phase', !/rest/i.test(running ?? ''), running)
const sub = await ev(`document.body.innerText`)
check('20. the line under it promises no rest either',
  /next one starts/i.test(sub) && !/\ds rest next/.test(sub),
  (sub.match(/Minute 1 of 10[^\n]*/) || sub.match(/next one starts[^\n]*/) || ['not found'])[0])
await shoot('round-presets-emom-running')

// --- FINISH A ROUND AND LOG IT ---------------------------------------------
// Ashley, 12 Sep 2026: "I logged it but it doesn't show anywhere on the app
// and the coach has no knowledge of it." It never logged — the button reset
// the timer and changed tab. Driven here end to end against the real clock
// with the shortest round the form allows, so the finished state is reachable
// in seconds rather than minutes.
console.log('\n  LOGGING A FINISHED ROUND')
// CLEAR THE EMOM STILL RUNNING FROM THE SECTION ABOVE. A live round holds the
// whole tab, so without this the tile grid is never on screen and every check
// below fails for the wrong reason — which is exactly what the first run did.
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Reset$/.test(x.textContent.trim())); if (b) b.click(); return !!b })()`)
await wait(1200)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
await wait(3500)
const gridUp = await ev(`/Change the intervals/.test(document.body.innerText)`)
check('20b. the round released the tab, so the interval row is back', gridUp === true,
  (await ev(`document.body.innerText`)).slice(0, 120))
check('21. the round setup opens again', await tap('[data-change-intervals]'))
await wait(800)
// 2 rounds x 1s work / 1s rest, and skip the ten-second countdown.
// The short round this section needs is not on the chip rows — they hold
// human values — so it goes through the Custom escape hatch on both, then
// steps the count down from eight to two.
await ev(`(() => {
  const tap = sel => { const el = document.querySelector(sel); if (el) el.click(); return !!el }
  tap('[data-work="custom"]'); tap('[data-rest="custom"]')
})()`)
await wait(300)
await ev(`(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  const ins = [...document.querySelectorAll('input[type=number]')]
  if (ins.length >= 2) { set(ins[0], '1'); set(ins[1], '1') }
  const down = document.querySelector('[data-rounds-down]')
  if (down) for (let i = 0; i < 6; i++) down.click()
})()`)
await wait(500)
check('22. Start is pressed', await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Start · /.test((x.textContent||'').trim())); if (!b) return false; b.click(); return true })()`))
await wait(1000)
await tap('[data-round-card-fullscreen]')
await wait(500)
check('23. tapping skips the countdown', await tap('[role="button"][aria-label^="Get ready"]'))
// 2x1s work + 1x1s rest = 3s, plus slack.
await wait(6000)
const finished = await ev(`/Log session/.test(document.body.innerText)`)
check('24. the finished round offers to log it', finished === true,
  (await ev(`document.body.innerText`)).slice(0, 160))

check('25. tapping Log session opens something that can actually write',
  await clickText('/^Log session$/'))
await wait(1200)
const sheet = await ev(`document.body.innerText`)
// AN INPUT'S VALUE IS NOT PAGE TEXT, which is what the first version of this
// looked for — it searched innerText for "Intervals" and found nothing while
// the field held it. The property here is which FORM opened: conditioning,
// with an effort to pick, rather than the lift form the sheet defaults to.
// The values themselves are read straight off the inputs in 27.
check('26. ...on the conditioning side, with an effort still to answer',
  /RPE/.test(sheet) && /Save/.test(sheet), sheet.slice(0, 200))
const filled = await ev(`(() => {
  const out = {}
  for (const i of document.querySelectorAll('input')) {
    const l = (i.closest('label') || {}).textContent || i.getAttribute('aria-label') || ''
    if (i.value) out[l.trim().slice(0, 24) || i.type] = i.value
  }
  return out
})()`)
check('27. ...with the activity and the minutes already in it',
  JSON.stringify(filled).includes('Intervals') && /"1"/.test(JSON.stringify(filled)), filled)
await shoot('round-log-sheet')

// THE WRITE ITSELF. The queue is local-first, so the row exists the moment it
// saves — read it back out of the fake database rather than trusting the UI.
const saveClicked = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^(Save|Log it|Add)$/i.test(x.textContent.trim()))
  if (!b || b.disabled) return [...document.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean)
  b.click(); return true
})()`)
check('28. the save button is found and pressed', saveClicked === true, saveClicked)
await wait(1500)
const logged = await ev(`document.body.innerText`)
check('29. the app says it was logged, rather than going quiet',
  /Logged ·/.test(logged), logged.slice(0, 200))
// ONLY MEANINGFUL IF THE LOG HAPPENED. Asserted against the confirmation, not
// on its own: mid-round there is no "Log session" either, so this passed once
// while every check around it failed.
check('30. ...and the timer released the screen only after that',
  /Logged ·/.test(logged) && !/Log session/.test(logged), logged.slice(0, 160))
await shoot('round-logged')

const err = await ev(`window.__lastError ?? null`)
check('no uncaught error on the page', err === null || err === undefined, err)

console.log(failures === 0 ? '\nEvery preset the tile names is a button that fills the timer.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
