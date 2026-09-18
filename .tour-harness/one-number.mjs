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
import { nearestAnchorDate } from './anchor.mjs'

// The harness's four training days are Wednesday (the anchor), Friday, Sunday
// and Monday. Section 9 needs the Monday — see its own note.
const MONDAY = nearestAnchorDate('Monday')

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

// Expand the row, the same way ramp-readonly does.
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

// ---------------------------------------------------------------------------
// 8. WHOSE NUMBERS ARE THOSE — read off the same screen, one day later.
//
// Ashley, 18 Sep 2026, on her dumbbell rows: "Last sets prescribed were sets
// of 11 reps. Is thay correct at the end of a exercise?" Nothing prescribed
// 11. The faint figures in the boxes were her own last session, drawn in the
// identical grey the app uses for a suggestion on a row with no history.
//
// Her ruling, from three options: mark them "last time" — the numbers stay in
// the boxes where her thumb is, and a small marker says when they are history.
//
// WHY A BROWSER. test:last-time proves the sentence and proves the guard is in
// the source. It cannot prove the marker lands on the RIGHT ROW: the marker
// and the row are siblings in one flat grid, so a caption, a warning line or
// an extra set can put it under the wrong one, and every source check still
// passes. Reading the DOM in document order is the only way to see it.
// ---------------------------------------------------------------------------
const MARKERS = `(() => {
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === ${NAME})
  if (!leaf) return { found: false }
  let card = leaf
  for (let i = 0; i < 12 && card.parentElement; i++) {
    card = card.parentElement
    if (card.querySelector('input') && /kg/i.test(card.innerText)) break
  }
  const anyRow = card.querySelector('[data-testid="working-row"]')
  if (!anyRow) return { found: true, grid: false }
  const kids = [...anyRow.parentElement.children]
  const isRow = el => { const t = el.getAttribute('data-testid'); return t === 'warmup-row' || t === 'working-row' }
  const rows = []
  for (let i = 0; i < kids.length; i++) {
    if (!isRow(kids[i])) continue
    // Everything between this row and the next one belongs to this row.
    let marker = null
    for (let j = i + 1; j < kids.length && !isRow(kids[j]); j++) {
      const m = kids[j].matches('[data-testid="last-time"]') ? kids[j] : kids[j].querySelector('[data-testid="last-time"]')
      if (m) { marker = (m.textContent || '').trim(); break }
    }
    const boxes = [...kids[i].querySelectorAll('input')].map(inp => (inp.value || inp.placeholder || '').trim())
    rows.push({ kind: kids[i].getAttribute('data-testid'), marker, boxes })
  }
  return { found: true, grid: true, rows }
})()`

const marked = await ev(MARKERS)
check('8a. the set grid is readable row by row', marked.found === true && marked.grid === true && marked.rows.length > 0, marked)

if (marked.grid) {
  const working = marked.rows.filter(r => r.kind === 'working-row')
  const warmups = marked.rows.filter(r => r.kind === 'warmup-row')

  // THE FIXTURE MUST BE UNDER PRESSURE. ?logged=1 seeds a real prior session
  // on this lift, so every working row here IS history-driven. A run where
  // none of them carried a marker would otherwise read as a quiet pass.
  check('8b. every working row on a lift with a logged session says "last time"',
    working.length > 0 && working.every(r => r.marker && r.marker.startsWith('last time')),
    working)

  // The whole harm, inverted: a marker that names figures the boxes do not
  // show is a second prescription, which is what she was reading in the first
  // place. Every number in the marker must be in that row's own boxes.
  const mismatched = working.filter(r => {
    if (!r.marker) return true
    const nums = (r.marker.match(/[0-9]+(?:[.][0-9]+)?/g) || [])
    return !nums.every(n => r.boxes.some(b => parseFloat(b) === parseFloat(n)))
  })
  check('8c. ...and every figure it names is a figure in that row’s own boxes',
    working.length > 0 && mismatched.length === 0, mismatched)

  // A build-up number comes from the prescription and nowhere else, so a
  // marker there would be a plain lie. This lift ramps, so there are rows to
  // check; when there are none that is reported rather than folded into a pass.
  //
  // MEASURED, not assumed: this fixture's logged lift is a tier-2 under 60kg,
  // and `needsRampUp` skips those — so the card arrives with no build-up rows
  // at all and this check had nothing to read. Rather than move the fixture,
  // the driver makes one the way she would, with "+ Add warm-up" on this very
  // card. That is the stronger read anyway: a row created at runtime is
  // exactly the row no source check can see.
  let warmRows = warmups
  if (warmRows.length === 0) {
    const added = await ev(`(() => {
      const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === ${NAME})
      if (!leaf) return 'no leaf'
      let card = leaf
      for (let i = 0; i < 12 && card.parentElement; i++) {
        card = card.parentElement
        if (card.querySelector('input') && /kg/i.test(card.innerText)) break
      }
      const btn = card.querySelector('[data-testid="add-warmup-set"]')
      if (!btn) return 'no button'
      btn.click()
      return 'clicked'
    })()`)
    await wait(1200)
    const after = await ev(MARKERS)
    warmRows = (after.rows ?? []).filter(r => r.kind === 'warmup-row')
    check('8d. "+ Add warm-up" really adds a build-up row to this card',
      added === 'clicked' && warmRows.length > 0, { added, rows: (after.rows ?? []).map(r => r.kind) })
  }
  check('8e. no build-up row claims to be showing last time',
    warmRows.length > 0 && warmRows.every(r => r.marker === null), warmRows)

  // AND IT IS NOT SIMPLY ALWAYS ON. Every other exercise on this day has no
  // history behind it, so its boxes hold the app's own suggestion and must
  // say nothing. Without this the marker could be unconditional and 8b-8c
  // would still be green.
  const elsewhere = await ev(`(() => {
    const grids = [...document.querySelectorAll('[data-testid="working-row"]')].map(r => r.parentElement)
    const seen = new Set()
    const out = []
    for (const g of grids) {
      if (seen.has(g)) continue
      seen.add(g)
      const rows = [...g.children].filter(c => c.getAttribute('data-testid') === 'working-row')
      const boxes = rows.flatMap(r => [...r.querySelectorAll('input')].map(i => (i.value || i.placeholder || '').trim()))
      out.push({ markers: g.querySelectorAll('[data-testid="last-time"]').length, rows: rows.length, boxes: boxes.slice(0, 4) })
    }
    return out
  })()`)
  const unmarked = elsewhere.filter(g => g.markers === 0)
  check('8f. a set grid with no session behind it shows no marker at all',
    elsewhere.length > 1 && unmarked.length > 0, elsewhere)

  // Framed on the grid itself, not the card heading: the thing to look at is
  // a marker sitting under its own row, small enough to ignore and legible
  // enough to answer "whose numbers are these?" without tapping anything.
  await ev(`(() => {
    const row = document.querySelector('[data-testid="last-time"]')
    if (row) row.scrollIntoView({ block: 'center' })
  })()`)
  await wait(600)
  const shot8 = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/one-number-lasttime.png', Buffer.from(shot8.result.data, 'base64'))
}

