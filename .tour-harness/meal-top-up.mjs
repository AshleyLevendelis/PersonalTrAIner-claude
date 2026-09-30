// ---------------------------------------------------------------------------
// MORE MEAL OPTIONS, AND TODAY DOES NOT MOVE — 28 Sep 2026.
//
// Ashley's ruling, from three options: "Button, keep today". A button on
// Nutrition tops each meal up to seven; today, and any day already on the
// shopping list, stay exactly as they are.
//
// WHICH HALF THIS PROVES. real.tsx (?topup=1) renders the real
// NutritionDisplay and MealPlan with a plan made at five options a meal and
// batch cooking on. TODAY COMES FROM THE APP'S OWN useMealDays, and the button
// runs the app's own topUpMealPlan over the fake database; only the meal
// generator is faked (?topupfail=1 makes it answer 502). So every day read
// below is the app's derivation before and after the tap. It does not boot
// App.tsx: that App gates the offer on the first build and wires the same
// function is held by test:meal-top-up.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9493', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9493/json/list').then(r => r.json())
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

const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const strip = () => ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
const tapDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(450) }
/** Everything a meal row shows collapsed: the dish and its calories, which is its portion. */
const dayOnScreen = () => ev(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => [e.dataset.mealName, (e.parentElement?.textContent || '').replace(/\\s+/g, ' ').trim()])))`)
const namesOnScreen = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => [e.dataset.mealName, e.textContent.trim()]))`)
/**
 * The lines an OPEN meal shows: "Last night's dinner." on a leftover lunch and
 * "Cook both portions together" on the dinner that feeds tomorrow. They are
 * only drawn once a meal is opened, so each is opened, read and closed.
 */
