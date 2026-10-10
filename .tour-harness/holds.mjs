// ---------------------------------------------------------------------------
// A BOX FOR EVERY SET — read off a real screen.
//
// Ashley, from her gym floor, 17 Sep 2026: "Only the ramp up sets input
// fields were visible until I clicked add set then I saw the input fields
// for the working sets." Her ruling that day, from three options: a box for
// every set, labelled — Warm-up 1,2,3 then Set 1,2,3, the build-up marked so
// it never counts toward the weight going up.
//
// WHY THIS FILE EXISTS, said plainly, because the source gate beside it is
// thorough and could not do this. test:ramp-visibility reads SOURCE. Deleting
// the build-up rows from the row list leaves every one of its checks green
// while the rows vanish from the screen — measured, by doing exactly that
// (mutation M2, 17 Sep). Only a browser can see a row that is not there.
//
// It also holds the half of the ruling that is a LAYOUT claim rather than a
// data one: the two blocks are one grid, so the weight column reads as a
// single build down the card. A source check cannot see a column.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9441', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9441/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
const pageErrors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.text)
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname,
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}
// ONE EXIT.
const finish = async () => {
  console.log(failures === 0 ? '\nA hold is timed, logged in seconds, and offered no drop.\n' : `\n${failures} check(s) FAILED.\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}
// ---------------------------------------------------------------------------
// verify:holds — A TIMED HOLD ON A REAL CARD (runs 3-4, M42, 10 Oct 2026).
// A plank had no timer, a 33-second hold was logged as "33 reps", and "Add a
// drop" was offered on it. On the ?legcurl=1 day, Dead Bug is a timed hold:
// start and stop the row's timer, the seconds fill the box, tick it, and the
// receipt says seconds, with no drop offered and no record claimed.
// ---------------------------------------------------------------------------
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1#/tab/exercise` })
await wait(5000)
const HOLD = 'Dead Bug'
const CARD = `[...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(HOLD)})`
check('0. the day carries a timed hold', await ev(`!!${CARD}`))
const at = await ev(`(() => { const card = ${CARD}; if (!card) return null; const head = card.querySelector('button,[role="button"]') || card; head.scrollIntoView({ block: 'center' }); const r = head.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
if (at) for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
await wait(1200)
const q = sel => `(() => { const card = ${CARD}; return card ? card.querySelector(${JSON.stringify(sel)}) : null })()`
check('1a. the row offers a hold timer', await ev(`!!${q('[data-testid="hold-timer-start"]')}`))
check('1b. ...and only on the timed exercise', await ev(`document.querySelectorAll('[data-testid="hold-timer-start"]').length`) >= 1
  && await ev(`[...document.querySelectorAll('[data-testid="hold-timer-start"]')].every(b => b.closest('[data-exercise-name]')?.getAttribute('data-exercise-name') === ${JSON.stringify(HOLD)})`))
await ev(`${q('[data-testid="hold-timer-start"]')}.click()`)
await wait(3300)
const running = await ev(`${q('[data-testid="hold-timer-stop"]')}?.textContent?.trim() ?? null`)
check('1c. it counts while held', /^Stop · [2-4] s$/.test(running ?? ''), running)
await ev(`${q('[data-testid="hold-timer-stop"]')}.click()`)
await wait(400)
const filled = await ev(`(() => { const card = ${CARD}; const row = card?.querySelector('[data-testid="working-row"]'); return row ? row.querySelectorAll('input')[1]?.value ?? null : null })()`)
check('1d. Stop puts the seconds in the box', Number(filled) >= 2 && Number(filled) <= 4, filled)
await ev(`(() => { const card = ${CARD}; const b = [...card.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Save set 1'); b && b.click() })()`)
await wait(1500)
const text = await ev(`${CARD}?.innerText ?? ''`)
check('2a. the receipt says seconds, not reps', new RegExp(`Set 1: ${filled} s`).test(text) && !/Set 1: \d+ reps/.test(text), (text.match(/Set 1:[^\n]*/) || [null])[0])
check('2b. no drop is offered on a hold', !/Add a drop/.test(text))
check('2d. a bodyweight carry is not announced as "weight from set 1"', !/weight from set/.test(text))
check('2c. and no record is claimed for it', !(await ev(`!!${q('svg.lucide-trophy')}`)) && !/\bPR\b/.test(text))
await ev(`${CARD}?.scrollIntoView({ block: 'center' })`)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(new URL('./holds.png', import.meta.url).pathname, Buffer.from(shot.result.data, 'base64'))
check('3. nothing on the page threw', pageErrors.length === 0, pageErrors)
await finish()
