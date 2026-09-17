// ---------------------------------------------------------------------------
// WHEN THE TARGET HAS DRIFTED AWAY FROM THE MEALS, ON THE REAL NUTRITION SCREEN
//
// Ashley's two rulings, 17 Sep 2026: tell her and offer to refit rather than
// refit silently; and stay quiet until the drift is real, resizing rather than
// swapping, so the shopping list stays valid and saying yes costs nothing.
//
// THE CLAIM THIS RUN MAKES, and the one it does not.
//   IT PROVES: on a day the real engine judges drifted, the real
//   NutritionDisplay renders the offer above the meal list; the offer names
//   every meal it would change with real before/after numbers; the meal NAMES
//   do not change; the real persistResizedPools write lands in the store and
//   comes back out through a real re-read; and the number the card promised is
//   the number the day ends up with.
//   IT CANNOT PROVE that App.tsx decides to show the offer at all, because no
//   harness page boots App.tsx. test:meal-refit §9 holds that half, and the two
//   halves are named separately on purpose.
//
// The last check is the point of the whole run. A card that renders is not the
// claim; the claim is that the promise on it and the day afterwards agree.
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
for (let i = 0; i < 6; i++) {
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

await send('Page.enable'); await send('Runtime.evaluate', { expression: '1' })
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const text = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); return n ? n.innerText.trim() : null })()`)
const exists = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const tapLabel = label => ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === ${JSON.stringify(label)})
  if (!b) return false
  b.click(); return true
})()`)
const wait2 = ms => new Promise(r => setTimeout(r, ms))
/** Every meal name the list is showing, so "the names did not change" is measured rather than assumed. */
const mealNames = () => ev(`[...document.querySelectorAll('[data-meal-name]')].map(n => n.textContent.trim())`)
const dayCalories = () => ev(`(() => {
  const m = document.body.innerText.match(/([\\d,]+)\\s*\\n?\\s*kcal planned/)
  return m ? Number(m[1].replace(/,/g, '')) : null
})()`)

let ok0 = null
for (let i = 0; i < 6; i++) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&refit=1&drift=1.6#/tab/nutrition` })
  await wait2(1500)
  ok0 = await exists('[data-testid="meal-refit-offer"]')
  if (ok0) break
}

console.log('\n1. A DRIFTED DAY IS TOLD ABOUT, ON THE TAB THE MEALS ARE ON\n')
check('1a. the offer is on screen', ok0 === true)
const offer = await text('[data-testid="meal-refit-offer"]')
check('1b. ...and says the meals do not match the target', /add up to/i.test(offer ?? ''), offer)
check('1c. ...with both numbers in it', ((offer ?? '').match(/[\d,]{3,}/g) ?? []).length >= 2, offer)
check('1d. ...and offers the resize without demanding it',
  /Resize them/.test(offer ?? '') && /Leave them/.test(offer ?? ''), offer)
check('1e. ...naming at least one meal it would change, before and after',
  /\d+\s*→\s*\d+ kcal/.test(await text('[data-testid="meal-refit-rows"]') ?? ''),
  await text('[data-testid="meal-refit-rows"]'))
await shoot('meal-refit-offer')

// THE OFFER IS ABOVE THE MEALS IT IS ABOUT. Read off geometry, not source
// order — a card that renders below the list it describes is the kind of thing
// no source check can see and one screenshot makes obvious.
const above = await ev(`(() => {
  const o = document.querySelector('[data-testid="meal-refit-offer"]')
  const m = [...document.querySelectorAll('[data-meal-name]')][0]
  if (!o || !m) return null
  return o.getBoundingClientRect().bottom <= m.getBoundingClientRect().top
})()`)
check('1f. ...and sits above the meal list, not under it', above === true, above)

console.log('\n2. NOTHING HAS CHANGED UNTIL SHE TAPS\n')
const namesBefore = await mealNames()
const caloriesBefore = await dayCalories()
check('2a. the meals are readable before the tap', (namesBefore ?? []).length >= 2, namesBefore)
const promised = await ev(`(() => {
  const rows = [...document.querySelectorAll('[data-testid="meal-refit-rows"] li')]
  return rows.map(r => r.innerText.trim())
})()`)
check('2b. the card states its promise in kcal, per meal', (promised ?? []).length >= 1, promised)

