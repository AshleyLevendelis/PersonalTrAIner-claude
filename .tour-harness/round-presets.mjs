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

// 4b (14 Sep 2026): THE ROUND TIMER IS NO LONGER ON THE TAB. Ashley asked for
// it to sit behind a "Timers" row with the stopwatch and the lap timer rather
// than permanently at the top of Tools. Everything this driver checks is
// unchanged in substance — the card, the chips, the numbers — it is two taps
// further in. Anchored on the row's TEXT and the choice's data attribute, not
// on position, so re-ordering the list does not break it.
const openRoundTimer = async () => {
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Timers/.test((x.innerText || '').trim())); if (b) b.click(); return !!b })()`)
  await wait(700)
  await ev(`(() => { const b = document.querySelector('[data-timer-choice="round"]'); if (b) b.click(); return !!b })()`)
  await wait(700)
}
await openRoundTimer()

// RE-ANCHORED AGAIN 13 Sep 2026 (frame 4a). The presets were a tile, then a
// grid inside a setup panel behind a row, and are now the CHIP ROW that is the
// tab's whole control surface. Two things changed for this driver and nothing
// else did: there is no setup to open, and the state a tap produces is read
// off the CARD — which is the point of 4a, since the card is what she is
// looking at when she decides.
//
// THE PROPERTIES ARE UNCHANGED: the tab names only protocols that exist, a
// preset fills the choice without starting it, a second preset replaces the
// first rather than merging, and every one of them is thumb-sized.
const cardText = () => ev(`document.querySelector('[data-round-card]')?.innerText?.replace(/\\s+/g, ' ')?.trim() || ''`)
const chip = key => `[data-protocol="${key}"]`

const tabText = await ev(`document.body.innerText`)
check('0. the Tools tab names EMOM', /EMOM/.test(tabText), tabText.slice(0, 240))
check('1. the protocols are on the tab, with no setup to open first',
  (await ev(`document.querySelectorAll('[data-protocol]').length`)) >= 5
  && !(await ev(`!!document.querySelector('[data-change-intervals]')`)))

check('2. Tabata is on the screen as a button', await ev(`!!document.querySelector('[data-protocol="tabata"]')`))
const tabataChip = await ev(`document.querySelector('[data-protocol="tabata"]')?.textContent?.trim() || ''`)
check('3. ...with its numbers beside it, so nothing is opaque', /8×20\/10/.test(tabataChip), tabataChip)

// Start somewhere else, so "tapping Tabata" has something to change.
await tap(chip('boxing'))
await wait(500)
const before = await cardText()
await shoot('round-presets')

check('4. tapping Tabata registers', await tap(chip('tabata')))
await wait(600)
const after = await cardText()
check('5. ...and the card now describes Tabata — 8 rounds, 3:50, 20s/10s',
  after !== before && /READY · 8 ROUNDS/i.test(after) && /3:50/.test(after) && /20s work · 10s rest/.test(after),
  { before, after })

// THE THING THAT WOULD BE WORST TO GET WRONG. A preset that STARTS on tap
// runs four minutes of work from one mis-tap, with the numbers never shown.
check('6. ...without starting the timer',
  await ev(`!!document.querySelector('[data-protocol]')`)
  && !(await ev(`/GET READY|Round 1 of/i.test(document.body.innerText)`)), null)

check('7. a second preset overwrites the first rather than merging with it',
  await tap(chip('boxing')))
await wait(600)
const boxing = await cardText()
check('8. ...boxing reads 3 rounds of 3 minutes with a minute off',
  /READY · 3 ROUNDS/i.test(boxing) && /3 min work · 1 min rest/.test(boxing) && /11:00/.test(boxing), boxing)

// ONE-HANDED ON A GYM FLOOR. 44px is the floor the rest of this app is held to.
const small = await ev(`(() => [...document.querySelectorAll('[data-protocol]')]
  .map(n => ({ p: n.getAttribute('data-protocol'), h: Math.round(n.getBoundingClientRect().height), w: Math.round(n.getBoundingClientRect().width) }))
  .filter(x => x.h < 44 || x.w < 44))()`)
check('9. every protocol chip is big enough to hit', Array.isArray(small) && small.length === 0, small)

await shoot('round-presets-tabata')

// --- EMOM, THE ONE THAT WAS ADVERTISED AND ABSENT ---------------------------
// Run for real against the wall clock. No dev clock: getAppNow returns a
// FROZEN noon whenever an override is set, so a pinned harness would show a
// countdown that never moves and prove nothing (the lead-in driver records
// the same trap).
console.log('\n  EMOM')
check('10. there is an EMOM chip now', await tap(chip('emom')))
await wait(600)
const emomCard = await cardText()
check('11. ...and the card reads ten sixty-second intervals',
  /READY · 10 INTERVALS/i.test(emomCard) && /every 1 min/.test(emomCard) && /10:00/.test(emomCard), emomCard)
// AN EMOM HAS NO REST TO NAME, and the card must not invent one — the whole
// reason `style` exists is that the numbers alone cannot tell an EMOM from
// ten continuous intervals.
check('12. ...and names no rest, because an EMOM has none', !/rest/i.test(emomCard), emomCard)
// AND ITS OWN CHIP SAYS ITS LENGTH rather than a work/rest pair it lacks.
const emomChip = await ev(`document.querySelector('[data-protocol="emom"]')?.textContent?.trim() || ''`)
check('13. the chip states the block, not a rest interval',
  /10 min/.test(emomChip) && !/\//.test(emomChip), emomChip)
await shoot('round-presets-emom')

// A ten-minute EMOM with a ten-second lead-in: start it, skip the countdown,
// and read what the running screen calls the interval.
check('15. Start is pressed', await ev(`(() => { const b = document.querySelector('[data-round-card-start]'); if (!b) return false; b.click(); return true })()`))
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
// CLEAR THE EMOM STILL RUNNING FROM THE SECTION ABOVE. The previous section
// leaves the flooded field up, whose Reset is the one to press — from the
// card the tab is still usable, but from the field it is not.
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Reset$/.test((x.textContent||'').trim())); if (b) b.click(); return !!b })()`)
await wait(1500)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
await wait(3500)
// A RELOAD PUTS THE ROUND TIMER BACK BEHIND THE ROW (4b), so the way back in
// is the same two taps. A live round re-opens straight onto the round view —
// the Timers row carries it — so this works whether or not one is running.
await openRoundTimer()
// RE-ANCHORED AGAIN 14 Sep 2026 (frame 4b). Under 4a "released the tab" meant
// the card was back to IDLE with the list under it. Under 4b there is no card
// on the tab at rest at all, so the property is two things instead: the TAB is
// back to the plain list with the Timers row reading its idle subtitle rather
// than "A round is running", and the idle card is still one tap in — which
// openRoundTimer above has already taken.
const released = await ev(`(() => {
  const idleCard = !!document.querySelector('[data-round-card][data-round-phase="idle"]')
  const t = document.body.innerText
  return idleCard && /Everything here/i.test(t) && /Round timer, stopwatch, lap timer/i.test(t) && !/A round is running/i.test(t)
})()`)
check('20b. the round released the tab, so the idle card and the list are back', released === true,
  (await ev(`document.body.innerText`)).slice(0, 120))
check('21. the Custom setup opens again', await tap('[data-protocol="custom"]') && (await wait(700), await ev(`!!document.querySelector('[data-round-setup]')`)))
await wait(300)
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
})()`)
await wait(500)
// ONE TAP AT A TIME. A synchronous burst is batched into one render, so every
// handler reads the same stale count and the last write wins.
for (let i = 0; i < 14; i++) {
  const n = await ev(`document.querySelector('[data-round-card]')?.innerText?.match(/READY · (\\d+)/i)?.[1] || ''`)
  if (Number(n) <= 2) break
  await ev(`(() => { const b = document.querySelector('[data-rounds-down]'); if (b) b.click(); return !!b })()`)
  await wait(120)
}
check('22. Start is pressed', await ev(`(() => { const b = document.querySelector('[data-round-card-start]'); if (!b) return false; b.click(); return true })()`))
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
