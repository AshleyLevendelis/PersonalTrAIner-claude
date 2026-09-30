// ---------------------------------------------------------------------------
// SWAPPING A MEAL WITH ANOTHER DAY'S, ON THE REAL NUTRITION SCREEN, AT PHONE
// SIZE — 29 Sep 2026.
//
// Ashley: "Moving a meal to another day. Neither the screen nor the coach can
// do this yet." Her ruling, from three options: THEY SWAP PLACES.
//
// WHICH HALF THIS PROVES. real.tsx (?daymove=1) renders the real
// NutritionDisplay, MealPlan and Move sheet and calls the app's OWN useMealDays
// hook — the one App.tsx calls — with five options a meal and batch cooking on,
// over a fake database. So the day strip, the sheet, the card's text, the
// executor's two writes and the row that changes afterwards are the shipping
// code on the shipping data path. It does NOT boot App.tsx: that App hands the
// hook the way to show today's row is held by test:meal-day-move.
//
// THE CARD IS CHECKED AGAINST THE SCREEN, not against itself: the week is read
// off the strip before, the swap is confirmed, the week is read again, and every
// meal that changed is asked whether the card said so.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9413', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9413/json/list').then(r => r.json())
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
  for (let i = 0; i < 60; i++) { if (await ev(`!!document.querySelector('[data-testid="meal-day-strip"]')`)) break; await wait(200) }
  await wait(700)
}
await open()

const strip = () => ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => ({ date: b.dataset.mealDay, selected: b.getAttribute('aria-pressed') === 'true', text: b.textContent.trim() }))`)
const meals = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => [e.dataset.mealName, e.textContent.trim()]))`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ').trim() ?? null`)
const tapDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(450) }
const openSlot = async slot => {
  if (!(await ev(`!!document.querySelector('[data-testid="meal-move-open"]')`))) await ev(`document.querySelector('[data-meal-name="${slot}"]').closest('button').click()`)
  await wait(350)
}
const closeSheet = async () => { if (await has('[data-testid="meal-move-sheet"]')) { await ev(`document.querySelector('[data-testid="meal-move-open"]').click()`); await wait(250) } }
const openMove = async slot => {
  await ev(`(() => { const row = document.querySelector('[data-meal-name="${slot}"]'); if (!document.querySelector('[data-testid="meal-move-open"]')) row.closest('button').click() })()`)
  await wait(350)
  await ev(`document.querySelector('[data-testid="meal-move-open"]').click()`)
  await wait(350)
}
const readWeek = async days => {
  const w = {}
  for (const d of days) { await tapDay(d.date); w[d.date] = await meals() }
  return w
}
// ON SCREEN means above the fixed tab bar, not merely above the window's edge.
const inView = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const bar = document.querySelector('nav[aria-label="Primary"]'); const floor = bar ? bar.getBoundingClientRect().top : window.innerHeight; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= floor && r.height > 0 })()`)
/** What a person does before tapping a button: scroll it into view. */
const reach = sel => ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`)
const long = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const short = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })

console.log('\n[1] The week as it stands')
const days = await strip()
const today = days[0].date
const week0 = await readWeek(days)
check('seven days, each with three meals', days.length === 7 && Object.values(week0).every(m => Object.keys(m).length === 3), week0)
// A PAIR OF UPCOMING DAYS WITH DIFFERENT DINNERS, found rather than assumed.
const pairs = []
for (let i = 1; i < 7; i++) for (let j = i + 1; j < 7; j++) if (week0[days[i].date].dinner !== week0[days[j].date].dinner) pairs.push([days[i].date, days[j].date])
const [dA, dB] = pairs[0] ?? []
check('the fixture is under pressure: two upcoming days serve different dinners', !!dA && !!dB, pairs)
const dinnerA = week0[dA]?.dinner, dinnerB = week0[dB]?.dinner

