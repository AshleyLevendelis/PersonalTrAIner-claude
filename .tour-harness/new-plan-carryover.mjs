// ---------------------------------------------------------------------------
// verify:new-plan-carryover — "START A NEW PLAN" CARRIES NOTHING OF THE LAST PERSON (his Sal and Margaret test,
// 14 Nov 2026). Margaret, who declined her weight, got 1,596 kcal and 160 g protein: the previous profile's 80 kg run
// through her age and height, then saved under her id. Her Home showed Sal's "targets moved" line, and her meals said
// "Complete onboarding" after she had.
//
// Boots the WHOLE app (app-boot.html: App.tsx's own start, the fake database) as Sam, with an 80 kg weigh-in and an
// earlier target snapshot, so the app holds an 80 kg weight anchor AND shows a "targets moved" line. Then Profile →
// Start a new plan and a whole setup, twice: Margaret skips the body questions (no weight), Sal gives 70 kg. It reads
// what each new person sees and what was saved under their id.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
const AUTO = readFileSync(new URL('../.onb-harness/qa-autocoach.js', import.meta.url).pathname, 'utf8')
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = join(DIST, p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message)))
const wait = ms => new Promise(r => setTimeout(r, ms))
let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }
const shot = async name => { try { writeFileSync(new URL(`./new-plan-${name}.png`, import.meta.url).pathname, await page.screenshot()) } catch { /* not a check */ } }
const body = () => page.evaluate(() => document.body.innerText)
const OLD_ID = '00000000-0000-4000-8000-00000000b007'

const go = async (what, fn) => { try { await fn() } catch (e) { check(`harness: could ${what}`, false, String(e).slice(0, 160)) } }
const dismissEmail = async () => { const b = page.getByRole('button', { name: /Not now/ }); if (await b.count()) { await b.first().click({ timeout: 3000 }).catch(() => {}); await wait(500) } }
const sendText = async t => { await page.fill('.ob-composer-fade input', t, { timeout: 4000 }).catch(() => {}); await page.locator('button:has(svg.lucide-send)').click({ timeout: 4000 }).catch(() => {}); await wait(1300) }
const MOVED = /targets moved|daily targets moved|recent weigh-ins|targets have moved/i

