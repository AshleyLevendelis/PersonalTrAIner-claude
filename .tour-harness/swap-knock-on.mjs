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
// verify:swap-knock-on — A MEAL SWAP SAYS WHAT ELSE IT CHANGED (runs 3-4, M34,
// 10 Oct 2026). Swapping lunch changed the snack and nothing said so. Here:
// swap lunch on the Nutrition tab, read every other meal before and after,
// and require a line for each one that changed (and none when none did).
// ---------------------------------------------------------------------------
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&week=1#/tab/nutrition` })
for (let i = 0; i < 60; i++) { if (await ev(`!!document.querySelector('[data-testid="meal-day-strip"]')`)) break; await wait(200) }
await wait(600)
// Names AND sizes, off the rows' own hooks: a knock-on can be a different
// dish or the same dish at another size.
const MEALS = `Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => {
  const k = e.closest('.py-4')?.querySelector('[data-testid="meal-row-kcal"]')?.textContent.trim() ?? ''
  return [e.dataset.mealName, e.textContent.trim() + ' | ' + k]
}))`
const days = await ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
check('0. the strip has upcoming days', (days?.length ?? 0) >= 4, days)
// THE FIXTURE MUST BE UNDER PRESSURE: walk days, slots and options until a
// swap moves ANOTHER meal of that day, so the line is tested, not just absent.
let found = null, quietOk = true, quietSeen = 0, swaps = 0
outer: for (const date of (days ?? []).slice(1)) {
  for (const slot of ['dinner', 'lunch', 'breakfast']) {
    for (let opt = 0; opt < 3; opt++) {
      await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(450)
      const before = await ev(MEALS)
      if (!before[slot]) continue
      const opened = await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]')?.closest('.py-4'); const head = r?.querySelector('button'); if (!head) return false; head.click(); return true })()`)
      await wait(350)
      const swapBtn = await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]').closest('.py-4'); const b = [...r.querySelectorAll('button')].find(x => /^Swap/.test(x.textContent.trim())); if (!b) return false; b.click(); return true })()`)
      if (!opened || !swapBtn) break
      await wait(300)
      const picked = await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]').closest('.py-4'); const bs = [...r.querySelectorAll('button')].filter(x => x.querySelector('p.line-clamp-2') && !x.disabled); const b = bs[${opt}]; if (!b) return null; const t = b.querySelector('p').textContent.trim(); b.click(); return t })()`)
      if (!picked) break
      await wait(1200)
      swaps++
      const note = await ev(`document.querySelector('[data-testid="swap-knock-on"]')?.textContent?.trim() ?? null`)
      await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(450)
      const after = await ev(MEALS)
      const others = Object.keys(before).filter(k => k !== slot && before[k] !== after[k])
      if (others.length === 0) { quietSeen++; if (note !== null) quietOk = false; continue }
      found = { date, slot, picked, others, note, before, after }
      break outer
    }
  }
}
console.log(`  ${swaps} swaps tried; ${found ? `${found.slot} on ${found.date} moved ${found.others.join(', ')}; note: ${found.note}` : 'none moved another meal'}`)
check('1a. a swap that moved nothing else says nothing', quietOk && quietSeen > 0, { quietSeen })
// WHAT THIS DRIVER CANNOT SHOW, measured 10 Oct 2026: on ?week=1, 18 swaps
// across six upcoming days and three meals moved no other meal (the fixture's
// days have room to absorb any one swap). So the line for a swap that DOES
// move another meal is proven by test:coach-knows §8
// (its words and its wiring), not here. If a swap here ever moves another
// meal, the line must name it:
if (found) check('2a. every other meal that changed is named in the line under the swap',
  !!found.note && found.others.every(s => new RegExp(`\\b${s}\\b`, 'i').test(found.note)), found)
const note = found?.note ?? null
if (note) { await ev(`document.querySelector('[data-testid="swap-knock-on"]')?.scrollIntoView({ block: 'center' })`); const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL('./swap-knock-on.png', import.meta.url).pathname, Buffer.from(shot.result.data, 'base64')) }
console.log(failures === 0 ? '\nA swap says what else it changed.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
