// ---------------------------------------------------------------------------
// TOOLS IS ONE TIMER, AND A RUNNING ROUND NO LONGER TAKES THE TAB.
//
// Design handoff 2a (12 Sep 2026), then frame 4a (13 Sep). Claims that are
// only checkable in a browser:
//
//   1. Tools leads with the timer, the six-tile grid is gone, grocery with it,
//      and the protocols are ON the tab rather than behind a second screen.
//   2. The card is ALWAYS there — idle it holds the total you would start —
//      and starting swaps the clock in without the layout moving.
//   3. A running round leaves the rest of the tab reachable. Before 2a,
//      everything below the timer was unreachable until the round was reset.
//   4. The card colour-codes its phase, and the flooded screen only appears
//      once she taps Full screen — and can be left again.
//   5. A tap on a different protocol MID-ROUND queues rather than restarting,
//      says which round it lands on, and can be undone.
//
// Runs a real short round through the Custom panel so the phases arrive.
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

// --- 1. the settled tab -----------------------------------------------------
const settled = await text()
// 4b REVERSES BOTH OF THESE, on Ashley's ruling of 14 Sep: at rest Tools leads
// with the LIST, and there is no idle card on the tab at all. The idle card
// still exists — it is inside the timers sheet, which `openRoundTimer` above
// has already opened by this point, so 1b reads it there.
check('1a. Tools leads with the list, not a timer',
  /Everything here/i.test(settled || '') && /Timers\s*\n?\s*Round timer, stopwatch, lap timer/i.test(settled || ''),
  (settled || '').slice(0, 200))
// 4c (10 Oct 2026): THE IDLE CARD BECAME THE SHEET'S PREVIEW. The sheet is
// full screen with its own top bar, cards, steppers and a docked Start.
check('1b. ...and the round-timer sheet is open, one tap in', await seen('[data-round-sheet] [data-round-preview]'))
check('1c. ...and the truth about the rest timer', /runs itself in the session dock/.test(settled || ''))
check('1d. the six-tile grid is gone', !/Rest timer/.test(settled || ''), (settled || '').slice(0, 300))
check('1e. the list carries every tool, timers included',
  /Everything here/i.test(settled || '') && /Timers/.test(settled || ''), (settled || '').slice(0, 300))
check('1f. ...and the grocery list is one of them again', /Grocery list/i.test(settled || ''), (settled || '').slice(0, 400))
check('1g. there is no row to a second screen any more', !(await seen('[data-change-intervals]')))
const chipTexts = await ev(`[...document.querySelectorAll('[data-protocol]')].map(b => b.innerText.trim())`)
check('1h. the protocols are preset cards', Array.isArray(chipTexts) && chipTexts.length >= 7, chipTexts)
check('1i. ...each carrying its own numbers', chipTexts.every(t => /\d/.test(t)), chipTexts)
check('1j. ...and none of them says its numbers twice',
  !chipTexts.some(t => { const m = t.match(/(\d+)\/(\d+)/g); return m && m.length > 1 }), chipTexts)
// 4c: CARDS, NOT PILLS. The old 44px-pill rule became "every card is the
// same 98x76 and nothing inside it spills" — measured, because a wrapped
// label is invisible to every source check.
const cardBoxes = await ev(`[...document.querySelectorAll('[data-protocol]')].map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), spill: b.scrollHeight > b.clientHeight + 1 } })`)
check('1k. every card is 98x76 and nothing in it spills', cardBoxes.every(c => c.w === 98 && c.h === 76 && !c.spill), cardBoxes)
check('1k2. ...and the row scrolls inside itself, the page does not scroll sideways',
  await ev('document.documentElement.scrollWidth <= window.innerWidth'), await ev('[document.documentElement.scrollWidth, window.innerWidth]'))
const preview = () => ev(`document.querySelector('[data-round-preview]')?.innerText?.replace(/\\s+/g, ' ')?.trim() || ''`)
const idle = await preview()
check('1l. the preview holds a total and what it is made of',
  /^3:50 /.test(idle) && /8 rounds · 0:20 work · 0:10 rest · no rest after the last/.test(idle), idle)
const startText = () => ev(`document.querySelector('[data-round-sheet-start]')?.textContent?.trim() || ''`)
check('1m. ...and Start promises the countdown before you press', (await startText()) === 'Start · 10s countdown', await startText())
check('1n. the Tabata card is the one lit', await ev(`document.querySelector('[data-protocol="tabata"]')?.getAttribute('aria-pressed') === 'true'`))
await shoot('tools-timer-settled')

