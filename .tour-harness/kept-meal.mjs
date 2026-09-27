// ---------------------------------------------------------------------------
// A KEPT MEAL THAT BREAKS A LATER RESTRICTION IS NOT SERVED — 27 Sep 2026.
//
// Ashley's ruling, from three options: "stop serving it". It stays in the
// hearted list, marked as clashing, never appears in a day while the
// restriction is on, and comes back if the restriction is lifted.
//
// WHICH HALF THIS PROVES. real.tsx (?week=1) renders the real
// NutritionDisplay and MealPlan through the app's own useMealDays AND
// useServablePools, the hooks App.tsx calls, over the fake database; ?kept=1
// adds a hearted dinner with mushrooms in it, ?avoid= a food she avoids. So
// every day read below is the app's marking and the app's assembly. It does
// not boot App.tsx; that App reads its pools through the same hook is held by
// test:kept-meal-restriction. Profile's half is read on profile.html.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
let page = '/.tour-harness/real.html'
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? page : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9491', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9491/json/list').then(r => r.json())
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

const RISOTTO = 'Chicken and mushroom risotto'
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const strip = () => ev(`[...document.querySelectorAll('[data-meal-day]')].map(b => b.dataset.mealDay)`)
const meals = () => ev(`Object.fromEntries([...document.querySelectorAll('[data-meal-name]')].map(e => [e.dataset.mealName, e.textContent.trim()]))`)
const tapDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(450) }
const notice = () => ev(`(() => {
  const s = [...document.querySelectorAll('span')].find(e => /no longer fits? your restrictions/.test(e.textContent || ''))
  if (!s) return null
  const r = s.getBoundingClientRect()
  return { text: s.textContent.trim(), onScreen: r.top >= 0 && r.bottom <= innerHeight && r.height > 0 }
})()`)
const loadWeek = async qs => {
  page = '/.tour-harness/real.html'
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&week=1&${qs}#/tab/nutrition` })
  for (let i = 0; i < 60; i++) { if (await has('[data-meal-day]')) break; await wait(200) }
  await wait(600)
}
/** Every one of the seven days, read off the screen by opening it. */
const readWeek = async () => {
  const days = await strip()
  const out = []
  for (const d of days) { await tapDay(d); out.push({ date: d, ...(await meals()) }) }
  await tapDay(days[0])
  return out
}

console.log('\n[1] The sanity check: with nothing avoided, the kept risotto IS served')
await loadWeek('kept=1')
const free = await readWeek()
const freeDays = free.filter(d => d.dinner === RISOTTO).length
check('seven days read off the strip', free.length === 7, free.map(d => d.date))
check(`the kept risotto is some day's dinner (${freeDays} of 7), so the next run has something to take away`, freeDays >= 1, free.map(d => d.dinner))

console.log('\n[2] Mushrooms avoided since: the risotto is not served on any day')
await loadWeek('kept=1&avoid=mushroom')
const avoided = await readWeek()
check('seven days read off the strip', avoided.length === 7)
check('the risotto is dinner on NONE of the seven days', avoided.every(d => d.dinner !== RISOTTO), avoided.map(d => d.dinner))
check('...and every day still has a dinner, breakfast and lunch', avoided.every(d => d.dinner && d.breakfast && d.lunch), avoided)
check('...so nothing says the day no longer fits: something else can be served', (await notice()) === null, await notice())
// STILL THERE, MARKED: the swap list shows it greyed with the reason, as the
// ruling asked ("stays ... marked as clashing"), rather than hiding it.
await ev(`document.querySelector('[data-meal-name="dinner"]').closest('button').click()`)
await wait(400)
await ev(`[...document.querySelectorAll('button')].find(b => /^Swap/.test(b.textContent.trim()))?.click()`)
await wait(400)
const listed = await ev(`(() => {
  const row = document.querySelector('[data-meal-name="dinner"]').closest('.py-4')
  const b = [...row.querySelectorAll('button')].find(x => (x.querySelector('p.line-clamp-2')?.textContent || '').trim() === ${JSON.stringify(RISOTTO)})
  return b ? { disabled: b.disabled, reason: [...b.querySelectorAll('p')].map(p => p.textContent.trim()).join(' | ') } : null
})()`)
check('the risotto is still in the swap list, greyed, saying why', !!listed && listed.disabled && /mushroom/i.test(listed.reason), listed)
await shoot('kept-meal-not-served')

console.log('\n[3] Every saved option clashes: the day says so rather than going quiet')
await loadWeek('avoid=chicken')
const today = await meals()
check('no meal is served that she avoids (every option is chicken)', Object.values(today).every(n => n === ''), today)
const rowNotes = await ev(`[...document.querySelectorAll('[data-testid="meal-slot-all-clash-note"]')].map(e => e.textContent.trim())`)
check('...and each slot says nothing saved fits, rather than that nothing was made', rowNotes.length === 3 && rowNotes.every(t => t === 'Nothing saved fits what you avoid'), rowNotes)
const n = await notice()
check('the day says its meals no longer fit her restrictions', !!n && /no longer fit/.test(n.text), n)
check('...where she can see it', n?.onScreen === true, n)
check('...with the way out beside it', await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Redo them')`))
const days3 = await strip()
await tapDay(days3[2])
const later = await notice()
check('an upcoming day says the same', !!later && /no longer fit/.test(later.text), later)
await shoot('kept-meal-all-clash')

console.log('\n[4] Profile: the clashing heart stays listed, marked')
page = '/.tour-harness/profile.html'
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?likes=1&keptclash=1` })
for (let i = 0; i < 60; i++) { if (await has('[data-slot="dialog-content"]')) break; await wait(200) }
await wait(800)
await ev(`(() => { const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^Nutrition$/i.test((x.textContent || '').trim())); if (b && b.getAttribute('aria-expanded') !== 'true') b.click() })()`)
for (let i = 0; i < 40; i++) { if (await has('[data-testid="profile-hearts-clash"]')) break; await wait(150) }
const hearts = await ev(`[...document.querySelectorAll('[data-hearted-meal]')].map(li => [li.dataset.heartedMeal, li.dataset.clashes])`)
check('the hearted risotto is still listed', hearts.some(([n]) => n === RISOTTO), hearts)
check('...marked as clashing, and the other hearts are not', hearts.every(([n, c]) => (n === RISOTTO) === (c === 'yes')), hearts)
const line = await ev(`document.querySelector('[data-testid="profile-hearts-clash"]')?.textContent.trim() ?? null`)
check('...with a line saying it is not served, and comes back if that changes',
  line === `${RISOTTO} clashes with what you avoid, so it isn't served. It comes back if that changes.`, line)
await ev(`document.querySelector('[data-testid="profile-hearts-clash"]').scrollIntoView({ block: 'center' })`)
await wait(300)
await shoot('kept-meal-profile')

const errs = await ev(`window.__errors ?? []`)
check('no page errors', (errs ?? []).length === 0, errs)
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? 'kept meal: all checks passed' : `${failures} check(s) failed`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
