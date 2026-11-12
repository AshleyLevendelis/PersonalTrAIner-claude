// verify:nutrition-week — the Nutrition Week handoff (his approval, 11 Nov 2026), on real.html at 390x844:
//   N1 today's rings card: five rings that match the rows under them, the calories left in the middle, every
//      number with its unit, "+ Water" logs water; M2 rows: the split bar is each macro's share of the meal's energy.
//   W1 a future day: violet on the strip, a planned card with no water ring, the engine's verdict, the add-to-list
//      inside the card and nowhere else.
//   W3 the week: seven rows, today first, the week's dates as the heading, one day open at a time, each total and
//      verdict the week's own, a meal opening its day, and "Shop the whole week" asking the list for 7 days.
//   And on grocery.html: a list asked for 7 days picks 7 (rebuilding from 3), and is left alone when already 7.
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p === '/grocery' ? '/.tour-harness/grocery.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const PORT = 9803
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
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let ran = 0
let failures = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol
const num = t => (t == null ? NaN : Number(String(t).replace(/,/g, '')))
const fmt = v => Math.round(v).toLocaleString('en-GB')

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const open = async (path, ready) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${path}` })
  for (let i = 0; i < 75; i++) { if (await ev(`!!document.querySelector(${JSON.stringify(ready)})`)) break; await wait(200) }
  await wait(700)
}
const click = async sel => { await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e?.scrollIntoView({ block: 'center' }); e?.click(); return !!e })()`); await wait(450) }

/** The rings card's rows: eaten and target as numbers, and the "left" words, by ring. */
const ringRows = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-nutrition-hero] [data-ring-key-row]')].map(r => {
  const mono = r.querySelector('.tabular-mono')
  const [eaten, target] = (mono?.textContent ?? '').split('/').map(s => s.trim())
  return [r.dataset.ringKeyRow, { eaten, target, left: r.querySelector('[data-ring-left]')?.textContent.trim() ?? '' }]
}))`)
const ringShare = (scope, key) => ev(`(() => { const c = document.querySelector('${scope} [data-ring="${key}"]'); return c ? c.dataset.share : null })()`)

await open('/?tour=off&week=1#/tab/nutrition', '[data-testid="meal-day-strip"]')

console.log('\n[N1] Today: one circle of five rings, a row for each')
const ringKeys = await ev(`[...document.querySelectorAll('[data-testid="today-rings"] [data-ring]')].map(c => c.dataset.ring)`)
check('five rings, outside in: water, calories, protein, carbs, fat', JSON.stringify(ringKeys) === JSON.stringify(['water', 'calories', 'protein', 'carbs', 'fat']), ringKeys)
check('the circle says what it shows, for a screen reader', /^Today so far: .+ kcal (left|over), protein .+ water .+ litres\.$/.test(await ev(`document.querySelector('[data-testid="today-rings"]')?.getAttribute('aria-label') ?? ''`)), await ev(`document.querySelector('[data-testid="today-rings"]')?.getAttribute('aria-label')`))
// Eat breakfast so the rings have something to show, and log half a litre.
await ev(`document.querySelector('[data-meal-name="breakfast"]').closest('button').click()`); await wait(500)
await click('[data-meal-log]')
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(500)
await click('[data-water-add]')
check('"+ Water" opens the quick-add', await ev(`!!document.querySelector('[data-water-quick-add]')`))
const waterBefore = num(await ringShare('[data-testid="today-rings"]', 'water'))
await click('[data-water-quick-add] button'); await click('[data-water-quick-add] button')
const rows = await ringRows()
check('the water row reads the half litre logged, in litres', rows.water?.eaten === '0.5' && /L$/.test(rows.water?.target ?? ''), rows.water)
check('...and the water ring moved with it', num(await ringShare('[data-testid="today-rings"]', 'water')) > (Number.isFinite(waterBefore) ? waterBefore : 0), [waterBefore, await ringShare('[data-testid="today-rings"]', 'water')])
check('breakfast counted: calories eaten are above zero', num(rows.calories?.eaten) > 0, rows.calories)
const unitOk = { calories: /^[\d,.]+$/, protein: /^[\d,.]+g$/, carbs: /^[\d,.]+g$/, fat: /^[\d,.]+g$/, water: /^[\d.]+L$/ }
for (const k of ['calories', 'protein', 'carbs', 'fat', 'water']) {
  const r = rows[k]
  const target = num(String(r?.target ?? '').replace(/[gL]$/, ''))
  const eaten = num(r?.eaten)
  const share = num(await ringShare('[data-testid="today-rings"]', k))
  // The rows are rounded (whole grams, two places of litres); the ring is not, so allow a rounding's worth.
  check(`${k}: the ring is the row's eaten over target, capped at 100%`, near(share, Math.min(1, eaten / target), 0.01), { share, eaten, target })
  check(`${k}: the target carries its unit (kcal by the row's name)`, unitOk[k].test(String(r?.target ?? '')), r?.target)
  const leftUnit = k === 'calories' ? '' : k === 'water' ? 'L' : 'g'
  check(`${k}: what is left says so, with its unit`, new RegExp(`^[\\d,.]+${leftUnit} (left|over)$`).test(r?.left ?? ''), r?.left)
}
const centre = await ev(`[document.querySelector('[data-testid="kcal-left-number"]')?.textContent, document.querySelector('[data-testid="kcal-left"]')?.textContent]`)
check('the middle is the calories left: target minus eaten', num(centre[0]) === num(rows.calories?.target) - num(rows.calories?.eaten) && centre[1] === 'kcal left', [centre, rows.calories])

