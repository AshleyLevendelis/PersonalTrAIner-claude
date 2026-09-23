// ---------------------------------------------------------------------------
// "NEVER GIVE ME THAT AGAIN", IN THE REAL CHAT.
//
// Banning an exercise was the LAST thing a screen could do that the coach could
// not. The server declared ban_exercise to the model and then declined it in
// the handler, pointing at the button on the exercise row — which is exactly
// the shape CLAUDE.md records as the hole no general gate could see.
//
// Wired 14 Sep 2026 on Ashley's instruction. test:coach-parity holds the source
// property (no declared tool declines). This holds what no source check can:
// that asking for it in the real chat produces a real card, that the card states
// the BLAST RADIUS before the tap — every week, not just today — and that an
// ambiguous name asks which lift rather than banning a guess.
//
// WHAT THIS DRIVER CANNOT SEE, said so nobody assumes otherwise: the model is
// stubbed AT THE FETCH BOUNDARY, so the edge function's own handler never runs
// here. Reverting the server to its old decline leaves this driver fully green
// — measured, not assumed. The server half is test:coach-parity's job ("not a
// declining stub"), and that half is mutation-tested there. Neither check
// covers both ends alone.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9421', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9421/json/list').then(r => r.json())
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

console.log('\nA BAN REACHES THE WHOLE PLAN, AND SAYS SO FIRST\n')

// WHICH LIFT TO BAN — read off the page, not typed here, for the same
// reason verify:swap-request does it: a name hard-coded here is a name that
// stops being on the plan the day the plan changes. This used to name
// "squats" and assert the card said Squats. Its own comment claimed the plan
// was read from the page, through `window.__todayExercises`, which no page has
// ever published: the read came back null every time and the hard-coded name
// was the whole test. Once "today" stopped drifting with the calendar, today's
// session had no squats on it and the resolver correctly said so — which the
// check reported as the dead end coming back.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(3000)
const banTarget = await ev(`window.__banTarget`)
const swapTarget = await ev(`window.__banAmbiguous`)
check('0a. the plan holds a lift whose loose name means one thing plan-wide',
  !!banTarget && !!banTarget.full && !!banTarget.loose, banTarget)
// ASSERTED, not assumed. This used the swap target and never checked it was
// ambiguous; on 23 Sep 2026 it quietly was not, and check 4 blamed the coach.
check('0b. ...and one whose loose name does NOT — at least two lifts on the plan answer to it',
  !!swapTarget && !!swapTarget.loose && (swapTarget.matches?.length ?? 0) >= 2, swapTarget)
if (!banTarget || !swapTarget) { console.error('\nNo usable lift on today’s session.\n'); ws.close(); chrome.kill(); server.close(); process.exit(1) }
console.log(`asking to ban "${banTarget.loose}" — the plan spells it "${banTarget.full}"; the ambiguous probe is "${swapTarget.loose}" (${swapTarget.matches.join(', ')})`)
const TARGET_FULL = banTarget.full

// THE SLOPPY ARGUMENTS ARE THE TEST. No day at all, and the old exercise named
// the way a person says it rather than the way the catalogue spells it. Both
// were dead ends before; either alone was enough.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  window.__askFor = ${JSON.stringify(banTarget.loose)}
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/never|ban|hate/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_exercise_ban',
          rawArgs: { item: window.__askFor, reason: 'I hate them.' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0c. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, 'never give me that again, I hate it') })()`)
await wait(400)
check('1. asking for the ban', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
  if (!b || b.disabled) return false
  b.click(); return true
})()`))

