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

// The harness's four training days are Wednesday (the anchor), Friday, Sunday
// and Monday. Section 9 needs the Monday — see its own note.

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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9437', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9437/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }

// ---------------------------------------------------------------------------
// verify:day-as-shown — TODAY'S MEALS, ONE CALCULATION, ON A REAL SCREEN
// (runs 3-4 of the live-app test: H24 and M33; Ashley's ruling A, 10 Oct 2026).
//
// The header said 1692 over meals adding up to 1,801. Here, on the Nutrition
// tab: the header's number is the sum of the rows' numbers in every state; a
// lunch eaten 200 kcal heavier re-sizes the other three meals and one line
// says so, with an Undo that puts the portions back (and survives a reload);
// a lunch 900 heavier leaves the meals alone and the line says how far over;
// and the ring past the target says "over", never "0 left".
// ---------------------------------------------------------------------------
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
let load = 0
const open = async q => { load++; await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${q}&load=${load}#/tab/nutrition` }); for (let i = 0; i < 40; i++) { await wait(300); if (await ev(`!!document.querySelector('[data-testid="day-kcal"]')`)) break } await wait(800) }
const READ = `(() => {
  const header = Number((document.querySelector('[data-testid="day-kcal"]')?.textContent || '').trim())
  const rows = [...document.querySelectorAll('[data-testid="meal-row-kcal"]')].map(e => ({ slot: e.getAttribute('data-slot'), kcal: Number((e.textContent.match(/\\d+/) || [NaN])[0]) }))
  const line = document.querySelector('[data-testid="around-eaten"]')
  const left = document.querySelector('[data-testid="kcal-left"]')?.textContent?.trim() ?? null
  return { header, rows, sum: rows.reduce((s, r) => s + r.kcal, 0), line: line ? { kind: line.getAttribute('data-kind'), text: line.querySelector('span')?.textContent?.trim() } : null, left }
})()`
// A row's figure is rounded on screen; four of them can differ from the
// rounded total by up to 2.
const adds = d => d && d.rows.length >= 3 && Math.abs(d.header - d.sum) <= 2

console.log('\n1. NOTHING EATEN: the header is the meals on screen')
await open('refit=1&drift=1')
const plain = await ev(READ)
check('1a. four meals and a header are on screen', plain.rows.length === 4 && plain.header > 0, plain)
check('1b. the header is the sum of the rows', adds(plain), plain)
check('1c. nothing is said', plain.line === null, plain.line)

console.log('\n2. LUNCH EATEN 200 KCAL HEAVIER: the rest fits around it, said once, with Undo')
await open('refit=1&drift=1&ateover=200')
const over = await ev(READ)
const lunchPlan = plain.rows.find(r => r.slot === 'lunch')?.kcal
check('2a. lunch shows what was eaten', over.rows.find(r => r.slot === 'lunch')?.kcal === lunchPlan + 200, { over, lunchPlan })
check('2b. the other three are each smaller than planned',
  ['breakfast', 'dinner', 'snack'].every(s => over.rows.find(r => r.slot === s).kcal < plain.rows.find(r => r.slot === s).kcal), over.rows)
check('2c. the header is the sum of the rows', adds(over), over)
check('2d. ...and the day is back near the target it had before lunch', Math.abs(over.header - plain.header) <= plain.header * 0.05, { before: plain.header, now: over.header })
check('2e. one line says what happened', over.line?.kind === 'resized' && /^Lunch came to 200 kcal more than planned, so breakfast, dinner and snack are \d+% smaller today\.$/.test(over.line?.text ?? ''), over.line)
await ev(`document.querySelector('[data-testid="around-eaten"]')?.scrollIntoView({ block: 'center' })`)
await shoot('day-as-shown-resized')
check('2f. Undo is on the line', await ev(`(() => { const b = document.querySelector('[data-testid="around-eaten-undo"]'); if (!b) return false; b.click(); return true })()`))
await wait(800)
const undone = await ev(READ)
check('2g. Undo puts the planned portions back', ['breakfast', 'dinner', 'snack'].every(s => undone.rows.find(r => r.slot === s).kcal === plain.rows.find(r => r.slot === s).kcal), undone.rows)
check('2h. ...the header is still the sum of the rows', adds(undone), undone)
check('2i. ...and the line says how far over the day is', undone.line?.kind === 'kept' && undone.line.text === 'Your meals are as planned. Today is 200 kcal over your target.', undone.line)
await open('refit=1&drift=1&ateover=200')
const reloaded = await ev(READ)
check('2j. Undo is remembered for the day', reloaded.line?.kind === 'kept', reloaded.line)
check('2k. ...and can be taken back', await ev(`(() => { const b = document.querySelector('[data-testid="around-eaten-refit"]'); if (!b) return false; b.click(); return true })()`))
await wait(800)
check('2l. ...re-sizing again', (await ev(READ)).line?.kind === 'resized')

console.log('\n3. LUNCH EATEN 900 KCAL HEAVIER: past 25%, the meals stay and the gap is said')
await open('refit=1&drift=1&ateover=900')
const far = await ev(READ)
check('3a. no meal is re-sized', ['breakfast', 'dinner', 'snack'].every(s => far.rows.find(r => r.slot === s).kcal === plain.rows.find(r => r.slot === s).kcal), far.rows)
check('3b. the header is the sum of the rows', adds(far), far)
check('3c. the line says how far over, plainly', far.line?.kind === 'too_far' && far.line.text === 'Today is 900 kcal over your target: too far to fix by changing portions, so your meals are as planned.', far.line)
await ev(`document.querySelector('[data-testid="around-eaten"]')?.scrollIntoView({ block: 'center' })`)
await shoot('day-as-shown-too-far')

console.log('\n4. PAST THE TARGET, THE RING SAYS OVER (M33)')
await open('refit=1&drift=1&ateover=2500')
const ring = await ev(READ)
check('4a. "N over", never "0 left"', /^\d+ over$/.test(ring.left ?? '') && ring.left !== '0 over', ring.left)
await ev(`document.querySelector('[data-testid="kcal-left"]')?.scrollIntoView({ block: 'center' })`)
await shoot('day-as-shown-over')

const err = await ev('window.__err ?? null')
check('5. no uncaught error on the page', err === null, err)
console.log(`\nday-as-shown: ${ran} checks ran`)
console.log(failures === 0 ? 'Today\'s header is the meals on screen, and the day fits around what was eaten.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
