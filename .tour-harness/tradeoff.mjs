// ---------------------------------------------------------------------------
// "THAT WOULD COST YOU SOMETHING" — ASKED, IN A REAL BROWSER.
//
// Ashley, 14 Sep 2026: "If we just allow users to make any change they want
// without advising them, they will end up with a plan that doesn't help them
// meet their goal." The decision that followed — ask first at tier 2, never
// refuse what is not unsafe — is guarded by test:edit-tradeoff (the rules) and
// test:coach-promises (the wiring).
//
// THIS EXISTS BECAUSE NEITHER OF THOSE CAN SEE A DEAD BRANCH. Measured the same
// day: changing the guard to `if (false && advice)` disabled the entire
// trade-off step and all twelve wiring checks still passed, because they read
// source text and the text was still there. A source gate cannot tell reachable
// code from unreachable code. A browser can — it either gets a question or it
// does not.
//
// TWO ASKS, AND THE SECOND IS THE POINT. The first request for a
// goal-damaging change must produce a QUESTION and no card. The second
// identical request must produce a CARD — that is "once per block, per thing"
// working, and it is also what proves the first outcome was a decision rather
// than the card path being broken.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9391', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9391/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 360)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

console.log('\nA CHANGE THAT WORKS AGAINST THE GOAL IS ASKED ABOUT\n')

// The model is stubbed at the fetch boundary; everything after it — the
// builder, the trial, the verdict, the guards — is the real code.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/drop|remove/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_exercise_remove',
          rawArgs: { day: window.__removeDay, item: window.__removeName, scope: 'permanent' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

// WHICH REMOVAL ACTUALLY COSTS SOMETHING — computed by the page against its
// own generated week, never named here. See chat.tsx's own note.
const removal = await ev('window.__tradeoffRemoval ?? null')
check('0a. this week holds a removal that genuinely works against the goal',
  !!removal && !!removal.name, removal)
if (!removal) {
  console.error('\nNo tier-2 removal on this week — nothing to drive.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`  asking to drop "${removal.name}" from ${removal.day} for the block`)
console.log(`  the engine's reason: ${removal.reason}`)
await ev(`window.__removeName = ${JSON.stringify(removal.name)}; window.__removeDay = ${JSON.stringify(removal.day)}`)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0b. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const ask = async words => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(words)}) })()`)
  await wait(400)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
  await wait(4000)
}

// What is on screen: whether a confirm card exists, and what chips are offered.
const READ = `(() => {
  const text = document.body.innerText
  const buttons = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  return {
    hasCard: /Proposed change/i.test(text),
    hasApply: buttons.some(t => /^Apply/.test(t)),
    chips: buttons.filter(t => t.length < 30),
    tail: text.replace(/\\s+/g, ' ').slice(-420),
  }
})()`

// --- 1. THE FIRST ASK ------------------------------------------------------
await ask(`drop ${removal.name} from ${removal.day} for the rest of the block`)
const first = await ev(READ)
await shoot('tradeoff-ask')

check('1a. it does NOT put a confirm card up', first.hasCard === false && first.hasApply === false, first)
check('1b. ...it asks a question instead', /\?/.test(first.tail), first.tail)
check('1c. ...naming what it costs in the goal’s own terms',
  /\bsets\b/i.test(first.tail) && /\d+/.test(first.tail), first.tail)
// THE WHOLE OF THE DECISION: never blocked, exactly one tap further away.
check('1d. ...and offers "Do it anyway"', first.chips.some(c => /do it anyway/i.test(c)), first.chips)
check('1e. ...alongside a cheaper route, not on its own',
  first.chips.filter(c => !/do it anyway/i.test(c) && !/^(Send|Chat|Home|Nutrition|Exercise|Tools)$/i.test(c)).length >= 1, first.chips)

// --- 2. THE SECOND ASK -----------------------------------------------------
// Once per block, per thing. The same request again must go straight to a card
// — which is also what proves the first outcome was a decision and not simply
// a broken card path.
await ask(`drop ${removal.name} from ${removal.day} for the rest of the block`)
const second = await ev(READ)
await shoot('tradeoff-second-ask')

check('2a. asked a second time, it stops asking and shows the card', second.hasCard === true, second)
check('2b. ...and the card still states what it costs',
  /\bsets\b/i.test(second.tail), second.tail)
check('2c. ...so the change was never blocked, only slowed by one tap', second.hasApply === true, second)

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA goal-damaging change is asked about, then allowed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
