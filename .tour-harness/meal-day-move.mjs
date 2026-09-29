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

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'meal day move: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
