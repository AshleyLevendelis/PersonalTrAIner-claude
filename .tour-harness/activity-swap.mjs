// ---------------------------------------------------------------------------
// "I'M DOING MUAY THAI INSTEAD" ASKS FIRST — driven on a real screen.
//
// Ashley's ruling, 15 Sep 2026, from three options: ask first, like the
// others. Until that day this was the only one of the four day-verbs that
// wrote the moment the model decided it had heard one; its three siblings
// (rest, missed, move) have all asked since 31 Aug, when she first ruled
// "record it, but confirm first". This verb was six days older than that
// ruling and never came back for it.
//
// WHY A BROWSER AND NOT A SOURCE CHECK. The failure this replaces was not
// "the card says the wrong thing" — it was "there is no card". A gate that
// reads the builder proves the builder; only a screen proves a card reached
// it. And the second half matters as much: NOTHING MAY BE WRITTEN BEFORE THE
// TAP, which is a claim about two moments in time that source cannot hold.
//
// The model is stubbed at the fetch boundary; everything downstream — the
// builder, the card, the pending-action store, the confirm arm and the
// executor — is the real client.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9397', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9397/json/list').then(r => r.json())
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
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// The turn the new edge function produces: a proposal envelope and NO prose.
// `activity_planned: true` is the live shape — an evening class that has not
// happened yet — and it is the one that must not promise a log.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__writes = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/muay thai/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_session_activity_swap',
          rawArgs: { activity_name: 'Muay Thai', date: null, duration_minutes: null, intensity_rpe: null, activity_planned: true },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

console.log('\nTELLING THE COACH YOU ARE DOING SOMETHING ELSE\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

// READ THE PLAN OFF THE PAGE, never a hard-coded name. __swapTarget's own
// comment in chat.tsx records the day a driver asserted against a plan it had
// never read and passed on a fixture that did not exist.
const todayFocus = await ev('window.__todayFocus ?? null')
check('0b. today has a session to swap out', typeof todayFocus === 'string' && todayFocus.length > 0, todayFocus)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, "Im not going to hit that session in going to do muay thai instead") })()`)
await wait(400)
check('1. her sentence goes — no command verb in it', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
  if (!b || b.disabled) return false
  b.click(); return true
})()`))

const READ = String.raw`(() => {
  const text = document.body.innerText
  const btns = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return {
    // Client-authored furniture, so model prose can never satisfy it.
    hasCard: /Proposed change/i.test(text)
      && btns.some(b => /^Apply/.test(b))
      && btns.includes('Keep'),
    asks: /Shall I\?/.test(text),
    announces: /I've swapped|I have swapped|is now down as|Done —/.test(text),
    namesActivity: /Muay Thai/.test(text),
    saysNotMissed: /won't (show as|count as) missed|won't count as a missed session/i.test(text),
    // A class that has not happened yet has nothing to log; promising one is
    // the 8 Sep defect (a guessed 60 minutes for an evening class) in card form.
    promisesLog: /I'll log the \d+ minutes/.test(text),
    asksHowLong: /how long it went afterwards/i.test(text),
    // THE RECEIPT'S OWN LINE, read off the real screen: a "Swapped" heading
    // and the row naming what replaced what. Anchored on the sentence rather
    // than the heading alone, because "Swapped" is a word the card can use too.
    receipt: /\bSwapped\b/.test(text) && /Muay Thai instead of /.test(text),
    hasUndo: btns.includes('Undo'),
    btns,
  }
})()`

// WAIT FOR THE TYPEWRITER, not the first matching word — the lead renders
// character by character and "Shall I?" is the last thing on it, so a poll
// that stops at the card reports the question as missing.
let r = await ev(READ)
for (let i = 0; i < 60 && !(r.hasCard && r.asks); i++) { await wait(500); r = await ev(READ) }

check('2. A CARD, NOT A SENTENCE — she is asked', r.hasCard === true, r)
check('2b. ...and it asks rather than announcing', r.asks === true && r.announces === false, r)
check('2c. ...naming what she said she was doing', r.namesActivity === true, r)
check('2d. ...and what it saves her from', r.saysNotMissed === true, r)
check('2e. ...against the session it replaces', (await ev(`document.body.innerText.includes(${JSON.stringify(todayFocus)})`)) === true, todayFocus)
// THE CARD PROMISES ONLY WHAT CONFIRM WILL DO.
check('3. a class still to come is not promised a log', r.promisesLog === false, r)
check('3b. ...it says it will ask afterwards instead', r.asksHowLong === true, r)
await shoot('activity-swap-card')

// NOTHING IS WRITTEN BEFORE THE TAP. This is the half of Ashley's ruling that
// a card on screen does not by itself prove.
const wroteEarly = await ev(`(window.__fakeDb && window.__fakeDb.workout_sessions || []).some(r => r.swapped_for_activity)`)
check('4. NOTHING IS WRITTEN UNTIL SHE TAPS', wroteEarly !== true, wroteEarly)

check('5. tapping Apply', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Apply/.test((x.textContent || '').trim()))
  if (!b || b.disabled) return false
  b.click(); return true
})()`))
await wait(1500)
let after = await ev(READ)
for (let i = 0; i < 40 && !after.receipt; i++) { await wait(500); after = await ev(READ) }
check('5b. ...gives a receipt', after.receipt === true, after)
check('5c. ...with an Undo', after.hasUndo === true, after.btns)

const wroteAfter = await ev(`(window.__fakeDb && window.__fakeDb.workout_sessions || []).some(r => r.swapped_for_activity === 'Muay Thai')`)
check('6. AND NOW the day is marked', wroteAfter === true, wroteAfter)
await shoot('activity-swap-confirmed')

const err = await ev('window.__err ?? null')
check('7. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nShe is asked first, and nothing moves until she says yes.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