console.log('\n[2] Move, on an upcoming day, offers the other days')
await tapDay(dA)
await openMove('dinner')
check('the row has a Move control on an upcoming day', await has('[data-testid="meal-move-open"]'))
check('the sheet is open', await has('[data-testid="meal-move-sheet"]'))
check('...with no meal to move it to (that is today\'s, not another day\'s)', !(await has('[data-testid="meal-move-to-lunch"]')) && !(await has('[data-testid="meal-move-to-snack"]')))
const dayButtons = await ev(`[...document.querySelectorAll('[data-testid^="meal-move-day-"]')].map(b => ({ date: b.dataset.testid.replace('meal-move-day-', ''), text: b.textContent.trim(), label: b.getAttribute('aria-label'), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))`)
check('it offers the six other days of the strip', dayButtons.length === 6 && !dayButtons.some(b => b.date === dA) && days.every(d => d.date === dA || dayButtons.some(b => b.date === d.date)), dayButtons.map(b => b.date))
check('...today named as Today, the others by weekday', dayButtons.find(b => b.date === today)?.text === 'Today' && dayButtons.find(b => b.date === dB)?.text === short(dB), dayButtons.map(b => b.text))
check('...each a thumb-sized target with its full name for a screen reader', dayButtons.every(b => b.h >= 44 && b.w >= 44) && dayButtons.find(b => b.date === dB)?.label === long(dB), dayButtons.map(b => [b.w, b.h, b.label]))
const tops = await ev(`[...document.querySelectorAll('[data-testid^="meal-move-day-"]')].map(b => Math.round(b.getBoundingClientRect().top))`)
check('...and all six sit on one row, none wrapped onto a line of its own', new Set(tops).size === 1, tops)
check('...and nothing is previewed until a day is chosen', !(await has('[data-testid="meal-move-preview"]')))

console.log('\n[3] The card, before the tap')
await reach(`[data-testid="meal-move-day-${dB}"]`)
await shoot('meal-day-move-days')
await ev(`document.querySelector('[data-testid="meal-move-day-${dB}"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-preview"]') || await has('[data-testid="meal-move-refusal"]')) break; await wait(150) }
const card = await text('[data-testid="meal-move-preview"]')
const rows = await ev(`[...document.querySelectorAll('[data-testid="meal-move-preview"] > p')].map(p => p.innerText.replace(/\\s+/g, ' ').trim())`)
check('a card is shown, not a refusal', !!card && !(await has('[data-testid="meal-move-refusal"]')), await text('[data-testid="meal-move-refusal"]'))
check('it names each day\'s dinner, with what it is now and what it becomes',
  rows.some(r => r.startsWith(`${long(dA)}'s dinner`) && r.includes(dinnerA) && r.includes(dinnerB))
  && rows.some(r => r.startsWith(`${long(dB)}'s dinner`) && r.includes(dinnerB) && r.includes(dinnerA)), rows)
check('...says they swap places, so both days keep a dinner', /swap places, so both days keep a dinner/.test(card ?? ''), card)
check('...and offers exactly one way forward: a button that says what it does', (await text('[data-testid="meal-move-confirm"]')) === 'Swap them', await text('[data-testid="meal-move-confirm"]'))
check('...and the card is on screen where the tap was', (await inView('[data-testid="meal-move-preview"]')) === true && (await inView('[data-testid="meal-move-confirm"]')) === true,
  await ev(`(() => { const bar = document.querySelector('nav[aria-label="Primary"]'); const f = s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.bottom)] : null }; const wrap = document.querySelector('[data-testid="meal-move-preview"]')?.parentElement; return { floor: bar?.getBoundingClientRect().top, preview: f('[data-testid="meal-move-preview"]'), confirm: f('[data-testid="meal-move-confirm"]'), h: window.innerHeight, scrollY: window.scrollY, docH: document.documentElement.scrollHeight, wrapCls: wrap?.className, wrapMb: wrap && getComputedStyle(wrap).scrollMarginBottom, scroller: document.scrollingElement?.tagName, bodyOverflow: getComputedStyle(document.body).overflow } })()`))
check('NOTHING IS SAVED before the tap', (await ev(`window.__mealPicks()`)).length === 0, await ev(`window.__mealPicks()`))
check('...and the strip still shows both days as they were', (await meals()).dinner === dinnerA)
await shoot('meal-day-move-card')

