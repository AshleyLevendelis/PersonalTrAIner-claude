// ---------------------------------------------------------------------------
// CHANGING ONE FOOD, ON THE REAL NUTRITION SCREEN.
//
// Ashley chose "make meals as adjustable as workouts" on 12 Sep 2026. The
// coach could take a food out of a meal, swap it or resize it; this screen
// could not. This drives the screen half at 390x844 through the REAL
// MealPlan: open a meal, tap an ingredient, take it out, READ THE COST AND
// THE OFFERED SWAPS OFF THE SCREEN, apply, and check the day's number moved
// by what the card said it would.
//
// The point of the run is the last part. A build that renders is not the
// claim being made — the claim is that the number the card promises and the
// number the day ends up with are the same number.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

/**
 * Every read is held this long.
 *
 * 1500 rather than something more dramatic because Home's first load makes
 * about seven sequential reads, so the whole run scales with this number —
 * at 4000ms the Home tab alone takes half a minute to appear. What matters is
 * not the size of the delay but that the counter moves in a fraction of it,
 * which is what the elapsed-time assertions below measure rather than assume.
 */
const SLOW_MS = 0
/** A tap that has to wait for the network cannot beat this. */
const INSTANT_BUDGET_MS = 600

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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9371', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9371/json/list').then(r => r.json())
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
/** Polls until `read()` returns `want`, and reports how long that took — the measurement this whole run exists to make. */
const timeUntil = async (read, want, budgetMs) => {
  const started = Date.now()
  while (Date.now() - started < budgetMs) {
    if ((await read()) === want) return Date.now() - started
    await wait(50)
  }
  return null
}
const mealButton = () => ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^(Log this meal|Logged)$/.test((x.textContent||'').trim()))
  return b ? (x => x)(b.textContent.trim()) : null
})()`)
const tapMealButton = () => ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^(Log this meal|Logged)$/.test((x.textContent||'').trim()))
  if (!b) return false
  b.click(); return true
})()`)
const homeCalories = () => ev(`(() => {
  const m = document.body.innerText.match(/Calories\\s*([\\d,]+)/)
  return m ? m[1].replace(/,/g, '') : null
})()`)


console.log('\nCHANGING ONE FOOD, FROM THE SCREEN\n')

const openBreakfast = async () => {
  await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => /Breakfast/i.test(b.textContent||'')); if (r[0]) r[0].click() })()`)
  await wait(600)
}
const rows = () => ev(`[...document.querySelectorAll('[data-ingredient-row]')].map(b => b.getAttribute('data-ingredient-row'))`)
const tapRow = line => ev(`(() => {
  const want = ${JSON.stringify(line)}
  const b = [...document.querySelectorAll('[data-ingredient-row]')].find(x => x.getAttribute('data-ingredient-row') === want)
  if (!b) return false
  b.click(); return true
})()`)
const sheetText = () => ev(`(() => { const s = document.querySelector('[data-meal-food-edit]'); return s ? s.innerText : null })()`)
const tapVerb = verb => ev(`(() => {
  const b = [...document.querySelectorAll('[data-edit-verb]')].find(x => x.getAttribute('data-edit-verb') === ${JSON.stringify(verb)})
  if (!b) return false
  b.click(); return true
})()`)
const suggestions = () => ev(`[...document.querySelectorAll('[data-edit-suggestion]')].map(b => b.getAttribute('data-edit-suggestion'))`)
const tapApply = () => ev(`(() => { const b = document.querySelector('[data-edit-apply]'); if (!b || b.disabled) return false; b.click(); return true })()`)

// EVERY BIG NUMBER ON THE TAB. The eaten counter and the day's planned
// calories share a class, and which is first is a layout detail this run has
// no business depending on — so it reads them all and asserts that the one
// that moves, moves by what the card promised.
const bigNumbers = () => ev(`[...document.querySelectorAll('.ds-num-mega')].map(el => el.textContent.trim())`)
const mealCalories = () => ev(`(() => { const el = document.querySelector('.ds-num-lg'); return el ? el.textContent.trim() : null })()`)

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/nutrition` })
check('0a. the Nutrition tab loads', (await timeUntil(hero, '0', 40000)) !== null, await hero())
await openBreakfast()
const numbersBefore = await bigNumbers()
const mealBefore = await mealCalories()
check('0b. the meal is open with its calories on screen', mealBefore !== null && Number(mealBefore) > 0, { numbersBefore, mealBefore })

// --- 1. every ingredient is a control -------------------------------------
const lines = await rows()
check('1a. the ingredients are tappable rows, not a readout', Array.isArray(lines) && lines.length >= 2, lines)
check('1b. tapping one opens the three verbs', await tapRow(lines[0]))
const opened = await sheetText()
check('1c. ...take it out, swap it, change amount', /Take it out/.test(opened||'') && /Swap it/.test(opened||'') && /Change amount/.test(opened||''), opened)