// --- 2. the preview re-reads as a protocol is chosen ------------------------
const totalNow = () => ev(`document.querySelector('[data-round-total]')?.textContent?.trim() || ''`)
const beforePick = await totalNow()
check('2a. tapping a different protocol', await tapSel('[data-protocol="boxing"]'))
await wait(500)
const afterPick = await totalNow()
check('2b. ...re-reads the total, with no second screen in between',
  afterPick !== beforePick && afterPick === '11:00', { beforePick, afterPick })
check('2c. ...and nothing started', !(await seen('[data-round-card-primary]')))

// --- 3. the steppers make it hers, Custom lights by itself, and it starts ----
// A SHORT ROUND so the rest of this run has a boundary to queue onto and a
// finish to reach: 3 rounds of 10s work / 5s rest, countdown off = 40s.
// ONE TAP AT A TIME with a beat between — a burst inside one frame is a
// driver artefact a thumb cannot produce (see the old note on the stepper).
const stepVal = f => ev(`document.querySelector('[data-step-value="${f}"]')?.textContent?.trim() || ''`)
const stepTo = async (f, want, dir) => { for (let i = 0; i < 20 && (await stepVal(f)) !== want; i++) { await tapSel(`[data-step="${f}"][data-dir="${dir}"]`); await wait(120) } return stepVal(f) }
await tapSel('[data-protocol="tabata"]'); await wait(300)
check('3a. rounds step down to 3', (await stepTo('rounds', '3', 'down')) === '3', await stepVal('rounds'))
check('3b. work steps down to 0:10', (await stepTo('work', '0:10', 'down')) === '0:10', await stepVal('work'))
check('3c. rest steps down to 0:05', (await stepTo('rest', '0:05', 'down')) === '0:05', await stepVal('rest'))
const lit = await ev(`[...document.querySelectorAll('[data-protocol][aria-pressed="true"]')].map(b => b.dataset.protocol)`)
check('3d. any change lights Custom by itself, and only Custom', JSON.stringify(lit) === '["custom"]', lit)
check('3d2. ...whose card says the draft is unsaved', /save as preset/.test(await ev(`document.querySelector('[data-protocol="custom"]')?.innerText || ''`)))
// Countdown to Off: Off → 5 → 10 → 15 → Off, from the default 10.
const countdownChip = () => ev(`document.querySelector('[data-option="countdown"]')?.innerText?.replace(/\\s+/g, ' ')?.trim() || ''`)
for (let i = 0; i < 4 && !/Off$/.test(await countdownChip()); i++) { await tapSel('[data-option="countdown"]'); await wait(150) }
check('3e. the countdown can be switched off', /Countdown Off$/.test(await countdownChip()), await countdownChip())
const custom = await preview()
check('3f. the preview states what is about to run, live',
  /^0:40 /.test(custom) && /3 rounds · 0:10 work · 0:05 rest/.test(custom) && !/countdown/.test(custom), custom)
check('3f2. ...and Start says it will start now', (await startText()) === 'Start now', await startText())
check('3g. tapping Custom saves the draft', await tapSel('[data-protocol="custom"]'))
await wait(300)
check('3g2. ...and it stops saying "save as preset"', !/save as preset/.test(await ev(`document.querySelector('[data-protocol="custom"]')?.innerText || ''`)))
await shoot('tools-timer-custom')
// BACK ON, AT 5s: the run below samples the ready colour during the
// countdown, and with none there is no ready phase to sample. One more tap
// walks Off → 5, which is also the label following the chip.
await tapSel('[data-option="countdown"]'); await wait(150)
check('3g3. one more tap sets a 5s countdown, and Start says so', (await startText()) === 'Start · 5s countdown', await startText())
check('3h. ...and Start starts it', await tapSel('[data-round-sheet-start]'))
await wait(1500)

