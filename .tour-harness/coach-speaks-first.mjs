// ---------------------------------------------------------------------------
// THE ONE THING A GATE CANNOT SETTLE about the coach speaking first.
//
// scripts/test-coach-nudge.ts proves pickNudge picks the right thing and that
// every guard is present in the source. What it cannot prove is that the effect
// carrying them actually FIRES in a real render — the exact class of bug that
// slipped through a week ago, when a ramp tick was stored correctly, read
// correctly, and never repainted.
//
// So this drives the real ChatAssistant, in App.tsx's real wrapper, with a
// real ongoing conversation and a real finished-but-unreviewed session, and
// asks four questions:
//
//   1. does a new coach message actually appear in a thread that already had
//      one — the thing that was impossible before this change;
//   2. is it the RIGHT message (the how-did-it-feel question);
//   3. did it reach the database, which is what makes it survive a reload and
//      what lights the chat button;
//   4. does it stop at one, rather than adding another every time the effect
//      re-runs.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9347', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9347/json/list').then(r => r.json())
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
  // NOT captureBeyondViewport: it expands the viewport to the full page, which
  // re-lays-out the message scroller and clamps its scrollTop — so a thread that
  // is correctly scrolled to the newest message photographs as if it were not.
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('\nTHE COACH SPEAKS FIRST — into a conversation that already exists\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?seed=nudge` })
await wait(3000)

// The rendered transcript, and the rows behind it. Both, deliberately: a
// message in React state alone would not survive a reload and would not light
// the button, and a row alone would mean the effect wrote something nobody can
// see. The bug this repo shipped a week ago was exactly the second shape.
//
// Split by ROW ID rather than by a before/after snapshot. The seeded rows are
// `seed-N`; anything else was written by the app during this run. A timing
// snapshot would race the very effect being measured — the first attempt at
// this check took its "before" 3 seconds in and found the message already
// there, which reads as a failure of the app rather than of the ruler.
const read = () => ev(`(() => {
  const db = window.__fakeDb
  const text = document.body.innerText
  const rows = db ? db.chat_messages : null
  if (!rows) return { onScreen: 0, seeded: -1, added: 'no-db-handle', restored: false }
  return {
    onScreen: (text.match(/actually feel/gi) ?? []).length,
    restored: /User line 7\./.test(text),
    seeded: rows.filter(r => String(r.id).startsWith('seed-')).length,
    seededAsk: rows.filter(r => String(r.id).startsWith('seed-') && /actually feel/i.test(String(r.content))).length,
    added: rows.filter(r => !String(r.id).startsWith('seed-'))
      .map(r => ({ role: r.role, status: r.status, asks: /actually feel/i.test(String(r.content)), text: String(r.content).slice(0, 80) })),
  }
})()`)

let state = await read()
for (let i = 0; i < 30 && state.onScreen === 0; i++) { await wait(600); state = await read() }

check('the seeded conversation is intact and asks nothing itself',
  state.restored && state.seeded === 14 && state.seededAsk === 0, state)
check('1. the app added exactly one message of its own to that thread',
  Array.isArray(state.added) && state.added.length === 1, state.added)
check('2. it is the how-did-it-feel question, rendered on screen',
  state.onScreen === 1 && state.added[0]?.asks === true, { onScreen: state.onScreen, added: state.added })
check('3. and it reached chat_messages as a complete coach message',
  state.added[0]?.role === 'assistant' && state.added[0]?.status === 'complete', state.added)

// The chat is not on screen in this fixture, so the tab bar is where she would
// find out. The ring is what Ashley asked for on 6 Sep; the dot is the glow-off
// fallback. Either is a pass — what must not happen is neither.
const indicator = await ev(`(() => {
  const fab = document.querySelector('[data-tour="chatfab"]')
  if (!fab) return 'no-fab'
  return { ring: !!fab.querySelector('[class*="ring-"]'), dot: !!fab.querySelector('.chat-attention-dot') }
})()`)
check('4. the chat button says so while she is on another tab',
  indicator !== 'no-fab' && (indicator.ring || indicator.dot), indicator)

// AND IT IS ON SCREEN, not merely in the DOM below the fold. The chat scroller
// keeps itself pinned to the newest message; a coach message that lands while
// she is elsewhere has to survive that path too, or the feature is "the button
// glowed and the chat looked unchanged".
const visible = await ev(`(() => {
  const leaf = [...document.querySelectorAll('*')].filter(n => n.children.length === 0 && /actually feel/i.test(n.textContent || ''))
  const el = leaf[leaf.length - 1]
  if (!el) return 'not-rendered'
  const r = el.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight }
})()`)
check('...and it is scrolled into view, not left below the fold',
  visible !== 'not-rendered' && visible.top >= 0 && visible.bottom <= visible.vh, visible)

await shoot('coach-speaks-first')

// And it stops at one. The effect re-runs on every messages change, every data
// arrival and every attention recompute; without the quiet period and the
// burnt key this is where a nag would show up.
await wait(5000)
const settled = await read()
check('5. exactly one unprompted message, not one per render', settled.onScreen === 1, settled)
check('...and no second row behind the scenes', settled.added.length === 1, settled.added)

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nAll coach-speaks-first checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
