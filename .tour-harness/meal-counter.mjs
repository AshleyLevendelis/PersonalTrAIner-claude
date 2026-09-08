// ---------------------------------------------------------------------------
// THE CALORIE COUNTER, ON A NETWORK THAT IS NOT INSTANT.
//
// Ashley, 8 Sep 2026: "tapping Log this meal doesn't update the top-level
// daily calorie counter without an app reload."
//
// The write was already local-first. The READ was not — getTodayLedger begins
// with an await on a meal_events select, so every screen showing today's
// calories sat on its old figure until the network answered. A harness whose
// fake answers in the same microtask cannot see that at all, which is why
// this run uses ?slow=4000: it is the only setting under which the bug and
// the fix look different.
//
// Runs the REAL NutritionDisplay + MealPlan + Dashboard at 390x844 and asserts
// the number moves in well under a second — and that it is still right after
// the request it no longer waits for finally lands.
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
const SLOW_MS = 1500
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9364', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9364/json/list').then(r => r.json())
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

console.log('\nTHE CALORIE COUNTER, ON A SLOW NETWORK\n')
// HOME FIRST, and deliberately: its cell renders from a cache written by a
// previous visit, so "she opens Home after logging a meal" is only a real
// test once Home has been opened at least once. A first-ever mount has
// genuinely nothing to show and waiting for it proves nothing.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&slow=${SLOW_MS}#/tab/dashboard` })
check('0a. Home has loaded once, with nothing eaten', (await timeUntil(homeCalories, '0', 40000)) !== null, await homeCalories())

await ev(`location.hash = '#/tab/nutrition'`); await wait(SLOW_MS + 5000)

check('0b. the Nutrition counter agrees', (await timeUntil(hero, '0', 20000)) !== null, await hero())
await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => /Breakfast/i.test(b.textContent||'')); if (r[0]) r[0].click() })()`)
await wait(1000)
check('0c. a meal with a Log button is on screen', (await mealButton()) === 'Log this meal', await mealButton())

// --- the tap ---------------------------------------------------------------
check('1a. tapping Log this meal', await tapMealButton())
const tapToCounter = await timeUntil(hero, '480', SLOW_MS * 4)
check(`1b. the counter moved (in ${tapToCounter}ms)`, tapToCounter !== null, await hero())
check(`1c. ...without waiting for the ${SLOW_MS}ms request`, tapToCounter !== null && tapToCounter < INSTANT_BUDGET_MS, tapToCounter)
check('1d. ...and the meal row says so too', (await mealButton()) === 'Logged', await mealButton())
await shoot('meal-counter-logged')

// --- and it is still right once the request it did not wait for lands ------
await wait(SLOW_MS + 2500)
check('1e. still right after the authoritative read finally answers', (await hero()) === '480', await hero())

// --- Home's own counter, on the way back ------------------------------------
await ev(`location.hash = '#/tab/dashboard'`)
const homeArrival = await timeUntil(homeCalories, '480', 40000)
check(`2a. Home shows the meal (in ${homeArrival}ms)`, homeArrival !== null, await homeCalories())
check('2b. ...off the corrected cache, not after its own slow reload', homeArrival !== null && homeArrival < INSTANT_BUDGET_MS + SLOW_MS, homeArrival)
await wait(SLOW_MS * 8)
check('2c. ...and still right once that reload lands', (await homeCalories()) === '480', await homeCalories())

// --- undo ------------------------------------------------------------------
await ev(`location.hash = '#/tab/nutrition'`); await wait(SLOW_MS + 5000)
await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => /Breakfast/i.test(b.textContent||'')); if (r[0]) r[0].click() })()`)
await wait(1000)
check('3a. the meal is still logged when the tab comes back', (await mealButton()) === 'Logged', await mealButton())
check('3b. tapping Logged to undo it', await tapMealButton())
const undoToCounter = await timeUntil(hero, '0', SLOW_MS * 4)
check(`3c. the counter drops back (in ${undoToCounter}ms)`, undoToCounter !== null, await hero())
check('3d. ...without waiting either — an undo of a SYNCED meal is not in the queue to remove', undoToCounter !== null && undoToCounter < INSTANT_BUDGET_MS, undoToCounter)
await wait(SLOW_MS + 2500)
check('3e. ...and the undo holds once the server answers', (await hero()) === '0', await hero())
await shoot('meal-counter-undone')

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe number moves when she taps, not when the network answers.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