console.log('\n[M2] Meal rows: the split bar is the meal\'s energy')
const mealRows = await ev(`[...document.querySelectorAll('[data-meal-row]')].map(r => {
  const grams = Object.fromEntries([...r.querySelectorAll('[data-macro]')].map(m => [m.dataset.macro, m.textContent.trim()]))
  const split = Object.fromEntries([...r.querySelectorAll('[data-split]')].map(s => [s.dataset.split, { share: Number(s.dataset.share), w: s.getBoundingClientRect().width }]))
  const label = r.querySelector('button span span span')?.textContent ?? ''
  return { slot: r.dataset.mealRow, variant: r.dataset.variant, grams, split, label: r.querySelector('button')?.textContent ?? '' }
})`)
check('three meal rows, each with its bar', mealRows.length === 3 && mealRows.every(m => Object.keys(m.split).length === 3), mealRows.map(m => Object.keys(m.split)))
for (const m of mealRows) {
  const g = { protein: parseFloat(m.grams.protein), carbs: parseFloat(m.grams.carbs), fat: parseFloat(m.grams.fat) }
  const kcal = g.protein * 4 + g.carbs * 4 + g.fat * 9
  check(`${m.slot}: each segment is that macro's share of the energy (fat at 9 a gram)`,
    ['protein', 'carbs', 'fat'].every(k => near(m.split[k]?.share, (g[k] * (k === 'fat' ? 9 : 4)) / kcal, 0.02)), { g, split: m.split })
  check(`${m.slot}: the legend names each macro in words, with grams`, /^\d+g protein$/.test(m.grams.protein ?? '') && /^\d+g carbs$/.test(m.grams.carbs ?? '') && /^\d+g fat$/.test(m.grams.fat ?? ''), m.grams)
}
const widths = mealRows[0]?.split
check('...and the segments are drawn to those shares (protein:carbs widths)', widths && near(widths.protein.w / widths.carbs.w, widths.protein.share / widths.carbs.share, 0.15), widths)
const eatenRow = mealRows.find(m => m.slot === 'breakfast')
check('an eaten meal says "· eaten"', /Breakfast · eaten/i.test(eatenRow?.label ?? ''), eatenRow?.label)
check('...and one not eaten does not', !/· eaten/i.test(mealRows.find(m => m.slot === 'dinner')?.label ?? 'x'))
await shoot('nutrition-week-n1')

