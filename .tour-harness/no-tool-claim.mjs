// ---------------------------------------------------------------------------
// THE LIE NEVER REACHES THE SCREEN — driven, not asserted.
//
// Ashley, 15 Sep 2026, from the live app with a screenshot. She typed "Im not
// going to hit that session in going to do muay thai instead" and got back, in
// an ordinary bubble with no card and nothing to tap:
//
//   "I've swapped out today's lifting session for Muay Thai on your schedule.
//    Have a killer class tonight, and let me know how the training goes!"
//
// No tool ran. Nothing was written. Her verdict: "The chat is still lying."
//
// WHY THIS DRIVER HAS TO EXIST AND test:no-false-claim IS NOT ENOUGH. The
// detector is a pure function and its gate executes it, so the RULE is proved.
// What a source gate can never prove is that the branch is REACHED — CLAUDE.md
// records the day `if (false && advice)` left twelve source checks green. The
// failure mode here is exactly "the code is there but never runs", so it needs
// a real screen.
//
// THE MODEL IS STUBBED AT THE FETCH BOUNDARY and returns HER EXACT SENTENCE
// with no tool call, no proposal and no action — the precise shape of the live
// turn. Everything downstream of that is the real client.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const LIE = "I've swapped out today's lifting session for Muay Thai on your schedule. Have a killer class tonight, and let me know how the training goes!"

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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9395', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9395/json/list').then(r => r.json())
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

// The live turn, reproduced: prose only. No logWorkout, no proposal, no
// action — which is what made every existing defence miss it.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__sent = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      window.__sent.push(String(body.message || ''))
      return new Response(JSON.stringify({ reply: ${JSON.stringify(LIE)} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

console.log('\nA CLAIM WITH NO TOOL BEHIND IT\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

const composer = () => ev(`(() => { const t = document.querySelector('textarea'); return t ? { found: true } : { found: false } })()`)
let c = await composer()
for (let i = 0; i < 20 && !c.found; i++) { await wait(500); c = await composer() }
check('0. the chat is up', c.found === true, c)

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

const READ = String.raw`(() => {
  const text = document.body.innerText
  return {
    // The exact claim, and the verb on its own — a partial render is still a lie.
    lie: text.includes("I've swapped out today's lifting session"),
    swappedClaim: /I've swapped|I have swapped/.test(text),
    floor: /haven't actually changed anything/i.test(text),
    ownsIt: /got ahead of myself/i.test(text),
    chips: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim())
      .filter(t => /Swap today for something else|Mark today as a rest day|Move today to tomorrow/.test(t)),
    blames: /didn't quite catch|rephrase|not sure I followed/i.test(text),
    bubbles: document.querySelectorAll('[data-testid="chat-message"], .prose, p').length,
  }
})()`

check('1. her message goes', await say("Im not going to hit that session in going to do muay thai instead"))

// WAIT FOR THE TYPEWRITER TO FINISH, not for the first matching word. The
// bubble renders character by character, so the first read landed on
// "I haven't actually changed anything — I got ahead of" and reported the
// second half of the sentence and the chips as missing. A poll that stops at
// the first partial match measures the animation, not the behaviour.
let r = await ev(READ)
for (let i = 0; i < 60 && !r.lie && !(r.ownsIt && r.chips.length >= 2); i++) { await wait(500); r = await ev(READ) }

// THE ONE THAT MATTERS.
check('2. THE CLAIM NEVER REACHES THE SCREEN', r.lie === false, r)
check('2b. ...not even the verb on its own', r.swappedClaim === false, r)

// AND THE BUBBLE IS NOT EMPTY. Refusing the sentence and rendering nothing
// would trade a lie for the silence fixed the day before — the two defects
// are neighbours and a fix for one can cause the other.
check('3. something is said instead', r.floor === true, r)
check('3b. ...it owns the mistake', r.ownsIt === true, r)
check('3c. ...and does not blame her for being unclear', r.blames === false, r)

// THE OFFER IS TAPPABLE. A refusal with nowhere to go is its own defect: she
// asked for something the app can plainly do.
check('4. the offer is there to tap', r.chips.length >= 2, r.chips)
await shoot('no-tool-claim-refused')

// A CHIP ROUTES SOMEWHERE REAL. Tapping it must put an instruction in front of
// the model, not repeat the question — which is what the chips' wording is for.
const before = (await ev('window.__sent.length')) ?? 0
const tapped = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Swap today for something else')
  if (!b) return false
  b.click(); return true
})()`)
check('5. a chip can be tapped', tapped === true)
await wait(1500)
const sent = await ev('window.__sent')
check('5b. ...and it sends an instruction, not the same question again',
  Array.isArray(sent) && sent.length > before && /swap/i.test(sent[sent.length - 1] ?? ''),
  { before, sent })

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe lie does not reach the screen, and the offer does.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
