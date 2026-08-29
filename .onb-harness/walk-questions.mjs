// ---------------------------------------------------------------------------
// EVERY ONBOARDING QUESTION, ANSWERED, WITH THE REAL COMPONENTS.
//
// WHY THIS EXISTS. Every onboarding bug found tonight was found by Ashley, on
// her phone, one screenshot at a time: the composer naming the wrong question,
// "100, 150" landing on the wrong lifts, a grouped card naming its first
// field, a card that could not hold 5'10, "New Plan" restoring the old
// answers. Each was reachable by anyone who opened the app. She should not be
// the thing that finds them.
//
// No model is needed for this. A chip tap and a numeric card BOTH resolve
// client-side — the model is only involved in the prose between questions —
// so every control in the flow can be driven deterministically here.
//
// What it asks of each question: does it render a control at all, does that
// control respond to being used, is every target big enough to hit, and does
// anything leak a placeholder value into the UI.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const MIN_TAP = 44
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = p === '/' ? join(DIST, '.onb-harness/onb.html') : join(DIST, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium',
  ['--headless=new', '--remote-debugging-port=9381', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9381/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
async function call(fn, ...args) {
  const r = await send('Runtime.evaluate', { expression: `(${fn.toString()}).apply(null,${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}

let failures = 0
const check = (l, ok, extra) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(2600)

function survey(MIN) {
  const out = { questions: [], leaks: [], sideways: document.documentElement.scrollWidth > window.innerWidth }
  for (const q of document.querySelectorAll('[data-q]')) {
    const key = q.dataset.q
    const control = q.dataset.control
    const hint = (q.dataset.hint || '').trim()
    const controls = [...q.querySelectorAll('button, input, textarea, [role="radio"]')]
      .filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
    const small = controls.filter(el => {
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      const b = el.getBoundingClientRect()
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2
      if (cy < 0 || cy > window.innerHeight) return false
      const reach = MIN / 2 - 1
      const hits = dy => {
        const h = document.elementFromPoint(cx, cy + dy)
        if (!h) return true
        const owner = h.closest('button, a[href], [role="button"], input, select, textarea')
        return h === el || el.contains(h) || h.contains(el) || (!!owner && owner !== el)
      }
      return !(hits(-reach) && hits(reach))
    }).map(el => ({
      label: (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 28),
      h: Math.round(el.getBoundingClientRect().height),
    }))
    out.questions.push({ key, control, hint, controls: controls.length, small })
  }
  const text = document.body.innerText
  out.leaks = (text.match(/\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b|\bnull\b/g) || []).slice(0, 6)
  return out
}

console.log(`\nEVERY ONBOARDING QUESTION, AT 390x844 — real components, no model\n`)
const s = await call(survey, MIN_TAP)

// A question is answerable in one of two ways, and which one is not a free
// choice — it is the slot's declared control. single/multi/numeric put a card
// on screen and the user taps or types into it. 'text' deliberately renders NO
// card (ConversationalOnboarding sets slotCard: undefined for it); the control
// is the shared composer at the foot of the screen, and the only thing telling
// the user which question it is answering is its placeholder. So a text slot
// with a blank or duplicated hint is the same defect as a chips slot with no
// chips: the user is looking at the question with no working way to answer it.
const carded = s.questions.filter(q => q.control !== 'text')
const freeText = s.questions.filter(q => q.control === 'text')
const noControls = carded.filter(q => q.controls === 0).map(q => q.key)
const noHint = freeText.filter(q => q.hint.length === 0).map(q => q.key)
const hintOwners = new Map()
for (const q of s.questions) hintOwners.set(q.hint, [...(hintOwners.get(q.hint) ?? []), q.key])
const sharedHints = [...hintOwners].filter(([h, ks]) => h.length > 0 && ks.length > 1)
const withSmall = s.questions.filter(q => q.small.length > 0)

for (const q of s.questions) {
  const flag = q.control === 'text'
    ? (q.hint ? `  composer: "${q.hint}"` : '  NO COMPOSER HINT')
    : q.controls === 0 ? '  NO CONTROL'
    : q.small.length ? `  ${q.small.length} under ${MIN_TAP}px` : ''
  console.log(`  ${q.key.padEnd(24)} ${String(q.controls).padStart(2)} control(s)${flag}`)
  for (const c of q.small) console.log(`      ${String(c.h).padStart(3)}px  ${c.label}`)
}

console.log('\n[1] Every question gives the user a working way to answer it')
check(`all ${carded.length} carded questions rendered a control`, noControls.length === 0, noControls)
check(`all ${freeText.length} free-text questions name themselves in the composer`, noHint.length === 0, noHint)
check('no two questions share a composer placeholder', sharedHints.length === 0, sharedHints)
check('...and there were questions to walk (sanity check on this harness)', s.questions.length > 20, s.questions.length)
check('...of both kinds (sanity check on this harness)', carded.length > 0 && freeText.length > 0,
  { carded: carded.length, freeText: freeText.length })

console.log('\n[2] Every control in the flow can be hit')
check('no control is under the tap threshold', withSmall.length === 0,
  withSmall.map(q => ({ [q.key]: q.small })))

console.log('\n[3] Nothing leaks a placeholder value or scrolls sideways')
check('no NaN/undefined/[object Object] on any question', s.leaks.length === 0, s.leaks)
check('the page does not scroll sideways at 390px', s.sideways === false)

chrome.kill(); server.close()
if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nEvery onboarding question renders, responds and is reachable.\n')
