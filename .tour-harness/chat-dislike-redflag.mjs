// ---------------------------------------------------------------------------
// HIS RULINGS OF 14 NOV 2026, on the real chat screen at 390px, the coach stubbed at the fetch boundary:
//   "Ask, and hold Tuesday": "I don't like salmon" is asked about ("just this meal, or ... for good?"), nothing saved
//     until he answers; "Never give me salmon" saves it once; "Just this meal" saves nothing.
//   "Park it, go quiet": a symptom answered by a referral puts the app's quiet line under the reply, on screen, and
//     stores the quiet for the phone's reminders (quiet_until) and this phone (red_flag_<id>).
// What it cannot see: whether the deployed coach obeys its new lines, or a session being parked (no workout is open on
// this page; the park itself is held by test:qa-batch3 §13).
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9517', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9517/json/list').then(r => r.json())
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

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__chatCalls = 0
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      window.__chatCalls++
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
      const m = said.match(/(?:like|give me) (salmon|tuna)/i)
      if (m) return json({ reply: '', memoryIntent: { tool: 'record_fact', rawArgs: {
        origin_verbatim_quote: said, kind: 'food_preference', domain: 'food', polarity: 'dislike', hardness: 'hard', target_phrase: m[1].toLowerCase(),
      } } })
      if (/chest pain/i.test(said)) return json({ reply: 'That is one to get checked today, so please stop for now and call your GP or NHS 111.' })
      return json({ reply: 'Got it.' })
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

const lastText = () => ev(`document.body.innerText.slice(-900)`)
const chip = label => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`)
const salmonRows = async () => (await facts()).filter(r => /salmon/.test(r.ref ?? '') || /salmon/.test(r.text ?? ''))

console.log('\n1. "I don\'t like salmon" is asked about\n')
check('1a. said it', await say("I don't like salmon"))
const q = await tick('or should I keep salmon off your meals for good?')
check('1b. the app asks "just this meal, or for good?", on screen', !!q && q.inView, await lastText())
check('1c. ...with both answers as buttons', (await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Just this meal') && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Never give me salmon')`)) === true)
check('1d. nothing is saved yet', (await salmonRows()).length === 0, await facts())
await shoot('chat-dislike-ask')
check('1e. "Never give me salmon" sends', await chip('Never give me salmon'))
await wait(2500)
check('1f. ...and saves it, once, as a hard food dislike', (await salmonRows()).length === 1 && (await salmonRows())[0].hardness === 'hard', await facts())

console.log('\n2. "Just this meal" saves nothing\n')
check('2a. said it', await say("I don't like tuna"))
check('2b. asked', !!(await tick('or should I keep tuna off your meals for good?')), await lastText())
check('2c. "Just this meal" sends', await chip('Just this meal'))
await wait(2500)
check('2d. tuna is not in Foods to avoid', (await facts()).filter(r => /tuna/.test(r.ref ?? '') || /tuna/.test(r.text ?? '')).length === 0, await facts())

console.log('\n3. A red flag: the app goes quiet\n')
check('3a. said it', await say('I had chest pain on the bike just now'))
const quiet = await tick("I'll keep quiet for a couple of days")
check('3b. the quiet line is under the referral, on screen', !!quiet && quiet.inView, await lastText())
const pid = await ev(`(window.__fakeDb.fitness_profiles || [])[0]?.id`)
const stored = await ev(`(() => { try { return JSON.parse(localStorage.getItem('red_flag_' + ${JSON.stringify(pid)}) || 'null') } catch { return null } })()`)
check('3c. this phone remembers it: quiet for 48 hours, the check-in not yet asked', !!stored && Math.round((stored.until - stored.at) / 3600000) === 48 && stored.checkedIn === false, stored)
const sw = await ev(`(window.__fakeDb.fitness_profiles || [])[0]?.notification_switches?.quiet_until ?? null`)
check('3d. the phone\'s reminders are told (quiet_until saved with the Reminders settings)', typeof sw === 'string' && Math.abs(Date.parse(sw) - stored?.until) < 2000, sw)
await shoot('chat-red-flag-quiet')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('A dislike is asked about, and a red flag puts the coach quiet.\n')