console.log('\n[W1] A future day: its rings are its plan')
const days = await ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
const nw = () => ev(`(() => { const n = window.__nw; return { week: n.week.map(d => ({ date: d.date, dayName: d.dayName, totals: d.totals, names: Object.values(d.chosen).map(o => o.name) })), targets: n.targets } })()`)
const W = await nw()
const pick = 2
await click(`[data-meal-day="${days[pick]}"]`)
const tones = await ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDayTone)`)
check('the tapped day is the planned (violet) one; today is no longer selected', tones[pick] === 'planned' && tones[0] === 'none' && tones.filter(t => t !== 'none').length === 1, tones)
check('the heading is that day', (await ev(`document.querySelector('[data-testid="meal-day-heading"]')?.textContent`)) === W.week[pick].dayName)
const planned = await ev(`(() => { const c = document.querySelector('[data-planned-card]'); return c ? {
  rings: [...c.querySelectorAll('[data-ring]')].map(r => [r.dataset.ring, Number(r.dataset.share)]),
  verdict: c.querySelector('[data-testid="planned-verdict"]')?.textContent ?? null,
  verdictColor: c.querySelector('[data-testid="planned-verdict"]') ? getComputedStyle(c.querySelector('[data-testid="planned-verdict"]')).color : null,
  verdictIcon: !!c.querySelector('[data-verdict-icon]'),
  kicker: c.querySelector('[data-testid="planned-kicker"]')?.textContent ?? null,
  rows: Object.fromEntries([...c.querySelectorAll('[data-planned-row]')].map(r => [r.dataset.plannedRow, r.querySelector('.tabular-mono')?.textContent ?? ''])),
  addInCard: !!c.querySelector('[data-testid="meal-day-add-grocery"], [data-testid="meal-day-grocery"]'),
} : null })()`)
const D = W.week[pick]
// THE CALORIES SWATCH (his comment, 12 Nov 2026): every meal row's calories has the calories ring's colour beside it.
const swatches = await ev(`(() => { const ring = document.querySelector('[data-ring="calories"]'); const ringCol = ring ? getComputedStyle(ring).stroke : null; return { ringCol, rows: [...document.querySelectorAll('[data-meal-row]')].map(r => { const k = r.querySelector('[data-testid="meal-row-kcal"]'); const sw = k?.parentElement?.querySelector('[data-kcal-swatch]'); const b = sw?.getBoundingClientRect(); return sw ? { col: getComputedStyle(sw).backgroundColor, w: Math.round(b.width), before: !!(sw.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING) } : null }) } })()`)
check('every meal row has the calories swatch, 8px, in the calories ring colour, before the number', swatches.rows.length >= 3 && swatches.rows.every(r => r && r.w === 8 && r.col === swatches.ringCol && r.before), swatches)
check('a planned card, four rings and NO water ring (water is logged, never planned)', !!planned && planned.rings.map(r => r[0]).join() === 'calories,protein,carbs,fat', planned?.rings)
check('the kicker is the day and "planned"', planned?.kicker === `${D.dayName} ${Number(D.date.slice(8))} · planned`, planned?.kicker)
check('the verdict is the engine\'s dayVerdictLabel for that day', planned?.verdict === (await ev(`window.__nw.verdict(window.__nw.week[${pick}].totals, window.__nw.targets)`)), planned?.verdict)
for (const k of ['calories', 'protein', 'carbs', 'fat']) {
  check(`${k}: the row is planned/target${k === 'calories' ? '' : ' in grams'}, and the ring planned over target`,
    planned?.rows[k] === `${fmt(D.totals[k])}/${fmt(W.targets[k])}${k === 'calories' ? '' : 'g'}` && near(planned.rings.find(r => r[0] === k)?.[1], Math.min(1, D.totals[k] / W.targets[k]), 0.001),
    [planned?.rows[k], D.totals[k], W.targets[k]])
}
check('the add-to-list is in the card', planned?.addInCard === true)
check('...and nowhere else on the page', (await ev(`[...document.querySelectorAll('[data-testid="meal-day-add-grocery"], [data-testid="meal-day-grocery"]')].filter(e => !e.closest('[data-planned-card]')).length`)) === 0)
check('no second planned-total line under the card', !(await ev(`!!document.querySelector('[data-planned-day]')`)))
check('no "+ Water" and no water on a day not yet lived', !(await ev(`!!document.querySelector('[data-water-add], [data-nutrition-hero]')`)))
check('the meals have no status circles to tick (none can be eaten yet)', (await ev(`[...document.querySelectorAll('[data-meal-status]')].every(s => s.dataset.mealStatus === 'later')`)) === true)
await shoot('nutrition-week-w1')

console.log('\n[W3] The week on one screen')
await click('[data-testid="nutrition-week-toggle"]')
const wk = await ev(`(() => ({
  heading: document.querySelector('[data-testid="meal-day-heading"]')?.textContent,
  toggle: document.querySelector('[data-testid="nutrition-week-toggle"]')?.textContent.trim(),
  expanded: document.querySelector('[data-testid="nutrition-week-toggle"]')?.getAttribute('aria-expanded'),
  rows: [...document.querySelectorAll('[data-week-day]')].map(r => ({ date: r.dataset.weekDay, label: r.querySelector('[data-week-day-label]')?.textContent, kcal: r.querySelector('[data-week-day-kcal]')?.textContent, kcalCtx: r.querySelector('[data-week-day-kcal]')?.parentElement?.textContent.trim(), meals: r.querySelector('[data-week-day-meals]')?.textContent, h: r.querySelector('button').getBoundingClientRect().height })),
  strip: !!document.querySelector('[data-testid="meal-day-strip"]'),
}))()`)
const long = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
const expectRange = long(days[0]) === long(days[6]) ? `${Number(days[0].slice(8))} – ${Number(days[6].slice(8))} ${long(days[6])}` : `${Number(days[0].slice(8))} ${long(days[0])} – ${Number(days[6].slice(8))} ${long(days[6])}`
check('the heading is the week\'s dates', wk.heading === expectRange, [wk.heading, expectRange])
check('the pill reads "Week" and says it is open', /^Week/.test(wk.toggle ?? '') && wk.expanded === 'true', [wk.toggle, wk.expanded])
check('seven days, the strip\'s, today first and named "Today"', wk.rows.length === 7 && wk.rows.map(r => r.date).join() === days.join() && wk.rows[0].label === 'Today', wk.rows.map(r => [r.date, r.label]))
check('every other day is "Thu 17" style', wk.rows.slice(1).every(r => /^[A-Z][a-z]{2} \d{1,2}$/.test(r.label ?? '')), wk.rows.map(r => r.label))
check('each day\'s calories are its planned total, with "kcal" beside them', wk.rows.every((r, i) => num(r.kcal) === Math.round(W.week[i].totals.calories) && /kcal$/.test(r.kcalCtx ?? '')), wk.rows.map((r, i) => [r.kcal, W.week[i].totals.calories]))
check('each day lists its meals', wk.rows.every((r, i) => W.week[i].names.every(n => (r.meals ?? '').includes(n))), wk.rows.map(r => r.meals))
check('every row is a thumb-sized target', wk.rows.every(r => r.h >= 64), wk.rows.map(r => r.h))
const weekSw = await ev(`(() => { const ring = document.querySelector('[data-week-day] [data-ring="calories"]'); const ringCol = ring ? getComputedStyle(ring).stroke : null; return [...document.querySelectorAll('[data-week-day]')].map(r => { const sw = r.querySelector('[data-kcal-swatch]'); return !!sw && getComputedStyle(sw).backgroundColor === ringCol && !!(sw.compareDocumentPosition(r.querySelector('[data-week-day-kcal]')) & Node.DOCUMENT_POSITION_FOLLOWING) }) })()`)
check('each day row has the calories swatch before its calories, in the ring colour', weekSw.length === 7 && weekSw.every(Boolean), weekSw)
check('the strip steps aside in the week view', wk.strip === false)
const openRows = () => ev(`[...document.querySelectorAll('[data-week-day-open="yes"]')].map(r => r.dataset.weekDay)`)
await click(`[data-week-day="${days[2]}"] > button`)
check('a tap opens that day', JSON.stringify(await openRows()) === JSON.stringify([days[2]]), await openRows())
await click(`[data-week-day="${days[4]}"] > button`)
check('ONE AT A TIME: opening another closes the first', JSON.stringify(await openRows()) === JSON.stringify([days[4]]), await openRows())
const openDay = await ev(`(() => { const r = document.querySelector('[data-week-day-open="yes"]'); return { summary: r?.querySelector('[data-week-day-summary]')?.textContent, verdict: r?.querySelector('[data-testid="week-day-verdict"]')?.textContent, meals: [...(r?.querySelectorAll('[data-week-meal]') ?? [])].map(m => m.dataset.weekMeal), bars: r?.querySelectorAll('[data-meal-split]').length ?? 0 } })()`)
check('the open day says its total and the engine\'s verdict', openDay.verdict === (await ev(`window.__nw.verdict(window.__nw.week[4].totals, window.__nw.targets)`)) && openDay.summary?.startsWith(`${fmt(W.week[4].totals.calories)} kcal · `), openDay)
check('...and shows its meals, each with its split bar', openDay.meals.length === W.week[4].names.length && openDay.bars === openDay.meals.length, openDay)
await click(`[data-week-day="${days[4]}"] > button`)
check('tapping the open day closes it', (await openRows()).length === 0, await openRows())
await click(`[data-week-day="${days[3]}"] > button`)
await shoot('nutrition-week-w3')
await click(`[data-week-day="${days[3]}"] [data-week-meal]`)
check('a meal opens its day on the strip, and the week closes', (await ev(`document.querySelector('[data-meal-day-selected="yes"]')?.dataset.mealDay`)) === days[3] && !(await ev(`!!document.querySelector('[data-testid="nutrition-week"]')`)))
await click('[data-testid="nutrition-week-toggle"]')
const shop = await ev(`(() => { const b = document.querySelector('[data-testid="shop-whole-week"]'); return b ? { text: b.textContent.trim(), h: b.getBoundingClientRect().height } : null })()`)
check('"Shop the whole week" is at the foot, thumb-sized', shop?.text === 'Shop the whole week' && shop.h >= 44, shop)
await click('[data-testid="shop-whole-week"]')
const after = await ev(`({ hash: location.hash, days: window.__nw.takeGroceryDays(), again: window.__nw.takeGroceryDays() })`)
check('it opens the shopping list asking for 7 days, once', after.hash === '#/nutrition/grocery' && after.days === 7 && after.again === null, after)
await click('[data-testid="nutrition-week-toggle"]').catch(() => {})

console.log('\n[W1b] An OFF-target day says what is off (one on-target day cannot test the verdict)')
// The everyday test week is on target every day, so "always on target" would pass above. ?refit=1 drifts the targets,
// putting every day off: the card and the week must say the engine's words for it, in the warning colour.
await open('/?tour=off&week=1&refit=1&n=2#/tab/nutrition', '[data-testid="meal-day-strip"]')
const daysR = await ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
await click(`[data-meal-day="${daysR[3]}"]`)
const verdictProbe = sel => ev(`((sel) => { const v = document.querySelector(sel); if (!v) return null; const w = v.closest('[data-verdict-miss]'); const tmp = document.createElement('span'); document.body.appendChild(tmp); const col = c => { tmp.style.color = c; return getComputedStyle(tmp).color }; const out = { text: v.textContent, color: getComputedStyle(v).color, icon: !!w?.querySelector('[data-verdict-icon]'), fg: col('var(--foreground)'), mint: col('var(--primary-text)'), amber: col('var(--role-warn-text)'), carbs: col('var(--chart-4)') }; tmp.remove(); return out })(${JSON.stringify(sel)})`)
const offCard = await verdictProbe('[data-planned-card] [data-testid="planned-verdict"]')
const offWant = await ev(`window.__nw.verdict(window.__nw.week[3].totals, window.__nw.targets)`)
check('the off-target day is off by the engine (the fixture binds)', typeof offWant === 'string' && offWant !== 'on target', offWant)
check('...and the card says exactly that', offCard?.text === offWant, [offCard?.text, offWant])
await click('[data-testid="nutrition-week-toggle"]')
await click(`[data-week-day="${daysR[3]}"] > button`)
const offWeek = await verdictProbe('[data-week-day-open="yes"] [data-testid="week-day-verdict"]')
await shoot('nutrition-week-miss')
check('...and so does the week view', offWeek?.text === offWant, [offWeek?.text, offWant])
check('a miss is drawn in a different colour from "on target"', !!offCard && !!planned && offCard.color !== (await (async () => planned.verdictColor)()), [offCard?.color, planned?.verdictColor])
// HIS RULING 12 NOV 2026, option 1: a miss is in the ordinary text colour with a warning triangle, NEVER amber (it read
// as carbs). Read off both places a miss is said, against the theme's own colours.
check('a miss is in the text colour, never the warning amber or the carbs colour, on the card and in the week', [offCard, offWeek].every(v => !!v && v.color === v.fg && v.color !== v.amber && v.color !== v.carbs), [offCard, offWeek])
check('...with a warning triangle in front of it, in both places', [offCard, offWeek].every(v => v?.icon === true), [offCard?.icon, offWeek?.icon])
check('...and "on target" is mint, with no triangle', !!planned && planned.verdict === 'on target' && planned.verdictColor === offCard?.mint && planned.verdictIcon === false, [planned?.verdict, planned?.verdictColor, offCard?.mint, planned?.verdictIcon])

console.log('\n[List] The shopping list takes the 7 days')
const memo = () => ev(`(() => { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_grocery_built_v1:')); return k ? JSON.parse(localStorage.getItem(k)).days : null })()`)
await open('/grocery?built=3&asked=7', '[data-testid="grocery-hero"]')
await wait(800)
const pill7 = await ev(`document.querySelector('[data-testid="grocery-horizon"]')?.textContent.trim()`)
check('built over 3 days, asked for 7: the choice reads 7 days and the list was rebuilt for 7', pill7 === '7 days' && (await memo()) === 7, [pill7, await memo()])
await open('/grocery?built=7&asked=7&n=2', '[data-testid="grocery-hero"]')
await wait(800)
const toast = await ev(`document.querySelector('[data-testid="grocery-toast"]')?.textContent ?? null`)
check('already 7: left as it is, no rebuild', (await ev(`document.querySelector('[data-testid="grocery-horizon"]')?.textContent.trim()`)) === '7 days' && toast === null, toast)

console.log(`\n${ran} checks ran, ${failures} failed.`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 && ran > 0 ? 0 : 1)