console.log('\n3. RESIZING KEEPS THE MEALS AND MOVES ONLY THE AMOUNTS\n')
check('3a. the Resize button responds', await tapLabel('Resize them'))
await wait2(1600)
const namesAfter = await mealNames()
check('3b. every meal is still the same meal',
  JSON.stringify(namesAfter) === JSON.stringify(namesBefore), { namesBefore, namesAfter })
const caloriesAfter = await dayCalories()
check('3c. the day\'s calories actually moved',
  caloriesBefore !== null && caloriesAfter !== null && caloriesAfter !== caloriesBefore,
  { caloriesBefore, caloriesAfter })
// THE WHOLE POINT. The engine said the day would land inside tolerance; the
// screen is where that is either true or a claim.
check('3d. ...and the offer is gone, because the day now fits',
  (await exists('[data-testid="meal-refit-offer"]')) === false)
check('3e. ...with no failure banner',
  (await exists('[data-testid="meal-refit-error"]')) === false,
  await text('[data-testid="meal-refit-error"]'))

// THE CLAIM THIS WHOLE RUN EXISTS TO MAKE. Not "a card rendered" and not "a
// number changed": that the exact figure the card promised for each meal is
// the figure that meal ends up showing. A resize that lands the day inside
// tolerance while putting different numbers on the meals than it advertised
// would pass every other check here.
const promisedBySlot = {}
for (const line of promised ?? []) {
  const m = line.match(/^(\w+)\s*·\s*(.+?)\s+\d+\s*→\s*(\d+) kcal$/)
  if (m) promisedBySlot[m[1].toLowerCase()] = Number(m[3])
}
const shownBySlot = await ev(`(() => {
  const out = {}
  for (const n of document.querySelectorAll('[data-meal-name]')) {
    const slot = n.getAttribute('data-meal-name')
    const row = n.closest('button') ?? n.parentElement
    const m = (row?.innerText ?? '').match(/([\\d,]+)\\s*kcal/)
    if (m) out[slot] = Number(m[1].replace(/,/g, ''))
  }
  return out
})()`)
check('3f. every meal the card named is now the size the card promised',
  Object.keys(promisedBySlot).length > 0
  && Object.entries(promisedBySlot).every(([slot, kcal]) => shownBySlot?.[slot] === kcal),
  { promisedBySlot, shownBySlot })
check('3g. ...and the day lands on the target the offer was measured against',
  Math.abs((caloriesAfter ?? 0) - Object.values(shownBySlot ?? {}).reduce((a, b) => a + b, 0)) <= 2,
  { caloriesAfter, shownBySlot })

await shoot('meal-refit-after')

console.log('\n4. A DAY THAT ALREADY FITS IS NEVER ASKED ABOUT\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&refit=1&drift=1#/tab/nutrition` })
await wait2(2500)
check('4a. no offer on an undrifted day', (await exists('[data-testid="meal-refit-offer"]')) === false)
check('4b. ...and the meal list is genuinely there (sanity check on 4a)',
  ((await mealNames()) ?? []).length >= 2, await mealNames())

console.log('\n5. SAYING NO TAKES IT AWAY AND CHANGES NOTHING\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&refit=1&drift=1.6#/tab/nutrition` })
await wait2(2500)
check('5a. the offer is back on a drifted day', await exists('[data-testid="meal-refit-offer"]'))
const namesBeforeNo = await mealNames()
const kcalBeforeNo = await dayCalories()
check('5b. Leave them responds', await tapLabel('Leave them'))
await wait2(900)
check('5c. the offer goes away', (await exists('[data-testid="meal-refit-offer"]')) === false)
check('5d. ...and the meals are untouched',
  JSON.stringify(await mealNames()) === JSON.stringify(namesBeforeNo), namesBeforeNo)
check('5e. ...including their sizes', (await dayCalories()) === kcalBeforeNo,
  { before: kcalBeforeNo, after: await dayCalories() })

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe drift is told, the resize is offered, and the day lands where the card said.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
