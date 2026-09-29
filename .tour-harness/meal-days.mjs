// ---------------------------------------------------------------------------
// THE MEAL DAYS, ON THE REAL NUTRITION SCREEN, AT PHONE SIZE — 27 Sep 2026.
//
// Ashley: "I can only see today's meal, I can't see upcoming meals and I
// can't add things to the grocery list for future meals so I can plan
// ahead." Her ruling, from three options: a strip of days across the top of
// Nutrition — tap a day to see its meals, swap one, or add that day to the
// shopping list; today's screen stays as it is.
//
// WHICH HALF THIS PROVES. real.tsx renders the real NutritionDisplay and
// MealPlan and calls the app's OWN useMealDays hook — the one App.tsx calls —
// over the fake database, with a three-options-a-slot pool and the app's own
// rotation (?week=1). So the strip, the upcoming day, the swap, the saved pick
// and the list's rows below are the shipping code on the shipping data path.
// It does NOT boot App.tsx: that App hands the hook the same rotation and
// pools as today's own day is held by test:meal-days.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9412', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9412/json/list').then(r => r.json())
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&week=1#/tab/nutrition` })
for (let i = 0; i < 60; i++) { if (await ev(`!!document.querySelector('[data-testid="meal-day-strip"]')`)) break; await wait(200) }
await wait(600)

/** The strip as the screen shows it. */
const strip = () => ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => {
  const r = b.getBoundingClientRect()
  return { date: b.dataset.mealDay, selected: b.getAttribute('aria-pressed') === 'true', text: b.textContent.trim(), h: r.height, w: r.width }
})`)
/** Which meal is in which slot, off the rows' own test hooks. */
const meals = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => [e.dataset.mealName, e.textContent.trim()]))`)
const heading = () => ev(`document.querySelector('[data-testid="meal-day-heading"]')?.textContent.trim() ?? null`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const tapDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(500) }
const openSlot = async slot => { await ev(`document.querySelector('[data-meal-name="${slot}"]').closest('button').click()`); await wait(400) }
const buttonTexts = () => ev(`[...document.querySelectorAll('[data-meal-name]')].flatMap(e => [...e.closest('.py-4').querySelectorAll('button')].map(b => b.textContent.trim()))`)

console.log('\n[1] Today, with the strip across the top')
const days = await strip()
check('seven days, today first', days.length === 7 && days[0].text.startsWith('Today'), days.map(d => d.text))
check('...today is the one open', days[0].selected && days.slice(1).every(d => !d.selected), days.map(d => d.selected))
check('...and every day is a thumb-sized target', days.every(d => d.h >= 44 && d.w >= 44), days.map(d => [d.w, d.h]))
check('...consecutive calendar dates', days.every((d, i) => i === 0 || new Date(d.date + 'T00:00:00Z') - new Date(days[i - 1].date + 'T00:00:00Z') === 86_400_000), days.map(d => d.date))
check('the heading is today\'s', (await heading()) === "Today's meals", await heading())
check('today\'s rings are there', await has('[data-tour="rings"]'))
const todayMeals = await meals()
check('today has its three meals', Object.keys(todayMeals).length === 3, todayMeals)
await shoot('meal-days-today')

console.log('\n[2] An upcoming day')
// EVERY UPCOMING DAY IS OPENED AND READ, so "the week is not one day seven
// times" is counted rather than hoped for — the defect Ashley reported.
const week = {}
for (const d of days.slice(1)) {
  await tapDay(d.date)
  week[d.date] = await meals()
}
const keys = Object.values(week).map(m => JSON.stringify(m))
check('every upcoming day shows three meals', Object.values(week).every(m => Object.keys(m).length === 3), week)
check('the week is not one day seven times', new Set([JSON.stringify(todayMeals), ...keys]).size >= 2, new Set(keys).size)