console.log('\n[4] The tap: both days now hold each other\'s dinner')
await reach('[data-testid="meal-move-confirm"]')
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-note"]')) break; await wait(150) }
const note = await text('[data-testid="meal-move-note"]')
check('it says what it did, naming both days', note === `${long(dA)}'s dinner and ${long(dB)}'s have swapped places.`, note)
check('...and the sheet has closed', !(await has('[data-testid="meal-move-sheet"]')))
check('the day now open shows the other day\'s dinner', (await meals()).dinner === dinnerB, await meals())
await shoot('meal-day-move-done')
const picks = await ev(`window.__mealPicks()`)
check('both days\' picks are saved, in the table a reload reads',
  picks.length === 2 && picks.some(p => p.date === dA && p.slot === 'dinner' && p.meal_name === dinnerB) && picks.some(p => p.date === dB && p.slot === 'dinner' && p.meal_name === dinnerA), picks)
await tapDay(dB)
check('the other day shows this one\'s', (await meals()).dinner === dinnerA, await meals())
// EVERY MEAL THAT CHANGED ON THE STRIP MUST HAVE BEEN ON THE CARD.
const week1 = await readWeek(days)
const changed = []
for (const d of days) for (const slot of ['breakfast', 'lunch', 'dinner']) {
  if ((d.date === dA || d.date === dB) && slot === 'dinner') continue
  if (week0[d.date][slot] !== week1[d.date][slot]) changed.push({ date: d.date, slot, to: week1[d.date][slot] })
}
const listed = rows.concat(await ev(`[...document.querySelectorAll('[data-testid="meal-move-preview"] p')].map(p => p.innerText)`) ?? [])
check('today is not touched unless the card said so', week1[today].dinner === week0[today].dinner || dA === today || dB === today)
const cardLines = card ?? ''
const missing = changed.filter(c => !new RegExp(`${c.date === today ? 'Today' : long(c.date)}'s ${c.slot} (becomes|goes from)`).test(cardLines)).filter(c => changed.length <= 4)
check('every other meal that changed was on the card before the tap', missing.length === 0, { changed, missing, card })
check('...and a card that changed nothing else said nothing else', changed.length > 0 || !/becomes|goes from/.test(cardLines), { changed, card })

