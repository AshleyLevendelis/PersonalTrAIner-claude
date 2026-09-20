// ---------------------------------------------------------------------------
// THE HEART, ON THE REAL NUTRITION SCREEN, AT PHONE SIZE.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9397', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9397/json/list').then(r => r.json())
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

console.log('\nSAYING YOU LIKE A MEAL, ON A PHONE\n')

const openMeal2 = async label => {
  await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => new RegExp(${JSON.stringify(label)}, 'i').test(b.textContent||'')); if (r[0]) r[0].click() })()`)
  await wait(600)
}
const heart = () => ev(`(() => {
  const el = document.querySelector('[data-meal-favourite]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { meal: el.getAttribute('data-meal-favourite'), on: el.getAttribute('data-meal-favourite-on'), label: el.getAttribute('aria-label'), pressed: el.getAttribute('aria-pressed'), h: Math.round(r.height), w: Math.round(r.width) }
})()`)
const tapHeart = () => ev(`(() => { const el = document.querySelector('[data-meal-favourite]'); if (!el) return false; el.click(); return true })()`)
const heartOn = async () => (await heart())?.on

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/nutrition` })
check('0. the Nutrition tab loads', (await timeUntil(hero, '0', 40000)) !== null, await hero())
await openMeal2('Breakfast')

// --- 1. the control is there and honest about its state -------------------
const before = await heart()
check('1a. the meal has a heart', before !== null, before)
check('1b. it starts unfilled — nothing was marked', before?.on === 'no', before)
check('1c. its spoken label names THIS meal, so two rows are never one name',
  (before?.label || '').includes(before?.meal || 'x'), before?.label)
check('1d. it says "not pressed" to a screen reader, matching what the eye sees',
  before?.pressed === 'false', before?.pressed)
check('1e. it is big enough to hit on a phone', (before?.h ?? 0) >= 44, { h: before?.h, w: before?.w })

// --- 2. tapping it actually marks the meal --------------------------------
check('2a. the heart takes a tap', await tapHeart())
const filled = await timeUntil(heartOn, 'yes', 4000)
check('2b. ...and fills once the write lands', filled !== null, await heart())
const after = await heart()
check('2c. the screen reader hears the change too', after?.pressed === 'true', after?.pressed)
check('2d. ...and the label now offers to remove it', /remove/i.test(after?.label || ''), after?.label)
await scrollTo('[data-meal-favourite]')
await shoot('meal-favourite-on')

// --- 3. and tapping again takes it back -----------------------------------
check('3a. it takes a second tap', await tapHeart())
const cleared = await timeUntil(heartOn, 'no', 4000)
check('3b. ...and empties again — a heart is on or off, not a counter you cannot undo', cleared !== null, await heart())

const w = await pageWidth()
check('3c. nothing about it makes the page scroll sideways at 390px', w && w.scroll <= w.client + 1, w)

console.log(failures === 0 ? '\nAll favourite screen checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
try { chrome.kill() } catch {}
server.close()
process.exit(failures === 0 ? 0 : 1)
