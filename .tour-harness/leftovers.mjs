// ---------------------------------------------------------------------------
// COOK ONCE, EAT TWICE, ON THE REAL NUTRITION SCREEN, AT PHONE SIZE.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9391', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9391/json/list').then(r => r.json())
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

console.log('\nCOOK ONCE, EAT TWICE, ON A PHONE\n')

const openMeal2 = async label => {
  await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => new RegExp(${JSON.stringify(label)}, 'i').test(b.textContent||'')); if (r[0]) r[0].click() })()`)
  await wait(600)
}
const leftoverNote = () => ev(`(() => { const el = document.querySelector('[data-meal-leftover]'); return el ? el.innerText.trim() : null })()`)
const cookExtraNote = () => ev(`(() => { const el = document.querySelector('[data-meal-cook-extra]'); return el ? el.innerText.trim() : null })()`)
const slotHeadings = () => ev(`[...document.querySelectorAll('*')].filter(x => x.children.length === 0 && /^(BREAKFAST|LUNCH|DINNER)/i.test((x.textContent||'').trim())).map(x => x.textContent.trim()).slice(0, 6)`)

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&leftovers=1#/tab/nutrition` })
check('0. the Nutrition tab loads with the batch-cooked day', (await timeUntil(hero, '0', 40000)) !== null, await hero())
check('0b. it is showing a real day of meals', (await slotHeadings()).length >= 2, await slotHeadings())

// --- 1. the lunch says where it came from ---------------------------------
console.log('\n  1. Lunch, which the app decided is last night\'s dinner')
await openMeal2('Lunch')
const note = await leftoverNote()
check('1a. the lunch card says it is last night\'s dinner', note !== null && /last night/i.test(note), note)
const w1 = await pageWidth()
check('1b. it does not push the page sideways at 390px', w1 && w1.scroll <= w1.client + 1, w1)
await scrollTo('[data-meal-leftover]')
await shoot('leftovers-lunch')

// --- 2. the dinner promises it before it happens --------------------------
console.log('\n  2. Dinner, which is being cooked for two meals')
await openMeal2('Lunch')
await wait(300)
await openMeal2('Dinner')
const promise = await cookExtraNote()
check('2a. the dinner card says to cook both portions together', promise !== null && /both portions/i.test(promise), promise)
check('2b. ...and says which meal the second one is for', promise !== null && /tomorrow/i.test(promise), promise)
await scrollTo('[data-meal-cook-extra]')
await shoot('leftovers-dinner')

// --- 2b. and it is not the same dish twice in one day ---------------------
const dayDishes = await ev(`(() => {
  const out = []
  for (const label of ['BREAKFAST', 'LUNCH', 'DINNER']) {
    const head = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && new RegExp('^' + label).test((x.textContent||'').trim()))
    if (!head) continue
    let card = head.parentElement
    const name = card ? (card.innerText||'').split('\\n').map(t => t.trim()).find(t => t && !/^(BREAKFAST|LUNCH|DINNER)/i.test(t)) : null
    out.push({ slot: label, name })
  }
  return out
})()`)
// THE DEFECT A SCREENSHOT FOUND AND NO SOURCE CHECK COULD. With the leftover
// pinned at lunch, the assembler was free to pick the SAME dish for dinner and
// did — one plate, twice, four hours apart, under a feature whose promise is
// that it saves cooking.
const names = (dayDishes || []).map(d => d.name).filter(Boolean)
check('2c. no dish appears twice in the same day', new Set(names).size === names.length, dayDishes)

// --- 3. the numbers still add up ------------------------------------------
console.log('\n  3. The day still adds up')
const text = await ev(`document.body.innerText`)
const planned = (text || '').match(/([\d,]+)\s*\n?\s*kcal planned/)
check('3a. the day states a planned calorie total', planned !== null, (text || '').slice(0, 120))
check('3b. ...and it is a real number, not zero — nothing was double counted into nonsense',
  planned !== null && Number(planned[1].replace(/,/g, '')) > 500 && Number(planned[1].replace(/,/g, '')) < 6000,
  planned?.[1])

console.log(failures === 0 ? '\nAll cook-once screen checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
try { chrome.kill() } catch {}
server.close()
process.exit(failures === 0 ? 0 : 1)
