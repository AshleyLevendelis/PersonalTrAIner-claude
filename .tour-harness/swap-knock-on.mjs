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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9443', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9443/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
// ---------------------------------------------------------------------------
// verify:swap-knock-on — A SWAP KEEPS THE DAY'S OTHER DISHES (runs 3-4, M34).
// Swapping lunch changed the snack to a different recipe and nothing said so.
// Ashley, 10 Oct 2026: "Resize, else leave" — the other meals keep their
// dishes, re-sized together within about 25%, one line with an Undo; beyond
// that left as planned and the gap said. Here, on the Nutrition tab's upcoming
// days: every swap leaves every other dish on its row, a swap that re-sizes
// says so in one line, Undo puts the planned sizes back and says the gap, and
// "Fit around my swap" re-sizes again.
//
// WHICH FILE RENDERS IT: the line is MealPlan's own, reached through the real
// NutritionDisplay and the real days hook (useMealDays), which the harness
// page mounts as App does. The swap itself is the page's stand-in for the
// pool swap; the pick it saves and the day it serves are the app's.
// ---------------------------------------------------------------------------
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&week=1&bigswap=1#/tab/nutrition` })
for (let i = 0; i < 60; i++) { if (await ev(`!!document.querySelector('[data-testid="meal-day-strip"]')`)) break; await wait(200) }
await wait(600)
const MEALS = `Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => {
  const k = e.closest('.py-4')?.querySelector('[data-testid="meal-row-kcal"]')?.textContent.trim() ?? ''
  return [e.dataset.mealName, { name: e.textContent.trim(), kcal: k }]
}))`
const HELD = `(() => { const p = document.querySelector('[data-testid="held-around"]'); return p ? { kind: p.dataset.kind, text: p.querySelector('span')?.textContent.trim() ?? '' } : null })()`
const shoot = async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(shot.result.data, 'base64')) }
const openDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(500) }
const days = await ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
check('0. the strip has upcoming days', (days?.length ?? 0) >= 4, days)

// Walk days, meals and options until a swap RE-SIZES the others, so the line
// and its Undo are tested rather than merely absent. Every swap on the way is
// held to the dish rule.
let found = null, swaps = 0
const dishMoved = []
for (const date of (days ?? []).slice(1)) {
  // One date carries the re-size the Undo checks below use; it is left alone
  // once found, and every other date is still walked, so "every swap keeps
  // the other dishes" is asked of many swaps, not one.
  if (found && date === found.date) continue
  for (const slot of ['lunch', 'dinner', 'breakfast']) {
    if (found && date === found.date) break
    for (let opt = 0; opt < 3; opt++) {
      await openDay(date)
      const before = await ev(MEALS)
      if (!before[slot]) continue
      const opened = await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]')?.closest('.py-4'); const head = r?.querySelector('button'); if (!head) return false; head.click(); return true })()`)
      await wait(350)
      const swapBtn = await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]').closest('.py-4'); const b = [...r.querySelectorAll('button')].find(x => /^Swap/.test(x.textContent.trim())); if (!b) return false; b.click(); return true })()`)
      if (!opened || !swapBtn) break
      await wait(300)
      const picked = await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]').closest('.py-4'); const bs = [...r.querySelectorAll('button')].filter(x => x.querySelector('p.line-clamp-2') && !x.disabled); const big = bs.find(x => x.querySelector('p').textContent.trim() === 'Big rice bowl'); const b = ${opt} === 0 && big ? big : bs[${opt}]; if (!b) return null; const t = b.querySelector('p').textContent.trim(); b.click(); return t })()`)
      if (!picked) break
      await wait(1200)
      swaps++
      await openDay(date)
      const after = await ev(MEALS)
      const held = await ev(HELD)
      const others = Object.keys(before).filter(k => k !== slot)
      for (const k of others) if (before[k].name !== after[k]?.name) dishMoved.push({ date, slot, other: k, from: before[k].name, to: after[k]?.name })
      const resized = others.filter(k => before[k].kcal !== after[k]?.kcal)
      if (!found && held?.kind === 'resized' && resized.length > 0) { found = { date, slot, picked, before, after, held, resized }; break }
    }
  }
}
console.log(`  ${swaps} swaps tried; ${found ? `${found.slot} on ${found.date} -> ${found.picked}; resized ${found.resized.join(', ')}` : 'none re-sized the others'}`)
check('1a. EVERY swap left every other meal on its own dish, across many swaps and days', swaps >= 10 && dishMoved.length === 0, { swaps, moved: dishMoved.slice(0, 4) })
check('1b. the fixture is under pressure: a swap re-sized the others', !!found, { swaps })
check('1c. ...and one line says so, naming those meals and the size',
  !!found && /^To fit around your swap, your .+ (is|are) \d+% (smaller|bigger)\. Same dish(es)?\.$/.test(found.held.text) && found.resized.every(k => found.held.text.includes(k)), found?.held)
if (found) await openDay(found.date)
check('1d. the line is on screen with its Undo', !!found && await ev(`(() => { const u = document.querySelector('[data-testid="held-around-undo"]'); if (!u) return false; u.scrollIntoView({ block: 'center' }); const r = u.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })()`))
await shoot('swap-knock-on')

// UNDO: the planned sizes come back, and the gap is said.
let undone = null, refit = null
if (found) {
  await openDay(found.date)
  await ev(`document.querySelector('[data-testid="held-around-undo"]').click()`); await wait(700)
  undone = { meals: await ev(MEALS), held: await ev(HELD) }
  await shoot('swap-knock-on-undo')
}
const plannedSizes = found ? found.resized.every(k => undone?.meals[k]?.kcal === found.before[k].kcal) : false
check('2a. Undo puts every re-sized meal back to its planned size', !!found && plannedSizes, found && found.resized.map(k => [k, found.before[k].kcal, undone?.meals[k]?.kcal]))
check('2b. ...says the day as it now is, over or under', undone?.held?.kind === 'kept' && /^Kept your .+ as planned after your swap\. The day is \d+ kcal (over|under) your target\.$/.test(undone.held.text), undone?.held)
check('2c. ...and offers the way back', !!found && await ev(`!!document.querySelector('[data-testid="held-around-refit"]')`))
if (found) {
  await ev(`document.querySelector('[data-testid="held-around-refit"]').click()`); await wait(700)
  refit = { meals: await ev(MEALS), held: await ev(HELD) }
}
check('2d. "Fit around my swap" re-sizes them again, to the same sizes', !!found && refit?.held?.kind === 'resized' && found.resized.every(k => refit.meals[k]?.kcal === found.after[k].kcal), refit?.held)
// The Undo is for that date only: today's meals are untouched by it.
console.log(failures === 0 ? '\nA swap keeps the other dishes and says what it re-sized.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