const openLines = async slot => {
  await ev(`document.querySelector('[data-meal-name="${slot}"]')?.closest('button')?.click()`)
  await wait(350)
  const lines = await ev(`JSON.stringify({ leftover: [...document.querySelectorAll('[data-meal-leftover]')].map(e => e.dataset.mealLeftover), cookBoth: [...document.querySelectorAll('[data-meal-cook-extra]')].map(e => e.dataset.mealCookExtra) })`)
  await ev(`document.querySelector('[data-meal-name="${slot}"]')?.closest('button')?.click()`)
  await wait(300)
  return lines
}
const readWeek = async () => {
  const days = await strip()
  const out = []
  for (const d of days) { await tapDay(d); out.push({ date: d, shown: await dayOnScreen(), names: await namesOnScreen() }) }
  await tapDay(days[0])
  return out
}
const offerText = () => ev(`document.querySelector('[data-testid="meal-top-up-offer"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null`)
const note = () => ev(`(() => {
  const n = document.querySelector('[data-testid="meal-top-up-note"]')
  if (!n) return null
  const r = n.getBoundingClientRect()
  return { text: n.querySelector('span')?.textContent.trim(), failed: n.dataset.failed, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.height > 0 }
})()`)
const tapButton = async label => {
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); b?.scrollIntoView({ block: 'center' }); b?.click(); return !!b })()`)
}
// A DISTINCT ADDRESS PER LOAD. Navigating to the address already open is a
// same-page jump to its #fragment and reloads nothing — which read, the first
// time, as "a fresh plan does not offer again".
let loads = 0
const load = async qs => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&topup=1&load=${++loads}&${qs}#/tab/nutrition` })
  for (let i = 0; i < 60; i++) { if (await has('[data-meal-day]')) break; await wait(200) }
  await wait(700)
}
const clearDismissal = () => ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('meal-top-up-dismissed')) localStorage.removeItem(k); return true })()`)
const weekday = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })

console.log('\n[1] A plan made at five options a meal is offered more')
await load('')
await clearDismissal()
await load('')
const offered = await offerText()
check('the offer is on Nutrition', offered !== null, offered)
check('...saying what she has and what it will do', /Your meals have 5 options each\. I can top each one up to 7, so your week repeats less\./.test(offered ?? ''), offered)
check('...and what it will not touch, before the tap', /Today, and any day on your shopping list, stay exactly as they are\./.test(offered ?? ''), offered)
check('...with a way to say not now', await ev(`[...document.querySelectorAll('[data-testid="meal-top-up-offer"] button')].map(b => b.textContent.trim()).join('|')`) === 'Get more options|Not now')
await ev(`document.querySelector('[data-testid="meal-top-up-offer"]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('meal-top-up-offer')

console.log('\n[2] Thursday to Saturday go on the shopping list first')
// THREE DAYS, CHOSEN BY THE BROKEN CODE. With only tomorrow on the list, the
// re-picked rotation happened to choose the same dinner for the held day, so
// the edge never needed a re-made leftover and two mutations came back
// MISSED. With Thursday to Saturday held, Saturday's dinner is not the one the
// new rotation would pick, so Sunday's lunch must be re-made from it.
const days = await strip()
check('seven days on the strip', days.length === 7, days)
const HELD = 4 // today and three list days
for (const d of days.slice(1, HELD)) {
  await tapDay(d)
  await ev(`document.querySelector('[data-testid="meal-day-add-grocery"]')?.click()`)
  for (let i = 0; i < 30; i++) { if ((await ev(`document.querySelector('[data-testid="meal-day-grocery"]')?.dataset.state`)) === 'added') break; await wait(150) }
}
await tapDay(days[0])
const listed = await ev(`window.__groceryRows().then(r => [...new Set(r.flatMap(x => x.meal_refs).map(m => m.date))].sort())`)
check('Thursday to Saturday are on the list', JSON.stringify(listed) === JSON.stringify(days.slice(1, HELD)), listed)
const before = await readWeek()
const todayLunchBefore = await openLines('lunch')
const todayDinnerBefore = await openLines('dinner')
// THE EDGE OF THE HELD DAYS, which is the case worth seeing: Saturday is held
// (on the list), Sunday is the first day new meals may appear, and Sunday's
// lunch is Saturday's dinner. The rotation re-picks Sunday, and its lunch
// must still be the dinner actually cooked the night before.
check('the sanity check: today\'s lunch is last night\'s dinner, and says so when opened', /"leftover":\["/.test(todayLunchBefore), todayLunchBefore)
check('the sanity check: the first new day\'s lunch is the last held day\'s dinner', !!before[HELD]?.names.lunch && before[HELD].names.lunch === before[HELD - 1]?.names.dinner, before.slice(HELD - 1, HELD + 1).map(d => d.names))
await tapDay(days[HELD - 1])
const edgeDinnerBefore = await openLines('dinner')
await tapDay(days[0])
check('...and that dinner says to cook both portions', /"cookBoth":\["/.test(edgeDinnerBefore), edgeDinnerBefore)

console.log('\n[3] Tapping it')
await tapButton('Get more options')
for (let i = 0; i < 60; i++) { if (await has('[data-testid="meal-top-up-note"]')) break; await wait(150) }
await wait(500)
const done = await note()
const from = days[HELD]
check('the receipt says how many were added, and from which day',
  done?.text === `Added 6 new meals. They start on ${weekday(from)}; every day before then stays as it was.`, done)
check('...marked as a success', done?.failed === 'false', done)
check('...where she can see it, not a scroll away', done?.onScreen === true, done)
check('the offer is gone: every meal has seven now', (await offerText()) === null)
await shoot('meal-top-up-done')

console.log('\n[4] Today and the shopping-list days did not move; the rest can')
const after = await readWeek()
const same = n => after[n]?.shown === before[n]?.shown
check('today is exactly as it was: every dish and its calories', same(0), { before: before[0]?.shown, after: after[0]?.shown })
check('...and its leftover and cook-both lines', (await openLines('lunch')) === todayLunchBefore && (await openLines('dinner')) === todayDinnerBefore, { todayLunchBefore, todayDinnerBefore })
check('every day on the shopping list is exactly as it was', [1, 2, 3].every(same), [1, 2, 3].filter(n => !same(n)).map(n => ({ before: before[n]?.shown, after: after[n]?.shown })))
await tapDay(days[HELD - 1])
const edgeDinnerAfter = await openLines('dinner')
await tapDay(days[0])
check('...Saturday\'s dinner still telling her to cook both portions', edgeDinnerAfter === edgeDinnerBefore, { edgeDinnerBefore, edgeDinnerAfter })
check('and Sunday, the first re-picked day, still has Saturday\'s dinner for lunch', after[HELD]?.names.lunch === after[HELD - 1]?.names.dinner, after.slice(HELD - 1, HELD + 1).map(d => d.names))
const freshBefore = after.slice(0, HELD).filter(d => /Fresh /.test(d.shown)).length
const freshFrom = after.slice(HELD).filter(d => /Fresh /.test(d.shown)).length
check('no new meal is served before its first day', freshBefore === 0, after.slice(0, HELD).map(d => d.shown))
check('...and new meals are served from it', freshFrom > 0, after.slice(HELD).map(d => d.shown))
// A NEW MEAL, OPENED: its labels are drawn only on an open card, and the
// first-day tag must not be one of them.
const newDay = after.findIndex(d => Object.values(d.names).some(n => /^Fresh /.test(n)))
const newSlot = newDay >= 0 ? Object.entries(after[newDay].names).find(([, n]) => /^Fresh /.test(n))?.[0] : null
if (newDay >= 0) await tapDay(days[newDay])
if (newSlot) { await ev(`document.querySelector('[data-meal-name="${newSlot}"]')?.closest('button')?.click()`); await wait(400) }
const openCard = await ev(`document.querySelector('[data-meal-name="${newSlot}"]')?.closest('.py-4')?.innerText ?? ''`)
check('a new meal, opened, never shows the app\'s bookkeeping as a label', !!newSlot && openCard.length > 0 && !/new-from/.test(openCard) && !(await ev(`document.body.innerText.includes('new-from')`)), openCard.slice(0, 200))
if (newSlot) { await ev(`document.querySelector('[data-meal-name="${newSlot}"]')?.closest('button')?.click()`); await wait(300) }
await tapDay(days[0])
const listNames = await ev(`window.__groceryRows().then(r => Object.fromEntries(${JSON.stringify(days.slice(1, 4))}.map(d => [d, [...new Set(r.flatMap(x => x.meal_refs).filter(m => m.date === d).map(m => m.mealName))].sort()])))`)
const shownNames = Object.fromEntries(after.slice(1, HELD).map(d => [d.date, Object.values(d.names).filter(Boolean).sort()]))
check('the list still shops for exactly what those days serve', JSON.stringify(listNames) === JSON.stringify(shownNames), { listNames, shownNames })

console.log('\n[5] "Not now" is remembered')
await load('')
check('a fresh plan offers again', (await offerText()) !== null)
await tapButton('Not now')
await wait(300)
check('"Not now" hides it', (await offerText()) === null)
await load('')
check('...and it stays hidden when she comes back', (await offerText()) === null)
await clearDismissal()

console.log('\n[6] When the meal generator cannot be reached, nothing changes and it says so')
await load('topupfail=1')
const todayBefore = await dayOnScreen()
await tapButton('Get more options')
for (let i = 0; i < 60; i++) { if (await has('[data-testid="meal-top-up-note"]')) break; await wait(150) }
await wait(400)
const failed = await note()
check('the receipt says the generator could not be reached and nothing has changed',
  failed?.text === "I couldn't reach the meal generator just then, so nothing has changed. Try again in a moment.", failed)
check('...marked as a failure', failed?.failed === 'true', failed)
check('...where she can see it', failed?.onScreen === true, failed)
check('today is exactly as it was', (await dayOnScreen()) === todayBefore)
await shoot('meal-top-up-failed')
await ev(`[...document.querySelectorAll('[data-testid="meal-top-up-note"] button')].find(b => b.textContent.trim() === 'Dismiss')?.click()`)
await wait(300)
check('dismissing the receipt brings the offer back for another go', (await offerText()) !== null)

console.log('\n[7] Seven dishes of which one fits is not seven options')
// A FULL plan (seven a meal), six of whose dinners are far too big for any
// day. The count-based offer has nothing to say about it; the fit offer does.
await load('topfit=1')
await clearDismissal()
await load('topfit=1')
const fitPlan = await ev(`window.__topUpPlan()`)
check('the fixture: seven dinners, none short by count, and only one that fits, so four are asked for and only three fit in the pool',
  fitPlan?.have?.dinner === 7 && Object.keys(fitPlan.short ?? {}).length === 0 && fitPlan.fewFit?.dinner === 1 && Object.keys(fitPlan.fewFit ?? {}).length === 1 && fitPlan.needs?.dinner === 3, fitPlan)
const fitOffered = await offerText()
check('the offer says how many of the seven dinners fit ( "fits" for one)',
  (fitOffered ?? '').startsWith('Only 1 of your 7 dinners fits your targets right now, so your dinners keep repeating. I can add some that do.'), fitOffered)
check('...and what it will not touch, before the tap', /Today, and any day on your shopping list, stay exactly as they are\./.test(fitOffered ?? ''), fitOffered)
check('...and it is not the count offer', !/options each/.test(fitOffered ?? ''), fitOffered)
check('...with the same two buttons', await ev(`[...document.querySelectorAll('[data-testid="meal-top-up-offer"] button')].map(b => b.textContent.trim()).join('|')`) === 'Get more options|Not now')
await ev(`document.querySelector('[data-testid="meal-top-up-offer"]')?.scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('meal-top-up-fit-offer')
const fitTodayBefore = await dayOnScreen()
await tapButton('Get more options')
for (let i = 0; i < 60; i++) { if (await has('[data-testid="meal-top-up-note"]')) break; await wait(150) }
await wait(500)
const fitDone = await note()
check('the receipt says three were added, from tomorrow (four would have been wanted, room for three)',
  fitDone?.text === 'Added 3 new meals. They start tomorrow; every day before then stays as it was.', fitDone)
check('...marked as a success, where she can see it', fitDone?.failed === 'false' && fitDone?.onScreen === true, fitDone)
check('the offer is gone', (await offerText()) === null)
const fitAfter = await ev(`window.__topUpPlan()`)
check('...because ten dinners are on the plan and four of them fit', fitAfter?.have?.dinner === 10 && Object.keys(fitAfter.fewFit ?? {}).length === 0 && Object.keys(fitAfter.needs ?? {}).length === 0, fitAfter)
check('today is exactly as it was', (await dayOnScreen()) === fitTodayBefore)
await shoot('meal-top-up-fit-done')
await load('topfit=1')
check('a fresh plan offers again', (await offerText()) !== null)
await tapButton('Not now')
await wait(300)
check('"Not now" hides the fit offer', (await offerText()) === null)
await load('topfit=1')
check('...and it stays hidden when she comes back', (await offerText()) === null)
await clearDismissal()

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'meal top-up: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
