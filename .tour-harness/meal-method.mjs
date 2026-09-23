// ---------------------------------------------------------------------------
// HOW TO COOK IT, ON THE REAL NUTRITION SCREEN, AT PHONE SIZE.
//
// The generator has always written a cooking method and the app has always
// thrown it away. This drives the REAL MealPlan at 390x844 and reads three
// things off the screen that no source check can see:
//
//   1. a meal with a method shows it, under the ingredients;
//   2. a meal whose STORED method names an amount shows no method at all —
//      the display-time re-check, proven on the surface where being wrong
//      would cost something rather than in a unit test;
//   3. a meal with no method shows no empty "Method" heading.
//
// WHICH HALF THIS PROVES. real.tsx renders the actual MealPlan against the
// actual meal-store, so everything above is the shipping component reading
// the shipping data path. It does NOT boot App.tsx, so it says nothing about
// the day-to-day meal rotation — that is held by test:meal-variety, which
// calls the real assembler, plus the source checks on the wiring. Writing
// down which half you have is the rule verify:prep-weight was written to
// enforce after a fixture spent weeks proving itself.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9384', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9384/json/list').then(r => r.json())
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
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const hero = () => ev(`(() => { const el = document.querySelector('.ds-num-mega'); return el ? el.textContent.trim() : null })()`)
const timeUntil = async (read, want, budgetMs) => {
  const started = Date.now()
  while (Date.now() - started < budgetMs) {
    if ((await read()) === want) return Date.now() - started
    await wait(50)
  }
  return null
}
const openMeal = async label => {
  await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => new RegExp(${JSON.stringify(label)}, 'i').test(b.textContent||'')); if (r[0]) r[0].click() })()`)
  await wait(600)
}
/** The rendered method for a named meal, or null when the block is not there at all. */
const methodFor = () => ev(`(() => {
  const el = document.querySelector('[data-meal-method]')
  return el ? { meal: el.getAttribute('data-meal-method'), text: el.innerText.trim() } : null
})()`)
const ingredientRows = () => ev(`[...document.querySelectorAll('[data-ingredient-row]')].map(b => b.getAttribute('data-ingredient-row'))`)
const methodTopVsIngredients = () => ev(`(() => {
  const m = document.querySelector('[data-meal-method]')
  const i = document.querySelector('[data-ingredient-row]')
  if (!m || !i) return null
  return { method: Math.round(m.getBoundingClientRect().top), ingredient: Math.round(i.getBoundingClientRect().top) }
})()`)
const pageWidth = () => ev(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`)
/** Scrolls whatever is being asserted into shot, so the saved png is worth reading. */
const scrollTo = async sel => {
  await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollIntoView({ block: 'center' }); return !!el })()`)
  await wait(400)
}

console.log('\nHOW TO COOK IT, ON A PHONE\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/nutrition` })
check('0. the Nutrition tab loads', (await timeUntil(hero, '0', 40000)) !== null, await hero())

// --- 1. a meal with a method shows it --------------------------------------
console.log('\n  1. Breakfast, whose stored method is clean')
await openMeal('Breakfast')
const breakfast = await methodFor()
check('1a. the method is on the card', breakfast !== null && breakfast.meal === 'Greek yoghurt, berries and honey', breakfast)
// Case-insensitive: the label class uppercases it in CSS and innerText
// reports the transformed text, so pinning the source casing would be
// asserting a style rule rather than that the block is labelled.
check('1b. it is labelled, so it is not read as another ingredient list', /^method\b/i.test(breakfast?.text || ''), breakfast?.text)
check('1c. it is the method that was stored, in full',
  /sear it skin-side down until golden/.test(breakfast?.text || '') && /Rest it before slicing/.test(breakfast?.text || ''), breakfast?.text)
const rows = await ingredientRows()
check('1d. the ingredients are on the card too — the amounts are still theirs', Array.isArray(rows) && rows.length >= 2, rows)
const order = await methodTopVsIngredients()
check('1e. and the method sits BELOW them on the real screen, not just later in the source',
  order !== null && order.method > order.ingredient, order)
const w = await pageWidth()
check('1f. nothing about it makes the page scroll sideways at 390px', w && w.scroll <= w.client + 1, w)
await scrollTo('[data-meal-method]')
await shoot('meal-method-shown')

// --- 2. a stored method naming an amount is not shown ----------------------
console.log('\n  2. Lunch, whose stored method names 180g of chicken')
await openMeal('Breakfast')  // collapse
await wait(300)
await openMeal('Lunch')
const lunch = await methodFor()
check('2a. no method is rendered for it at all', lunch === null, lunch)
const lunchText = await ev(`document.body.innerText`)
check('2b. and the amount from that method is nowhere on the screen',
  !/Fry the 180g chicken breast/.test(lunchText || ''),
  (lunchText || '').slice(0, 200))
check('2c. the meal itself is still there — the method was dropped, never the food',
  /Chicken, rice and roasted peppers/.test(lunchText || ''))
await scrollTo('[data-ingredient-row]')
await shoot('meal-method-dropped')

// --- 3. no method at all is silent, not an empty heading -------------------
console.log('\n  3. Dinner, which has no stored method')
await openMeal('Lunch')  // collapse
await wait(300)
await openMeal('Dinner')
const dinner = await methodFor()
check('3a. no empty Method heading is rendered', dinner === null, dinner)
const dinnerText = await ev(`document.body.innerText`)
check('3b. the meal is open, so 3a is a real absence rather than a closed card',
  /Salmon, new potatoes and green beans/.test(dinnerText || ''))
await shoot('meal-method-absent')

console.log(failures === 0 ? '\nAll meal-method screen checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
try { chrome.kill() } catch {}
server.close()
process.exit(failures === 0 ? 0 : 1)
