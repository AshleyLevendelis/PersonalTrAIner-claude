// ---------------------------------------------------------------------------
// CORRECTING A MISLOGGED SET, IN THE REAL CHAT.
//
// Ashley, 8 Sep 2026: asking the coach to fix a mislogged set "repeats
// questions endlessly without performing the update."
//
// Two faults, stacked. A weight was only recognised as "@60kg" — so almost
// every correction produced a BLOCKING "What weight did you use?" — and that
// question was rendered into a card with no answer buttons and no answer box,
// so the reply went back through the model as a fresh turn, arrived at the
// parser stripped of the half-finished entry, and was asked for again.
//
// The unit gate holds the grammar and the wiring. This holds the thing neither
// can: that a person sitting in the chat can type an answer and see the set
// change. The model is stubbed at the fetch boundary — the tool call it would
// have returned, returned directly — so everything downstream of it (parse,
// clarification, resume, write, receipt) is the real code.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9381', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9381/json/list').then(r => r.json())
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

// The model's half of the turn, stubbed at the fetch boundary. `sets_phrase`
// carries only the weight — which is what "actually the bench was 60kg" gives
// you, and the shape that used to start the loop.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  window.__chatSeen = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      window.__chatSeen.push(said)
      // KEYED BY WHAT WAS SAID, not by call order: the app makes chat calls of
      // its own and a queue quietly mis-aligns behind them.
      const logWorkout = /6kg/.test(said)
        ? { date: null, corrects_previous: false, entries: [{ raw_text: said, exercise_phrase: 'barbell bench press', sets_phrase: '3x8 6kg' }] }
        : /60kg/.test(said)
        ? { date: null, corrects_previous: true, entries: [{ raw_text: said, exercise_phrase: 'barbell bench press', sets_phrase: '60kg' }] }
        : undefined
      return new Response(JSON.stringify({ reply: logWorkout ? '' : 'Sure.', logWorkout }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

console.log('\nA CORRECTION THAT ENDS IN A CORRECTION\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

const composer = () => ev(`(() => {
  const t = document.querySelector('textarea')
  return t ? { found: true, placeholder: t.placeholder } : { found: false }
})()`)
let c = await composer()
for (let i = 0; i < 20 && !c.found; i++) { await wait(500); c = await composer() }
check('0. the chat is up', c.found === true, c)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

const say = async (text) => {
  // TYPE, THEN WAIT, THEN CLICK. Send is disabled until React has re-rendered
  // on the input event; doing both in one evaluate clicks a disabled button
  // and nothing happens — which is what this driver did on its first run.
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
}

const READ_CARD = String.raw`(() => {
  const box = document.querySelector('[data-testid="clarification-answer"]')
  const text = document.body.innerText
  const receipts = text.match(/(?:Corrected|Logged) · [^\n]*/g) || []
  const details = text.match(/\d+ × [^\n]*/g) || []
  const summaries = text.match(/\d+ exercises? · \d+ sets?(?: · replaced \d+)?/g) || []
  return {
    asked: !!box || /How many sets and reps|What weight did you use|Which exercise was that/.test(text),
    question: (text.match(/How many sets and reps[^\n]*|What weight did you use[^\n]*|Which exercise was that[^\n]*/) || [null])[0],
    hasAnswerBox: !!box,
    placeholder: box ? box.placeholder : null,
    brokenSentence: text.indexOf(' for ?') !== -1,
    logged: receipts.length > 0,
    receipt: receipts.length ? receipts[receipts.length - 1] : null,
    receiptCount: receipts.length,
    summary: summaries.length ? summaries[summaries.length - 1] : null,
    detail: details.length ? details[details.length - 1] : null,
  }
})()`
const readCard = () => ev(READ_CARD)

// --- turn one: the session goes in, at the wrong weight --------------------
check('1a. logging the session at 6kg', await say('bench 3x8 6kg'))
let first = await readCard()
for (let i = 0; i < 24 && !first.logged; i++) { await wait(500); first = await readCard() }
check('1b. it is on the log at 6kg', first.logged === true && first.detail === '3 × 8 @ 6kg', first)

// --- turn two: the correction, carrying only the new weight ----------------
check('1c. asking the coach to fix it', await say('actually it was 60kg'))



let card = await readCard()
for (let i = 0; i < 24 && !card.hasAnswerBox; i++) { await wait(500); card = await readCard() }
check('1d. it asks for the one thing it is missing', card.asked === true, card)
check('1e. ...as a whole sentence, naming the lift', /Barbell Bench Press/.test(card.question ?? '') && card.brokenSentence === false, card.question)
check('1f. THE QUESTION HAS SOMEWHERE TO ANSWER IT — this is the loop, closed', card.hasAnswerBox === true, card)
check('1g. ...with an example of what it wants', card.placeholder === 'e.g. 3x8', card.placeholder)
await shoot('correction-loop-asked')

const callsBefore = await ev('window.__chatCalls')
check('2a. typing the answer into the card', await ev(`(() => {
  const box = document.querySelector('[data-testid="clarification-answer"]'); if (!box) return false
  ;(${setValue})(box, '3x8')
  return true
})()`))
await wait(400)
check('2a2. ...and submitting it', await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Answer')
  if (!btn || btn.disabled) return false
  btn.click(); return true
})()`))
await wait(1200)
card = await readCard()
for (let i = 0; i < 24 && card.receiptCount < 2; i++) { await wait(500); card = await readCard() }

check('2b. the set is written — the question does not come back', card.logged === true && card.asked === false, card)
check('2c. ...as a CORRECTION: the wrong sets are REPLACED, not added to',
  /Corrected/.test(card.receipt ?? '') && /replaced 3/.test(card.summary ?? ''), { receipt: card.receipt, summary: card.summary })
check('2d. ...at the numbers she gave', /3 × 8 @ 60kg/.test(card.detail ?? ''), card.detail)
check('2e. and the model was never asked again — the answer stayed in the turn it belonged to',
  (await ev('window.__chatCalls')) === callsBefore, { before: callsBefore, after: await ev('window.__chatCalls') })
await shoot('correction-loop-logged')

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe correction lands, and the asking stops.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
