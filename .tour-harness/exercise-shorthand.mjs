// ---------------------------------------------------------------------------
// GYM SHORTHAND, IN THE REAL CHAT.
//
// Ashley, live test, 19 Oct 2026: "Im doing my own workout. First exercise I
// did was rdl". The coach asked "How many sets and reps for Single-Leg RDL
// (Bodyweight)?" — the only catalogue name containing the letters — and a
// bodyweight entry skips the weight question, so her loaded RDL would have
// logged at 0 kg with nothing on screen to catch it.
//
// test:exercise-aliases holds the resolver. This holds what she sees: the
// question names the Romanian deadlift, the weight is asked, the set logs at
// the weight she gave — and a guessed bodyweight name is OFFERED as a tap
// rather than written. The model is stubbed at the fetch boundary with the
// tool call it would have made; everything after it is the real code.
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

const DEBUG_PORT = 9461
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json())
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
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// The model's half, keyed by WHAT WAS SAID (the app makes chat calls of its
// own). The rdl entry carries no sets at all — her message had none.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      const logWorkout = /was rdl/.test(said)
        ? { date: null, corrects_previous: false, entries: [{ raw_text: 'rdl', exercise_phrase: 'rdl', sets_phrase: '' }] }
        : /sissy/.test(said)
        ? { date: null, corrects_previous: false, entries: [{ raw_text: 'sissy 3x10', exercise_phrase: 'sissy', sets_phrase: '3x10' }] }
        : undefined
      return new Response(JSON.stringify({ reply: logWorkout ? '' : 'Sure.', logWorkout }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async (text) => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
}
const answer = async (text) => {
  const typed = await ev(`(() => {
    const box = document.querySelector('[data-testid="clarification-answer"]'); if (!box) return false
    ;(${setValue})(box, ${JSON.stringify(text)}); return true
  })()`)
  await wait(400)
  const sent = await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Answer')
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
  return typed && sent
}
const READ = String.raw`(() => {
  const text = document.body.innerText
  // One per receipt: the card's own summary line (the "Logged · day" line is
  // drawn twice per receipt, in the bubble and on the card).
  const receipts = text.match(/\d+ exercises? · \d+ sets?/g) || []
  const details = text.match(/\d+ × [^\n]*/g) || []
  const q = text.match(/How many sets and reps[^\n]*|What weight did you use[^\n]*|Which "[^"\n]*" did you mean\?|Which exercise was that\?/g) || []
  const box = document.querySelector('[data-testid="clarification-answer"]')
  return {
    question: q.length ? q[q.length - 1] : null,
    hasAnswerBox: !!box,
    taps: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => /Squat|RDL|Deadlift/i.test(t)),
    receiptCount: receipts.length,
    rdlLogged: /Romanian Deadlifts\s+3 × 8 @ 60kg/.test(text),
    sissyLogged: /Sissy Squat\s+3 × 10/.test(text),
    detail: details.length ? details[details.length - 1] : null,
    singleLeg: /Single-Leg RDL/.test(text),
  }
})()`
const read = () => ev(READ)
const until = async (pred) => {
  let s = await read()
  for (let i = 0; i < 24 && !pred(s); i++) { await wait(500); s = await read() }
  return s
}

console.log('\n1. "First exercise I did was rdl"\n')
let c = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !c; i++) { await wait(500); c = await ev(`!!document.querySelector('textarea')`) }
check('1a. the chat is up', c === true)
check('1b. saying it', await say('Im doing my own workout. First exercise I did was rdl'))
let s = await until(x => /How many sets/.test(x.question ?? ''))
check('1c. it asks sets and reps FOR ROMANIAN DEADLIFTS', /How many sets and reps for Romanian Deadlifts\?/.test(s.question ?? ''), s)
check('1d. ...and the single-leg bodyweight variant is nowhere on screen', s.singleLeg === false, s)
check('1e. ...nothing is logged yet', s.receiptCount === 0, s)
await shoot('exercise-shorthand-asked')
check('1f. answering 3x8 in the card', await answer('3x8'))
s = await until(x => /What weight/.test(x.question ?? ''))
check('1g. it asks the WEIGHT, naming the lift — a loaded RDL is never written at 0 kg',
  /What weight did you use for Romanian Deadlifts\?/.test(s.question ?? '') && s.receiptCount === 0, s)
check('1h. answering 60kg', await answer('60kg'))
s = await until(x => x.receiptCount > 0)
check('1i. it logs Romanian Deadlifts, 3 × 8 at 60 kg', s.receiptCount === 1 && s.rdlLogged === true, s)
await shoot('exercise-shorthand-logged')

console.log('\n2. A guessed bodyweight name is offered, never written\n')
check('2a. "did sissy 3x10"', await say('did sissy 3x10'))
s = await until(x => /Which "sissy"/.test(x.question ?? ''))
check('2b. it asks which "sissy" she meant', /Which "sissy" did you mean\?/.test(s.question ?? ''), s)
check('2c. ...offering Sissy Squat as a tap', s.taps.includes('Sissy Squat'), s.taps)
check('2d. ...with a box to type a different one', s.hasAnswerBox === true, s)
check('2e. ...and nothing new is logged', s.receiptCount === 1, s)
await shoot('exercise-shorthand-chooser')
const tapped = await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Sissy Squat')
  if (!btn || btn.disabled) return false
  btn.click(); return true
})()`)
check('2f. tapping Sissy Squat', tapped === true)
s = await until(x => x.receiptCount > 1)
check('2g. ...logs 3 × 10 of Sissy Squat', s.receiptCount === 2 && s.sissyLogged === true, s)
await shoot('exercise-shorthand-chooser-logged')

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'Shorthand means what she meant, and a guess is asked about.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
