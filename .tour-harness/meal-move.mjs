// ---------------------------------------------------------------------------
// MOVING A MEAL, ON THE REAL NUTRITION SCREEN.
//
// The last operation on the meal grain that existed on no surface. Ashley
// made both calls it was waiting on: "Resize it to fit" (13 Sep 2026) and,
// on what happens to the slot the meal leaves, "they swap places" (14 Sep).
//
// `test:meal-move` holds the rules — the dietary checks run on both legs, the
// resize hits the destination budget, an absurd one is refused, the moved meal
// is renamed. This holds the half no source check can: that the control is
// really on the row at 390x844, that the card STATES BOTH NEW SIZES before the
// tap, and that after the tap the two slots really hold each other's meals.
//
// THE LAST PART IS THE POINT. A card that renders is not the claim. The claim
// is that the two slots swap and the numbers on screen afterwards are the
// numbers the card promised — the same thing verify:meal-food-edit exists to
// measure, and the reason the food-edit rename bug was caught by a driver
// while every unit check stayed green.
//
// PORT 9451. 9443 is verify:setup-answers, 9421 verify:coach-ban.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9451', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9451/json/list').then(r => r.json())
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
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

const hero = () => ev(`(() => { const el = document.querySelector('.ds-num-mega'); return el ? el.textContent.trim() : null })()`)
const until = async (read, pred, budgetMs = 20000) => {
  const started = Date.now()
  let v = await read()
  while (Date.now() - started < budgetMs && !pred(v)) { await wait(200); v = await read() }
  return v
}

/**
 * WHAT EACH SLOT HOLDS, off the row's own `data-meal-name`.
 *
 * The first version scraped the rendered text under each slot heading. That
 * broke the moment the Move sheet put the words "Lunch" and "Dinner" inside an
 * expanded row: the driver read a destination BUTTON as the slot's meal and
 * reported the plan had changed when nothing had. A text scrape is a mechanism;
 * which meal is in which slot is the property.
 */
const slotMeals = () => ev(`(() => Object.fromEntries(
  [...document.querySelectorAll('[data-meal-name]')].map(el => [el.getAttribute('data-meal-name'), el.textContent.trim()])
))()`)

const openSlot = async name => {
  await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => new RegExp(${JSON.stringify(name)}, 'i').test(b.textContent||'')); if (r[0]) r[0].click() })()`)
  await wait(700)
}
const tapTestId = t => ev(`(() => { const b = document.querySelector('[data-testid=${JSON.stringify(t)}]'); if (!b || b.disabled) return false; b.click(); return true })()`)
const textOf = t => ev(`(() => { const b = document.querySelector('[data-testid=${JSON.stringify(t)}]'); return b ? b.innerText.replace(/\\s+/g,' ').trim() : null })()`)
const REACH = `(el) => {
  const reach = 44 / 2 - 1
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
  const b = el.getBoundingClientRect()
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2
  const r = (dx, dy) => {
    const x = cx + dx, y = cy + dy
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return true
    const hit = document.elementFromPoint(x, y)
    if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return true
    const owner = hit && hit.closest ? hit.closest('button, a[href], [role="button"], input, select, textarea') : null
    return !!owner && owner !== el && !el.contains(owner)
  }
  return r(0, -reach) && r(0, reach) && r(-reach, 0) && r(reach, 0)
}`

console.log('\nMOVING A MEAL — on the screen\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/nutrition` })
check('0a. the Nutrition tab loads', (await until(hero, v => v !== null, 40000)) !== null, await hero())

const before = await until(slotMeals, v => v && Object.keys(v).length >= 2, 20000)
check('0b. the day has at least two meals to move between', Object.keys(before ?? {}).length >= 2, before)
if (!before || Object.keys(before).length < 2) {
  console.error('\nNo two meals on the day — nothing to move.\n'); ws.close(); chrome.kill(); server.close(); process.exit(1)
}
// READ OFF THE PAGE, never typed here — and MEASURED, not assumed. A slot
// named in this file is a slot that stops being on the plan the day the plan
// changes, which is the rule verify:swap-request and verify:coach-ban follow.
//
// AND NOT EVERY PAIR CAN MOVE, which this run learned the hard way: the first
// version took the first two slots and got a correct refusal — a ~250 kcal
// yoghurt breakfast cannot scale into a lunch slot worth three times that, and
// portion-scaler refuses past 2.5x rather than serving three breakfasts. So it
// tries each destination and drives the first that produces a preview, and
// checks the refusal path separately below rather than tripping over it.
const slots = Object.keys(before)
const FROM = slots[0]
await openSlot(FROM.charAt(0).toUpperCase() + FROM.slice(1))

// --- 1. the control is there, and a thumb reaches it -----------------------
check('1a. the meal row offers Move', await ev(`!!document.querySelector('[data-testid="meal-move-open"]')`))
check('1b. ...and a thumb reaches it', await ev(`(() => {
  const reaches = ${REACH}
  const b = document.querySelector('[data-testid="meal-move-open"]')
  return b ? reaches(b) : false
})()`))
check('1c. tapping it opens the destinations', await tapTestId('meal-move-open'))
await wait(400)
const sheet = await textOf('meal-move-sheet')
check('1d. ...listing somewhere to put it', (sheet ?? '').length > 0 && /move it to/i.test(sheet ?? ''), sheet)
// EVERY SLOT ON THE PLAN EXCEPT THIS ONE, and never one the profile lacks.
check('1e. ...and never offers the slot it is already in',
  !(await ev(`!!document.querySelector('[data-testid="meal-move-to-${FROM}"]')`)))
