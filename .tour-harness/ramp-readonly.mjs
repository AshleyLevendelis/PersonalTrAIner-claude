// ---------------------------------------------------------------------------
// THE BUILD-UP WHERE IT IS ONLY BEING READ.
//
// REPLACES verify:ramp-ticks, 17 Sep 2026, and the reason is the whole point.
// That driver measured the tickable ramp strip on TODAY's card — that the
// steps looked like controls before anyone tapped them, which is what Ashley
// reported on 10 Sep. Her ruling of 17 Sep removed the strip from today's
// card entirely: the build-up is real rows with real boxes now, read by
// verify:warmup-rows. A driver whose subject has been deliberately deleted
// does not get re-anchored; it gets replaced by one for what is still there.
//
// What is still there is the strip itself, read-only, on the program and peek
// surfaces — and the property worth holding is the opposite of the old one:
// on a day that is NOT today, the steps must NOT look tappable, because a
// tick there would mark a set on a day nobody is training.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9405', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9405/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  // A THROWN EXPRESSION MUST NOT READ AS A FALSE ANSWER. An undefined return
  // from a broken selector looks exactly like a control that is not there.
  if (r.result?.exceptionDetails) throw new Error('page threw: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value
}
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
// ONE EXIT, including the early one below.
const finish = async () => {
  console.log(failures === 0 ? '\nThe build-up reads as a plan where it is only being read.\n' : `\n${failures} check(s) FAILED.\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}

// ASK THE PAGE WHICH DAY, DON'T ASSERT IT. real.tsx computes the target with
// formatRampSets — the screen's OWN predicate — so the driver and the screen
// cannot disagree about what counts as ramped.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(3000)
const target = await ev(`window.__rampTarget`)

console.log('\nTHE BUILD-UP, READ-ONLY\n')
check('0. the fixture plan holds a ramped main lift somewhere', !!target && !!target.date && !!target.exercise, target)
if (!target) { console.error('\nNo ramped lift in the fixture plan — nothing to check.\n'); await finish() }

// ---- 1. TODAY: no strip, because the build-up is rows now ----------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&today=${target.date}#/tab/exercise` })
await wait(4000)
const NAME = JSON.stringify(target.exercise)
await ev(`(() => { const n = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === ${NAME})
 if (!n) return false; let p = n; for (let i = 0; i < 6 && p.parentElement; i++) { p = p.parentElement; if (p.tagName === 'BUTTON' || p.getAttribute('role') === 'button') { p.click(); return true } } return false })()`)
await wait(1500)
// THE STRIP IS THE BLOCK THAT SAYS "Ramp up first", not "anything whose label
// mentions a warm-up". The first version counted aria-labels and started
// finding the grid's own save buttons the moment those gained the row kind —
// four of them, read as four ramp steps still on the card. A selector that
// drifts onto a different control reports a defect that is not there.
const today = await ev(`(() => ({
  strip: [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && /Ramp up first/i.test(el.textContent || '')).length,
  rows: document.querySelectorAll('[data-testid="warmup-row"]').length,
}))()`)
check('1. today\'s card has no tappable ramp strip — the ruling removed it', today.strip === 0, today)
check('2. ...and the build-up is there as rows instead', today.rows >= 3, today)

// ---- 2. THE PROGRAM SURFACE: the strip, and nothing to tap ----------------
// NOT pinned to the ramped day. The point of this half is a day that is NOT
// today: browse renders every day through the same read-only list, and a tick
// there would mark a set on a day nobody is training.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/exercise/program` })
await wait(4500)
const dayOpened = await ev(`(() => {
  const card = [...document.querySelectorAll('[role="button"],button')]
    .find(b => (b.textContent || '').includes(${NAME}))
  if (!card) return false
  card.scrollIntoView({ block: 'center' }); card.click(); return true
})()`)
check('2b. the day holding the ramped lift opens on the program surface', dayOpened === true)
await wait(1500)
// The ladder is behind one more tap — the day lists its exercises, the ROW
// opens the prescription. Deliberate (ReadOnlyDayList's own comment says so),
// so the driver follows the same path a reader would.
const rowOpened = await ev(`(() => {
  const leaf = [...document.querySelectorAll('*')].find(el => el.children.length === 0 && (el.textContent || '').trim() === ${NAME})
  if (!leaf) return false
  let p = leaf
  for (let i = 0; i < 6 && p.parentElement; i++) {
    p = p.parentElement
    if (p.tagName === 'BUTTON' || p.getAttribute('role') === 'button' || /cursor-pointer/.test(p.className || '')) { p.scrollIntoView({ block: 'center' }); p.click(); return true }
  }
  return false
})()`)
check('2c. ...and the lift\'s own prescription opens with it', rowOpened === true)
await wait(1200)
const strip = await ev(`(() => {
  const hit = [...document.querySelectorAll('*')].find(el => el.children.length === 0 && /Ramp up first/i.test(el.textContent || ''))
  if (!hit) return { found: false, body: (document.body.innerText || '').slice(0, 300) }
  // The strip's own container — its immediate parent. Climbing one further
  // swept in the load chip beside it, whose "Why this weight" button then read
  // as something tappable inside the ramp.
  const block = hit.parentElement
  const text = (block?.innerText || '').split(String.fromCharCode(10)).join(' | ')
  return {
    found: true,
    text,
    buttons: block ? block.querySelectorAll('button,[role="button"]').length : -1,
    // [0-9.] rather than \\d: this expression is injected through a template
    // literal, where a backslash-d is just a 'd'. It cost two false results in
    // one day — a regex that matched nothing and reported an empty ladder.
    kgs: (text.match(/[0-9.]+[ ]*kg/gi) || []).map(x => parseFloat(x)),
  }
})()`)
check('3. the program surface still shows the build-up', strip.found === true, strip)
check('4. ...as a plan to read, with nothing on it to tap', strip.buttons === 0, strip)
check('5. ...saying what it is for, on screen and not in a tooltip', /ramp up first/i.test(strip.text || '') && /then set 1/i.test(strip.text || ''), strip.text)
check('6. ...and its weights climb', (strip.kgs ?? []).length >= 2 && (strip.kgs ?? []).every((n, i) => i === 0 || n >= strip.kgs[i - 1]), strip.kgs)
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/ramp-readonly.png',
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

await finish()
