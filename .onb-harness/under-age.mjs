// ---------------------------------------------------------------------------
// verify:under-age — THE APP IS FOR 16 AND OVER (his ruling 26 Nov 2026, "16+, setup stops younger"), on the real setup
// screen at 390px:
//   1. a date of birth on the age card that makes them 14 replaces setup with the stop screen: its words, its one
//      button, and no message box and no Generate under it;
//   2. "I entered my birthday wrong" clears the age and puts the age card back;
//   3. a birthday that makes them 16 carries on as before;
//   0. the birthday has no Skip and a blank Save does not carry on (his "Must answer");
//   4. an age under 16 recorded any other way (here, already in the saved setup, as the coach would set it) stops too.
// Dates come from the card's own limit (the latest birthday that makes someone 13), never the machine's calendar.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
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
const shot = name => page.screenshot({ path: new URL(`./under-age-${name}.png`, import.meta.url).pathname }).catch(() => {})
const fill = (s, v) => page.fill(s, v, { timeout: 3000 }).catch(() => {})
const count = s => page.locator(s).count()
const savedAge = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || '{}').values?.age ?? null)
// The card's latest allowed birthday makes someone exactly 13; a year earlier makes them 14, three years 16.
const yearsBefore = (iso, n) => `${Number(iso.slice(0, 4)) - n}${iso.slice(4)}`
const saveCard = async dob => {
  await fill('#slot-age', dob); await fill('#slot-heightCm', '170'); await fill('#slot-weightKg', '60')
  await page.locator('[data-slot-card="age"]').last().getByRole('button', { name: 'Save' }).click({ timeout: 3000 }).catch(() => {})
  await wait(1200)
}

try {
  console.log('\n1. A birthday that makes them 14 stops setup')
  await page.goto(`${origin}/?state=age-card&n=1`); await wait(1500)
  const max = await page.locator('#slot-age').getAttribute('max', { timeout: 3000 }).catch(() => null)
  check('the age card is on screen with its limit', typeof max === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(max), max)
  // "Must answer" (his ruling 26 Nov 2026): no Skip while the birthday is asked, so the check cannot be stepped round.
  check('the birthday question has no Skip', (await count('[data-onboarding-skip]')) === 0)
  await page.locator('[data-slot-card="age"]').last().getByRole('button', { name: 'Save' }).click({ timeout: 3000 }).catch(() => {}); await wait(600)
  check('...and saving it blank does not carry on (the card stays, no age kept)', (await count('#slot-age')) > 0 && (await savedAge()) === '' , await savedAge())
  await saveCard(yearsBefore(max ?? '2013-01-01', 1))
  const stop = await page.locator('[data-under-age]').innerText({ timeout: 3000 }).catch(() => '')
  await shot('stop')
  check('1a. the stop screen is up, titled "This app is for 16 and over"', /This app is for 16 and over/.test(stop), stop)
  check('1b. ...says why, says no account was made, and where to get help', /written for adults/.test(stop) && /No account has been made/.test(stop) && /GP/.test(stop), stop)
  check('1c. ...with no message box and no Generate', (await count('.ob-composer-fade input')) === 0 && (await page.getByRole('button', { name: /generate|build my plan/i }).count()) === 0)
  const fixBox = await page.locator('[data-under-age-fix]').boundingBox().catch(() => null)
  check('1d. its one button is on screen and at least 44px tall', !!fixBox && fixBox.height >= 44 && fixBox.y + fixBox.height <= 844, fixBox)

  console.log('\n2. "I entered my birthday wrong" puts the age card back, empty')
  await page.locator('[data-under-age-fix]').click({ timeout: 3000 }).catch(() => {}); await wait(1200)
  await shot('fix')
  check('2a. the stop screen is gone', (await count('[data-under-age]')) === 0)
  check('2b. the age card is on screen again', (await count('#slot-age')) > 0)
  check('2c. the age is cleared', (await savedAge()) === '', await savedAge())

  console.log('\n3. A birthday that makes them 16 carries on')
  await saveCard(yearsBefore(max ?? '2013-01-01', 3))
  await shot('sixteen')
  check('3a. no stop screen', (await count('[data-under-age]')) === 0)
  check('3b. the age 16 is kept', (await savedAge()) === '16', await savedAge())

  console.log('\n4. An age of 15 recorded another way stops setup too')
  await page.goto(`${origin}/?state=under-16&n=2`); await wait(1500)
  check('4a. the stop screen is up', /This app is for 16 and over/.test(await page.locator('[data-under-age]').innerText({ timeout: 3000 }).catch(() => '')))
} finally {
  await browser.close(); server.close()
}
console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`verify:under-age FAILED (${failures})`); process.exit(1) }
console.log('verify:under-age PASSED')
