// ---------------------------------------------------------------------------
// A MOVED SESSION, ON THE DAY IT LANDED ON — IN THE REAL CHAT.
//
// Ashley, 9 Sep 2026 18:41, from the live app. She moved Tuesday's Push &
// Press to Wednesday. Then, on Wednesday:
//
//   her  I missed todays session
//   app  There's no session on Wednesday to move — that day is already clear.
//
// Three times. scripts/test-moved-session-stuck.ts holds the resolver's half.
// This holds the half no source check can: that a real mount, reading a real
// move row through useTrainingWeek, puts the question on screen with its two
// answers under it, and that tapping either one gets a card.
//
// WHY NO EXISTING DRIVER SAW THIS. real.tsx's ?moved=1 fixture puts the
// move's ORIGIN on today — the case that always worked. The fixture here
// (?movedin=1 in chat.tsx) points the row the other way and, critically,
// makes today NOT a training day of its own: her Wednesday.
//
// The model is stubbed at the fetch boundary — the tool call it would have
// returned, returned directly — so everything downstream of it is the real
// code: resolveMoveTarget, both builders, the chips, the card.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9388', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9388/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const nameOf = n => new Date(`${iso(n)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
const TODAY = iso(0), TOMORROW = iso(1)
const YESTERDAY_NAME = nameOf(-1), TOMORROW_NAME = nameOf(1), TODAY_NAME = nameOf(0)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// The model's half, keyed by WHAT WAS SAID rather than by call order — the
// app makes chat calls of its own and a queue quietly mis-aligns behind them.
// Each branch is the tool call the deployed prompt already documents for that
// sentence: "I missed today's session" with no day named is a move with no
// to_date; naming a day fills it in; "take today off" is a rest day.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatSeen = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      window.__chatSeen.push(said)
      const proposal = /off instead/i.test(said)
        ? { kind: 'propose_rest_day', rawArgs: { date: ${JSON.stringify(TODAY)} } }
        : /move it to/i.test(said)
        ? { kind: 'propose_session_move', rawArgs: { from_date: ${JSON.stringify(TODAY)}, to_date: ${JSON.stringify(TOMORROW)} } }
        : /missed/i.test(said)
        ? { kind: 'propose_session_move', rawArgs: { from_date: ${JSON.stringify(TODAY)} } }
        : undefined
      return new Response(JSON.stringify({ reply: proposal ? '' : 'Sure.', proposal }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async text => {
  // TYPE, THEN WAIT, THEN CLICK: send is disabled until React has re-rendered
  // on the input event, and doing both in one evaluate clicks a disabled
  // button — which is nothing happening, reported as a pass.
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
}

const READ = `(() => {
  const text = document.body.innerText
  const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean)
  return {
    text,
    // The chips are the buttons the chat renders under the newest bubble; the
    // card's own controls are Confirm / Not now.
    buttons,
    // The card's own controls are Apply / Keep — NOT Confirm / Not now, which
    // is what this driver looked for on its first run and never found, while
    // both cards were on screen the whole time.
    hasCard: /PROPOSED CHANGE/.test(text) && buttons.includes('Apply') && buttons.includes('Keep'),
    saysAlreadyClear: /already clear/i.test(text),
    sample: text.replace(/\\s+/g, ' ').slice(-320),
  }
})()`
const read = () => ev(READ)
// WAIT FOR THE REVEAL, NOT FOR THE TEXT. A just-arrived reply is typed out a
// character at a time and its chips are withheld until that finishes — so
// polling on "does the sentence mention the move" samples a half-written
// bubble with no buttons under it and reports the chips missing. First run of
// this driver failed six checks on exactly that.
const until = async (pred, tries = 40) => {
  let r = await read()
  for (let i = 0; i < tries && !pred(r); i++) { await wait(500); r = await read() }
  return r
}

console.log('\nHER WEDNESDAY, IN THE REAL CHAT\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?movedin=1` })
await wait(4000)
let up = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !up; i++) { await wait(500); up = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', up === true, up)

// --- "I missed todays session" ---------------------------------------------
await say('I missed todays session')
const r = await until(x => x.saysAlreadyClear || x.buttons.includes('Take today off instead'))

check('1. it is NOT the refusal she got three times', !r.saysAlreadyClear, r.sample)
check('2. it names the session by the day it came FROM',
  new RegExp(`That's ${YESTERDAY_NAME}'s`).test(r.text), r.sample)
check('3. ...and says she has already moved it once', /already moved it once/i.test(r.text), r.sample)
check('4. it offers the next free day by name', new RegExp(TOMORROW_NAME).test(r.text), r.sample)
check('5. ...and offers to drop it, saying what dropping means',
  /drop it and take today off/i.test(r.text), r.sample)
check('6. both answers are there to TAP, not to type',
  r.buttons.includes(`Move it to ${TOMORROW_NAME}`) && r.buttons.includes('Take today off instead'), r.buttons)
check('7. the tag that carries them is not left visible in the bubble',
  !/QUICK_REPLIES/.test(r.text), r.sample)
await shoot('moved-session-asked')

// --- tapping "Move it to X" -------------------------------------------------
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Move it to ${TOMORROW_NAME}'); if (b) b.click(); return !!b })()`)
// THE CARD ARRIVES BEFORE THE SENTENCE FINISHES TYPING, so waiting on the
// card alone samples a half-written lead and reports the question mark
// missing. Wait for both.
const moved = await until(x => x.hasCard && /Shall I\?/.test(x.text))
check('8. tapping it gets a card, not the same question again', moved.hasCard, moved.sample)
check('9. ...whose sentence names the TRUE origin, not the day it was sitting on',
  new RegExp(`put ${YESTERDAY_NAME}'s`).test(moved.text) && !new RegExp(`put ${TODAY_NAME}'s`).test(moved.text), moved.sample)
// Confirming rewrites the ORIGINAL move, so afterwards today is an ordinary
// day and yesterday is the day the session left. A row naming today was
// describing a state that would never exist — found here, on the screen,
// after the resolver's own gate was green.
const rows = await ev(`(() => [...document.querySelectorAll('*')]
  .filter(n => n.children.length === 0 && /^Moved to /.test(n.textContent.trim()))
  .map(n => (n.parentElement?.parentElement?.textContent || '').trim()))()`)
check('9b. ...and so does the row under it, and the promise beside it',
  Array.isArray(rows) && rows.some(t => t.includes(YESTERDAY_NAME)) && !rows.some(t => t.includes(TODAY_NAME)), rows)
check('9c. the day that will not count as missed is the day it LEFT',
  new RegExp(`${YESTERDAY_NAME} won't count as a missed session`).test(moved.text)
    && !new RegExp(`${TODAY_NAME} won't count as a missed session`).test(moved.text), moved.sample)
check('10. ...and it is still a question until she confirms',
  /Shall I\?/.test(moved.text) && !/has been moved|is now on/i.test(moved.text), moved.sample)
await shoot('moved-session-move-card')

// --- the other answer: dropping it -----------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?movedin=1` })
await wait(4000)
await say('I missed todays session')
await until(x => x.buttons.includes('Take today off instead'))
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Take today off instead'); if (b) b.click(); return !!b })()`)
const dropped = await until(x => x.hasCard && /Shall I\?/.test(x.text))
check('11. dropping it gets a card too — the rest-day path is not the silent one',
  dropped.hasCard, dropped.sample)
check('12. ...and does not claim there was nothing on the day to rest from',
  !/no session on that day to rest from/i.test(dropped.text), dropped.sample)
check('13. ...saying it will not count as missed',
  /rest day you chose/i.test(dropped.text) && /won't count as (a )?missed/i.test(dropped.text), dropped.sample)
await shoot('moved-session-drop-card')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA moved session can be moved again, or dropped.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