// --- 4. the card, not the flood ---------------------------------------------
check('4a. a running round shows as a card', await seen('[data-round-card]'))
// THE COUNTDOWN SHE CHOSE IS THE ONE THAT RUNS — 5s here, not the 10s every
// round used to get. Read off the running card's own clock, 1.5s in.
const leadClock = await ev(`document.querySelector('[data-round-card-clock]')?.textContent?.trim() || ''`)
const leadSecs = Number((leadClock.match(/(\d+):(\d+)/) || [])[2] ?? (leadClock.match(/\d+/) || [])[0])
check('4a2. ...counting down from the 5s she set, not the old 10s', Number.isFinite(leadSecs) && leadSecs > 0 && leadSecs <= 5, leadClock)
// STILL THE POINT OF THIS CHECK: a running round is a card on the tab, not a
// takeover — the list is still under it. Re-anchored off the heading text,
// which 4b renamed.
check('4b. ...and does NOT take the whole tab', /Everything here/i.test((await text()) || ''), (await text() || '').slice(0, 300))
const readySample = await cardPrimary()
check('4c. the card offers Pause while it runs', readySample?.label === 'Pause' || readySample?.label === 'Resume', readySample)
// THE STOPWATCH IS BLOCKED WHILE A ROUND IS LIVE, and says why — switching
// mode clears the timer record, so choosing one used to destroy a running
// round on the way to a stopwatch. Under 4b the choice lives in the timers
// sheet, so the sheet has to be open to read it; everything the check asserts
// about it is unchanged.
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Timers/.test((x.innerText || '').trim())); if (b) b.click(); return !!b })()`)
await wait(700)
// WHILE A ROUND IS LIVE the row opens straight onto the round view — the
// running clock is what you almost certainly wanted — so the chooser is one
// Back away. That the way back EXISTS is part of what this checks: a sheet
// that opened onto the round with no exit would strand the other two timers.
check('4c2. ...and the sheet offers a way back to the other timers',
  await ev(`!!document.querySelector('[aria-label="Back to the timer list"]')`))
await ev(`(() => { const b = document.querySelector('[aria-label="Back to the timer list"]'); if (b) b.click(); return !!b })()`)
await wait(500)
const swRow = await ev(`(() => {
  const b = document.querySelector('[data-timer-choice="stopwatch"]')
  return b ? { disabled: b.disabled, text: b.textContent.trim() } : null
})()`)
check('4d. the stopwatch cannot silently wipe the running round', swRow?.disabled === true, swRow)
check('4e. ...and says why rather than just going grey', /Finish or reset your round first/.test(swRow?.text || ''), swRow)
await shoot('tools-timer-card-ready')

// --- 5. full screen is opt-in, and leaving it works -------------------------
check('5a. tapping Full screen floods it', await tapSel('[data-round-card-fullscreen]'))
await wait(600)
check('5b. ...the field is up', await ev(`!!document.querySelector('[role=status], [role=button]') && !document.querySelector('[data-round-card]')`))
check('5c. ...and it can be left again', await tapSel('[aria-label^="Leave full screen"]'))
await wait(600)
check('5d. back to the card, round still running', await seen('[data-round-card]'))

// --- 6. A TAP MID-ROUND QUEUES, IT DOES NOT LURCH ---------------------------
//
// Frame 4a's whole behavioural claim, and the one thing no source check can
// see: that tapping 40/20 during a round changes nothing about the round you
// are in, says which round it WILL change, and can be taken back.
const roundNow = () => ev(`document.querySelector('[data-round-card]')?.innerText?.match(/ROUND (\\d+) OF (\\d+)/i)?.slice(1)?.join('/') || ''`)
await wait(800)
// 4b: starting a round CLOSES the timers sheet (you asked for a round, you get
// the tab back with the clock on it), so the chips are two taps away again.
// The Timers row opens straight onto the round view while one is live, which
// is why this is the same helper and not a special case.
await openRoundTimer()
const beforeQueue = await roundNow()
check('6a. the round is under way and says where it is', /^\d+\/\d+$/.test(beforeQueue), beforeQueue)
check('6b. tapping a different protocol mid-round', await tapSel('[data-protocol="tabata"]'))
await wait(400)
check('6c. ...changes nothing about the round in progress', (await roundNow()) === beforeQueue, { beforeQueue, now: await roundNow() })
const strip = await ev(`document.querySelector('[data-round-queued]')?.innerText?.replace(/\\s+/g, ' ')?.trim() || ''`)
check('6d. ...says what is coming and when', /^Switching to Tabata at round \d+/.test(strip), strip)
const badge = await ev(`document.querySelector('[data-protocol-queued-badge]')?.textContent?.trim() || ''`)
check('6e. ...and the chip itself is badged with the same round',
  /^from round \d+$/.test(badge) && strip.includes(badge.replace('from round ', 'round ')), { strip, badge })
await shoot('tools-timer-queued')
check('6f. ...and it can be undone', await tapSel('[data-round-queued-undo]'))
await wait(400)
check('6g. ...which clears both the strip and the badge',
  !(await seen('[data-round-queued]')) && !(await seen('[data-protocol-queued-badge]')))

// --- 7. the phases are three colours ----------------------------------------
// TEN SECONDS OF LEAD-IN come first, then 3x4s work and 2x2s rest — a round
// deliberately slow enough that the WORK phase can be sampled at all. The
// first version ran 2x1s/1s and sampled "work" during the countdown, so the
// grey ready button stood in for mint; a mutation that painted the finished
// card in the WORKING colour then passed, because grey and mint differ. Three
// samples, three colours, all compared.
// POLLED INTO THE WORK PHASE (4c's shortest round is 10s on / 5s off, so a
// fixed sample point can land in a rest): the card says which phase it is in.
for (let i = 0; i < 30 && !(await seen('[data-round-card][data-round-phase="work"]')); i++) await wait(250)
const workSample = await cardPrimary()
check('7a. mid-round the card is in its working colour', !!workSample && workSample.bg !== readySample?.bg, { ready: readySample?.bg, work: workSample?.bg })
await shoot('tools-timer-card-work')

// POLLED, NOT GUESSED. The run's length moved when the fixture gained a round
// for the queue test, and a fixed wait that is one second short reports "the
// finished card never appeared" — a false failure that looks exactly like a
// real one.
let done = await cardPrimary()
for (let i = 0; i < 60 && done?.label !== 'Log session'; i++) { await wait(1000); done = await cardPrimary() }
check('7b. the finished card offers to log the session', done?.label === 'Log session', done)
check('7c. ...and it is not the working colour, nor the ready one',
      !!done && !!workSample && done.bg !== workSample.bg && done.bg !== readySample?.bg,
      { ready: readySample?.bg, work: workSample?.bg, done: done?.bg })
await shoot('tools-timer-card-done')

// --- 8. "LOG SESSION" ACTUALLY OPENS SOMETHING, ON THE SCREEN SHE TAPS IT FROM
//
// Ashley, 14 Sep 2026: "Tapping Log session in the Round Timer modal after
// finishing 6/6 rounds does nothing. The button doesn't even click, and
// nothing is logged or submitted."
//
// The button fired every time. The sheet it opened was a plain block in normal
// document flow, and the full-screen field is `fixed … z-30` with an opaque
// background — so the form mounted UNDERNEATH it. Nothing to see, nothing to
// tap, no error.
//
// 7b above already checked that the finished card OFFERS to log. That is the
// hole this closes: the button's existence was checked and its effect never
// was. And it is checked from FULL SCREEN, because that is the only place the
// defect existed and the place she hit it.
check('8a. from the finished round, full screen still opens', await tapSel('[data-round-card-fullscreen]'))
await wait(700)
const fieldLog = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Log session/i.test((x.textContent || '').trim()))
  if (!b) return null
  b.click()
  return true
})()`)
check('8b. ...and the flooded field offers it too', fieldLog === true)
await wait(900)
await shoot('tools-timer-log-sheet')

