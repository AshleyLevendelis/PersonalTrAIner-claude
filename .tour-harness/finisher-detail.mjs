// ---------------------------------------------------------------------------
// THE FINISHER SAYS WHAT THE FINISHER IS.
//
// Ashley, 14 Sep 2026, on the workout overview: "the finisher title is
// truncated (Finisher · 11m Rowing Intervals — 6 rounds...), making it
// impossible to see the full description, round breakdown, or work/rest
// durations."
//
// The row carried `truncate` on a single line, and the plan's own strings put
// the entire prescription after an em dash — "Rowing Intervals — 6 rounds of
// 20s hard / 40s easy". So what the ellipsis ate was the instruction.
//
// THE PROPERTY, NOT THE MARKUP. This does not check for two spans or a
// particular class; it asks the browser whether the row is clipping its own
// text (scrollWidth past clientWidth, on the element and every descendant) and
// whether every word the plan wrote is readable on screen. A future layout
// that solves it differently passes; one that quietly re-clips does not.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = '/home/user/PersonalTrAIner-claude/.tour-harness/dist/'
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9417', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9417/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&finisher=1#/tab/exercise` })
await wait(3500)
const target = await ev('window.__finisherTarget ?? null')
check('0a. the fixture plan prescribes a finisher somewhere', !!target && !!target.activity, target)
if (!target) {
  console.error('\nNo finisher in the fixture plan — nothing to check.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`  ${target.day}: "${target.activity}" (${target.duration}m, RPE ${target.rpe})`)

// Pinned to the day that HOLDS it, read off the page — never a weekday name.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&finisher=1&today=${target.date}#/tab/exercise` })
await wait(4000)

const row = await ev(`(() => {
  const card = document.querySelector('[data-testid="finisher-row"]')
  if (!card) return { found: false }
  card.scrollIntoView({ block: 'center' })
  // CLIPPING, ASKED OF THE BROWSER. An element whose content is wider than its
  // box is cutting text off, whatever CSS is doing it — truncate, a fixed
  // width, a nowrap. Checked on the row and every descendant, because the
  // clip was on an inner span.
  const nodes = [card, ...card.querySelectorAll('*')]
  const clipped = nodes
    .filter(n => n.scrollWidth > n.clientWidth + 1 && (n.textContent || '').trim().length > 0)
    .map(n => ({ tag: n.tagName, cls: String(n.className).slice(0, 60), text: (n.textContent || '').trim().slice(0, 60) }))
  const boxes = card.querySelector('[data-effort]')?.closest('[style]')
  return {
    found: true,
    text: card.innerText.replace(/\\s+/g, ' ').trim(),
    clipped,
    h: Math.round(card.getBoundingClientRect().height),
    boxesH: boxes ? Math.round(boxes.getBoundingClientRect().height) : 0,
    minutesHint: card.querySelector('input[data-field="minutes"]')?.placeholder ?? null,
    effort: [...card.querySelectorAll('[data-effort]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.effort),
  }
})()`)
// The driver's own copy of the scale, a literal rather than an import: a gate
// that asks the app what "Hard" means can only ever agree with it.
const word = rpe => (rpe <= 4 ? 'Easy' : rpe <= 6 ? 'Steady' : 'Hard')

console.log('\nTHE FINISHER SAYS WHAT THE FINISHER IS\n')
check('0b. the finisher row is on the day the plan puts it', row.found === true, row)

check('1. nothing in the row is cutting its own text off', (row.clipped || []).length === 0, row.clipped)
check('2. ...no ellipsis stands in for the prescription', !/[.]{3}|…/.test(row.text || ''), row.text)

// EVERY WORD THE PLAN WROTE. The activity string is the coaching instruction;
// a row that keeps the name and loses "6 rounds of 20s hard / 40s easy" has
// kept the label and dropped the session.
const words = target.activity.split(/\s+/).filter(w => /[a-z0-9]/i.test(w))
const missing = words.filter(w => !(row.text || '').toLowerCase().includes(w.toLowerCase()))
check('3. every word of the prescription is on screen', missing.length === 0, { missing, shown: row.text })
check('4. ...along with the duration and the effort, in words',
  (row.text || '').includes(`${target.duration} min · ${word(target.rpe)}`),
  { shown: row.text, want: `${target.duration} min · ${word(target.rpe)}` })
// LIKE A SET (Ashley, 24 Sep 2026): the plan's minutes faint in the box and its
// effort already chosen, so the ✓ alone logs what was prescribed.
check('5. the log row is ONE 44px row of boxes, not a form', row.boxesH >= 44 && row.boxesH <= 52, { boxes: row.boxesH, whole: row.h })
check('5b. ...holding the plan\'s minutes and its effort before any tap',
  row.minutesHint === String(target.duration) && row.effort.join(',') === word(target.rpe).toLowerCase(), row)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/finisher-detail.png', Buffer.from(shot.result.data, 'base64'))

const tapSave = await ev(`(() => {
  const n = document.querySelector('[data-testid="finisher-row"] [data-testid="cardio-save"]')
  if (!n) return false
  const r = n.getBoundingClientRect()
  for (const type of ['mousedown', 'mouseup', 'click']) n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  return true
})()`)
check('6. one tap on the ✓ logs it', tapSave === true)
await wait(900)
const readback = await ev(`(document.querySelector('[data-testid="finisher-row"] [data-testid="cardio-readback"]')?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)
check('7. ...and the row reads back what was done, with Undo',
  readback.startsWith(`${target.activity.split(/\s+[—–-]\s+/)[0]} · ${target.duration} min · ${word(target.rpe)}`) && /Undo/.test(readback), readback)
// THE FIGURE: the plan's EXACT RPE is stored, not the one its word stands for.
// An RPE-8 interval finisher logged as prescribed is an 8, not "Hard" = 7.
const stored = await ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe }))`)
check('8. ...stored at the plan\'s own minutes and its exact RPE',
  stored.length === 1 && stored[0].a === target.activity && stored[0].m === target.duration && stored[0].rpe === target.rpe,
  { stored, want: { a: target.activity, m: target.duration, rpe: target.rpe } })
await send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/finisher-logged.png', Buffer.from(r.result.data, 'base64')))

// AND IT IS STILL LOGGED WHEN YOU COME BACK — the old "Logged" was component
// state, and a tab change offered to log the same finisher a second time.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&finisher=1&today=${target.date}#/tab/home` })
await wait(2500)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&finisher=1&today=${target.date}#/tab/exercise` })
await wait(4000)
const back = await ev(`(document.querySelector('[data-testid="finisher-row"] [data-testid="cardio-readback"]')?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)
check('9. leaving and coming back, it is still logged — not offered again', back.includes(`${target.duration} min · ${word(target.rpe)}`) && !(await ev(`!!document.querySelector('[data-testid="finisher-row"] [data-testid="cardio-save"]')`)), back)

const err = await ev('window.__err ?? null')
check('10. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe whole finisher is readable at 390px.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
