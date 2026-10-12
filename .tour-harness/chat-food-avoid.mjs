// ---------------------------------------------------------------------------
// "I DON'T EAT PORK", SAID TO THE COACH IN PASSING (11 Oct 2026).
//
// Ashley's ruling of 9 Oct 2026, "Build all four", item 1: a food said in
// passing goes into Foods to avoid, with a visible tick. Test log H12 had the
// coach confirm "pork stays off the menu" three times while nothing was saved.
//
// The coach is stubbed AT THE FETCH BOUNDARY, so what is driven here is the
// app's own half: the browser backstop (ChatAssistant.saveFoodsSaidInPassing).
// It proves, on the real chat screen and in the harness's database:
//   1. the coach saying nothing useful still leaves pork in Foods to avoid,
//      with a tick on screen and a hard food dislike row in user_facts;
//   2. a habit ("I don't eat much fish") saves nothing;
//   3. when the coach DOES record the dislike, the app does not save it twice.
// What it cannot see: whether the deployed coach obeys its new prompt line.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9511', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9511/json/list').then(r => r.json())
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

// The coach: a plain reply, except for "olives", where it records the dislike
// itself (the path the prompt asks for) so the app must not add a second.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (/olives/i.test(said)) {
        return new Response(JSON.stringify({ reply: '', memoryIntent: { tool: 'record_fact', rawArgs: {
          origin_verbatim_quote: said, kind: 'food_preference', domain: 'food', polarity: 'dislike', hardness: 'hard', target_phrase: 'olives',
        } } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ reply: 'Noted. How did today\\'s session go?' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)
let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
async function say(text) {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(300)
  const sent = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || ''))
    if (!b || b.disabled) return false
    b.click(); return true
  })()`)
  await wait(2500)
  return sent
}
const facts = () => ev(`JSON.stringify((window.__fakeDb.user_facts || []).map(f => ({ kind: f.kind, polarity: f.polarity, hardness: f.hardness, ref: (f.resolved_refs || [])[0] ?? f.display_text, text: f.display_text })))`).then(s => JSON.parse(s || '[]'))
/** The tick, and whether a person can see it without scrolling: inside the viewport. */
const tick = text => ev(`(() => {
  const el = [...document.querySelectorAll('*')].reverse().find(e => e.children.length === 0 && (e.textContent || '').includes(${JSON.stringify(text)}))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= 844 }
})()`)

console.log('\n1. The coach says nothing useful; the app still saves it, and ticks it\n')
check('1a. said it', await say("I don't eat pork, by the way"))
let rows = await facts()
const pork = rows.filter(r => /pork/.test(r.ref ?? ''))
check('1b. pork is in Foods to avoid: one hard food dislike in user_facts', pork.length === 1 && pork[0].kind === 'food_preference' && pork[0].polarity === 'dislike' && pork[0].hardness === 'hard', rows)
const t1 = await tick('Added to Foods to avoid')
check('1c. a tick says so, on screen where the reply is', !!t1 && t1.inView, t1)
check('1d. ...naming the food', !!(await tick("won't eat/do pork")), await ev(`document.body.innerText.slice(-600)`))
await shoot('chat-food-avoid-tick')

console.log('\n2. A habit is not a ban\n')
const before = (await facts()).length
check('2a. said it', await say("I don't eat much fish these days"))
check('2b. nothing new saved', (await facts()).length === before, await facts())

console.log('\n3. When the coach records it, the app does not save it twice\n')
check('3a. said it', await say("I can't stand olives"))
rows = await facts()
const olives = rows.filter(r => /olive/.test(r.ref ?? '') || /olive/.test(r.text ?? ''))
check('3b. exactly one olives row (the coach\'s), not two', olives.length === 1, rows)
check('3c. the coach was asked every time (three turns)', (await ev(`window.__chatCalls`)) === 3, await ev(`window.__chatCalls`))

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('A food said in passing to the coach is in Foods to avoid, ticked, once.\n')
