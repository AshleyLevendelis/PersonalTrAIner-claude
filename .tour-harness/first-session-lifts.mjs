// ---------------------------------------------------------------------------
// THE LIFT NUMBERS, ASKED AT THE FIRST SESSION (his ruling 14 Nov 2026, "Ask at the first session").
// The real Exercise tab (real.html, ?firstlifts=1: a plan made today, nothing ever logged). It proves, on screen:
//   1. the card is just under today's session card with the three lifts and both answers;
//   2. a half-filled lift is asked about, nothing saved;
//   3. "Start from these" saves the plan's numbers and the skip, and the card says it is done;
//   4. "I don't know" puts it away for good on this phone;
//   5. it is NOT shown on the default plan, where a set is already logged.
// What App does with the save (saves, then rebuilds from that profile) is test:first-session-lifts's.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e.message)))
const wait = ms => new Promise(r => setTimeout(r, ms))
let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }
const shot = async name => { try { writeFileSync(new URL(`./first-session-lifts-${name}.png`, import.meta.url).pathname, await page.screenshot()) } catch { /* a missing picture is not a check */ } }
let loads = 0
const open = async (q, keepStorage = false) => {
  if (!keepStorage) await page.goto(`${origin}/?tour=off`).then(() => page.evaluate(() => localStorage.clear())).catch(() => {})
  await page.goto(`${origin}/?tour=off&${q}&n=${++loads}#/tab/exercise`); await wait(2500)
}
const card = page.locator('[data-testid="first-lifts-card"]')
const saved = () => page.evaluate(() => window.__firstLifts ?? [])
const fill = (sel, v) => page.fill(sel, v, { timeout: 3000 }).catch(() => {})
const tap = sel => page.locator(sel).first().click({ timeout: 3000 }).catch(() => {})

console.log('\n  1. The card is there at the first session')
await open('firstlifts=1')
check('1a. the card is on screen', (await card.count()) === 1)
const text = (await card.count()) ? await card.innerText() : ''
check('1b. ...naming the three lifts', /Barbell back squat/.test(text) && /Barbell bench press/.test(text) && /Barbell deadlift/.test(text), text.slice(0, 200))
check('1c. ...saying the first week finds them otherwise', /first week finds your starting weights/.test(text), text.slice(0, 200))
check('1d. ...with both answers', /Start from these/.test(text) && /I don't know/.test(text), text.slice(-80))
const inView = await card.boundingBox().then(b => !!b && b.y >= 0 && b.y < 844).catch(() => false)
check('1e. ...on screen where the session starts', inView)
const boxH = await page.locator('#first-lift-known_squat_kg-kg').boundingBox().then(b => b?.height ?? 0).catch(() => 0)
check('1f. the boxes are 44px tall', boxH >= 44, boxH)
await shot('card')

console.log('\n  2. A half-filled lift is asked about, nothing saved')
await fill('#first-lift-known_bench_kg-kg', '80')
await tap('[data-testid="first-lifts-start"]')
await wait(400)
const msg = await page.locator('[data-testid="first-lifts-message"]').innerText().catch(() => '')
check('2a. it asks for the reps', /bench press, put the weight and how many reps you got/.test(msg), msg)
check('2b. nothing was saved', (await saved()).length === 0, await saved())

console.log('\n  3. "Start from these" saves the numbers and the skip')
await fill('#first-lift-known_bench_kg-reps', '6')
await fill('#first-lift-known_squat_kg-kg', '100')
await fill('#first-lift-known_squat_kg-reps', '5')
await tap('[data-testid="first-lifts-start"]')
await wait(800)
const s = (await saved())[0] ?? null
check('3a. one save, with the squat and bench as the plan reads them, and the first week skipped',
  !!s && s.known_squat_kg > 0 && s.known_bench_kg > 0 && s.known_deadlift_kg === undefined && s.skip_calibration_week === true, s)
check('3b. ...the plan number is under the set weight (a set of 5 is heavier than the plan\'s 10-rep number)', !!s && s.known_squat_kg < 100 && s.known_bench_kg < 80, s)
check('3c. the card says it is done', (await page.locator('[data-testid="first-lifts-done"]').count()) === 1)
await shot('done')
await open('firstlifts=1', true)
check('3d. after answering it does not come back', (await card.count()) === 0)

console.log('\n  4. "I don\'t know" puts it away for good')
await open('firstlifts=1')
await tap('[data-testid="first-lifts-dont-know"]')
await wait(400)
check('4a. gone at once', (await card.count()) === 0)
check('4b. ...nothing saved', (await saved()).length === 0, await saved())
await open('firstlifts=1', true)
check('4c. ...and not back on the next open', (await card.count()) === 0)

console.log('\n  5. Not shown once he has trained')
await open('joined=today')
check('5a. a plan with a set already logged has no card', (await card.count()) === 0)
check('harness: no page errors', pageErrors.length === 0, pageErrors)

console.log(`\n${ran} checks ran`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
await browser.close(); server.close()
process.exit(failures ? 1 : 0)
