// ---------------------------------------------------------------------------
// "NEXT WEIGHT UP IS TOO BIG A JUMP", READ OFF A REAL SCREEN.
//
// Ashley's ruling, 19 Sep 2026: the commonest reason a weight stands still in
// this app — one real notch would be over 12% of it — gets its own line on the
// card, because unlike the other two it ends on its own.
//
// NO FIXTURE. The harness's own generated plan already contains the case: the
// audit's sweep found 423 stamped slots across eight profiles, and this
// profile's week 14 Monday has Front Raises at 6kg with the rep bump capped.
// So the driver PAGES to that week on the Full Program screen and reads what
// the app drew — there is nothing here that the harness wrote, which is the
// distinction .tour-harness/README.md keeps having to relearn.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the label reaches a real
// screen, in the app's own words, on a row the generator produced, without
// opening the weight's own ⓘ explainer. It does not prove the generator's
// stamping rule — that is test:frozen-weeks §9, end to end over eight
// generated plans.
//
// ON BROWSE, THE WHOLE LOAD DETAIL SITS BEHIND THE ROW TAP — RampStrip, the
// load chip, the rest line, all of it (ReadOnlyDayList's `expanded &&`). That
// is the browse convention and not this label's business; what the 5 Sep work
// was about is the ⓘ, which opens an explainer ABOUT the weight and which
// nothing here touches. Today's card draws the chip without any tap; that
// surface is held by test:frozen-weeks §8's render checks.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9467', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9467/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