const READ = String.raw`(() => {
  const text = document.body.innerText
  return {
    deadEnd: text.indexOf("couldn't find that on your current plan") !== -1,
    // The card's own heading, its Apply control (labelled with the scope, so
    // "Apply today") and its decline — all client-authored, so matching them
    // cannot be satisfied by model prose.
    hasProposal: /Proposed change/i.test(text)
      && [...document.querySelectorAll('button')].some(b => /^Apply/.test((b.textContent || '').trim()))
      && [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Keep'),
    mentionsTarget: text.indexOf(${JSON.stringify(TARGET_FULL)}) !== -1,
    mentionsLegPress: /Leg Press/i.test(text),
    buttons: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean),
    // THE CARD'S OWN TEXT, not the last N characters of the page. The seeded
    // conversation sits below the card and is longer than any window, so a tail
    // slice reads the thread and never the thing under test.
    card: (() => {
      const all = [...document.querySelectorAll('*')].filter(e => /Proposed change/i.test(e.textContent || ''))
      const heading = all[all.length - 1]
      if (!heading) return ''
      // Up from the heading to the smallest ancestor that also holds the card's
      // own controls — that is the card, and nothing above or below it.
      let p = heading
      for (let i = 0; i < 12 && p.parentElement; i++) {
        p = p.parentElement
        const btns = [...p.querySelectorAll('button')].map(b => (b.textContent || '').trim())
        // RE-ANCHORED 15 Sep 2026. This used to climb until the container held
        // the literal old lead, "I can stop giving you" — so when Ashley's
        // grammar changed that day the loop never broke, the node climbed to
        // <body>, and 2d-2f read an unrelated scroll fixture from elsewhere on
        // the page. They reported the ban card as missing its blast-radius line
        // while the card was correct, and 2a-2c passed throughout, which is
        // what made it look like a content bug rather than a bad read.
        //
        // The lead requirement is GONE rather than re-worded: it was there so
        // the captured text would include the line naming the exercise, and the
        // only check that needs that (2c) reads mentionsTarget from the whole
        // page, not from this slice. 2d-2f test the card's IMPLICATIONS, which
        // are inside the card. So the innermost ancestor holding the controls
        // is exactly right, and nothing here encodes a sentence we chose.
        if (btns.some(t => /^Apply/.test(t)) && btns.includes('Keep')) break
      }
      return p.textContent.replace(/\s+/g, ' ').trim().slice(0, 1200)
    })(),
    tail: text.replace(/\s+/g, ' ').slice(-600),
  }
})()`
let state = await ev(READ)
for (let i = 0; i < 24 && !state.hasProposal && !state.deadEnd; i++) { await wait(500); state = await ev(READ) }

check('2a. NO DECLINE — it does not send her to a button', state.deadEnd === false && !/ban button|through chat yet/i.test(state.card), state.card)
check('2b. ...a real proposal card came back instead', state.hasProposal === true, { buttons: state.buttons, tail: state.tail })
check('2c. ...naming the exercise the way the plan spells it',
  state.mentionsTarget === true, { asked: swapTarget.loose, expected: TARGET_FULL, card: state.card })
// THE WHOLE POINT OF THE CARD. A ban is every week of every block, and that is
// invisible from a chat sentence — so the card has to say how far it reaches
// BEFORE the tap, which the screen's own ban button does not do.
check('2d. ...and states the blast radius: every week, not just today',
  /every week of your plan, not just today/i.test(state.card), state.card)
check('2e. ...with a real count of the sessions it rebuilds',
  /\b\d+ sessions? get/i.test(state.card), state.card)
check('2f. ...and says what happens where no alternative exists',
  /no good alternative/i.test(state.card), state.card)
await shoot('coach-ban-proposal')

// THE AMBIGUOUS CASE, and it is the one worth having. A ban is permanent and
// plan-wide, so a name that could mean three different lifts must produce a
// question, not a guess — banning the wrong exercise is silent and wide. Found
// by this driver asking for "row" and getting exactly that question back.
await ev(`window.__askFor = ${JSON.stringify(swapTarget.loose)}`)
await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, 'never give me that again, I hate it') })()`)
await wait(400)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
await wait(3000)
const amb = await ev(`document.body.innerText.replace(/\\s+/g,' ')`)
check('4. an ambiguous name asks which one, rather than banning a guess',
  /Did you mean .*\?/.test(amb || ''), (amb || '').slice(-200))
check('...and does not produce a card off a guess',
  ((amb || '').match(/Proposed change/gi) || []).length <= 1, ((amb || '').match(/Proposed change/gi) || []).length)

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA ban is proposed, with its reach stated first.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
