// ---------------------------------------------------------------------------
// MOVING CALORIES FROM ONE MEAL TO ANOTHER, ON THE REAL NUTRITION SCREEN, AT
// PHONE SIZE — 20 Oct 2026.
//
// The live test of 19 Oct: "move some of lunch's calories to dinner" had no
// control anywhere. Ashley's ruling: "Ask how much first", with buttons, then
// both new sizes before the tap.
//
// WHICH HALF THIS PROVES. real.tsx (?daymove=1) renders the real
// NutritionDisplay, MealPlan and Move sheet and calls the app's OWN useMealDays
// hook — the one App.tsx calls — over a fake database. So the sheet, its
// question, its amount buttons, the card, the two writes, the rows afterwards
// and the Undo are the shipping code on the shipping data path. That App hands
// the coach the same controller is held by test:meal-rebalance; the coach's
// half is driven by verify:chat-rebalance.
//
// THE CARD IS CHECKED AGAINST THE SCREEN: the question's two sizes against the
// rows before, the card's after-sizes against the rows after the tap.
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

const PORT = 9562
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())
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

let ran = 0
let failures = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
let load = 0
const open = async () => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&daymove=1&load=${++load}#/tab/nutrition` })
  for (let i = 0; i < 60; i++) { if (await ev(`window.__poolsRead === true && !!document.querySelector('[data-testid="meal-day-strip"]')`)) break; await wait(200) }
  await wait(700)
}
await open()

const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ').trim() ?? null`)
const strip = () => ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
const tapDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(450) }
const names = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => [e.dataset.mealName, e.textContent.trim()]))`)
/** Every row collapsed, so each shows its kcal; then each row's kcal by slot. */
const collapseAll = () => ev(`(() => { for (const r of document.querySelectorAll('[data-meal-row]')) { const b = r.querySelector('button'); if (b && /· open/.test(b.textContent)) b.click() } })()`)
const kcals = async () => {
  await collapseAll(); await wait(300)
  return ev(`Object.fromEntries([...document.querySelectorAll('[data-testid="meal-row-kcal"]')].map(e => [e.dataset.slot, Number((e.textContent.match(/[\\d,]+/) || ['NaN'])[0].replace(/,/g, ''))]))`)
}
const openMove = async slot => {
  await collapseAll(); await wait(250)
  await ev(`document.querySelector('[data-meal-row="${slot}"] button').click()`)
  await wait(350)
  await ev(`document.querySelector('[data-meal-row="${slot}"] [data-testid="meal-move-open"]').click()`)
  await wait(350)
}
const reach = sel => ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`)
const tap = async sel => { await reach(sel); await wait(150); await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await wait(200) }
const until = async (fn, n = 40) => { for (let i = 0; i < n; i++) { if (await fn()) return true; await wait(150) } return false }
const inView = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const bar = document.querySelector('nav[aria-label="Primary"]'); const floor = bar ? bar.getBoundingClientRect().top : window.innerHeight; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= floor && r.height > 0 })()`)
const sizes = sel => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(b => ({ t: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))`)
const picks = () => ev(`window.__mealPicks()`)
const copies = () => ev(`window.__fakeDb.meal_plan_slots.filter(r => /\\((smaller|bigger)( \\d+)?\\)$/.test(r.name)).map(r => r.name)`)
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const long = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })

console.log('\n[1] Today as it stands')
const days = await strip()
const today = days[0]
const names0 = await names()
const kcal0 = await kcals()
check('today has a breakfast, a lunch and a dinner on screen, each with its kcal', ['breakfast', 'lunch', 'dinner'].every(s => names0[s] && kcal0[s] > 0), { names0, kcal0 })

console.log('\n[2] Move → "Or move some of its calories to…" → a meal: the APP asks how much')
await openMove('lunch')
check('the Move sheet is open on lunch', await has('[data-testid="meal-move-sheet"]'))
const mealBtns = await sizes('[data-testid="meal-rebalance-meals"] button')
check('it offers the day\'s OTHER meals to move calories to, not lunch itself', JSON.stringify(mealBtns.map(b => b.t)) === '["Breakfast","Dinner"]', mealBtns)
check('...each a thumb-sized target', mealBtns.every(b => b.h >= 44 && b.w >= 44), mealBtns)
check('...and nothing is asked or previewed until a meal is chosen', !(await has('[data-testid="meal-rebalance-ask"]')) && !(await has('[data-testid="meal-move-preview"]')))
await tap('[data-testid="meal-rebalance-to-dinner"]')
await until(() => has('[data-testid="meal-rebalance-ask"]'))
const askLine = await text('[data-testid="meal-rebalance-ask"]')
check('the question names both meals at the sizes the rows show, then asks how much',
  askLine === `Today's lunch is ${fmt(kcal0.lunch)} kcal and dinner ${fmt(kcal0.dinner)}. How much should I move from lunch to dinner?`, { askLine, kcal0 })