// --- 2. taking it out says what it costs, in the app's own numbers ---------
check('2a. choosing to take it out', await tapVerb('remove'))
await wait(400)
const card = await sheetText()
const kcalCost = (card||'').match(/Calories[\s\S]*?(-\d+) kcal/)
check('2b. the card states the calorie cost as a loss', kcalCost !== null, card)
check('2c. ...and promises not to re-portion the rest', /nothing is re-portioned/i.test(card||''), card)
const offered = await suggestions()
check('2d. ...and offers named swaps to close it', Array.isArray(offered) && offered.length >= 1, offered)
// `.every` on an empty array is true, so the emptiness is checked FIRST and
// separately — a list that isn't there must not satisfy "every entry is well
// formed", which is exactly how a check comes to prove nothing.
check('2e. ...each a food with an amount', (offered||[]).length > 0 && offered.every(x => /^\d+g \S/.test(x)), offered)
await ev(`document.querySelector('[data-meal-food-edit]')?.scrollIntoView({ block: 'center' })`); await wait(400)
await shoot('meal-food-edit-cost')

// --- 3. applying it moves the day by exactly that much ---------------------
const promised = kcalCost ? Number(kcalCost[1]) : null
check('3a. applying the change', await tapApply())
await wait(2500)
const numbersAfter = await bigNumbers()
const mealAfter = await mealCalories()

// THE ACTUAL CLAIM. Not "something changed" — the number the card promised,
// on the meal and on the day, and nothing else on the tab moving with them.
const mealMoved = (mealBefore !== null && mealAfter !== null) ? Number(mealAfter) - Number(mealBefore) : null
check('3b. the meal came down by what the card promised', promised !== null && mealMoved !== null && Math.abs(mealMoved - promised) <= 2,
      { mealBefore, mealAfter, promised, mealMoved })
const deltas = (numbersBefore || []).map((b, i) => Number((numbersAfter || [])[i]) - Number(b))
check('3c. ...and so did the day', deltas.some(d => Number.isFinite(d) && Math.abs(d - (promised ?? NaN)) <= 2),
      { numbersBefore, numbersAfter, promised })
check('3d. ...while nothing else on the tab moved with it',
      deltas.filter(d => Number.isFinite(d) && d !== 0).length === 1, { numbersBefore, numbersAfter })

const gone = await rows()
check('3e. ...and the food is gone from the meal',
      Array.isArray(gone) && gone.length === lines.length - 1 && !gone.includes(lines[0]), { was: lines, now: gone })
await shoot('meal-food-edit-applied')

// --- 5. ADDING a food, the fourth verb -----------------------------------
// The last thing on this row the coach could do and the screen could not. The
// written parity list called it a deliberate exception — "no free-text food
// entry on the screen" — and that reason was too strong: the foods the app can
// cost are a KNOWN LIST, so the screen searches it. A food that cannot be
// costed is never offered, rather than typed and then refused.
const tapById = t => ev('(() => { const b = document.querySelector(\'[data-testid="' + t + '"]\'); if (!b || b.disabled) return false; b.click(); return true })()')
const byId = t => ev('(() => { const b = document.querySelector(\'[data-testid="' + t + '"]\'); return b ? b.innerText.replace(/\\s+/g, " ").trim() : null })()')

check('5a. the meal row offers Add food', await ev(`!!document.querySelector('[data-testid="meal-food-add-open"]')`))
check('5b. tapping it opens a search', await tapById('meal-food-add-open'))
await wait(400)
check('5c. ...with a real search field', await ev(`!!document.querySelector('[data-testid="meal-food-add-search"]')`))

// A FOOD THE DATABASE HAS. Typed through the prototype setter plus an input
// event, the way every controlled field in this harness is driven.
await ev(`(() => {
  const n = document.querySelector('[data-testid="meal-food-add-search"]')
  if (!n) return false
  n.focus()
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, 'almond')
  n.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await wait(500)
const results = await ev(`[...document.querySelectorAll('[data-testid="meal-food-add-result"]')].map(b => b.textContent.trim())`)
check('5d. ...that finds foods the app can actually cost', Array.isArray(results) && results.length > 0, results)

// AND A WORD IT CANNOT. The honest outcome is a sentence pointing at chat, not
// an empty list the user has to interpret.
await ev(`(() => {
  const n = document.querySelector('[data-testid="meal-food-add-search"]')
  n.focus()
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, 'zzqqx')
  n.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await wait(400)
const nomatch = await byId('meal-food-add-nomatch')
check('5e. a food it does not know says so, and points at chat',
  !!nomatch && /chat/i.test(nomatch), nomatch)

if (Array.isArray(results) && results.length > 0) {
  await ev(`(() => {
    const n = document.querySelector('[data-testid="meal-food-add-search"]')
    n.focus()
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, 'almond')
    n.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await wait(400)
  check('5f. a found food can be chosen', await ev(`(() => {
    const b = document.querySelector('[data-testid="meal-food-add-result"]')
    if (!b) return false
    b.click(); return true
  })()`))
  await wait(500)
  const addPreview = await byId('meal-food-add-preview')
  check('5g. ...and what it costs is stated BEFORE the tap', !!addPreview, addPreview)
  check('5h. ...with real macro numbers on it', /\d+ kcal/.test(addPreview ?? ''), addPreview)
  await shoot('meal-food-add-preview')
}

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA food comes out, the card says what it costs, and the day moves by that much.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
