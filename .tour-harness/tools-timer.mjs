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
check('1b. ...and the idle card is in the sheet, one tap in', await seen('[data-round-card][data-round-phase="idle"]'))
check('1c. ...and the truth about the rest timer', /runs itself in the session dock/.test(settled || ''))
check('1d. the six-tile grid is gone', !/Rest timer/.test(settled || ''), (settled || '').slice(0, 300))
// 4b: the list is the tab, and it is headed "Everything here" because it now
// IS everything — the timers moved into it rather than sitting above it.
check('1e. the list carries every tool, timers included',
  /Everything here/i.test(settled || '') && /Timers/.test(settled || ''), (settled || '').slice(0, 300))
// AND GROCERY IS BACK, which REVERSES the 12 Sep assertion that stood here.
// Ashley reported it missing from Tools on 14 Sep; it is a row again, pointing
// at the same one grocery screen Nutrition and Home point at.
check('1f. ...and the grocery list is one of them again', /Grocery list/i.test(settled || ''), (settled || '').slice(0, 400))
// THE ROW IS GONE AND THE PROTOCOLS TOOK ITS PLACE — frame 4a.
check('1g. there is no row to a second screen any more', !(await seen('[data-change-intervals]')))
const chipTexts = await ev(`[...document.querySelectorAll('[data-protocol]')].map(b => b.textContent.trim())`)
check('1h. the protocols are chips on the tab', Array.isArray(chipTexts) && chipTexts.length >= 5, chipTexts)
check('1i. ...each carrying its own numbers', chipTexts.every(t => /\d/.test(t)), chipTexts)
check('1j. ...and none of them says its numbers twice',
  !chipTexts.some(t => { const m = t.match(/(\d+)\/(\d+)/g); return m && m.length > 1 }), chipTexts)
// EVERY CHIP ON ONE LINE. test:tools-grid counts characters as a proxy for
// wrapping; this is the thing it proxies for, measured at 390px.
const chipLines = await ev(`[...document.querySelectorAll('[data-protocol]')].map(b => Math.round(b.getBoundingClientRect().height))`)
check('1k. every chip is a single 44px pill, not a wrapped one', chipLines.every(h => h <= 48), chipLines)
// THE IDLE CARD SAYS WHAT YOU WOULD BE STARTING.
const idleCard = await ev(`document.querySelector('[data-round-card]')?.innerText || ''`)
check('1l. the idle card holds a total and what it is made of',
  /READY · 8 ROUNDS/i.test(idleCard) && /3:50/.test(idleCard) && /20s work · 10s rest/.test(idleCard), idleCard)
check('1m. ...and promises the countdown before you press', /10s countdown/.test(idleCard), idleCard)
await shoot('tools-timer-settled')

// --- 2. the card re-reads as a protocol is chosen ---------------------------
const clockNow = () => ev(`document.querySelector('[data-round-card-clock]')?.textContent?.trim() || ''`)
const beforePick = await clockNow()
check('2a. tapping a different protocol', await tapSel('[data-protocol="boxing"]'))
await wait(500)
const afterPick = await clockNow()
check('2b. ...re-reads the card\'s total, with no second screen in between',
  afterPick !== beforePick && afterPick === '11:00', { beforePick, afterPick })
check('2c. ...and nothing started', !(await seen('[data-round-card-primary]')))

// --- 3. Custom unfolds in place, and starts a short round -------------------
check('3a. the Custom chip opens the setup where it stands', await tapSel('[data-protocol="custom"]') && (await wait(500), await seen('[data-round-setup]')))
// The short work and rest this run needs are not on the chip rows — they are
// deliberately human values — so it goes through the Custom escape hatch,
// which is the part of the redesign most likely to be quietly dropped.
const hatches = await ev(`(() => {
  const tap = sel => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true }
  if (!tap('[data-work="custom"]')) return 'no work custom'
  if (!tap('[data-rest="custom"]')) return 'no rest custom'
  return 'chips'
})()`)
check('3b. work and rest have a custom escape hatch', hatches === 'chips', hatches)
await wait(300)
const typed = await ev(`(() => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const nums = [...document.querySelectorAll('input[type=number]')]
  if (nums.length < 2) return nums.length
  ;[4, 2].forEach((v, i) => { setter.call(nums[i], String(v)); nums[i].dispatchEvent(new Event('input', { bubbles: true })) })
  return 'set'
})()`)
check('3c. a 4s work / 2s rest can be typed into them', typed === 'set', typed)
// STEPPED DOWN TO THREE — the stepper is the only way to set the count, so
// the run exercises it rather than routing round it. Three, not two, so there
// is a boundary left to queue a switch onto.
//
// ONE TAP AT A TIME, with a beat between. A burst of twelve synchronous
// .click()s is batched into one render, so every handler reads the same stale
// count and the last write wins — the stepper landed on 4 rather than 3 and
// the failure looked like a stepper bug. It is a driver artefact: a thumb
// cannot tap twelve times inside one frame.
const roundsShown = () => ev(`document.querySelector('[data-round-card]')?.innerText?.match(/READY · (\\d+)/i)?.[1] || ''`)
let stepped = 'no stepper'
if (await seen('[data-rounds-down]')) {
  for (let i = 0; i < 14 && Number(await roundsShown()) > 3; i++) { await tapSel('[data-rounds-down]'); await wait(120) }
  for (let i = 0; i < 14 && Number(await roundsShown()) < 3; i++) { await tapSel('[data-rounds-up]'); await wait(120) }
  stepped = (await roundsShown()) === '3' ? 'stepped' : `landed on ${await roundsShown()}`
}
check('3d. the rounds stepper sets the count', stepped === 'stepped', stepped)
await wait(400)
// THE CARD IS THE SUMMARY NOW. 4a: "Changing any chip re-reads the card's
// total live, so the number you're about to commit to is always the one on
// the card." So the check reads the CARD, not a line inside the panel.
const customCard = await ev(`document.querySelector('[data-round-card]')?.innerText || ''`)
check('3e. the card states what is about to run, live',
  /READY · 3 ROUNDS/i.test(customCard) && /4s work · 2s rest/.test(customCard), customCard)
await shoot('tools-timer-custom')
const started = await ev(`(() => {
  const b = document.querySelector('[data-round-card-start]')
  if (!b) return false; b.click(); return true
})()`)
check('3f. ...and the card starts it', started)
await wait(1500)

// --- 4. the card, not the flood ---------------------------------------------
check('4a. a running round shows as a card', await seen('[data-round-card]'))
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
await wait(9500)
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
const workSample = await cardPrimary()
check('7a. mid-round the card is in its working colour', !!workSample && workSample.bg !== readySample?.bg, { ready: readySample?.bg, work: workSample?.bg })
await shoot('tools-timer-card-work')

// POLLED, NOT GUESSED. The run's length moved when the fixture gained a round
// for the queue test, and a fixed wait that is one second short reports "the
// finished card never appeared" — a false failure that looks exactly like a
// real one.
let done = await cardPrimary()
for (let i = 0; i < 40 && done?.label !== 'Log session'; i++) { await wait(1000); done = await cardPrimary() }
check('7b. the finished card offers to log the session', done?.label === 'Log session', done)
check('7c. ...and it is not the working colour, nor the ready one',
      !!done && !!workSample && done.bg !== workSample.bg && done.bg !== readySample?.bg,
      { ready: readySample?.bg, work: workSample?.bg, done: done?.bg })
await shoot('tools-timer-card-done')

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nOne timer, a card that says what it is doing, and a tab you can still use.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