const amountBtns = await sizes('[data-testid="meal-rebalance-amounts"] button')
check('the amounts are buttons that say what they move and where', JSON.stringify(amountBtns.map(b => b.t)) === '["100 kcal to dinner","200 kcal to dinner","300 kcal to dinner"]', amountBtns)
check('...thumb-sized', amountBtns.every(b => b.h >= 44), amountBtns)
check('...and no card yet: asked first', !(await has('[data-testid="meal-move-preview"]')))
check('...the question and the buttons are on screen', (await inView('[data-testid="meal-rebalance-amounts"]')) === true)
await shoot('meal-rebalance-ask')

console.log('\n[3] An amount: both new sizes, before the tap')
await tap('[data-testid="meal-rebalance-kcal-200"]')
await until(() => has('[data-testid="meal-move-preview"]'))
const rows = await ev(`[...document.querySelectorAll('[data-testid="meal-move-preview"] > p')].map(p => p.innerText.replace(/\\s+/g, ' ').trim())`)
const rowFor = slot => rows.find(r => r.startsWith(`Today's ${slot} ·`)) ?? ''
const parse = r => { const m = /· ([\d,]+) kcal · (\d+) g protein → ([\d,]+) kcal · (\d+) g protein/.exec(r); return m ? { from: Number(m[1].replace(/,/g, '')), fromP: Number(m[2]), to: Number(m[3].replace(/,/g, '')), toP: Number(m[4]) } : null }
const lunchRow = parse(rowFor('lunch')), dinnerRow = parse(rowFor('dinner'))
check('the card names today\'s lunch by its dish, as it is now and as it will be', rowFor('lunch').includes(names0.lunch) && lunchRow?.from === kcal0.lunch, rows)
check('...about 200 kcal lighter', !!lunchRow && Math.abs(lunchRow.to - (kcal0.lunch - 200)) <= 15, lunchRow)
check('...and dinner about 200 kcal heavier', !!dinnerRow && dinnerRow.from === kcal0.dinner && Math.abs(dinnerRow.to - (kcal0.dinner + 200)) <= 15, dinnerRow)
check('...protein named on both, moving with the food', !!lunchRow && !!dinnerRow && lunchRow.toP < lunchRow.fromP && dinnerRow.toP > dinnerRow.fromP && rows.some(r => /Lunch goes down about \d+ g of protein and dinner up about \d+ g\./.test(r)), rows)
check('...and the day\'s total said', rows.some(r => /^Your day stays at about [\d,]+ kcal: the same food, moved from one meal to the other\.$/.test(r) || /re-fitted around these two/.test(r)), rows)
check('one way forward, saying what it does', (await text('[data-testid="meal-move-confirm"]')) === 'Move them')
check('...the card and its button on screen where the tap was', (await inView('[data-testid="meal-move-confirm"]')) === true)
check('nothing is written before the tap', (await picks()).length === 0 && (await copies()).length === 0, { picks: await picks(), copies: await copies() })
await shoot('meal-rebalance-card')

console.log('\n[4] Move them')
await tap('[data-testid="meal-move-confirm"]')
await until(() => has('[data-testid="meal-move-note"]'))
check('the note says what moved', (await text('[data-testid="meal-move-note"]')) === "Moved about 200 kcal from today's lunch to dinner.", await text('[data-testid="meal-move-note"]'))
check('...with an Undo beside it', await has('[data-testid="meal-move-undo"]'))
await shoot('meal-rebalance-done')
const p1 = await picks()
check('both of today\'s picks are saved, naming the resized copies', p1.length === 2 && p1.some(p => p.date === today && p.slot === 'lunch' && p.meal_name === `${names0.lunch} (smaller)`) && p1.some(p => p.date === today && p.slot === 'dinner' && p.meal_name === `${names0.dinner} (bigger)`), p1)
check('...and both copies are in the meals\' options', JSON.stringify((await copies()).sort()) === JSON.stringify([`${names0.dinner} (bigger)`, `${names0.lunch} (smaller)`].sort()), await copies())
const names1 = await names()
const kcal1 = await kcals()
check('the rows now show the two copies', names1.lunch === `${names0.lunch} (smaller)` && names1.dinner === `${names0.dinner} (bigger)`, names1)
check('...at exactly the sizes the card said', kcal1.lunch === lunchRow?.to && kcal1.dinner === dinnerRow?.to, { kcal1, lunchRow, dinnerRow })
check('...and breakfast as it was', names1.breakfast === names0.breakfast && kcal1.breakfast === kcal0.breakfast, { names1, kcal1 })
await shoot('meal-rebalance-rows-after')

