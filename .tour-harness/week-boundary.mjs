// ---------------------------------------------------------------------------
// WHERE ONE TRAINING WEEK ENDS AND THE NEXT BEGINS — ON THE REAL STRIPS.
//
// Ashley, 6 Oct 2026: "Make sure the app knows where one week ends and the other
// begins." Her ruling: a training week runs from the day the plan began, changes at
// local midnight, and the Monday-to-Sunday strip shows each day's own session and
// marks where the new week starts (docs/plans/week-boundaries.md).
//
// WHY A BROWSER. scripts/test-week-boundaries.ts holds the functions. What it cannot
// hold is that a real Home and a real Exercise tab, reading a real mesocycle through
// useTrainingWeek, put a day in ITS OWN week's session and draw the line in the right
// place. And until this driver existed no harness plan could have shown it: the default
// plan is made at midnight on a Monday, so every strip sits inside one plan week.
//
// THE FIXTURE (?thursday=1, real.tsx): a plan made on a Thursday at 18:30, so the
// anchor (a Wednesday) is the last day of week 1 and the strip's Thursday the first of
// week 2 — and week 2 trains on SATURDAY where week 1 trained on Friday. Read against
// week 1's days alone (the old behaviour) Friday is a training day and Saturday a rest;
// read against each day's own week it is the other way round.
//
// WHAT THIS DOES NOT PROVE: the app's own dialogs and App.tsx's wiring (no harness page
// boots App.tsx); Home here is fed the plan the way App feeds it, week 1's days, which
// is the point.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { ANCHOR_ISO } from './anchor.mjs'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9498', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9498/json/list').then(r => r.json())
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
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// A NEW ADDRESS FOR EVERY LOAD: navigating to the address already open is a jump to its #fragment and
// reloads nothing (CLAUDE.md), so each scenario has its own query string.
let loads = 0
const open = async (query, tab) => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${query}&n=${loads}#/tab/${tab}` })
  await wait(2500); await ev(`location.hash = '#/tab/${tab}'`); await wait(1500)
}

/** The seven Home cells, in order: their spoken labels, which one carries the boundary, and the note under them. */
const readHome = () => ev(`(() => {
  const names = ${JSON.stringify(DAY_NAMES)}
  const cells = [...document.querySelectorAll('[role="img"][aria-label]')]
    .filter(n => names.some(d => (n.getAttribute('aria-label') || '').startsWith(d + ':')))
  return {
    labels: cells.map(n => n.getAttribute('aria-label')),
    boundaryAt: cells.findIndex(n => n.getAttribute('data-week-boundary') === 'start'),
    boundaryMarks: document.querySelectorAll('[data-testid="home-week-boundary-mark"]').length,
    note: (document.querySelector('[data-testid="home-week-boundary-note"]') || {}).textContent ?? null,
  }
})()`)
const homeReady = async () => { let h = await readHome(); for (let i = 0; i < 20 && h.labels.length < 7; i++) { await wait(500); h = await readHome() } return h }

const readExercise = () => ev(`(() => ({
  marks: document.querySelectorAll('[data-testid="week-boundary-mark"]').length,
  note: (document.querySelector('[data-testid="week-boundary-note"]') || {}).textContent ?? null,
}))()`)
const exerciseReady = async () => { let x = await readExercise(); for (let i = 0; i < 20 && x.marks === 0 && x.note === null; i++) { await wait(500); x = await readExercise() } return x }

const label = (h, day) => h.labels.find(l => l.startsWith(day + ':')) ?? null

console.log('\nWEEK BOUNDARIES — a plan begun on a Thursday evening, on the real strips\n')

// --- A. Wednesday, the last day of week 1 ----------------------------------
console.log('A. The last day of week 1 (the anchor)')
await open('thursday=1', 'dashboard')
const a = await homeReady()
// The days the other scenarios stand on come from the PAGE, which reads them off the plan's own start.
const days = await ev('window.__weekBoundaryTarget ?? null')
check('0. the fixture put the anchor on the last day of week 1 (so the strip below splits into two weeks)', days?.lastDayOfWeekOne === ANCHOR_ISO, { days, ANCHOR_ISO })
check('1. Home shows seven days, Monday to Sunday', a.labels.length === 7 && a.labels.every((l, i) => l.startsWith(DAY_NAMES[i] + ':')), a.labels)
check('2. Friday is a REST day — week 2 trains on Saturday, and Friday is in week 2', label(a, 'Friday') === 'Friday: rest day', label(a, 'Friday'))
check('3. Saturday is DUE — it is a week 2 training day, not the rest week 1 had there', label(a, 'Saturday') === 'Saturday: due', label(a, 'Saturday'))
check('4. ...and Sunday, a training day in both weeks, is due', label(a, 'Sunday') === 'Sunday: due', label(a, 'Sunday'))
check('5. exactly one boundary, and it sits on Thursday (index 3), where week 2 begins', a.boundaryAt === 3 && a.boundaryMarks === 1, { at: a.boundaryAt, marks: a.boundaryMarks })
check('6. the note says when the new week starts, and names the day', a.note === 'Week 2 starts Thursday', a.note)
await shoot('week-boundary-home')

await ev(`location.hash = '#/tab/exercise'`); await wait(1500)
const ax = await exerciseReady()
check('7. the Exercise strip draws the same line, once', ax.marks === 1, ax)
check('8. ...and says the same words', ax.note === 'Week 2 starts Thursday', ax.note)
await shoot('week-boundary-exercise')

// --- B. Thursday, the day the new week starts -------------------------------
console.log('\nB. The first day of week 2 (the plan was made at 18:30 the Thursday before)')
await open(`thursday=1&today=${days?.weekTwoStarts}`, 'dashboard')
const b = await homeReady()
check('9. on the day itself the note says today', b.note === 'Week 2 starts today', b.note)
check('10. the boundary is still on Thursday', b.boundaryAt === 3 && b.boundaryMarks === 1, { at: b.boundaryAt, marks: b.boundaryMarks })
check('11. Friday and Saturday read the same as the day before (the week did not change under them)', label(b, 'Friday') === 'Friday: rest day' && label(b, 'Saturday') === 'Saturday: due', b.labels)
await shoot('week-boundary-home-thursday')

// --- C. Friday, after it ---------------------------------------------------
console.log('\nC. The day after it')
await open(`thursday=1&today=${days?.dayAfter}`, 'dashboard')
const c = await homeReady()
check('12. the day after, the note says it began, and names the day', c.note === 'Week 2 began Thursday', c.note)
check('13. Thursday is still where the line is drawn', c.boundaryAt === 3 && c.boundaryMarks === 1, { at: c.boundaryAt, marks: c.boundaryMarks })

// --- D. An ordinary plan: nothing to say -----------------------------------
console.log('\nD. The default plan (made at midnight on a Monday): the strip holds one plan week')
await open('', 'dashboard')
const d = await homeReady()
check('14. Home still shows seven days', d.labels.length === 7, d.labels)
check('15. no boundary is drawn on Home, and no note', d.boundaryAt === -1 && d.boundaryMarks === 0 && d.note === null, d)
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const dx = await readExercise()
check('16. ...nor on Exercise', dx.marks === 0 && dx.note === null, dx)

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nThe strips know where one training week ends and the next begins.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
