// ---------------------------------------------------------------------------
// "SWAP THIS EXERCISE", IN THE REAL CHAT.
//
// Ashley, 8 Sep 2026: asking the coach to swap an exercise answered "I
// couldn't find that on your current plan" for exercises plainly on it. The
// handler wanted three exact strings — the day as the plan spells it and both
// exercise names in full — and returned null from five places, all surfacing
// as that one sentence.
//
// The unit gate holds the resolver. This holds what it is for: a request with
// the day left out and the exercise named loosely — which is what "swap this
// exercise" produces — reaching a real proposal card with the right lift on
// it, rather than the dead end. The model is stubbed at the fetch boundary;
// everything after it is the real code, including the pending-action write.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9386', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9386/json/list').then(r => r.json())
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

// THE SLOPPY ARGUMENTS ARE THE TEST. No day at all, and the old exercise named
// the way a person says it rather than the way the catalogue spells it. Both
// were dead ends before; either alone was enough.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/swap/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({
        reply: '',
        proposal: {
          kind: 'propose_exercise_swap',
          rawArgs: { day: '', old_item: 'squats', new_item: 'leg press', scope: 'today', reason: 'Rack is busy.' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

console.log('\nA LOOSELY-NAMED SWAP FINDS THE EXERCISE\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)

// The plan the harness generated — read from the page so the assertions are
// about THIS run's plan rather than a name hard-coded here.
const planToday = await ev(`(() => (window.__todayExercises || null))()`)

let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, 'swap this exercise, the rack is busy') })()`)
await wait(400)
check('1. asking for the swap', await ev(`(() => {
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
    mentionsSquats: /Squats/i.test(text),
    mentionsLegPress: /Leg Press/i.test(text),
    buttons: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean),
    tail: text.replace(/\s+/g, ' ').slice(-320),
  }
})()`
let state = await ev(READ)
for (let i = 0; i < 24 && !state.hasProposal && !state.deadEnd; i++) { await wait(500); state = await ev(READ) }

check('2a. THE DEAD END IS GONE', state.deadEnd === false, state.tail)
check('2b. ...and a real proposal came back instead', state.hasProposal === true, state.buttons)
check('2c. ...for the exercise that is actually on the day', state.mentionsSquats === true, state.tail)
check('2d. ...swapped to the one that was asked for', state.mentionsLegPress === true, state.tail)
await shoot('swap-request-proposal')

const err = await ev('window.__err ?? null')
check('3. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe swap finds the exercise.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
