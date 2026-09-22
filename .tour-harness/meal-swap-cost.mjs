// ---------------------------------------------------------------------------
// SWAPPING A WHOLE MEAL SAYS WHAT IT COSTS THE DAY — in a real browser.
//
// The Nutrition tab's swap list showed a per-row DELTA ("+120 kcal, -22g P")
// and nothing else. meal-tradeoff.ts's own header calls that what it is: a
// readout, which says the number moved and never what the number means. A slot
// delta cannot answer "does the DAY still hit protein", which is the only
// question worth asking — and swapping a whole meal was the one meal change
// neither surface priced against the goal.
//
// WHY A DRIVER AND NOT A SOURCE CHECK. The cost line hangs off
// `editContextFor(option)` returning a day and a goal; a source check reads the
// call and cannot tell whether the day ever arrives. This repo has measured
// that exact blindness twice — `if (false && advice)` left twelve wiring checks
// green, and a harness fixture that hand-built its own load left a driver
// proving the fixture's own number for weeks.
//
// THE MEASUREMENT IS THE DISCRIMINATION, NOT THE PRESENCE. Two alternatives are
// seeded (?swapalts=1) and only ONE should carry a warning: a list where every
// row says the same thing cannot show that the app is reading the row it is on.
// One candidate cannot test a choice, so the wrong answer is on screen at the
// same time as the right one.
//
// AND IT IS THE DAY'S NUMBER, NOT THE SLOT'S. The swapped-in breakfast has 10g
// of protein; the sentence must say 100g, which is the whole day after the
// change. Asserting "a warning appeared" would pass on a slot readout in a new
// costume, which is the thing being replaced.
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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9461', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9461/json/list').then(r => r.json())
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

const hero = () => ev(`(() => { const el = document.querySelector('.ds-num-mega'); return el ? el.textContent.trim() : null })()`)
const timeUntil = async (read, want, budgetMs) => {
  const started = Date.now()
  while (Date.now() - started < budgetMs) {
    if ((await read()) === want) return Date.now() - started
    await wait(50)
  }
  return null
}

console.log('\nWHAT A MEAL SWAP COSTS THE DAY, ON THE SCREEN\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&swapalts=1#/tab/nutrition` })
check('0. the Nutrition tab loads', (await timeUntil(hero, '0', 40000)) !== null, await hero())

// The day this run judges against, read off the screen rather than assumed —
// every number below is only meaningful against these two.
const day = await ev(`(() => {
  const m = document.body.innerText.match(/(\\d+) \\/ (\\d+) P/)
  return m ? { protein: +m[1], target: +m[2] } : null
})()`)
check('0b. the day is short of protein to begin with, so a swap can matter',
  Boolean(day && day.protein < day.target), day)

await ev(`(() => { const r = [...document.querySelectorAll('button')].filter(b => /Breakfast/i.test(b.textContent||'')); if (r[0]) r[0].click() })()`)
await wait(700)

const swapLabel = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Swap( ·|$)/.test((x.textContent||'').trim()))
  return b ? b.textContent.trim() : null
})()`)
check('1. the swap control offers the seeded alternatives', swapLabel === 'Swap · 2 options', swapLabel)

await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Swap( ·|$)/.test((x.textContent||'').trim()))
  if (b) b.click()
})()`)
await wait(700)

// NULL-SAFE, AND EVERY CHECK RUNS EVERY TIME. Wrapping the detail checks in
// `if (found)` would make a broken feature print three checks instead of nine,
// which the mutation harness cannot tell apart from a crash.
const seen = (await ev(`(() => {
  const costs = {}
  for (const e of document.querySelectorAll('[data-meal-swap-cost]')) costs[e.getAttribute('data-meal-swap-cost')] = e.textContent.trim()
  const rows = [...document.querySelectorAll('button')]
    .map(b => (b.textContent || '').trim())
    .filter(t => /Toast and jam|Chicken omelette/.test(t))
  return { costs, rowCount: rows.length, names: Object.keys(costs) }
})()`)) ?? { costs: {}, rowCount: 0, names: [] }

check('2. both alternatives are on screen at once', seen.rowCount >= 2, seen)
check('3. exactly ONE of the two carries a cost — the app read the row', seen.names.length === 1, seen.names)
check('4. the costly one is the low-protein breakfast', seen.names[0] === 'Toast and jam', seen.names)
check('5. the higher-protein alternative says nothing', !('Chicken omelette' in seen.costs), seen.costs)

const cost = seen.costs['Toast and jam'] ?? ''
check('6. the cost names the protein the DAY lands on, not the meal\'s 10g',
  /\b100g\b/.test(cost), cost)
check('7. …against the target it is short of', /\b160g target\b/.test(cost), cost)
check('8. it is a sentence about the goal, not a signed delta', /protein/i.test(cost) && !/^[+-]/.test(cost), cost)

// SCROLL TO IT BEFORE SHOOTING. The checks above read the DOM and pass
// wherever the list sits, but a screenshot of the fold above it proves nothing
// about whether the sentence is legible on a 390px phone — which is the half
// only a person looking at the picture can judge.
await ev(`(() => {
  const e = document.querySelector('[data-meal-swap-cost]')
  if (e) e.scrollIntoView({ block: 'center' })
})()`)
await wait(500)
await shoot('meal-swap-cost')

const err = await ev('window.__err ?? null')
check('9. no uncaught error on the page', err === null, err)

console.log(failures === 0
  ? '\nThe swap list says what the day costs, on the row that costs it.\n'
  : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
