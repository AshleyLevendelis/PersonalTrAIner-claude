// ---------------------------------------------------------------------------
// verify:setup-fixes — what the 10 Nov 2026 QA walk found in setup, fixed and held at 390px on the real setup screens
// (his "test the app as much as you can"). A scripted coach (qa-autocoach.js) answers each setup turn by asking the
// first open question with its real card; everything after its reply is the app's own code.
//   1. the summary has no "Date of birth" row (the Age row is it), and a date the coach records moves the age with it
//   2. half pounds and half inches are answers; flicking through units does not drift the number; a switch never empties
//      a box that does not read yet, it says why; "1e2" is not stored as text
//   3. a typed answer that does not fit (a 53-letter name) is asked again in words, never "tap the option" with no options
//   4. the summary rows read "Age: 41", label and value apart
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
const AUTO = readFileSync(new URL('./qa-autocoach.js', import.meta.url).pathname, 'utf8')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  const f = join(DIST, p === '/' ? '/.onb-harness/scripted.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const wait = ms => new Promise(r => setTimeout(r, ms))
let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) } }
const INPUT = '.ob-composer-fade input'
const sendText = async t => { await page.fill(INPUT, t); await wait(100); await page.locator('button:has(svg.lucide-send)').click(); await wait(1200) }
const W = '#slot-weightKg', WL = '#slot-weightKg-lb', H = '#slot-heightCm', HI = '#slot-heightCm-in'
const val = s => page.locator(s).inputValue({ timeout: 3000 }).catch(() => '(none)')
// A box that is not there is a FAILED check below, never a crash (a crash is not a catch).
const fill = (s, v) => page.fill(s, v, { timeout: 3000 }).catch(() => {})

async function toBody() {
  await page.goto(`${origin}/?state=freehand-food&n=${Math.random()}`); await wait(1200)
  await page.evaluate(AUTO)
  await sendText('nothing really')
  for (let i = 0; i < 6 && !(await page.locator('[data-slot-card="age"]').count()); i++) {
    const c = page.locator('[data-slot-card]').last()
    if (await c.count()) { await c.locator('button').first().click(); await wait(1000) } else await sendText('ok')
  }
  return page.locator('[data-slot-card="age"]').last()
}
async function toReview() {
  await page.goto(`${origin}/?state=freehand-food&n=${Math.random()}`); await wait(1200)
  await page.evaluate(AUTO)
  await sendText('nothing really')
  for (let i = 0; i < 12 && !(await page.locator('[data-review-row]').count()); i++) {
    const c = page.locator('[data-slot-card]').last()
    if (await page.locator('[data-slot-card="age"]').count()) { await page.fill('#slot-age', '1990-05-17'); await page.fill(H, '180'); await page.fill(W, '80'); await page.locator('[data-slot-card="age"]').getByRole('button', { name: 'Save' }).click(); await wait(1200); continue }
    if (await c.count()) { const n = c.locator('[data-slot-next]'); if (await n.count()) await n.click(); else await c.locator('button').first().click(); await wait(1200) } else await sendText('none')
  }
}

console.log('\nSETUP, AS THE 10 NOV QA WALK FOUND IT\n')
console.log('  1. The summary and the birthday')
await toReview()
const rows = await page.evaluate(() => [...document.querySelectorAll('[data-review-row]')].map(b => b.textContent.trim()))
check('1a. the summary is up with its rows', rows.length >= 10, rows.length)
check('1b. there is an Age row and NO "Date of birth" row', rows.some(r => /^Age: \d+$/.test(r)) && !rows.some(r => /Date of birth/.test(r)), rows.filter(r => /Age|birth/.test(r)))
// AS DRAWN, not as text: the text always holds the space; a flex row drops it on screen (QA, 10 Nov 2026).
const gaps = await page.evaluate(() => [...document.querySelectorAll('[data-review-row]')].map(b => { const [a, v] = b.querySelectorAll('span'); return a && v ? Math.round(v.getBoundingClientRect().left - a.getBoundingClientRect().right) : -99 }))
check('4a. label and value are apart on screen ("Age: 36", never "Age:36")', gaps.length >= 10 && gaps.every(g => g >= 3), gaps)
await page.locator('[data-review-row="age"]').click(); await wait(800)
await page.evaluate(() => { window.__auto.on = false; window.__onbQueue.push({ reply: 'Updated.', actions: [{ name: 'set_slot', args: { slot_key: 'dateOfBirth', value: '1985-03-02' } }] }) })
await sendText('2 March 1985'); await wait(800)
const after = await page.evaluate(() => [...document.querySelectorAll('[data-review-row]')].map(b => b.textContent.trim()).filter(t => /Age|birth/.test(t)))
const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('fitplan_onboarding_draft') ?? '{}'))
const want = (() => { const t = new Date(); let a = t.getFullYear() - 1985; if (t.getMonth() < 2 || (t.getMonth() === 2 && t.getDate() < 2)) a -= 1; return a })()
check(`1c. a birthday the coach records moves the age with it (1985-03-02 is ${want})`, String(draft?.values?.age) === String(want) && draft?.values?.dateOfBirth === '1985-03-02' && after.length === 1 && after[0] === `Age: ${want}`, { after, age: draft?.values?.age, dob: draft?.values?.dateOfBirth })