console.log('\nA WEIGHT HELD BECAUSE THE NEXT ONE IS TOO BIG A JUMP\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/exercise/program` })
await wait(4500)
for (let i = 0; i < 20; i++) { if (await ev(`/FULL PROGRAM/i.test(document.body.innerText)`)) break; await wait(500) }

const weekNow = () => ev(`(document.body.innerText.match(/Week (\\d+)/) || [])[1] ?? null`)
const start = await weekNow()
check(`0. the program screen is up (week ${start})`, start != null, start)

// WALK THE WHOLE PLAN, ONE DAY AT A TIME. Not "week 14, Monday": which week
// holds the case is a fact about one seeded plan and would break the day
// anything upstream reshuffles it, proving nothing about the label. The
// property is that the app's own plan shows this line SOMEWHERE and shows it
// correctly; where is not the app's promise.
//
// ONE AT A TIME because the screen allows one open day — setOpenDay keeps a
// single name, so clicking the next row closes the last. An earlier version of
// this opened "every" day per week and read exactly one.
const dayTags = () => ev(`[...document.querySelectorAll('[role="button"][aria-expanded]')]
  .map(d => (d.innerText || '').trim().split('\\n')[0])
  .filter(t => /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/.test(t))`)

const openDay = async (tag) => {
  const box = await ev(`(() => {
    const el = [...document.querySelectorAll('[role="button"][aria-expanded]')]
      .find(d => (d.innerText || '').trim().split('\\n')[0] === '${tag}')
    if (!el) return null
    if (el.getAttribute('aria-expanded') === 'true') return 'already'
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 16) }
  })()`)
  if (!box) return false
  if (box !== 'already') {
    // A REAL MOUSE CLICK, not element.click() — the harness README's standing
    // warning, and an earlier version of this driver toggled a day open and
    // shut again in one tick by calling .click() on it.
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await wait(320)
  }
  return await ev(`(() => {
    const el = [...document.querySelectorAll('[role="button"][aria-expanded]')]
      .find(d => (d.innerText || '').trim().split('\\n')[0] === '${tag}')
    return !!el && el.getAttribute('aria-expanded') === 'true'
  })()`)
}

// THE ROW THAT CARRIES THE LABEL, and what else is on it — so the three
// wordings can be told apart on one row rather than across a whole page.
const scan = () => ev(`(() => {
  const leaf = [...document.querySelectorAll('*')].filter(e => e.children.length === 0)
  const label = leaf.find(e => /too big a jump/i.test(e.textContent || ''))
  if (!label) return null
  let row = label
  for (let i = 0; i < 6 && row.parentElement; i++) {
    row = row.parentElement
    if (/kg/i.test(row.innerText || '')) break
  }
  // THE WEIGHT CHIP, FOUND BY ITS TEXT NODE. An element-level search missed
  // it: the chip is a span that also holds an icon, so it is not a leaf, and
  // "no leaf matched" reads exactly like "the weight is not on the row".
  // Anchored on the number-then-kg shape at the start of the text rather than
  // on the whole string, because the chip carries qualifiers — "~6kg per
  // hand", "~8kg (single side)" — and pinning the wording would fail the next
  // time one is added while proving nothing about placement.
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  let kg = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/^\\s*~?[\\d.]+\\s*kg\\b/i.test(n.nodeValue || '')) { kg = n.parentElement; break }
  }
  const a = label.getBoundingClientRect(), b = kg ? kg.getBoundingClientRect() : null
  return {
    labelText: (label.textContent || '').trim(),
    rowText: (row.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
    weight: kg ? (kg.textContent || '').trim() : null,
    verticalGapPx: b ? Math.round(Math.abs(a.top - b.top)) : null,
    explainersOpen: [...document.querySelectorAll('[aria-expanded="true"]')]
      .filter(e => !/^(MON|TUE|WED|THU|FRI|SAT|SUN)\\n/.test((e.innerText || '').trim())).length,
  }
})()`)

// EVERY EXERCISE ROW INSIDE THE OPEN DAY, one at a time — the browse surface
// keeps one row expanded, so clicking the next closes the last.
// EVERY EXERCISE ROW INSIDE THE OPEN DAY, one at a time — the browse surface
// keeps one row expanded, so clicking the next closes the last. The rows are
// the role="button" controls that carry no aria-expanded; the day headers are
// the ones that do, and the non-training days carry tabindex -1.
const ROWS = '[role="button"][tabindex="0"]:not([aria-expanded])'
const rowsInOpenDay = () => ev(`document.querySelectorAll('${ROWS}').length`)

const expandRow = async (n) => {
  const box = await ev(`(() => {
    const row = document.querySelectorAll('${ROWS}')[${n}]
    if (!row) return null
    row.scrollIntoView({ block: 'center' })
    const r = row.getBoundingClientRect()
    return { x: Math.round(r.left + 24), y: Math.round(r.top + 10) }
  })()`)
  if (!box) return false
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await wait(160)
  return true
}

let found = null
let weeksWalked = 0, daysOpened = 0, rowsExpanded = 0
let week = start
outer:
for (let i = 0; i < 20; i++) {
  weeksWalked++
  for (const tag of (await dayTags()) ?? []) {
    if (!(await openDay(tag))) continue
    daysOpened++
    const n = (await rowsInOpenDay()) ?? 0
    for (let r = 0; r < n; r++) {
      if (!(await expandRow(r))) continue
      rowsExpanded++
      const hit = await scan()
      if (hit) { found = { ...hit, week: await weekNow(), day: tag }; break outer }
    }
  }
  const before = await weekNow()
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /next week/i.test(x.getAttribute('aria-label') || '')); if (b && !b.disabled) b.click() })()`)
  await wait(450)
  week = await weekNow()
  if (week === before) break
}

check(`1. the driver actually walked the plan (${weeksWalked} weeks, ${daysOpened} days, ${rowsExpanded} rows) — sanity check on this check`,
  weeksWalked > 1 && daysOpened > weeksWalked && rowsExpanded > daysOpened, { weeksWalked, daysOpened, rowsExpanded })
check('2. the app\'s own plan shows the line somewhere', !!found, { lastWeek: week })

// EVERY CHECK RUNS EVERY TIME, found or not. Wrapping them in `if (found)`
// made a broken label print 3 checks instead of 9 — which the mutation harness
// correctly refused to score as a catch, because a run that is three checks
// short is a crash, not a finding. Same rule as the `test:` gates: the number
// of checks is the same on a Tuesday.
const f = found ?? { labelText: '', rowText: '', weight: null, verticalGapPx: null, explainersOpen: -1 }
if (found) console.log(`      found on week ${found.week}, ${found.day}: ${found.rowText}`)
check('3. the line names the jump', /too big a jump/i.test(f.labelText), f.labelText)
check('4. ...and the row does NOT also say this is as heavy as it gets',
  !!found && !/as heavy as this gets/i.test(f.rowText), f.rowText)
check('5. ...nor call it an estimate ceiling', !!found && !/estimate.s ceiling/i.test(f.rowText), f.rowText)
check('6. ...nor point at a logged set, which would not move this one', !!found && !/log a set/i.test(f.rowText), f.rowText)
// OUTSIDE THE ⓘ. The whole point of the 5 Sep work was that the honest
// sentence already existed one tap away in load_guidance and nobody saw it.
// Opening the DAY and the ROW is how anyone reads a future session on browse;
// opening the weight's own explainer is the thing that must not be needed,
// and nothing did.
check('7. no weight explainer was opened to reveal it', f.explainersOpen === 0, f.explainersOpen)
check('8. it is drawn beside the weight it explains',
  f.weight != null && f.verticalGapPx != null && f.verticalGapPx < 120,
  { weight: f.weight, verticalGapPx: f.verticalGapPx })

if (found) {
  await ev(`(() => { const e = [...document.querySelectorAll('*')].find(x => /too big a jump/i.test(x.textContent || '') && x.children.length === 0); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 300) })()`)
  await wait(500)
}
await shoot('ceiling-label')

console.log(failures === 0 ? '\nAll ceiling-label checks passed.\n' : `\n${failures} FAILED\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
