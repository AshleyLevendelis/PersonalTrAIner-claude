// ---------------------------------------------------------------------------
// HELLO + MORE MOMENTS, on a real screen (her ruling 7 Nov 2026).
//
// Ashley: "The chat doesn't seem to proactively speak to the user ... it only speaks if you speak to it first." The
// opener only ever ran on an EMPTY chat, so anyone with a conversation got nothing on an ordinary day. This drives
// the real ChatAssistant with an ongoing thread and NO event in it, and asks:
//   A. a quiet day, the chat open: one coach message arrives by itself, greeting her, kept in the chat (a row with
//      the hello marker) — and opening the app again the same day adds no second one;
//   B. the evening, her hello already said at 3pm, a meal logged yesterday and none today: the phone's evening
//      moment is said in the chat too, in the phone's words, with its small shortcut button.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9531', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9531/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

// Rows the app wrote this run: anything not seeded.
const read = () => ev(`(() => {
  const db = window.__fakeDb
  const rows = db ? db.chat_messages : []
  const mine = rows.filter(r => !String(r.id).startsWith('seed-'))
  return {
    seeded: rows.filter(r => String(r.id).startsWith('seed-')).length,
    added: mine.map(r => ({ role: r.role, status: r.status, text: String(r.content), marker: r.action_data ?? null })),
    body: document.body.innerText,
  }
})()`)
const settle = async (want = 1) => {
  let s = await read()
  for (let i = 0; i < 40 && s.added.length < want; i++) { await wait(500); s = await read() }
  return s
}
let load = 0
const open = async query => {
  load++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?${query}&load=${load}` })
  await wait(2500)
}

console.log('\nA. A quiet afternoon, an ongoing conversation: the coach says hello by itself\n')
// 3pm: past the hour today's session reads as upcoming and before the evening moments, so nothing else is due and
// the hello is the opener's own pick.
await open('seed=hello&clock=15:00')
let a = await settle(1)
const hello = a.added[0]
check('the seeded conversation is there (14 rows), with no event in it', a.seeded === 14, a.seeded)
check('A1. the app added exactly one coach message of its own', a.added.length === 1 && hello?.role === 'assistant' && hello?.status === 'complete', a.added)
check('A2. it greets her ("Hey ...")', /^Hey\b/.test(hello?.text ?? ''), hello?.text)
check('A3. it is kept in the chat as the day\'s hello (the marker the phone reads)', hello?.marker?.source === 'reminder' && hello?.marker?.moment === 'daily_hello', hello?.marker)
const lead = (hello?.text ?? '').slice(0, 30)
const shown = await ev(`(() => {
  const leaf = [...document.querySelectorAll('*')].filter(n => n.children.length === 0 && (n.textContent || '').includes(${JSON.stringify(lead.slice(0, 20))}))
  const el = leaf[leaf.length - 1]
  if (!el) return 'not-rendered'
  const r = el.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight }
})()`)
check('A4. it is on screen at the bottom of the chat, not below the fold', shown !== 'not-rendered' && shown.top >= 0 && shown.bottom <= shown.vh, shown)
await shoot('coach-hello-day')
await wait(4000)
a = await read()
check('A5. still one after the effect has re-run (no second message per render)', a.added.length === 1, a.added.length)
// THE SAME DAY AGAIN: the fake database is rebuilt on load, so the hello is put back as a row from the chat, and the
// phone's store keeps what was said. A second hello would be the app greeting her every time she opens it.
// AND THIS PHONE'S MEMORY OF IT CLEARED: only the row in the chat now says the hello was said (her other phone,
// or the phone reminder that greeted her this morning).
await ev(`Object.keys(localStorage).filter(k => k.startsWith('coach_nudge_')).forEach(k => localStorage.removeItem(k))`)
await open('seed=hello&said=hello&clock=16:00')
await wait(4000)
const againRows = (await read()).added
check('A6. opening again the same day, with the hello in the chat: nothing more is said', againRows.length === 0, againRows)

console.log('\nA7. Noon on a training day: today\'s session IS the hello\n')
await ev(`Object.keys(localStorage).filter(k => k.startsWith('coach_nudge_')).forEach(k => localStorage.removeItem(k))`)
await open('seed=hello&clock=12:00')
const noon = await settle(1)
check('A7. one message: today\'s session, greeted, marked as the phone\'s session reminder',
  noon.added.length === 1 && /^Hey\b[^—]* — today's /.test(noon.added[0]?.text ?? '') && noon.added[0]?.marker?.moment === 'workout_today', noon.added)

console.log('\nB. The evening: the hello was at 3pm, she logs meals, nothing logged today\n')
await open('seed=hello&said=hello&meals=1&clock=19:30')
const b = await settle(1)
const moment = b.added[0]
const MOMENTS = ['session_not_logged', 'streak_at_risk', 'meal_not_logged', 'protein_short']
check('B1. one coach message arrives on its own', b.added.length === 1 && moment?.role === 'assistant', b.added)
check('B2. it is one of the phone\'s evening moments, marked as such', MOMENTS.includes(moment?.marker?.moment), moment?.marker)
check('B3. it does not greet again (the day\'s hello was at 3pm) beyond the phone\'s own words', !/^Hey\b[^,]* — /.test(moment?.text ?? ''), moment?.text)
const label = moment?.marker?.shortcut === 'exercise' ? "Open today's session" : moment?.marker?.shortcut === 'nutrition' ? 'Open Nutrition' : null
const button = label ? await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(label)})
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { h: Math.round(r.height), top: Math.round(r.top), vh: window.innerHeight }
})()`) : null
check('B4. its small shortcut button is drawn under it, on screen', !!label && !!button && button.top >= 0 && button.top < button.vh, { label, button })
await shoot('coach-hello-evening')
await wait(4000)
check('B5. and only one: the next waits its three hours', (await read()).added.length === 1)

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? 'All coach-hello checks passed.\n' : `${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