console.log('\n[5] Undo puts both back exactly')
// The note and its Undo live on the row the move was made from; the row was collapsed to read the sizes, so reopen it
// (only the row: tapping Move again would start a new move and clear the note).
await collapseAll(); await wait(250)
await ev(`document.querySelector('[data-meal-row="lunch"] button').click()`)
await wait(350)
const undoThere = await has('[data-testid="meal-move-undo"]')
check('the Undo is still on lunch\'s row', undoThere)
if (undoThere) await tap('[data-testid="meal-move-undo"]')
await until(async () => /^Put back/.test(await text('[data-testid="meal-move-note"]') ?? ''))
check('the note says both are as they were', (await text('[data-testid="meal-move-note"]')) === "Put back: Today's lunch and dinner are as they were.", await text('[data-testid="meal-move-note"]'))
check('no picks and no copies are left', (await picks()).length === 0 && (await copies()).length === 0, { picks: await picks(), copies: await copies() })
const names2 = await names()
const kcal2 = await kcals()
check('the rows are back to their dishes at their sizes', JSON.stringify(names2) === JSON.stringify(names0) && JSON.stringify(kcal2) === JSON.stringify(kcal0), { names2, kcal2, names0, kcal0 })
await shoot('meal-rebalance-undone')

console.log('\n[6] An upcoming day of the strip works the same, on that day only')
const dX = days[2]
await tapDay(dX)
const namesX = await names()
const kcalX = await kcals()
await openMove('dinner')
await tap('[data-testid="meal-rebalance-to-breakfast"]')
await until(() => has('[data-testid="meal-rebalance-ask"]'))
check(`the question names ${long(dX)}`, (await text('[data-testid="meal-rebalance-ask"]'))?.startsWith(`${long(dX)}'s dinner is ${fmt(kcalX.dinner)} kcal and breakfast ${fmt(kcalX.breakfast)}.`), await text('[data-testid="meal-rebalance-ask"]'))
await tap('[data-testid="meal-rebalance-kcal-100"]')
await until(() => has('[data-testid="meal-move-confirm"]'))
await tap('[data-testid="meal-move-confirm"]')
await until(() => has('[data-testid="meal-move-note"]'))
const pX = await picks()
check('the two picks are for that day only', pX.length === 2 && pX.every(p => p.date === dX), pX)
const namesX1 = await names()
check('...and that day now serves the copies', namesX1.dinner === `${namesX.dinner} (smaller)` && namesX1.breakfast === `${namesX.breakfast} (bigger)`, namesX1)
await tapDay(today)
check('...while today is untouched', JSON.stringify(await names()) === JSON.stringify(names0) && JSON.stringify(await kcals()) === JSON.stringify(kcal0))

console.log('\n[7] A meal already eaten stays as eaten')
await ev(`window.__fakeDb.meal_events.push({ profile_id: window.__fakeDb.fitness_profiles[0].id, client_id: 'eaten-dinner', date: ${JSON.stringify(today)}, slot: 'dinner', event_type: 'confirmed', meal_name: 'Eaten dinner', macros: { kcal: 700, protein: 40, carbs: 80, fat: 20 }, source: 'manual', created_at: '${today}T18:00:00.000Z', voided_at: null })`)
await openMove('lunch')
await tap('[data-testid="meal-rebalance-to-dinner"]')
await until(() => has('[data-testid="meal-move-refusal"]'))
check('moving calories into today\'s dinner once it is logged is refused, in plain words', (await text('[data-testid="meal-move-refusal"]')) === "You've already logged today's dinner as eaten, so it stays as you ate it.", await text('[data-testid="meal-move-refusal"]'))
check('...with no amounts and no button', !(await has('[data-testid="meal-rebalance-amounts"]')) && !(await has('[data-testid="meal-move-confirm"]')))
check('...and the refusal is on screen', (await inView('[data-testid="meal-move-refusal"]')) === true)
await shoot('meal-rebalance-eaten')

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'meal rebalance: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
