// verify:flexible-nutrition — strategy slice 4 (13 Nov 2026, docs/plans/flexible-nutrition.md), on real.html at 390x844:
//   [A] the week view's "This week so far" line: finished days, logged days only, said with how many;
//   [B] "Freestyle this day": the day's meals become his empty choices, the line is its own (never "on target"), an
//       empty choice cannot be logged, and "Back to the plan" restores the plan's dishes;
//   [C] the starter tier (Profile "Show numbers" off): no calorie or gram figure on Nutrition, its week view or Home,
//       the day counts meals instead, and the same screens show figures with the switch on.
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

const PORT = 9927
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


// ---------------------------------------------------------------------------
console.log('\n[A] The week so far (4d), with the numbers on')
await open('/?tour=off&pastate=1#/tab/nutrition', '[data-testid="meal-day-strip"]')
await click('[data-testid="nutrition-week-toggle"]')
await wait(600)
const weekLine = await ev(`document.querySelector('[data-testid="week-average"]')?.textContent ?? null`)
check('the week view says the average of the days he logged, against target, and how many',
  /^This week so far: 2,400 kcal a day against [\d,]+, protein 170 g against \d+ \(1 day logged of 2\)\.$/.test(weekLine ?? ''), weekLine)
await shoot('flexible-week-average')

console.log('\n[B] Freestyle this day (4a)')
await open('/?tour=off&regen=1&daymove=1#/tab/nutrition', '[data-testid="meal-day-strip"]')
const before = await ev(`({ names: [...document.querySelectorAll('[data-meal-name]')].map(n => n.textContent.trim()), verdict: document.querySelector('[data-testid="day-verdict"]')?.textContent ?? null, offer: document.querySelector('[data-testid="freestyle-on"]')?.textContent.trim() ?? null, h: document.querySelector('[data-testid="freestyle-on"]')?.getBoundingClientRect().height ?? 0 })`)
check('the day offers "Freestyle this day", as a 44px control', before.offer === 'Freestyle this day' && before.h >= 44, before)
check('...and the plan\'s day is the plan\'s own (no freestyle meal yet)', before.names.length > 0 && !before.names.some(n => /^Your \w+ choice/.test(n)), before.names)
await click('[data-testid="freestyle-on"]')
await wait(900)
const on = await ev(`({ line: document.querySelector('[data-testid="freestyle-line"]')?.textContent ?? null, names: [...document.querySelectorAll('[data-meal-name]')].map(n => n.textContent.trim()), verdict: document.querySelector('[data-testid="day-verdict"]')?.textContent ?? null, back: document.querySelector('[data-testid="freestyle-back"]')?.textContent.trim() ?? null })`)
check('the line says the day is freestyle and how to log it', on.line === 'Today is freestyle: eat what you like and log it as you go. Add food to a meal, or tell the coach.', on.line)
check('every meal of the day is now his choice, named for the day', on.names.length === before.names.length && on.names.every(n => /^Your (breakfast|lunch|dinner|snack) choice \(Wednesday\)$/.test(n)), on.names)
check('the day\'s line is its own, never "on target"', on.verdict === 'Freestyle · log what you eat', on.verdict)
check('...and "Back to the plan" is offered in its place', on.back === 'Back to the plan', on.back)
await shoot('flexible-freestyle-on')
await ev(`document.querySelector('[data-meal-name]').closest('button').click()`); await wait(600)
const sheet = await ev(`({ note: document.querySelector('[data-testid="freestyle-row-note"]')?.textContent ?? null, log: (() => { const b = document.querySelector('[data-meal-log]'); return b ? { disabled: b.disabled, text: b.textContent.trim() } : null })() })`)
check('an empty choice says to add what he ate, and cannot be logged as eaten', sheet.note === 'Freestyle: add what you ate, or tell the coach, then log it.' && sheet.log?.disabled === true, sheet)
await shoot('flexible-freestyle-sheet')
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(500)
await click('[data-testid="freestyle-back"]')
await wait(900)
const back = await ev(`({ line: document.querySelector('[data-testid="freestyle-line"]')?.textContent ?? null, names: [...document.querySelectorAll('[data-meal-name]')].map(n => n.textContent.trim()), verdict: document.querySelector('[data-testid="day-verdict"]')?.textContent ?? null })`)
check('"Back to the plan" puts the plan\'s own dishes back', JSON.stringify(back.names) === JSON.stringify(before.names), { before: before.names, after: back.names })
check('...says so, and the day line is the plan\'s again', back.line === 'Today is back on the plan.' && back.verdict === before.verdict, back)