// Sam, set up, with a weigh-in AND a "your targets moved" line on Home (an earlier snapshot with other numbers). Then
// Profile → Start a new plan, a whole setup, and Generate. `weight`: the new person's body numbers, or none (skipped).
async function newPlan(label, weight) {
  console.log(`\n  ${label}`)
  await page.goto(`${origin}/.tour-harness/app-boot.html?clear-storage&weigh=80&targets-moved&n=${label.length}`)
  await page.waitForFunction(() => /Today|Home/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
  await wait(3000)
  const before = await body()
  // The starting point the bug needs, so a check below can never pass because there was nothing to carry over.
  check('harness: the first person is on Home with a "targets moved" line', MOVED.test(before), before.slice(0, 300))
  await dismissEmail()
  await go('open the settings menu', () => page.getByRole('button', { name: 'Profile and settings' }).first().click({ timeout: 8000 }))
  await wait(400)
  await go('open Profile', () => page.getByRole('menuitem', { name: /Profile/ }).first().click({ timeout: 8000 }))
  await wait(800)
  await go('tap Start a new plan', () => page.getByRole('button', { name: /Start a new plan/ }).first().click({ timeout: 8000 }))
  await wait(500)
  await go('confirm it', () => page.getByRole('button', { name: 'Start new plan' }).click({ timeout: 8000 }))
  await page.waitForSelector('.ob-composer-fade input', { timeout: 20000 }).catch(() => {})
  check('a new setup starts', (await page.locator('.ob-composer-fade input').count()) === 1, (await body()).slice(0, 200))

  // A whole setup with a stand-in coach.
  await page.evaluate(AUTO)
  await sendText('Hi')
  let body3 = false
  let ageGiven = false
  for (let i = 0; i < 40 && !page.isClosed() && !(await page.locator('[data-review-row]').count().catch(() => 1)); i++) {
    if (await page.locator('[data-slot-card="age"], [data-slot-card="heightCm"], [data-slot-card="weightKg"]').count()) {
      body3 = true
      // As Margaret did: her age and height, but not her weight. Whatever is left (the weight) is then skipped.
      if (weight == null && !ageGiven && await page.locator('#slot-age').count()) {
        ageGiven = true
        await page.fill('#slot-age', '1966-05-17', { timeout: 3000 }).catch(() => {})
        await page.fill('#slot-heightCm', '160', { timeout: 3000 }).catch(() => {})
        await page.locator('[data-slot-card]').last().getByRole('button', { name: 'Save' }).click({ timeout: 3000 }).catch(() => {})
      } else if (weight == null) { await page.locator('[data-onboarding-skip]').first().click({ timeout: 4000 }).catch(() => {}) }
      else {
        await page.fill('#slot-age', '1990-05-17', { timeout: 3000 }).catch(() => {})
        await page.fill('#slot-heightCm', '170', { timeout: 3000 }).catch(() => {})
        await page.fill('#slot-weightKg', String(weight), { timeout: 3000 }).catch(() => {})
        await page.locator('[data-slot-card]').last().getByRole('button', { name: 'Save' }).click({ timeout: 3000 }).catch(() => {})
      }
      await wait(1300); continue
    }
    const c = page.locator('[data-slot-card]').last()
    if (await c.count()) {
      const n = c.locator('[data-slot-next]')
      // A screen carrying a second question (the days with their session length, since 14 Nov 2026) holds Next until
      // that one is answered too: pick its first option.
      const companion = c.locator('[data-companion] button')
      if (await n.count() && !(await n.isEnabled().catch(() => true)) && await companion.count()) {
        await companion.first().click({ timeout: 3000 }).catch(() => {})
        await wait(300)
      }
      if (await n.count() && await n.isEnabled().catch(() => false)) await n.click({ timeout: 3000 }).catch(() => {})
      else await c.locator('button').first().click({ timeout: 3000 }).catch(() => {})
      await wait(1300); continue
    }
    await sendText(/call you/i.test(await body()) && i < 3 ? 'Margaret' : 'none')
  }
  check(weight == null ? 'the body questions were skipped (no weight given)' : `the body questions were answered (${weight} kg)`, body3)
  await go('tap Generate My Plan', () => page.getByRole('button', { name: 'Generate My Plan' }).click({ timeout: 8000 }))
  await page.waitForFunction(() => !document.querySelector('.ob-composer-fade input'), null, { timeout: 60000 }).catch(() => {})
  await wait(3500)
  await dismissEmail()
  const db = await page.evaluate(() => window.__fakeDb)
  const newProfile = (db?.fitness_profiles ?? []).find(p => p.id !== OLD_ID)
  check('harness: a new profile was saved', !!newProfile, (db?.fitness_profiles ?? []).map(p => p.id))
  const savedTargets = (db?.daily_nutrition_targets ?? []).filter(r => r.profile_id === newProfile?.id)
  const home = await body()
  // A NEW PERSON'S FIRST DAY HAS NOTHING TO HAVE MOVED FROM, whatever the last person's line said.
  check('Home shows no "targets moved" line (the last person\'s, or a "move" from the last person\'s answers)', !MOVED.test(home), home.match(/[^\n]*(moved|weigh-ins)[^\n]*/i)?.[0])
  return { newProfile, savedTargets, home }
}

console.log('\n"START A NEW PLAN" CARRIES NOTHING OF THE LAST PERSON')
{
  const { newProfile, savedTargets, home } = await newPlan('1. Margaret gives no weight', null)
  await shot('home')
  check('...her profile has her age and height and no weight', newProfile?.weight_kg == null && Number(newProfile?.height_cm) === 160 && Number(newProfile?.age) > 50, { kg: newProfile?.weight_kg, cm: newProfile?.height_cm, age: newProfile?.age })
  check('no food targets were SAVED for her (nothing to work them out from)', savedTargets.length === 0, savedTargets.map(r => ({ kcal: r.target_calories, kg: r.calculated_weight_kg })))
  check('...and Home shows no calorie figure from the last person\'s weight', !/1,5\d\d|1,6\d\d|1,9\d\d|2,[0-9]\d\d kcal/.test(home), home.match(/[0-9,]+ ?kcal/g))
  await go('open Nutrition', () => page.evaluate(() => { location.hash = '#/tab/nutrition' }))
  await wait(3000)
  await shot('nutrition')
  const nut = await body()
  check('Nutrition says its food targets need the missing numbers', /Food targets need your/.test(nut), nut.slice(0, 300))
  check('...shows no target numbers', !/\b\d{1,2},?\d{3} kcal\b/.test(nut.split('Food targets need')[0] ?? ''), nut.match(/[0-9,]+ ?kcal/g))
  check('...and the meals say why there are none, never "Complete onboarding"', /built once those are in/.test(nut) && !/Complete onboarding/.test(nut), nut.match(/[^\n]*(onboarding|built once)[^\n]*/g))
}
{
  const { newProfile, savedTargets } = await newPlan('2. Sal gives 70 kg', 70)
  await shot('home-weighed')
  check('...his profile has his weight', Number(newProfile?.weight_kg) === 70, newProfile?.weight_kg)
  // Worked out from HIS 70 kg, never the last person's 80 kg anchor.
  check('his food targets are saved from his own weight', savedTargets.length >= 1 && savedTargets.every(r => Number(r.calculated_weight_kg) === 70), savedTargets.map(r => ({ kcal: r.target_calories, kg: r.calculated_weight_kg })))
}
check('harness: no page errors', errors.length === 0, errors.slice(0, 3))

console.log(`\n${ran} checks ran. ${failures === 0 ? 'A new plan starts clean: no weight, no invented targets.' : `${failures} check(s) FAILED.`}\n`)
await browser.close(); server.close()
process.exit(failures === 0 ? 0 : 1)
