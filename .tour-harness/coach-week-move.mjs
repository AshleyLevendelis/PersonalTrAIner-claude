// ---------------------------------------------------------------------------
// WHAT THE COACH IS ACTUALLY TOLD ON A DAY WHOSE SESSION MOVED AWAY.
//
// Ashley, 12 Sep 2026: she moved today's session from chat, the card said
// "Session moved", and the coach kept talking about "today's deadlifts".
//
// Every other check on this fix is on a pure function. This one is the half
// no pure function can prove: that a REAL mount, whose useTrainingWeek has
// read a real move row out of the database, puts a move-aware week into the
// request body it sends to chat-gemini. The model is stubbed at the fetch
// boundary and the BODY IS KEPT — the payload itself is the measurement, not
// anything the model then says about it.
//
// The payload it used to send, measured before the fix:
//
//   ...THEY MOVED IT TO <tomorrow>... The next session after today is <the
//   plan's next training day, two days out>...
//   <tomorrow>: Rest - no session prescribed
//   <today> (TODAY): Pull & Hinge - Deadlift (3x5), Barbell Row (3x8-10)
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`) }
}

const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const nameOf = n => new Date(`${iso(n)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
const TODAY_NAME = nameOf(0), TOMORROW_NAME = nameOf(1)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// THE BODY IS THE MEASUREMENT. Everything the coach knows about the training
// week arrives in context.exercise_summary; the deployed function interpolates
// it into the prompt verbatim.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__summaries = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      window.__summaries.push((body.context && body.context.exercise_summary) || '')
      return new Response(JSON.stringify({ reply: 'Noted.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))
    if (!btn || btn.disabled) return false
    btn.click(); return true
  })()`)
}

console.log('\nWHAT THE COACH IS TOLD, ON A DAY WHOSE SESSION LEFT\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?movedaway=1` })
await wait(4000)
let up = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !up; i++) { await wait(500); up = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', up === true, up)

const sent = await say('what am I doing today')
check('1. the message went', sent === true, sent)

// WAIT FOR THE READ, NOT FOR A CLOCK. useTrainingWeek's move read is async,
// and a summary captured before it resolves is the pre-fix payload — which
// would pass nothing and fail everything, or worse, the other way round.
let summary = ''
for (let i = 0; i < 40; i++) {
  const all = await ev(`window.__summaries || []`)
  summary = (all && all[all.length - 1]) || ''
  if (/MOVED TO/.test(summary)) break
  await wait(500)
}
console.log(`\n--- exercise_summary as sent (day rows only) ---\n${summary.split('\nHOW TO PERFORM')[0]}\n---\n`)

const rows = summary.split('\n')
const todayRow = rows.find(l => l.startsWith(`${TODAY_NAME} (TODAY):`)) ?? ''
const tomorrowRow = rows.find(l => l.startsWith(`${TOMORROW_NAME} (tomorrow):`)) ?? ''
const header = rows[0] ?? ''

check('2. the coach was sent a week at all', summary.length > 0 && !!todayRow, summary.slice(0, 200))
check(`3. the (TODAY) row says the session moved to ${TOMORROW_NAME}`,
  new RegExp(`MOVED TO ${TOMORROW_NAME.toUpperCase()}`).test(todayRow), todayRow)
check('4. ...and lists no exercises, so nothing can be called "today\'s"',
  !/\dx\d/.test(todayRow), todayRow)
check('5. the day it landed on carries the session, named by the day it came from',
  new RegExp(`${TODAY_NAME}'s .*MOVED HERE`).test(tomorrowRow) && /\dx\d/.test(tomorrowRow), tomorrowRow)
check('6. the header agrees with the rows rather than contradicting them',
  new RegExp(`MOVED IT TO ${TOMORROW_NAME.toUpperCase()}`).test(header), header.slice(0, 240))
check('7. ...and the "next session" it names is tomorrow, not the plan\'s next training row',
  /next session after today is tomorrow's/.test(header), header.slice(-200))
check('8. no row anywhere else claims to be today', rows.filter(l => l.includes('(TODAY)')).length === 1,
  rows.filter(l => l.includes('(TODAY)')))

// Let the reply finish typing before the shot, so the screenshot is of a
// finished exchange rather than an empty bubble mid-reveal.
for (let i = 0; i < 20; i++) {
  if (await ev(`/Noted\\./.test(document.body.innerText)`)) break
  await wait(400)
}
await shoot('coach-week-move')

ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nA moved session leaves the coach\'s week, not just its header.\n')
process.exit(0)
