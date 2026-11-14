// ---------------------------------------------------------------------------
// verify:setup-weight-correction — A SETUP WEIGHT CORRECTED ON PROFILE MOVES THE TARGETS (his ruling 14 Nov 2026,
// "Correct it now"). His live report: setup kept 187 kg, Nutrition said 4,336 kcal, and correcting it (in the chat, then
// on Profile, then regenerating the meals) left the target where it was. On Profile it was a silent no-op: the target
// follows the weigh-in anchor, which the field never touched.
//
// Boots the WHOLE app (app-boot.html?setup-typo: App.tsx's own start, the fake database) as someone who signed up today
// at 187 kg. Reads the calorie target on Nutrition, corrects the weight to 87 on Profile (asked, then Yes), and reads
// Nutrition again, and what was saved. The arithmetic is held by test:weigh-in-targets section 13.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = join(DIST, p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message)))
if (process.env.DEBUG_DRIVER) page.on('console', m => console.log('      [page]', m.text().slice(0, 200)))
const wait = ms => new Promise(r => setTimeout(r, ms))
let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }
const shot = async name => { try { writeFileSync(new URL(`./setup-weight-${name}.png`, import.meta.url).pathname, await page.screenshot()) } catch { /* not a check */ } }
const body = () => page.evaluate(() => document.body.innerText)
const db = () => page.evaluate(() => window.__fakeDb)
const tap = async (what, fn) => { try { await fn(); return true } catch (e) { console.error(`      (could not ${what}: ${String(e).slice(0, 120)})`); return false } }
const dismissEmail = async () => { const b = page.getByRole('button', { name: /Not now/ }); if (await b.count()) { await b.first().click({ timeout: 3000 }).catch(() => {}); await wait(500) } }
/** The calorie target Nutrition draws: "0 / 4,336" on its Kcal row, or the "N kcal left" in the circle with nothing eaten. */
const nutritionKcal = async () => {
  await page.evaluate(() => { location.hash = '#/tab/nutrition' })
  await wait(2500)
  const t = await body()
  const m = t.match(/([\d,]{4,6})\s*kcal left/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

console.log('\nA SETUP WEIGHT CORRECTED ON PROFILE MOVES THE TARGETS')
await page.goto(`${origin}/.tour-harness/app-boot.html?clear-storage&setup-typo`)
await page.waitForFunction(() => /Today|Home/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
await wait(3000)
await dismissEmail()
const before = await nutritionKcal()
await shot('before')
const db0 = await db()
check('the fixture binds: signed up today at 187 kg, and Nutrition draws a target worked out from it', Number(db0?.fitness_profiles?.[0]?.weight_kg) === 187 && before != null && before > 3500, { kg: db0?.fitness_profiles?.[0]?.weight_kg, before })

// Profile → Height & weight → the weight field, typed the way a thumb types it.
const opened = await tap('open Profile', async () => {
  await page.getByRole('button', { name: 'Profile and settings' }).first().click({ timeout: 8000 })
  await wait(400)
  await page.getByRole('menuitem', { name: /Profile/ }).first().click({ timeout: 8000 })
  await wait(800)
  await page.locator('[data-profile-row="Height & weight"]').first().click({ timeout: 8000 })
  await wait(600)
})
const field = page.locator('[data-testid="profile-weight-field"] input')
check('Profile\'s weight field is there, holding the 187 setup kept', opened && (await field.count()) === 1 && (await field.inputValue().catch(() => '')) === '187', await field.inputValue().catch(() => null))
await tap('type 87', async () => { await field.click({ timeout: 4000 }); await field.fill('87'); await field.press('Enter') })
await wait(800)
const question = page.locator('[data-testid="profile-weight-question"]')
check('it asks first, naming the 187 it replaces', (await question.count()) === 1 && /lighter than the 187 kg you gave before — is 87 kg right\?/.test(await question.innerText().catch(() => '')), await question.innerText().catch(() => null))
await shot('asked')
check('...and nothing is saved before the yes', Number((await db())?.fitness_profiles?.[0]?.weight_kg) === 187)
await tap('tap Yes', () => page.locator('[data-testid="profile-weight-yes"]').click({ timeout: 4000 }))
await wait(2500)

const db1 = await db()
check('Yes saves 87 on the profile', Number(db1?.fitness_profiles?.[0]?.weight_kg) === 87, db1?.fitness_profiles?.[0]?.weight_kg)
check('...and no target record still says it was worked out from 187', (db1?.daily_nutrition_targets ?? []).length > 0 && (db1?.daily_nutrition_targets ?? []).every(r => Number(r.calculated_weight_kg) === 87), (db1?.daily_nutrition_targets ?? []).map(r => [r.date, r.target_calories, r.calculated_weight_kg]))
check('...the sign-up weigh-in reads 87 too', (db1?.daily_metrics ?? []).length === 1 && Number(db1.daily_metrics[0].weight_kg) === 87, db1?.daily_metrics)
await page.keyboard.press('Escape').catch(() => {})
await wait(500)
const after = await nutritionKcal()
await shot('after')
const newest = [...(db1?.daily_nutrition_targets ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)).pop()
check('Nutrition now draws a much lower target, worked out from 87 kg', after != null && before != null && after < before - 800, { before, after })
check('...the same figure that was saved', after != null && newest != null && after === Number(newest.target_calories), { after, saved: newest?.target_calories })
check('harness: no page errors', errors.length === 0, errors.slice(0, 3))

console.log(`\n${ran} checks ran.${failures ? ` ${failures} FAILED.` : ' A setup weight corrected on Profile moves the targets.'}`)
await browser.close()
server.close()
process.exit(failures > 0 ? 1 : 0)