const d2 = days[2].date
await tapDay(d2)
const after = await strip()
check('the tapped day is the open one', after.find(d => d.date === d2)?.selected === true && !after[0].selected, after.map(d => d.selected))
check('...and "Today" is still named, so the way back is not a guess', after[0].text.startsWith('Today'), after[0].text)
const dayName = new Date(d2 + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
check('the heading names the day', (await heading()) === `${dayName}'s meals`, { heading: await heading(), dayName })
check('today\'s rings step aside', !(await has('[data-tour="rings"]')))
check('the day has an add-to-list button, in its own words',
  (await ev(`document.querySelector('[data-testid="meal-day-add-grocery"]')?.textContent.trim()`)) === `Add ${dayName} to the shopping list`,
  await ev(`document.querySelector('[data-testid="meal-day-add-grocery"]')?.textContent.trim()`))
await openSlot('dinner')
const controls = await buttonTexts()
check('an upcoming meal offers no logging', !controls.some(t => /Log this meal/.test(t)), controls)
// RE-ANCHORED 29 Sep 2026: this said "no moving", true until Ashley's ruling
// that a meal can be swapped with another day's. What is still true, and is
// what this check now holds, is that an upcoming meal offers no move to
// another MEAL (that resize is today's, and needs today's budgets) and no
// food edits. verify:meal-day-move drives the day swap itself.
check('...no food edits, and no moving to another meal (only to another day)', !(await has('[data-testid="meal-food-add-open"]')) && !(await has('[data-ingredient-row]')) && (await has('[data-testid="meal-move-open"]')))
await ev(`document.querySelector('[data-testid="meal-move-open"]').click()`)
await wait(300)
check('...its Move sheet offers days and no meals', (await has('[data-testid^="meal-move-day-"]')) && !(await has('[data-testid^="meal-move-to-"]')))
await ev(`document.querySelector('[data-testid="meal-move-open"]').click()`)
await wait(200)
check('...but it can be swapped', controls.some(t => /^Swap/.test(t)), controls)
await shoot('meal-days-upcoming')

console.log('\n[3] Swapping a meal on that day')
const before = await meals()
await ev(`[...document.querySelectorAll('button')].find(b => /^Swap/.test(b.textContent.trim())).click()`)
await wait(300)
const choice = await ev(`(() => { const row = document.querySelector('[data-meal-name="dinner"]').closest('.py-4'); const b = [...row.querySelectorAll('button')].find(x => x.querySelector('p.line-clamp-2') && !x.disabled); return b ? b.querySelector('p').textContent.trim() : null })()`)
await ev(`(() => { const row = document.querySelector('[data-meal-name="dinner"]').closest('.py-4'); [...row.querySelectorAll('button')].find(x => x.querySelector('p.line-clamp-2') && !x.disabled).click() })()`)
await wait(900)
const swapped = await meals()
check('the swap offered a different dinner', !!choice && choice !== before.dinner, { before: before.dinner, choice })
check('...and that day now shows it', swapped.dinner === choice, swapped)
const picks = await ev(`window.__mealPicks()`)
check('...saved for THAT date, in the table a reload reads', picks.some(p => p.date === d2 && p.slot === 'dinner' && p.meal_name === choice), picks)
check('...and for no other date', picks.every(p => p.date === d2), picks)
await tapDay(days[0].date)
check('today is untouched', JSON.stringify(await meals()) === JSON.stringify(todayMeals), await meals())
for (const d of days.slice(1)) {
  if (d.date === d2) continue
  await tapDay(d.date)
  if (JSON.stringify(await meals()) !== JSON.stringify(week[d.date])) { week.__moved = d.date; break }
}
check('...and so is every other upcoming day', !week.__moved, week.__moved)
await tapDay(d2)
check('coming back, the swap is still there', (await meals()).dinner === choice, await meals())

console.log('\n[4] Putting the day on the shopping list')
await ev(`document.querySelector('[data-testid="meal-day-add-grocery"]').click()`)
for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'added') break; await wait(150) }
const receipt = await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.textContent.trim()`)
check('it says what it did, naming the day', /on your shopping list/.test(receipt ?? '') && receipt.includes(dayName), receipt)
await shoot('meal-days-added')
const rows = await ev(`window.__groceryRows().then(r => r.map(x => ({ key: x.canonical_key, qty: x.quantity, source: x.source, refs: x.meal_refs })))`)
const refs = rows.flatMap(r => r.refs)
check('the list gained that day\'s ingredients', rows.length > 0 && rows.every(r => r.source === 'generated'), rows.length)
check('...every one dated to that day and no other', refs.length > 0 && refs.every(r => r.date === d2), [...new Set(refs.map(r => r.date))])
check('...shopping for the SWAPPED dinner, not the one it replaced',
  refs.some(r => r.slot === 'dinner' && r.mealName === choice) && !refs.some(r => r.mealName === before.dinner && r.slot === 'dinner'),
  refs.filter(r => r.slot === 'dinner'))
check('...and for each of that day\'s three meals', new Set(refs.map(r => r.slot)).size === 3, [...new Set(refs.map(r => r.slot))])

await tapDay(days[3].date)
await tapDay(d2)
for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'already') break; await wait(150) }
check('opened again, the day says it is already on the list — before anything is tapped',
  (await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'already',
  await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.textContent.trim()`))

const d3 = days[3].date
await tapDay(d3)
for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'ready') break; await wait(150) }
await ev(`document.querySelector('[data-testid="meal-day-add-grocery"]').click()`)
for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'added') break; await wait(150) }
const rows2 = await ev(`window.__groceryRows().then(r => r.map(x => ({ key: x.canonical_key, qty: x.quantity, refs: x.meal_refs })))`)
const dates2 = [...new Set(rows2.flatMap(r => r.refs).map(r => r.date))].sort()
check('a second day adds to the list rather than replacing it', JSON.stringify(dates2) === JSON.stringify([d2, d3].sort()), dates2)
check('...one line per ingredient, not one per day', new Set(rows2.map(r => r.key)).size === rows2.length, rows2.map(r => r.key))
const shared = rows2.find(r => new Set(r.refs.map(x => x.date)).size === 2 && rows.some(y => y.key === r.key))
const firstQty = shared ? rows.find(y => y.key === shared.key)?.qty : undefined
check('...and an ingredient both days use carries both days\' amount', !!shared && firstQty != null && shared.qty > firstQty, { shared, firstQty })

// UNDO, right after an add — and only then.
await ev(`document.querySelector('[data-testid="meal-day-grocery-undo"]')?.click()`)
for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'ready') break; await wait(150) }
const rows3 = await ev(`window.__groceryRows().then(r => r.flatMap(x => x.meal_refs.map(m => m.date)))`)
check('Undo takes that day back off, and only that day', !rows3.includes(d3) && rows3.includes(d2), [...new Set(rows3)])
check('...and the button is back, ready to add it again',
  (await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'ready' && await has('[data-testid="meal-day-add-grocery"]'))
await tapDay(d2)
for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'already') break; await wait(150) }
check('a day already on the list when it opens offers no Undo — this visit did not add it', !(await has('[data-testid="meal-day-grocery-undo"]')))

console.log('\n[5] Back to today')
await tapDay(days[0].date)
check('the heading is today\'s again', (await heading()) === "Today's meals")
check('...the rings are back', await has('[data-tour="rings"]'))
await openSlot('breakfast')
check('...and today\'s meals can be logged, as before', (await buttonTexts()).some(t => /Log this meal/.test(t)))

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'meal days: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
