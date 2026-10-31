// ---------------------------------------------------------------------------
// THE ONE-PAGE HOME, NUTRITION AND EXERCISE, DRIVEN AT 390px (design 5c·5 / 5c·6 / 5c·4, 17 Oct 2026).
//
// Reads the numbers off the real screens and taps her three rulings of that day:
//   A. Home: the headline is the mean of the rings drawn; Steps in the key opens the steps entry, the other
//      rows and the rings open Nutrition; the pill says "in a row"; the next meal is the dish (and the kcal)
//      Nutrition's Up next card shows; the docked button names today's session and sits above the tab bar.
//   B. Nutrition: the day strip is above the calories; no rings; the bar is eaten over target; the water
//      cell opens the quick-add, +500 moves it by 0.5 L and Undo puts it back; Targets opens the sheet.
//   C. Exercise: the week line's count is the strip's; no rings, no Program card, the week number opens the
//      programme; the ⋯ menu still holds What happened?; "Start session" is docked. (Re-anchored 30 Oct 2026.)
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring (no harness page boots it); real.tsx passes Home the meals
// the way App does.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

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

const PORT = 9478
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
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

let loads = 0
const open = async (tab, q = '') => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${q}&n=${loads}#/tab/${tab}` })
  await wait(2500); await ev(`location.hash = '#/tab/${tab}'`); await wait(2000)
}
/** A real click at an element's centre (a dispatched element.click() can open and shut a row in one tick). */
const tap = async sel => {
  const r = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()`)
  if (!r) return false
  await wait(150)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 })
  await wait(700)
  return true
}
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)

console.log('\nA. Home')
await open('dashboard')
const rings = await ev(`[...document.querySelectorAll('[data-home-rings] [data-ring]')].map(c => ({ k: c.dataset.ring, s: c.dataset.share }))`)
check('1. four rings, outermost first: calories, protein, water, steps', (rings ?? []).map(r => r.k).join(',') === 'calories,protein,water,steps', rings)
const shares = (rings ?? []).filter(r => r.s !== 'none').map(r => Number(r.s))
const expected = shares.length ? `${Math.round(shares.reduce((a, b) => a + b, 0) / shares.length * 100)}%` : '—'
const soFar = await text('[data-testid="home-so-far"]')
check('2. the headline is the mean of the rings drawn (a ring with no target left out)', soFar === expected && shares.length > 0, { soFar, expected, rings })
check('3. the pill reads "N in a row", never "days"', /^\d+ in a row$/.test(await text('[data-testid="home-streak"]')), await text('[data-testid="home-streak"]'))
// RE-ANCHORED 30 Oct 2026 ("less is more"): not docked; directly under the session it starts, on the first screen.
const cta = await ev(`(() => { const n = document.querySelector('[data-home-cta] button'); const row = document.querySelector('[data-home-hero]'); if (!n || !row) return null; const b = n.getBoundingClientRect(); return { text: n.innerText.trim(), bottom: b.bottom, top: b.top, rowBottom: row.getBoundingClientRect().bottom, h: innerHeight } })()`)
check('4. the Start button names today\'s session, sits right under the session row, and is on the first screen above the tab bar', !!cta && /^Start \S/.test(cta.text) && cta.top >= cta.rowBottom - 1 && cta.top - cta.rowBottom < 24 && cta.bottom <= cta.h - 64, cta)
const homeMeal = await ev(`(() => { const r = document.querySelector('[data-home-next-meal]'); return r ? { slot: r.dataset.homeNextMeal, text: r.innerText.replace(/\\s+/g, ' ').trim() } : null })()`)
check('5. Up next carries the next meal', !!homeMeal, homeMeal)
await shoot('one-page-home')
await tap('[data-key-row="steps"]')
check('6. "Tap the steps ring": Steps in the key opens the steps entry, on Home', await ev(`!!document.querySelector('input[aria-label="Steps today"]') && location.hash.includes('dashboard')`))
await shoot('one-page-home-steps')
await tap('[data-key-row="water"]')
check('7. ...Water in the key opens Nutrition', await ev(`location.hash.includes('nutrition')`), await ev('location.hash'))
await open('dashboard')
await tap('[data-home-rings]')
check('8. ...and so do the rings', await ev(`location.hash.includes('nutrition')`), await ev('location.hash'))

console.log('\nB. Nutrition')
await open('nutrition')
const order = await ev(`(() => { const s = document.querySelector('[data-testid="meal-day-strip"], [data-meal-day-strip]') ?? [...document.querySelectorAll('button')].find(b => /^today/i.test(b.innerText.trim()))?.parentElement; const h = document.querySelector('[data-nutrition-hero]'); return s && h ? { strip: s.getBoundingClientRect().top, hero: h.getBoundingClientRect().top } : null })()`)
check('9. "Keep it on top": the day strip is above the calories', !!order && order.strip < order.hero, order)
check('10. no rings on Nutrition', await ev(`!document.querySelector('main [data-ring]')`))
const bar = await ev(`(() => { const b = document.querySelector('[data-testid="kcal-bar"]'); return b ? { share: b.dataset.share, eaten: document.querySelector('[data-testid="kcal-eaten"]')?.innerText, of: b.closest('[data-nutrition-hero]')?.innerText } : null })()`)
const num = s => Number(String(s).replace(/,/g, ''))
const kcalTarget = bar ? num((bar.of.match(/of\s+([\d,]+)/) ?? [])[1]) : NaN
check('11. the calorie bar is eaten over target', !!bar && Math.abs(Number(bar.share) - Math.min(1, num(bar.eaten) / kcalTarget)) < 0.002, { bar, kcalTarget })
// RE-ANCHORED 31 Oct 2026 (design 3a): one list, the next meal is the row marked next; its kcal is the row's own number.
const nextRow = () => ev(`(() => { const r = document.querySelector('[data-meal-row][data-variant="upnext"]'); return r ? { slot: r.dataset.mealRow, kcal: r.querySelector('[data-testid="meal-row-kcal"]')?.textContent.trim() } : null })()`)
const upnextKcal = await nextRow()
const mealKcal = homeMeal ? (homeMeal.text.match(/(\d[\d,]*) kcal/) ?? [])[1] : null
check('12. Home\'s next meal is the dish and the kcal on Nutrition\'s Up next card', !!upnextKcal && !!mealKcal && upnextKcal.kcal === mealKcal && upnextKcal.slot === homeMeal.slot, { upnextKcal, homeMeal })
const waterBefore = await text('[data-ring-key-row="water"]')
await tap('[data-ring-key-row="water"]')
check('13. the water cell opens the quick-add', await ev(`!!document.querySelector('[data-water-quick-add]')`))
await shoot('one-page-nutrition-water')
await ev(`[...document.querySelectorAll('[data-water-quick-add] button')].find(b => b.innerText.trim() === '+500 ml')?.click()`)
await wait(600)
const litres = s => Number((String(s).match(/Water\s*\+?\s*([\d.]+)/) ?? [])[1])
const waterAfter = await text('[data-ring-key-row="water"]')
check('14. +500 ml moves the cell by 0.5 L', Math.abs(litres(waterAfter) - litres(waterBefore) - 0.5) < 0.001, { waterBefore, waterAfter })
await ev(`document.querySelector('[data-water-undo]')?.click()`)
await wait(600)
check('15. ...and Undo puts it back', litres(await text('[data-ring-key-row="water"]')) === litres(waterBefore), await text('[data-ring-key-row="water"]'))
await tap('[data-targets-row]')
check('16. Targets & plan settings opens the targets sheet', await ev(`[...document.querySelectorAll('[role="dialog"]')].some(d => /How your targets are set/.test(d.innerText))`))
await open('nutrition')
await shoot('one-page-nutrition')

console.log('\nC. Exercise')
await open('exercise')
const meter = await text('[data-testid="week-meter-count"]')
const key = await text('[data-testid="week-key"]')
// RE-ANCHORED 30 Oct 2026 ("less is more"): the rings and key became one line, "0 of 4 sessions · 0/76 sets", and
// the Program card left the page. The count is the strip's: one "done" dot per session done.
const done = await ev(`document.querySelectorAll('[data-exercise-strip] [data-dot="done"]').length`)
check('17. the week line\'s session count is the strip\'s', !!meter && key.startsWith(`${meter} session`) && Number(meter.split(' of ')[0]) === done, { meter, key, done })
check('18. no week rings and no Program card on the page', await ev(`!document.querySelector('main [data-ring]') && !document.querySelector('[data-program-row]')`))
const start = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(n => n.innerText.trim() === 'Start session'); if (!b) return null; const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } })()`)
check('19. "Start session" is docked on screen above the tab bar', !!start && start.top > start.h / 2 && start.bottom <= start.h - 64, start)
await shoot('one-page-exercise')
await ev(`document.querySelector('[aria-label="More options"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))`)
await wait(600)
check('20. the ⋯ menu still holds What happened?', await ev(`!!document.querySelector('[data-testid="what-happened-item"]')`))
await open('exercise')
await tap('[data-testid="week-context-header"]')
check('21. the week number opens the programme', await ev(`/program/.test(location.hash)`), await ev('location.hash'))

