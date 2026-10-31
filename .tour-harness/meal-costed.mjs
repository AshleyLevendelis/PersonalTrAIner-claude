// ---------------------------------------------------------------------------
// A STORED MEAL'S CARD SHOWS THE FOOD AS IT IS WEIGHED (H32, run 7, 14 Oct
// 2026; docs/plans/meals-costed-as-weighed.md), ON THE REAL NUTRITION SCREEN
// AT 390x844.
//
// The fixture (?stale=1) stores ONE dinner: "177g raw chicken breast, 53g dry
// couscous" and five more lines, with the numbers the pre-11-Oct food table
// made of them (482 kcal / 61 P / 23 C / 15 F: the raw breast as cooked, the
// dry couscous as cooked). Everything below is read off the screen after the
// real read (readPools) has run:
//   1. the dinner card shows 543 kcal · 51 P · 52 C · 14 F, the lines costed in
//      the state they name, and not the stored 482 / 61 / 23 / 15;
//   2. the day's planned total is the sum of the cards on screen (one
//      calculation, so the header cannot keep the old number);
//   3. nothing about it pushes the page sideways at phone width.
//
// WHICH HALF THIS PROVES: the shipping MealPlan reading the shipping read
// (readPools over the fake database). It does not boot App.tsx, so App's own
// load is held by test:meals-costed-as-weighed (readPools is App's only read
// of stored meals) rather than here.
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

const DEBUG_PORT = 9517
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json())
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
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('\nA STORED MEAL, COSTED AS IT IS WEIGHED, ON A PHONE\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&stale=1#/tab/nutrition` })
let read = false
const started = Date.now()
while (Date.now() - started < 40000) {
  if (await ev(`window.__poolsRead === true && !!document.querySelector('[data-testid="day-kcal"]')`)) { read = true; break }
  await wait(100)
}
check('0. the Nutrition tab loads and the stored meals have been read', read)
await wait(800)

// The day list first, every card closed: each row's kcal and the day's planned total.
const rows = await ev(`[...document.querySelectorAll('[data-testid="meal-row-kcal"]')].map(e => ({ slot: e.getAttribute('data-slot'), kcal: parseInt(e.textContent, 10) }))`)
const day = await ev(`parseInt(document.querySelector('[data-testid="day-kcal"]')?.textContent ?? '', 10)`)
await shoot('meal-costed-day')

// Open the dinner card (the row's own button).
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Greek Chicken Souvlaki/.test(x.textContent || '')); if (b) { b.scrollIntoView({ block: 'center' }); b.click() } return !!b })()`)
await wait(700)
// RE-ANCHORED 31 Oct 2026 (design 3b): the open meal is the recipe sheet; its header carries the kcal in bold and the
// same "P 51g C 52g F 14g" line the rows use.
const card = await ev(`(() => {
  const sheet = document.querySelector('[data-meal-sheet]')
  if (!sheet) return null
  return { kcal: sheet.querySelector('[data-testid="meal-sheet-kcal"] .tabular-mono')?.textContent?.trim(), split: sheet.querySelector('[data-meal-macros]')?.textContent?.replace(/\\s+/g, ' ').trim(), text: sheet.innerText }
})()`)
check('1a. the dinner card shows 543 kcal, its lines costed in the state they name', card?.kcal === '543', card)
check('1b. ...with 51 P · 52 C · 14 F (raw chicken is less protein a gram; dry couscous is more carbs)', /P\s*51g\s*C\s*52g\s*F\s*14g/.test(card?.split ?? ''), card?.split)
check('1c. the stored 482 / 61 / 23 / 15 is nowhere on the card', !!card && !/\b482\b/.test(card.text) && !/P\s*61g/.test(card.text) && !/C\s*23g/.test(card.text), card?.text?.slice(0, 200))
check('1d. the card still tells her to weigh it raw and dry', !!card && /raw chicken breast/i.test(card.text) && /dry couscous/i.test(card.text), card?.text?.slice(0, 300))
const dinnerRow = (rows ?? []).find(r => r.slot === 'dinner')
check('1e. the dinner row in the day list says the same 543', dinnerRow?.kcal === 543, rows)
const sum = (rows ?? []).reduce((a, r) => a + (r.kcal || 0), 0)
check('2. the day\'s planned total is the sum of the meals on screen (one calculation)', Array.isArray(rows) && rows.length >= 3 && day === sum, { day, sum, rows })
const w = await ev(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`)
check('3. nothing pushes the page sideways at 390px', !!w && w.scroll <= w.client + 1, w)
await ev(`(() => { const e = document.querySelector('[data-meal-sheet]'); if (e) e.scrollIntoView({ block: 'start' }) })()`)
await wait(300)
await shoot('meal-costed-dinner')