console.log('\n[5] Today\'s row can be swapped too')
await tapDay(today)
const todayDinner = (await meals()).dinner
const other = days.slice(1).find(d => week1[d.date].dinner !== todayDinner)
await openMove('dinner')
check('today\'s row offers the meals AND the days', (await has('[data-testid="meal-move-to-lunch"]')) && (await has(`[data-testid="meal-move-day-${other.date}"]`)) && !(await has(`[data-testid="meal-move-day-${today}"]`)))
await reach(`[data-testid="meal-move-day-${other.date}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${other.date}"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
await wait(300)
const todayCard = await text('[data-testid="meal-move-preview"]')
check('the card speaks of "today", not a weekday, for today', /^Today's dinner/.test(todayCard ?? '') && !new RegExp(`${long(today)}`).test(todayCard ?? ''), todayCard)
await shoot('meal-day-move-today')
const wantToday = week1[other.date].dinner
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-note"]')) break; await wait(150) }
check('today\'s own row now shows the other day\'s dinner (today lives in a different place from the rest)', (await meals()).dinner === wantToday, await meals())
check('the note names today', /^Today's dinner and .+ have swapped places\.$/.test(await text('[data-testid="meal-move-note"]') ?? ''), await text('[data-testid="meal-move-note"]'))
check('today\'s pick is saved for today\'s date', (await ev(`window.__mealPicks()`)).some(p => p.date === today && p.slot === 'dinner' && p.meal_name === wantToday))
await tapDay(other.date)
check('...and the other day holds today\'s old dinner', (await meals()).dinner === todayDinner, await meals())

console.log('\n[6] A meal already eaten cannot move')
await tapDay(today)
await openSlot('breakfast')
await ev(`[...document.querySelectorAll('button')].find(b => /Log this meal/.test(b.textContent)).click()`)
await wait(900)
await openMove('breakfast')
const eatenTarget = days.find(d => d.date !== today && d.date !== dA)
await reach(`[data-testid="meal-move-day-${eatenTarget.date}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${eatenTarget.date}"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-refusal"]') || await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
await wait(300)
const eaten = await text('[data-testid="meal-move-refusal"]')
check('the refusal says why, in plain words', eaten === "You've already logged today's breakfast as eaten, so it can't move.", eaten)
check('...it is on screen where the tap was', (await inView('[data-testid="meal-move-refusal"]')) === true)
check('...and there is no button to swap them', !(await has('[data-testid="meal-move-confirm"]')))
await shoot('meal-day-move-eaten')
await closeSheet()

console.log('\n[7] A leftover lunch moves with its dinner, not on its own')
const leftoverDay = await (async () => {
  for (const d of days.slice(1)) {
    await tapDay(d.date)
    await ev(`document.querySelector('[data-meal-name="lunch"]').closest('button').click()`)
    await wait(300)
    if (await has('[data-meal-leftover]')) return d.date
  }
  return null
})()
check('the fixture is under pressure: one day\'s lunch is last night\'s dinner', !!leftoverDay)
if (leftoverDay) {
  await openMove('lunch')
  const dest = days.find(d => d.date !== leftoverDay && d.date !== today)
  await reach(`[data-testid="meal-move-day-${dest.date}"]`)
  await ev(`document.querySelector('[data-testid="meal-move-day-${dest.date}"]').click()`)
  for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-refusal"]') || await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
  await wait(300)
  const lo = await text('[data-testid="meal-move-refusal"]')
  check('a leftover lunch is refused, and the way through is named', new RegExp(`^${long(leftoverDay)}'s lunch is leftovers of the dinner the night before, so it can't be moved on its own\\. Move that dinner`).test(lo ?? ''), lo)
  check('...with no button to swap', !(await has('[data-testid="meal-move-confirm"]')))
  await shoot('meal-day-move-leftover')
  await closeSheet()
}

console.log('\n[8] A swap that does not fully save is put back, and says so')
await open()
const days8 = await strip()
const w8 = await readWeek(days8)
const pair8 = days8.slice(1).flatMap((a, i) => days8.slice(i + 2).map(b => [a.date, b.date])).find(([a, b]) => w8[a].dinner !== w8[b].dinner)
const [fA, fB] = pair8
await tapDay(fA)
await openMove('dinner')
await reach(`[data-testid="meal-move-day-${fB}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${fB}"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
await wait(300)
await reach('[data-testid="meal-move-confirm"]')
// The SECOND day's write will fail; the first goes through and must be taken back.
await ev(`window.__failWrite = (t, op, row) => t === 'meal_plan_picks' && op === 'upsert' && row.date === ${JSON.stringify(fB)}`)
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-error"]')) break; await wait(150) }
const err = await text('[data-testid="meal-move-error"]')
check('it says nothing was swapped, and why', err === "Nothing was swapped — the swap didn't save.", err)
check('...the message is on screen where the tap was', (await inView('[data-testid="meal-move-error"]')) === true)
await shoot('meal-day-move-failed')
check('the first day was NOT left holding the other day\'s dinner: nothing is saved', (await ev(`window.__mealPicks()`)).length === 0, await ev(`window.__mealPicks()`))
check('...and the screen still shows the day as it was', (await meals()).dinner === w8[fA].dinner, await meals())
await ev(`window.__failWrite = undefined`)
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-note"]')) break; await wait(150) }
check('and asking again, once the connection is back, works', (await meals()).dinner === w8[fB].dinner && (await ev(`window.__mealPicks()`)).length === 2, await meals())


console.log("\n[9] Two DIFFERENT meals: a dinner for another day's breakfast")
// The other day's lunch is left out on purpose: in this fixture every lunch is
// last night's dinner and is refused on its own ([7] shows that), so the pair
// is a dinner and a breakfast, and the leftover lunch that follows the dinner
// is the knock-on the card has to name.
const acrossSetup = async () => {
  await open()
  const dd = await strip()
  const w = await readWeek(dd)
  const aDate = dd[1].date, bDate = dd[2].date
  await tapDay(aDate)
  await openMove('dinner')
  return { dd, w, aDate, bDate, dinnerA: w[aDate].dinner, breakfastB: w[bDate].breakfast }
}
const across = await acrossSetup()
const { aDate: xA, bDate: xB, dinnerA: xDinner, breakfastB: xBreakfast } = across
const options0 = await ev(`window.__mealOptions()`)
check('no meal chips until a day is chosen', !(await has('[data-testid="meal-move-day-meals"]')))
await reach(`[data-testid="meal-move-day-${xB}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${xB}"]').click()`)
await wait(400)
const chips = await ev(`[...document.querySelectorAll('[data-testid^="meal-move-day-meal-"]')].map(b => ({ slot: b.dataset.testid.replace('meal-move-day-meal-', ''), pressed: b.getAttribute('aria-pressed') === 'true', h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))`)
check('a day chosen offers that day\'s three meals, the same meal already picked', chips.length === 3 && chips.filter(c => c.pressed).map(c => c.slot).join() === 'dinner', chips)
check('...each a thumb-sized target', chips.every(c => c.h >= 44 && c.w >= 44), chips)
await ev(`document.querySelector('[data-testid="meal-move-day-meal-breakfast"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-preview"]') || await has('[data-testid="meal-move-refusal"]')) break; await wait(150) }
await wait(300)
const xCard = await text('[data-testid="meal-move-preview"]')
const xRows = await ev(`[...document.querySelectorAll('[data-testid="meal-move-preview"] > p')].map(p => p.innerText.replace(/\\s+/g, ' ').trim())`)
check('choosing another meal shows a card, not a refusal', !!xCard && !(await has('[data-testid="meal-move-refusal"]')), await text('[data-testid="meal-move-refusal"]'))
check('the breakfast chip is now the picked one, the dinner chip is not', await ev(`document.querySelector('[data-testid="meal-move-day-meal-breakfast"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-testid="meal-move-day-meal-dinner"]').getAttribute('aria-pressed') === 'false'`))
check('it names each meal, what it is now and the resized copy it becomes',
  xRows.some(r => r.startsWith(`${long(xA)}'s dinner`) && r.includes(xDinner) && r.includes(`${xBreakfast} (as dinner)`))
  && xRows.some(r => r.startsWith(`${long(xB)}'s breakfast`) && r.includes(xBreakfast) && r.includes(`${xDinner} (as breakfast)`)), xRows)
check('...says they swap places AND that each is resized', new RegExp(`${long(xA)}'s dinner and ${long(xB)}'s breakfast swap places, and each is resized to fit the meal it lands in\\.`).test(xCard ?? ''), xCard)
check('...and the leftover lunch the dinner feeds is on the card', new RegExp(`${long(xB)}'s lunch becomes`).test(xCard ?? ''), xCard)
check('...one button that says what it does, on screen where the tap was', (await text('[data-testid="meal-move-confirm"]')) === 'Swap them' && (await inView('[data-testid="meal-move-confirm"]')) === true)
check('NOTHING IS SAVED before the tap: no pick, no new option', (await ev(`window.__mealPicks()`)).length === 0 && (await ev(`window.__mealOptions()`)).length === options0.length)
await shoot('meal-day-move-across-card')

await reach('[data-testid="meal-move-confirm"]')
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-note"]')) break; await wait(150) }
await wait(500)
const xNote = await text('[data-testid="meal-move-note"]')
check('it says what it did, each meal named', xNote === `${long(xA)}'s dinner and ${long(xB)}'s breakfast have swapped places, each resized to fit.`, xNote)
const xPicks = await ev(`window.__mealPicks()`)
check('both picks are saved, each naming the resized copy', xPicks.length === 2
  && xPicks.some(p => p.date === xA && p.slot === 'dinner' && p.meal_name === `${xBreakfast} (as dinner)`)
  && xPicks.some(p => p.date === xB && p.slot === 'breakfast' && p.meal_name === `${xDinner} (as breakfast)`), xPicks)
const options1 = await ev(`window.__mealOptions()`)
check('...and the two resized copies are options in their slots', options1.length === options0.length + 2
  && options1.some(o => o.slot === 'dinner' && o.name === `${xBreakfast} (as dinner)`) && options1.some(o => o.slot === 'breakfast' && o.name === `${xDinner} (as breakfast)`), options1.slice(options0.length))
check('the day now open shows the other day\'s breakfast as its dinner', (await meals()).dinner === `${xBreakfast} (as dinner)`, await meals())
await tapDay(xB)
check('the other day shows this dinner as its breakfast', (await meals()).breakfast === `${xDinner} (as breakfast)`, await meals())
const weekX = await readWeek(across.dd)
const changedX = []
for (const d of across.dd) for (const slot of ['breakfast', 'lunch', 'dinner']) {
  if ((d.date === xA && slot === 'dinner') || (d.date === xB && slot === 'breakfast')) continue
  if (across.w[d.date][slot] !== weekX[d.date][slot]) changedX.push({ date: d.date, slot })
}
check('every other meal that changed was on the card before the tap', changedX.every(c => new RegExp(`${c.date === across.dd[0].date ? 'Today' : long(c.date)}'s ${c.slot} (becomes|goes from)`).test(xCard ?? '')) && changedX.length > 0, { changedX, xCard })
console.log('\n[9b] Undo puts it all back')
// No tapping about between the swap and the Undo: the note and its Undo live on
// the row the swap was made from, and leaving the day closes that row.
const back = await acrossSetup()
const backOptions0 = await ev(`window.__mealOptions()`)
// The count the open row prints beside Swap ("Swap · 4 options"): it reads the options the SCREEN holds, so it moves when a copy is added and must move back when one is taken away.
const swapCount = () => ev(`(document.body.innerText.match(/Swap\\s*·\\s*(\\d+) options?/) || [])[1] ?? null`)
const countBefore = await swapCount()
await reach(`[data-testid="meal-move-day-${back.bDate}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${back.bDate}"]').click()`)
await wait(300)
await ev(`document.querySelector('[data-testid="meal-move-day-meal-breakfast"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
await wait(300)
await reach('[data-testid="meal-move-confirm"]')
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-undo"]')) break; await wait(150) }
await wait(300)
const undoBtn = await ev(`(() => { const b = document.querySelector('[data-testid="meal-move-undo"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: r.height, w: r.width, text: b.textContent.trim() } })()`)
check('an Undo sits beside the note, thumb-sized', !!undoBtn && undoBtn.text === 'Undo' && undoBtn.h >= 44 && undoBtn.w >= 44, undoBtn)
check('...and is on screen where the swap was made', (await inView('[data-testid="meal-move-undo"]')) === true)
check('...with the swap saved behind it (two picks, two resized copies)', (await ev(`window.__mealPicks()`)).length === 2 && (await ev(`window.__mealOptions()`)).length === backOptions0.length + 2)
await shoot('meal-day-move-across-done')
await ev(`document.querySelector('[data-testid="meal-move-undo"]').click()`)
for (let i = 0; i < 40; i++) { if (/^Put back/.test(await text('[data-testid="meal-move-note"]') ?? '')) break; await wait(150) }
await wait(500)
const backNote = await text('[data-testid="meal-move-note"]')
check('it says what it put back', backNote === `Put back: ${long(back.aDate)}'s dinner and ${long(back.bDate)}'s breakfast are as they were.`, backNote)
check('...the Undo is gone: there is nothing left to undo', !(await has('[data-testid="meal-move-undo"]')))
check('no pick is left behind', (await ev(`window.__mealPicks()`)).length === 0, await ev(`window.__mealPicks()`))
check('...and the resized copies are taken out of the options again', JSON.stringify(await ev(`window.__mealOptions()`)) === JSON.stringify(backOptions0), (await ev(`window.__mealOptions()`)).length)
check('the row shows the dinner it had', (await meals()).dinner === back.dinnerA, await meals())
check('...and offers as many options as before: the removed copy is not left in the list', countBefore !== null && (await swapCount()) === countBefore, [countBefore, await swapCount()])
await shoot('meal-day-move-across-undone')
const weekBack = await readWeek(back.dd)
check('the whole week reads exactly as it did before the swap', JSON.stringify(weekBack) === JSON.stringify(back.w), Object.keys(weekBack).filter(d => JSON.stringify(weekBack[d]) !== JSON.stringify(back.w[d])))

console.log('\n[9c] Undo does not overwrite a meal she changed since')
const again = await acrossSetup()
await reach(`[data-testid="meal-move-day-${again.bDate}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${again.bDate}"]').click()`)
await wait(300)
await ev(`document.querySelector('[data-testid="meal-move-day-meal-breakfast"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
await wait(300)
await reach('[data-testid="meal-move-confirm"]')
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-undo"]')) break; await wait(150) }
// A pick the swap wrote is changed behind its back, the way a later swap would.
await ev(`window.__mealPicks().find(p => p.slot === 'breakfast').meal_name = 'Something she chose after'`)
const picksTampered = JSON.stringify(await ev(`window.__mealPicks()`))
const optionsTampered = JSON.stringify(await ev(`window.__mealOptions()`))
await ev(`document.querySelector('[data-testid="meal-move-undo"]').click()`)
for (let i = 0; i < 40; i++) { if (/left both as they are/.test(await text('[data-testid="meal-move-note"]') ?? '')) break; await wait(150) }
await wait(300)
const refusedNote = await text('[data-testid="meal-move-note"]')
check('it says why nothing was put back', refusedNote === "One of those meals has changed since, so I've left both as they are.", refusedNote)
check('...neither day was touched', JSON.stringify(await ev(`window.__mealPicks()`)) === picksTampered && JSON.stringify(await ev(`window.__mealOptions()`)) === optionsTampered)
check('...and the Undo stays, in case she wants it later', await has('[data-testid="meal-move-undo"]'))
await shoot('meal-day-move-across-refused')

console.log('\n[9d] An Undo that does not save says so and keeps the swap')
const third = await acrossSetup()
await reach(`[data-testid="meal-move-day-${third.bDate}"]`)
await ev(`document.querySelector('[data-testid="meal-move-day-${third.bDate}"]').click()`)
await wait(300)
await ev(`document.querySelector('[data-testid="meal-move-day-meal-breakfast"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-confirm"]')) break; await wait(150) }
await wait(300)
await reach('[data-testid="meal-move-confirm"]')
await ev(`document.querySelector('[data-testid="meal-move-confirm"]').click()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="meal-move-undo"]')) break; await wait(150) }
const picksSwapped = JSON.stringify(await ev(`window.__mealPicks()`))
await ev(`window.__failWrite = (t, op) => t === 'meal_plan_picks' && op === 'delete'`)
await ev(`document.querySelector('[data-testid="meal-move-undo"]').click()`)
await wait(1200)
const failNote = await text('[data-testid="meal-move-note"]')
check('it does not claim to have put anything back', !/^Put back/.test(failNote ?? '') && /./.test(failNote ?? ''), failNote)
check('...the swap is still exactly as it was', JSON.stringify(await ev(`window.__mealPicks()`)) === picksSwapped)
check('...and the Undo is still there to try again', await has('[data-testid="meal-move-undo"]'))
await shoot('meal-day-move-across-undo-failed')
await ev(`window.__failWrite = undefined`)
await ev(`document.querySelector('[data-testid="meal-move-undo"]').click()`)
for (let i = 0; i < 40; i++) { if (/^Put back/.test(await text('[data-testid="meal-move-note"]') ?? '')) break; await wait(150) }
check('once the connection is back, Undo works', /^Put back/.test(await text('[data-testid="meal-move-note"]') ?? '') && (await ev(`window.__mealPicks()`)).length === 0)

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'meal day move: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