// ---------------------------------------------------------------------------
// 9. THE COUNT, not just the numbers — every row on one day's screen.
//
// Ashley's second report from the same training session: a card reading "3
// working sets" above FOUR weight chips. Two views of one count, disagreeing,
// exactly as the header and the chips were two views of one weight above.
//
// WHY IT STANDS ON A DIFFERENT DAY. The defect is generation's: a later pass
// moves `sets` and the chips stay at the old length. It lands where that pass
// fired, not on a day this driver picked. Measured against the harness's own
// seeded plan with the fix removed — the anchor Wednesday is clean and the
// Monday carries it — so checking the anchor day alone would have been green
// either way, which is what the first version of this section was.
//
// The date is derived from the anchor, never from the machine's calendar.
// ---------------------------------------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&today=${MONDAY}#/tab/exercise` })
await wait(5000)

// The count line and the chips live inside an EXPANDED row, so open every one
// first. ExerciseLine's header is a div[role=button][tabindex=0] — not a
// <button>, deliberately, because the expanded body contains buttons of its
// own and a button may not nest.
const opened = await ev(`(() => {
  const heads = [...document.querySelectorAll('div[role="button"][tabindex="0"]')]
  heads.forEach(h => h.click())
  return heads.length
})()`)
await wait(2000)

const rows = await ev(`(() => {
  // ONE ROW, BOUNDED. Each exercise states its own count in the "N working
  // sets · M logged" line. Walk up from that line only while the ancestor
  // still contains exactly ONE such line — the moment it would swallow a
  // second exercise, stop. Without that bound a bodyweight primer, which
  // renders no chips of its own, climbs until it finds the NEXT lift's chips
  // and reports them as its own: measured, and it read as a real defect.
  const countsIn = el => [...el.querySelectorAll('*')].filter(x => x.children.length === 0 && /^\\d+ working sets/.test((x.textContent||'').trim())).length
  const out = []
  const leaves = [...document.querySelectorAll('*')].filter(x => x.children.length === 0 && /^\\d+ working sets/.test((x.textContent||'').trim()))
  for (const leaf of leaves) {
    const sets = Number(/^(\\d+) working sets/.exec(leaf.textContent.trim())[1])
    let card = leaf
    while (card.parentElement && countsIn(card.parentElement) === 1) card = card.parentElement
    const chips = [...card.querySelectorAll('span')]
      .map(n => (n.textContent||'').trim())
      .filter(t => /^S\\d+:\\s*[\\d.]+kg$/.test(t))
    // A row that renders no chips is recorded as such rather than scored as
    // agreement — an empty read must never read as a pass.
    out.push({ sets, chips: chips.length, name: (card.innerText||'').replace(/\\s+/g, ' ').slice(0, 90) })
  }
  return out
})()`)

const withChips = rows.filter(r => r.chips > 0)
check(`9a. the ${MONDAY} session shows rows that state a set count AND render chips`,
  rows.length > 1 && withChips.length > 0, { opened, rows: rows.length, withChips: withChips.length, sample: rows.slice(0, 3) })
check('9b. every row shows exactly as many weight chips as the sets it claims',
  withChips.length > 0 && withChips.every(r => r.chips === r.sets),
  withChips.filter(r => r.chips !== r.sets))

// Frame the screenshot on a row that shows BOTH halves — the chips and the
// count line beneath them — so the picture is evidence and not just a page.
await ev(`(() => {
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && /^\\d+ working sets/.test((x.textContent||'').trim()))
  if (leaf) leaf.scrollIntoView({ block: 'center' })
})()`)
await wait(700)
const shot9 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/one-number-chips.png', Buffer.from(shot9.result.data, 'base64'))

const err = await ev('window.__err ?? null')
check('10. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe card shows one weight, and it is the one the log earned.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
