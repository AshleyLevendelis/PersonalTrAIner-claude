// ---------------------------------------------------------------------------
// THE WINDOW BEFORE THE PLAN ARRIVES, ON THE TWO SCREENS THAT TALK ABOUT IT.
//
// scripts/test-plan-unknown.ts proves the three units behave: pickOpener,
// initialGreetingDetail's guard, loadDashboardData's status. What it cannot
// prove is that a REAL mount, with a REAL plan landing mid-render, ends up
// showing the right thing — and that is precisely where this bug lived. The
// chat's finalize effect was correct in isolation and self-cancelling in a
// render, because its cleanup cleared the very timer the plan's arrival was
// supposed to let run.
//
// ?planDelay=N is the whole race in one knob: both harnesses hold [] for the
// plan and the mesocycle (what App.tsx:111,138 do until their read resolves)
// and hand them over N ms later. Every other run of these harnesses passes the
// plan before first paint, which is why neither had ever seen this window.
//
// BEFORE (measured 8 Sep 2026, this driver against pre-fix code):
//   chat  0.4s  "Hey — it's a rest day on your plan. How's the recovery going?"
//   chat  6.5s  the same sentence, permanently
//   home  0.4s  "TODAY'S SESSION / Rest day", no Start button
//   home  6.5s  still "Rest day", beside a week strip showing four sessions
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
let page = '/.tour-harness/chat.html'
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? page : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9355', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9355/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
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

const read = () => ev(`({ text: document.body.innerText, planArrived: window.__planArrived === true })`)
const text = async () => (await read()).text
// UNDER the 2.5s opener ceiling on purpose: the runs that recovered on their
// own were the SLOW ones, where the plan missed the deadline and the timer
// fired. A prompt arrival is the case that used to be permanent.
const PLAN_DELAY = 1500
/** Poll until `re` renders, and report whether the plan had arrived by then. */
const firstPaintOf = async re => {
  for (let i = 0; i < 60; i++) {
    const r = await read()
    if (re.test(r.text)) return r
    await wait(100)
  }
  return await read()
}

console.log('\nTHE REST-DAY RACE — what each screen says before the plan lands\n')

// ---------------------------------------------------------------------------
console.log('  CHAT — the first bubble, cold, no cached thread')
// ---------------------------------------------------------------------------
page = '/.tour-harness/chat.html'
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?seed=opener&rows=0&planDelay=${PLAN_DELAY}` })
const chatFirst = await firstPaintOf(/Hey/)
const chatEarly = chatFirst.text
check('the opener is on screen before the plan is',
  /Hey/.test(chatEarly) && chatFirst.planArrived === false, { planArrived: chatFirst.planArrived, text: chatEarly.slice(0, 120) })
check('and it does NOT announce a rest day', !/rest day/i.test(chatEarly), chatEarly.slice(0, 160))
check('nor any other claim about today', !/today'?s |today was|recovery going/i.test(chatEarly), chatEarly.slice(0, 160))
await shoot('rest-day-race-chat-waiting')

// The plan lands at 1.2s — INSIDE the 2.5s ceiling, which is the case that
// used to fail. Give the finalize path room and then read again.
await wait(5000)
const chatLate = await text()
check('once the plan lands the opener is replaced, not frozen',
  !/Hey — how's it going\?/.test(chatLate) && !/rest day/i.test(chatLate), chatLate.slice(0, 200))
// THE PROPERTY, NOT THE NAME. This pinned "Squat & Carry" — today's session
// on the day it was written. The fixture's plan is laid out relative to the
// REAL weekday (real.tsx, availableIdx), so the same driver saw "Upper Pull &
// Core" two days later and failed on a screen that was right (10 Sep 2026).
// What the check means is "the coach now names a session, and no longer
// says it is waiting for the plan".
check('...and it no longer says it is waiting for the plan',
  !/Checking your plan/i.test(chatLate), chatLate.slice(0, 300))
await shoot('rest-day-race-chat-settled')

// ---------------------------------------------------------------------------
console.log('\n  HOME — the session block, same window')
// ---------------------------------------------------------------------------
page = '/.tour-harness/real.html'
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?planDelay=${PLAN_DELAY}` })
const homeFirst = await firstPaintOf(/TODAY'S SESSION/)
const homeEarly = homeFirst.text
check('Home draws its session block before the plan is in',
  /TODAY'S SESSION/.test(homeEarly) && homeFirst.planArrived === false, { planArrived: homeFirst.planArrived })
check('Home says it is still checking, in Ashley\'s words',
  /Checking your plan…/.test(homeEarly), homeEarly.slice(0, 200))
check('and it does NOT say rest day', !/Rest day/.test(homeEarly), homeEarly.slice(0, 200))
check('no Start session button over a session it cannot name',
  !/Start session/.test(homeEarly), homeEarly.slice(0, 200))
check('no Tomorrow row guessed from the same empty plan',
  !/\nTomorrow\n/.test(homeEarly), homeEarly.slice(0, 400))
check('the rest of Home is still on screen — this is a block waiting, not a blank page',
  /TODAY SO FAR/.test(homeEarly) && /Calories/.test(homeEarly), homeEarly.slice(0, 200))
await shoot('rest-day-race-home-waiting')

await wait(5000)
const homeLate = await text()
// Same property, same reason as the chat check above: a named session with a
// real exercise count where "Checking your plan…" was, whichever day it is.
check('the block fills in once the plan arrives',
  !/Checking your plan/.test(homeLate) && /TODAY'S SESSION[\s\S]{0,200}\d+ exercises/.test(homeLate), homeLate.slice(0, 240))
// AND THE TWO SCREENS NAME THE SAME SESSION. The strongest form of the old
// hard-coded check: whatever Home says today's session is, the coach's first
// bubble said the same — read off Home, not typed in by whoever wrote this.
const homeFocus = /TODAY'S SESSION\s+~\d+ min\s+([^\n]+)/.exec(homeLate)?.[1]?.trim() ?? null
check('...and the coach named the same session Home shows', !!homeFocus && chatLate.includes(homeFocus), { homeFocus, chat: chatLate.slice(0, 200) })
check('...with the button to start it', /Start session/.test(homeLate), homeLate.slice(0, 240))
check('...and it no longer says it is checking', !/Checking your plan…/.test(homeLate))
check('the week header knows which week it is', /WEEK 2 OF 16/.test(homeLate), homeLate.slice(0, 80))
await shoot('rest-day-race-home-settled')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nAll rest-day-race checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