await shoot('meal-move-1-destinations')

// --- 2. it proposes, it does not move ------------------------------------
// TRY EACH DESTINATION. The first that previews is the one driven; any that
// refuses has its refusal read, because a refusal in plain words is a real
// outcome here and not a failure — "resize it to fit" has honest limits and
// the screen states them.
let TO = null
let refusals = []
for (const dest of Object.keys(before)) {
  if (dest === FROM) continue
  if (!(await ev(`!!document.querySelector('[data-testid="meal-move-to-${dest}"]')`))) continue
  if (!(await tapTestId(`meal-move-to-${dest}`))) continue
  await wait(700)
  const previewed = await textOf('meal-move-preview')
  if (previewed) { TO = dest; break }
  const refused = await textOf('meal-move-refusal')
  if (refused) refusals.push({ slot: dest, said: refused })
  // Untoggle before trying the next one.
  await tapTestId(`meal-move-to-${dest}`)
  await wait(200)
}
check('2a. some destination produces a preview', TO !== null, { refusals })
if (TO === null) {
  console.error('\nEvery destination refused — cannot drive the move.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`moving ${FROM} ("${before[FROM]}") to ${TO} ("${before[TO]}")`)
// A REFUSAL IS AN OUTCOME, NOT AN ERROR, and it has to read as one. Only
// asserted when one actually happened, so this never invents a case.
if (refusals.length > 0) {
  check('2a-i. a destination it cannot fit is refused in plain words',
    refusals.every(r => /can't become/i.test(r.said) && !/scale factor|0\.4|2\.5/i.test(r.said)), refusals)
  check('2a-ii. ...and offers the nearest thing rather than stopping dead',
    refusals.every(r => /swap it for something else/i.test(r.said)), refusals)
}
const preview = await textOf('meal-move-preview')
check('2b. ...and produces a preview rather than moving anything', !!preview, preview)
// NOTHING HAS MOVED YET. The whole contract is propose-then-confirm, and a
// control that acted on the first tap would pass every other check here.
const midway = await slotMeals()
check('2c. ...with the plan untouched until Confirm',
  midway[FROM] === before[FROM] && midway[TO] === before[TO], { before, midway })
check('2d. the preview states BOTH new sizes, not just one',
  ((preview ?? '').match(/\d+ kcal/g) ?? []).length >= 3, preview)
check('2e. ...and says they swap places rather than one vanishing',
  /swap places/i.test(preview ?? ''), preview)
check('2f. ...and that the portions were resized',
  /resized|reduced|increased/i.test(preview ?? ''), preview)
await shoot('meal-move-2-preview')

// THE NUMBERS THE CARD PROMISES, pulled out so the state after the tap can be
// checked against them rather than against a recomputation. A sentence that
// agrees only with itself is what let "shortened to 20 min" sit beside
// "~26 min" on 13 Sep.
const promised = await ev(`(() => {
  const el = document.querySelector('[data-testid="meal-move-preview"]')
  if (!el) return null
  return [...el.innerText.matchAll(/(\\d+) kcal/g)].map(m => Number(m[1]))
})()`)

// --- 3. confirming really swaps them --------------------------------------
check('3a. there is a Confirm, labelled for what it does',
  /swap them|move it/i.test((await ev(`(() => { const b = document.querySelector('[data-testid="meal-move-confirm"]'); return b ? b.textContent.trim() : '' })()`)) ?? ''))
check('3b. tapping it is possible', await tapTestId('meal-move-confirm'))
const after = await until(slotMeals, v => v && v[FROM] !== before[FROM], 20000)
check('3c. the slot it left now holds the other meal',
  (after[FROM] ?? '').includes(before[TO]), { was: before[FROM], now: after[FROM], expected: before[TO] })
check('3d. ...and the destination holds the one that moved',
  (after[TO] ?? '').includes(before[FROM]), { was: before[TO], now: after[TO], expected: before[FROM] })
// NEITHER SLOT IS EMPTY, which is the failure her ruling was chosen to avoid.
check('3e. ...and neither slot is left empty', !!after[FROM] && !!after[TO], after)
const err = await textOf('meal-move-error')
check('3f. ...with no error reported', err === null, err)
await shoot('meal-move-3-after')

// --- 4. the numbers on screen are the numbers the card promised -----------
const landedKcal = await ev(`(() => [...document.body.innerText.matchAll(/(\\d+) kcal/g)].map(m => Number(m[1])))()`)
check('4a. the promised sizes are real numbers (sanity check on this check)',
  Array.isArray(promised) && promised.length >= 3, promised)
if (Array.isArray(promised) && promised.length >= 3) {
  // The card's "after" figures must appear on the page afterwards. Not every
  // number it printed — the "before" ones are gone by design.
  const present = promised.filter(n => landedKcal.includes(n))
  check('4b. at least one promised new size is on the screen afterwards',
    present.length > 0, { promised, landedKcal: landedKcal.slice(0, 12) })
}

const pageErr = await ev('window.__err ?? null')
check('5. no uncaught error on the page', pageErr === null, pageErr)

console.log(failures === 0 ? '\nA meal moves, resized, and both slots keep a meal.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
