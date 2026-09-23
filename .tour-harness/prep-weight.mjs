// ---------------------------------------------------------------------------
// A PREP MOVE THAT NEEDS A BELL SAYS SO — read off a real screen.
//
// Ashley, 18 Sep 2026, mid-session: "Swapped exercises doesnt show prescribed
// weights." Her Kettlebell Swings sat in the prep slot with no weight anywhere
// on the card, a box offering 0, and a plate calculator beside it. She put
// 24kg on the bell.
//
// Her ruling, from three options: a starting weight, kept light.
//
// WHY A BROWSER. test:primer-load proves the number survives generation, the
// rotation path and the swap, and proves the words are in the source. It
// cannot prove the card PRINTS the number next to the prep sentence rather
// than one instead of the other — that is a composition of two correct
// branches, and an absence is only visible in a screenshot. This is the same
// defect class as 17 Sep, when the right answer looked like a failed one.
//
// It also reads the two other things from the same screenshots: the logging
// column naming its unit, and a row of identical per-set chips no longer
// pretending to be a build-up ladder.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9447', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9447/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&prep=1#/tab/exercise` })
await wait(5000)

console.log('\nA PREP MOVE THAT NEEDS A BELL\n')

// The prep card, found by the movement's own name rather than by position —
// which slot the generator puts first has moved before.
const READ = `(() => {
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === 'Kettlebell Swings')
  if (!leaf) return { found: false }
  let card = leaf
  for (let i = 0; i < 12 && card.parentElement; i++) {
    card = card.parentElement
    if (card.querySelector('input')) break
  }
  const text = (card.innerText || '').replace(/\\s+/g, ' ')
  const big = [...card.querySelectorAll('.ds-num-lg')].map(n => (n.textContent || '').trim()).filter(Boolean)
  const boxes = [...card.querySelectorAll('input')]
    .filter(i => /^setgrid-weight-/.test(i.id))
    .map(i => ({ value: i.value, placeholder: i.placeholder }))
  return { found: true, text: text.slice(0, 320), big, boxes }
})()`

const card = await ev(READ)
check('1. the prep card is on screen with its set grid', card.found === true && card.boxes.length > 0, card)

if (card.found) {
  check('2. it leads with a weight, not a blank where every other card has one',
    card.big.some(v => /^[0-9]/.test(v)), card.big)
  // THE OTHER HALF OF HER RULING, and the half that keeps it prep. A number
  // without this sentence would be the app quietly turning a warm-up into work.
  // THE OTHER HALF OF HER RULING, as the card actually carries it.
  //
  // MEASURED, and the first version of this check was wrong about where the
  // words are: the full sentence ("Stay light and controlled. This is
  // preparation, not a working set.") is the slot's `load_guidance` and does
  // not render on the collapsed card — what the card carries is the intensity
  // line, "Light — movement prep". That IS the framing, on screen, beside the
  // number. The fuller sentence being a tap away is recorded as a residue
  // rather than asserted here, because a check should say what the screen
  // does, not what I hoped it did.
  check('3. ...and the number never appears without the word that keeps it prep',
    /Light\s*[—-]\s*movement prep/i.test(card.text), card.text)
  check('4. the boxes no longer offer a bare 0 to log',
    card.boxes.every(b => b.placeholder !== '0' && b.value !== '0'), card.boxes)
  await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()==='Kettlebell Swings'); if(n) n.scrollIntoView({block:'center'})})()`)
  await wait(600)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/prep-weight.png', Buffer.from(shot.result.data, 'base64'))
}

// ---------------------------------------------------------------------------
// The logging column, and the chips that were pretending to be a ladder.
// ---------------------------------------------------------------------------
const cols = await ev(`(() => {
  const heads = [...document.querySelectorAll('*')].filter(x => x.children.length === 0)
    .map(x => (x.textContent || '').trim())
  const kinds = heads.filter(t => /^(Distance|Hold|Work|Duration|Time)(\\s|$)/.test(t))
  // A row of per-set chips that all say the same thing.
  const chipRows = []
  for (const g of document.querySelectorAll('div')) {
    const chips = [...g.children].filter(c => /^S\\d+:\\s*[\\d.]+kg$/.test((c.textContent || '').trim()))
    if (chips.length > 1) chipRows.push(chips.map(c => c.textContent.trim()))
  }
  return { kinds, chipRows }
})()`)

if (cols.kinds.length === 0) {
  console.log('    \u00b7 no carry/hold/interval on this day \u2014 check 5 has nothing to read')
} else {
  check('5. a column counting anything but reps names its unit',
    cols.kinds.every(k => /\u00b7/.test(k)), cols.kinds)
}
check('6. no row of per-set chips says the same number more than once',
  cols.chipRows.every(r => new Set(r.map(c => c.split(':')[1].trim())).size > 1), cols.chipRows)

// 8 IS THE ONE THING NO SOURCE GATE CAN SEE. The prep weight is computed once
// and then travels to two different pixels — the big number on the card, and
// the placeholder in the box you tap to log. Different components, different
// props, and "the value was right and the two places disagreed" is the exact
// defect shape this repo keeps finding (three PR renderers on 17 Sep, three
// primer call sites on 18 Sep). Reading BOTH off one real screen is the only
// way to know the halving reached the whole card and not just the headline.
if (card.found) {
  const bigNum = (card.big.find(v => /^[0-9]/.test(v)) || '').replace(/[^0-9.]/g, '')
  const ghost = (card.boxes.find(b => b.placeholder && /[0-9]/.test(b.placeholder)) || {}).placeholder
  check('8. the number on the card is the number the log box offers',
    bigNum !== '' && ghost !== undefined && Number(bigNum) === Number(ghost),
    { card: bigNum, box: ghost, allBig: card.big, boxes: card.boxes })
  // WHAT THIS CHECK CANNOT SEE, stated so nobody over-trusts it: it proves the
  // two pixels AGREE, not that the number is half. Break the halving itself
  // and both would read 24 together and this would stay green. That the value
  // is the ladder's first rung is held by test:primer-load §8, with mutations.
  // The screen reads 12 against a 24kg working weight, which is the split
  // working — the source gate owns the arithmetic, the driver owns the pixels.
}

const err = await ev('window.__err ?? null')
check('7. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe bell has a number, and it is still a warm-up.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
