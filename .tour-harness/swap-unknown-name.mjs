// ---------------------------------------------------------------------------
// A SWAP TO A NAME THE CATALOGUE DOES NOT HAVE IS ANSWERED, NEVER A DEAD END (runs 7-10, H33, 18 Oct 2026).
//
// Sam asked to swap an exercise for "Dumbbell Step-Up" and the whole reply was "I don't have 'Dumbbell Step-Up' in
// the exercise library — try another name for it". The coach is stubbed AT THE FETCH BOUNDARY with exactly that
// request; what is driven is the app's own half (the swap builder's swapNameFallback):
//   1. the reply names what it does have and the alternatives his kit and injuries allow, as taps, plus a kit tap;
//   2. tapping one sends it back, and a swap naming that catalogue name reaches a real card for it;
//   3. the old dead-end sentence is gone.
// What it cannot see: whether the deployed coach turns a tap into the right tool call (the stub does it here).
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9521', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9521/json/list').then(r => r.json())
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

let ran = 0
let failures = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=0` })
await wait(3000)
const swapTarget = await ev(`window.__swapTarget`)
check('0a. today holds a lift to swap', !!swapTarget && !!swapTarget.full, swapTarget)
const OLD = swapTarget?.full ?? 'none'

// "Swap X for Dumbbell Step-Up" first; a tap "Swap X for Y" comes back as a swap to Y, the way the coach would.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  window.__old = ${JSON.stringify(OLD)}
  const realFetch = window.fetch
  const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const tapped = said.match(/^Swap (.+) for (.+)$/)
      const newItem = tapped ? tapped[2] : 'Dumbbell Step-Up'
      // On the tap the stub passes a reason, as swap-request does, so the app's reason question (asked before any
      // swap with none) does not stand between the tap and the card; that question has its own drivers.
      return json({ reply: '', proposal: { kind: 'propose_exercise_swap', rawArgs: { day: '', old_item: window.__old, new_item: newItem, scope: 'today', ...(tapped ? { reason: 'Rack is busy.' } : {}), origin_verbatim_quote: said } } })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?load=1` })
await wait(3000)
let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 30 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0b. the chat is up', ready === true)

await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(`swap ${OLD} for dumbbell step-ups`)}) })()`)
await wait(300)
check('1a. asked for the swap', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
  if (!b || b.disabled) return false
  b.click(); return true
})()`))
const READ = `(() => {
  const bs = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')]
  const b = bs[bs.length - 1]
  const chips = [...document.querySelectorAll('button')].map(x => (x.textContent || '').trim()).filter(t => /^Swap .+ for .+$/.test(t) || t === "That's not the kit I have")
  return { text: b ? b.innerText.trim() : '', chips, card: /Proposed change/i.test(document.body.innerText), body: document.body.innerText.slice(-500) }
})()`
let s = await ev(READ)
for (let i = 0; i < 30 && s.chips.length === 0; i++) { await wait(400); s = await ev(READ) }
check('1b. the reply says what it does not have, in plain words', s.text.includes('I don\'t have "Dumbbell Step-Up" under that name.'), s)
check('1c. ...and names alternatives for the lift being swapped', /(^| )(For|Or, for) /.test(s.text) && s.text.includes(`for ${OLD}, these fit your kit and injuries:`.slice(4)), s)
check('1c2. the name he meant comes first: the nearest catalogue name, Step-Ups, which this kit allows', s.text.includes('The nearest I have is Step-Ups.') && (s.chips[0] ?? '') === `Swap ${OLD} for Step-Ups`, s)
check('1d. the dead end is gone ("try another name")', !/try another name|in the exercise library/i.test(s.body), s.body)
const swaps = s.chips.filter(c => c.startsWith('Swap '))
check('1e. each alternative is a tap (at least two)', swaps.length >= 2, s.chips)
check('1f. ...and a tap to change the kit', s.chips.includes("That's not the kit I have"), s.chips)
check('1g. no card yet: nothing is changed until he picks', s.card === false, s)
await shoot('swap-unknown-name-reply')

const pick = swaps[0] ?? ''
const pickName = pick.replace(/^Swap .+ for /, '')
check('2a. tapped the first alternative', await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(pick)})
  if (!b) return false
  b.click(); return true
})()`))
for (let i = 0; i < 30 && !(await ev(`/Proposed change/i.test(document.body.innerText)`)); i++) await wait(400)
const after = await ev(`document.body.innerText`)
check('2b. the tap became a real swap card', /Proposed change/i.test(after), after.slice(-400))
check('2c. ...for the name on the tap (a catalogue name the app resolves)', !!pickName && after.includes(pickName), { pickName, tail: after.slice(-400) })
check('2d. the coach was asked twice (the request, then the tap)', (await ev(`window.__chatCalls`)) === 2, await ev(`window.__chatCalls`))
await shoot('swap-unknown-name-card')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('A swap to a name the app does not have is answered with real alternatives, each a tap.\n')
