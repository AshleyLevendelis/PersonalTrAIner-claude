// ---------------------------------------------------------------------------
// ONE LIFT, ONE NUMBER — READ OFF A REAL SCREEN.
//
// Ashley, 14 Sep 2026, training with the app: "On the T-Bar Rows detail screen,
// the main header prominently displays 40kg, but the pre-filled numbers in the
// set input rows show 35kg, making it confusing to know which weight to hit."
//
// Both figures were the app's own. 40 was what generation printed weeks
// earlier; 35 was her last session. Today's card asked the progression engine
// what that session had earned and used the answer for the chip's LABEL ("from
// your last session") and for the note underneath ("Held at 35kg") — and never
// for the number between them.
//
// WHY A BROWSER AND NOT A SOURCE CHECK. There already was one. test:logged-
// reanchor §5 asserted "...and OVERRIDES the plan number with what came back",
// checked by a regex that matched the line flipping the label. It was green for
// eleven days while the override did not exist. A gate that reads source text
// cannot tell a number that moved from a label that did; a screen can, because
// every figure on it is either the same or it is not.
//
// So this pins the property, not the mechanism: WHATEVER number today's card
// leads with, every set chip and every set-row prefill on that lift says the
// same thing. It never names 35, 40, or an exercise — the fixture computes the
// lift from the live week and the log is seeded two plate pairs below the
// plan's figure, so "they all agree" cannot be satisfied by nothing having
// happened.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9412', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9412/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
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

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&logged=1#/tab/exercise` })
await wait(5000)

const target = await ev(`window.__loggedTarget`)
check('0a. the fixture has a loaded lift on today with a session logged behind it',
  !!target && !!target.name && target.liftedKg < target.planKg, target)
if (!target) {
  console.error('\nNo loaded lift on today in the fixture — nothing to check.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`  ${target.name}: the plan says ${target.planKg}kg, the log says ${target.liftedKg}kg was lifted`)

// Expand the row, the same way ramp-ticks does.
const NAME = JSON.stringify(target.name)
await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${NAME});
 if(!n) return false; let p=n; for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement; if(p.tagName==='BUTTON'||p.getAttribute('role')==='button'){p.click();return true}} return false})()`)
await wait(2000)

// EVERY WEIGHT THE CARD SHOWS FOR THIS ONE LIFT, scoped to its own row so a
// neighbouring exercise's numbers cannot answer for it — the mistake
// verify:swap-request made and had to be re-anchored for.
const READ = `(() => {
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === ${NAME})
  if (!leaf) return { found: false }
  let card = leaf
  for (let i = 0; i < 12 && card.parentElement; i++) {
    card = card.parentElement
    if (card.querySelector('input') && /kg/i.test(card.innerText)) break
  }
  const text = card.innerText
  // The headline figure: the large tabular number beside the chip.
  const headline = [...card.querySelectorAll('.ds-num-lg')]
    .map(n => parseFloat((n.textContent || '').replace(/[^\\d.]/g, '')))
    .filter(n => Number.isFinite(n) && n > 0)
  // The S1/S2/... per-set chips.
  const chips = [...card.querySelectorAll('span')]
    .map(n => (n.textContent || '').trim())
    .map(s => /^S(\\d+):\\s*([\\d.]+)kg$/.exec(s))
    .filter(Boolean)
    .map(m => ({ set: Number(m[1]), kg: parseFloat(m[2]) }))
  // What the empty weight boxes offer.
  const prefills = [...card.querySelectorAll('input')]
    .filter(i => /^setgrid-weight-/.test(i.id))
    .map(i => i.value || i.placeholder)
    .map(v => parseFloat(String(v).replace(/[^\\d.]/g, '')))
    .filter(n => Number.isFinite(n) && n > 0)
  const note = (/Held at\\s*([\\d.]+)\\s*kg/i.exec(text) || [])[1]
  const label = /from your last session/i.test(text)
  return { found: true, headline, chips, prefills, note: note ? parseFloat(note) : null, label, text: text.replace(/\\s+/g, ' ').slice(0, 400) }
})()`

const card = await ev(READ)
check('0b. the lift’s own card is on screen with its set grid open', card.found === true && card.prefills.length > 0, card)

await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${NAME}); if(n) n.scrollIntoView({block:'center'})})()`)
await wait(600)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/one-number.png', Buffer.from(shot.result.data, 'base64'))

console.log('\nONE LIFT, ONE NUMBER\n')

const lifted = target.liftedKg
// 1. THE DEFECT ITSELF: the card led with the plan's figure.
check('1. the headline weight is what was lifted, not what the plan printed',
  card.headline.includes(lifted) && !card.headline.includes(target.planKg),
  { headline: card.headline, lifted, plan: target.planKg })

// 2. The caption was already true; it must stay true.
check('2. ...and it still says where that came from', card.label === true, card.text)

// 3. The note under the row, which was the ONLY honest number before.
check('3. the note underneath names the same figure, not a different one',
  card.note === lifted, { note: card.note, lifted })

// 4. The per-set chips — the third view of the number.
// The chips are absent on a single-set lift, which is a legitimate shape —
// but "absent" is reported rather than folded into a pass, so a run that
// silently stops finding them cannot read as green.
if (card.chips.length === 0) {
  console.log('    · this lift renders no per-set chips (single set) — checks 4 and 5 have nothing to read')
} else {
  check('4. every set chip sits at or below the headline, none above it',
    card.chips.every(c => c.kg <= lifted), card.chips)
  check('5. ...and the heaviest of them IS the headline',
    Math.max(...card.chips.map(c => c.kg)) === lifted, card.chips)
}

// 6. The boxes she types into — the half that was already right, and the half
//    the header was arguing with.
// NOT `.every()` ALONE. An empty list satisfies every() — on this driver's
// first run the selector matched nothing and this check passed while five
// others failed, which is a check reporting a tick for a card it never read.
check('6. the set rows offer that same number to log',
  card.prefills.length > 0 && card.prefills.every(p => p === lifted), { prefills: card.prefills, lifted })

// 7. THE WHOLE POINT, stated once as one sentence: no two numbers.
const all = [...card.headline, ...card.chips.map(c => c.kg), ...card.prefills, card.note].filter(n => n != null)
const distinct = [...new Set(all)]
check('7. across the headline, the chips, the note and the boxes there is ONE weight',
  distinct.length === 1 && distinct[0] === lifted, { distinct, lifted })

const err = await ev('window.__err ?? null')
check('8. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe card shows one weight, and it is the one the log earned.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