// ONE STATE (18 Oct 2026, runs 7-10, H36/M64), her ruling "Dry, plus cooked hint". The dinner is stored raw and dry;
// the lunch is stored COOKED ("180g chicken breast, 120g basmati rice") and must read raw and dry, with the hint.
const lineTexts = () => ev(`[...document.querySelectorAll('[data-ingredient-row]')].map(b => ({ row: b.getAttribute('data-ingredient-row'), text: b.innerText.replace(/\\s+/g, ' ').trim(), hint: b.querySelector('[data-testid="ingredient-cooked-hint"]')?.textContent?.trim() ?? null }))`)
const dinnerLines = await lineTexts()
const chick = (dinnerLines ?? []).find(l => /raw chicken breast/.test(l.text))
const cous = (dinnerLines ?? []).find(l => /dry couscous/.test(l.text))
check('4a. a raw line carries its cooked weight beside it: "177g raw chicken breast (about 130g cooked)"', chick?.text.startsWith('177g raw chicken breast (about 130g cooked)') === true, dinnerLines)
check('4b. ...and a dry one: "53g dry couscous (about 180g cooked)"', cous?.text.startsWith('53g dry couscous (about 180g cooked)') === true, cous)
check('4c. the hint is drawn beside the line, never part of the line the edit builders are handed', !!chick && chick.row === '177g raw chicken breast' && !/cooked/.test(chick.row ?? ''), chick)
check('4d. a food with no cooked twin has no hint (tzatziki, olive oil)', (dinnerLines ?? []).filter(l => /tzatziki|olive oil/.test(l.text)).length === 2 && (dinnerLines ?? []).filter(l => /tzatziki|olive oil/.test(l.text)).every(l => l.hint === null), dinnerLines)
// Close the dinner, open the lunch.
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Greek Chicken Souvlaki/.test(x.textContent || '')); if (b) b.click() })()`)
await wait(500)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Chicken, rice and roasted peppers/.test(x.textContent || '')); if (b) { b.scrollIntoView({ block: 'center' }); b.click() } return !!b })()`)
await wait(700)
const lunchLines = await lineTexts()
await shoot('meal-costed-lunch-raw-dry')
check('5a. a lunch stored cooked reads raw: "250g raw chicken breast (about 180g cooked)"', (lunchLines ?? []).some(l => l.text.startsWith('250g raw chicken breast (about 180g cooked)')), lunchLines)
check('5b. ...and dry: "40g dry basmati rice (about 120g cooked)"', (lunchLines ?? []).some(l => l.text.startsWith('40g dry basmati rice (about 120g cooked)')), lunchLines)
check('5c. no line on it is still written cooked', (lunchLines ?? []).length === 2 && !(lunchLines ?? []).some(l => /^\d+g (chicken breast|basmati rice)\b/.test(l.row ?? '')), lunchLines)

console.log(`\n${ran} checks ran, ${failures} failed.`)
try { chrome.kill() } catch {}
server.close()
process.exit(failures === 0 ? 0 : 1)