// WHAT IS ACTUALLY ON TOP, asked of the browser rather than inferred from a
// z-index. elementFromPoint at the sheet's own centre answers the only
// question that matters: if she taps where the form is, does she hit the form?
// A check on "z-50 is in the class list" would have passed on a sheet rendered
// inside a stacking context that flattened it.
const sheet = await ev(`(() => {
  const el = document.querySelector('[data-testid="unplanned-work-sheet"]')
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
  return {
    found: true,
    w: Math.round(r.width), h: Math.round(r.height),
    visible: cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.5,
    hitIsInside: !!hit && el.contains(hit),
    hitTag: hit ? (hit.tagName + '.' + (hit.className || '').toString().slice(0, 40)) : null,
    // The duration the timer just ran, carried in rather than retyped.
    prefilled: [...el.querySelectorAll('input')].map(i => i.value).filter(Boolean),
  }
})()`)
check('8c. the log sheet is really on screen', sheet.found === true && sheet.visible === true && sheet.h > 100, sheet)
check('8d. ...and a tap in the middle of it lands ON it, not on the field behind',
  sheet.hitIsInside === true, sheet)
check('8e. ...with what the timer just ran already filled in',
  (sheet.prefilled || []).length > 0, sheet.prefilled)

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nOne timer, a card that says what it is doing, and a tab you can still use.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