console.log('\nD. With breakfast logged over its plan (the rest of the day re-sized around it)')
// ateover=200: breakfast eaten 200 kcal over, so Nutrition fits lunch and dinner around it (her ruling A).
// Home's next meal must carry the RE-SIZED kcal, not the stored dish's.
await open('nutrition', 'refit=1&drift=1&ateover=200')
const resized = await ev(`document.querySelector('[data-testid="around-eaten"]')?.dataset.kind ?? null`)
const nUp = await nextRow()
const bar2 = await ev(`Number(document.querySelector('[data-testid="kcal-bar"]')?.dataset.share ?? 'NaN')`)
const hero2 = await text('[data-nutrition-hero]')
const eaten2 = num(await text('[data-testid="kcal-eaten"]'))
const target2 = num((hero2.match(/of\s+([\d,]+)/) ?? [])[1])
check('23. (the fixture binds: the day was re-sized around what was eaten, and the bar has moved)', resized === 'resized' && bar2 > 0, { resized, bar2 })
check('23b. with food eaten, the calorie bar is eaten over target', eaten2 > 0 && Math.abs(bar2 - Math.min(1, eaten2 / target2)) < 0.002, { bar2, eaten2, target2 })
const readHomeMeal = () => ev(`(() => { const r = document.querySelector('[data-home-next-meal]'); return r ? { slot: r.dataset.homeNextMeal, text: r.innerText.replace(/\\s+/g, ' ').trim() } : null })()`)
const kcalOf = m => m ? (m.text.match(/(\d[\d,]*) kcal/) ?? [])[1] : null
await open('dashboard', 'refit=1&drift=1')
const plain = await readHomeMeal()
await open('dashboard', 'refit=1&drift=1&ateover=200')
const hm2 = await readHomeMeal()
const k2 = kcalOf(hm2)
check('24. Home\'s next meal carries the re-sized kcal Nutrition shows', !!nUp && !!k2 && nUp.kcal === k2 && nUp.slot === hm2.slot, { nUp, hm2 })
check('25. ...which is not the stored dish\'s kcal (the same dish with nothing eaten)', !!plain && plain.slot === hm2?.slot && kcalOf(plain) !== k2, { plain, hm2 })

const err = await ev('window.__err ?? null')
check('22. no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nThe one-page screens draw what they say and every tap goes where her rulings put it.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