console.log('\n[C] Show numbers off (4b): the starter tier')
await open('/?tour=off&pastate=1&numbers=off#/tab/nutrition', '[data-testid="meal-day-strip"]')
await wait(400)
const starter = await ev(`(() => { const main = document.querySelector('main') ?? document.body; return { text: main.innerText, line: document.querySelector('[data-testid="starter-day-line"]')?.textContent ?? null, rings: document.querySelectorAll('[data-testid="today-rings"] [data-ring]').length } })()`)
const figures = (starter.text.match(/\d[\d,]*\s*(kcal|cal\b|g protein|g carbs|g fat|g\b)/gi) ?? [])
const where = await ev(`[...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && /\\d[\\d,]*\\s*(kcal|g\\b)/i.test(e.textContent)).map(e => { let p = e, path = []; for (let i = 0; i < 6 && p; i++) { path.push((p.dataset?.testid ?? '') || p.tagName); p = p.parentElement } return e.textContent.trim().slice(0, 60) + ' <- ' + path.join('<') })`)
check('Nutrition shows no calorie or gram figure anywhere', figures.length === 0, where)
check('...the day says how many meals instead', /^(\d+ meals planned|Logged \d+ of \d+ meals)$/.test(starter.line ?? ''), starter.line)
check('...and no macro rings are drawn', starter.rings === 0, starter.rings)
await shoot('flexible-starter-nutrition')
await click('[data-testid="nutrition-week-toggle"]'); await wait(600)
const starterWeek = await ev(`({ line: document.querySelector('[data-testid="week-average"]')?.textContent ?? null, text: (document.querySelector('main') ?? document.body).innerText })`)
check('the week line counts the days logged, with no figure', starterWeek.line === 'This week so far: food logged on 1 day of 2.', starterWeek.line)
check('...and the week view shows no calorie or gram figure', (starterWeek.text.match(/\d[\d,]*\s*(kcal|g protein|g\b)/gi) ?? []).length === 0, (starterWeek.text.match(/\d[\d,]*\s*(kcal|g protein|g\b)/gi) ?? []).slice(0, 5))
await open('/?tour=off&refit=1&drift=1.6&numbers=off#/tab/nutrition', '[data-testid="meal-day-strip"]')
await wait(500)
const refitOff = await ev(`(() => { const o = document.querySelector('[data-testid="meal-refit-offer"]'); return o ? { text: o.innerText, resize: [...o.querySelectorAll('button')].some(b => /Resize them/.test(b.textContent)) } : null })()`)
check('the resize offer is still made on the starter tier, in words with no figure',
  !!refitOff && refitOff.resize && !/\d[\d,]*\s*(kcal|calories|g\b)/i.test(refitOff.text), refitOff)
await open('/?tour=off&numbers=off#/tab/dashboard', '[data-testid="home-rings"], main')
await wait(800)
const home = await ev(`(document.querySelector('main') ?? document.body).innerText`)
const homeFigures = (home.match(/\d[\d,]*\s*(kcal|g protein|g\b)/gi) ?? [])
check('Home shows no calorie or protein figure either', homeFigures.length === 0, homeFigures.slice(0, 5))
await shoot('flexible-starter-home')
await open('/?tour=off#/tab/nutrition', '[data-testid="meal-day-strip"]')
const normal = await ev(`(document.querySelector('main') ?? document.body).innerText`)
check('with the switch on (the default) the figures are there (the check above can fail)', /\d[\d,]*\s*kcal/i.test(normal))

console.log(`\n${ran} checks ran`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`\n${failures} of ${ran} FAILED`); process.exit(1) }
console.log('\nFlexible nutrition: every check passed.')