console.log('\n  2. Units')
let card = await toBody()
const unit = async (f, u) => { await card.locator(`[data-body-field="${f}"] [data-unit="${u}"]`).click(); await wait(150) }
await fill(W, '80'); await unit('weightKg', 'lb'); const lb = await val(W)
await unit('weightKg', 'st'); const st = [await val(W), await val(WL)]
await unit('weightKg', 'kg'); const back = await val(W)
check('2a. 80 kg through lb and stone comes back as 80, not 79.8', lb === '176' && st.join(' ') === '12 8' && back === '80', { lb, st, back })
await unit('weightKg', 'st'); await fill(W, '12'); await fill(WL, '14'); await unit('weightKg', 'kg')
check('2b. 12 st 14 lb (not a weight yet) is NOT emptied by a switch: the boxes stay and a line says why', (await val(W)) === '12' && (await val(WL)) === '14' && (await page.locator('[data-testid="unit-note"]').count()) === 1, { w: await val(W), lb: await val(WL), note: await page.locator('[data-testid="unit-note"]').allTextContents() })
await fill(WL, '13.5'); await unit('weightKg', 'kg')
check('2c. 12 st 13.5 lb is a weight (82.3 kg) and the line goes', (await val(W)) === '82.3' && (await page.locator('[data-testid="unit-note"]').count()) === 0, await val(W))
await fill(W, '1e2')
check('2d. "1e2" cannot be typed as a weight (only digits and a point stay)', !/e/i.test(await val(W)), await val(W))
await unit('heightCm', 'ft'); await fill(H, '5'); await fill(HI, '10.5'); await fill(W, '82')
await card.getByRole('button', { name: 'Save' }).click(); await wait(1500)
const said = await page.evaluate(() => document.body.innerText)
check('2e. 5 ft 10.5 in is a height: saved as 179 cm with what was typed beside it', /Height — 179 cm \(from 5'10\.5"\)/.test(said), said.split('\n').filter(l => /Height|Give a height/.test(l)).slice(-3))

console.log('\n  3. A typed answer that does not fit')
await page.goto(`${origin}/?state=fresh&n=${Math.random()}`); await wait(1200)
await page.evaluate(() => { window.__onbQueue = window.__onbQueue || []; window.__onbQueue.push({ reply: 'Nice to meet you.', actions: [{ name: 'set_slot', args: { slot_key: 'displayName', value: 'Maximilian Alexander Christopher Montgomery the Third' } }] }) })
await sendText('Maximilian Alexander Christopher Montgomery the Third'); await wait(800)
const tail = (await page.evaluate(() => document.body.innerText)).split('\n').filter(Boolean).slice(-3).join(' | ')
check('3a. a 53-letter name is asked again in words, saying what fits, and never "tap the option" with nothing to tap', /Up to 30 letters/.test(tail) && !/tap the option that fits/.test(tail), tail)

console.log(`\n${ran} checks ran. ${failures === 0 ? 'Setup: one age, half units, no drift, no silent wipe, and a question you can answer.' : `${failures} check(s) FAILED.`}\n`)
await browser.close(); server.close()
process.exit(failures === 0 ? 0 : 1)
