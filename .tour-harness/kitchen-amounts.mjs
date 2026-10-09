// ---------------------------------------------------------------------------
// A RESIZED MEAL IS WRITTEN IN AMOUNTS SOMEBODY CAN MEASURE — ON THE REAL CARD.
//
// 9 Oct 2026, the test log's L18: "1.3 tsp", "0.8 tsp", "119g", "239g".
// test:kitchen-amounts holds the rule and every path that uses it; this reads
// the result off the real Nutrition tab at phone size. The day is the refit
// fixture with its targets 60% up, so the app OFFERS a resize; the driver
// accepts it and opens each meal. Every amount shown comes out of the app's
// own scaler — the fixture supplies 150g, 250g and "1 tbsp", never the answer.
//
// PORT 9661.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9661, page: 'real.html', name: 'kitchen-amounts' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
/** The open meal's ingredient rows: the string the builders are handed, and the words she reads. */
const rows = () => ev(`[...document.querySelectorAll('[data-ingredient-row]')].map(b => ({ data: b.getAttribute('data-ingredient-row'), shown: (b.querySelector('span')?.textContent || '').trim() }))`)
const openMeal = async label => {
  const ok = await clickAt(`[...document.querySelectorAll('button')].find(b => new RegExp('^\\\\s*${label}', 'i').test(b.textContent || '') && !b.hasAttribute('data-ingredient-row'))`)
  if (!ok) return []
  return until(rows, v => Array.isArray(v) && v.length > 0, 16)
}
const readDay = async () => {
  const day = {}
  for (const s of SLOTS) { day[s] = await openMeal(s); await wait(150) }
  return day
}
const parse = line => {
  const m = /^(\d+(?:\.\d+)?)\s*(g|ml|tbsp|tsp)?\b/.exec(line || '')
  return m ? { q: Number(m[1]), unit: m[2] ?? 'count' } : null
}
// The rule, in literals — not read from the app.
const measurable = p => !!p && (p.unit === 'g' || p.unit === 'ml' ? (p.q < 20 ? Number.isInteger(p.q) : p.q % 5 === 0)
  : p.unit === 'tbsp' || p.unit === 'tsp' ? p.q >= 0.25 && Number.isInteger(p.q * 4)
  : Number.isInteger(p.q) && p.q >= 1)

await go('&tour=off&refit=1&drift=1.6&spoon=1', '#/tab/nutrition')
await until(() => ev(`!!document.querySelector('[data-testid="meal-refit-offer"]')`), v => v === true)
const before = await readDay()
await shoot('kitchen-amounts-before')

console.log('\n1. The day as stored, before any resize\n')
const beforeLines = Object.values(before).flat()
check('1a. all four meals opened and listed their ingredients', SLOTS.every(s => before[s].length >= 2), Object.fromEntries(SLOTS.map(s => [s, before[s].length])))
check('1b. the dinner carries the spoon of oil the fixture gave it (so there is a spoon to resize)', before.Dinner.some(r => r.data === '1 tbsp olive oil'), before.Dinner)

console.log('\n2. Resized by the app\n')
const tapped = await clickAt(`[...document.querySelectorAll('button')].find(b => /^\\s*Resize them/.test(b.textContent || ''))`)
await until(() => ev(`!document.querySelector('[data-testid="meal-refit-offer"]')`), v => v === true)
await wait(800)
const after = await readDay()
await shoot('kitchen-amounts-after')
const afterLines = Object.values(after).flat()
check('2a. the Resize button responded and the offer went away', tapped === true && (await ev(`!document.querySelector('[data-testid="meal-refit-offer"]')`)) === true)
check('2b. the amounts really changed (a resize that changed nothing would pass everything below)',
  afterLines.length === beforeLines.length && afterLines.filter((r, i) => r.data !== beforeLines[i].data).length >= 6,
  { before: beforeLines.map(r => r.data), after: afterLines.map(r => r.data) })
const odd = afterLines.filter(r => !measurable(parse(r.data)))
check('2c. every amount is one somebody can measure: grams and ml in fives (whole grams under 20), spoons in quarters, counts whole', odd.length === 0, odd.length ? odd : afterLines.map(r => r.data))
const spoon = after.Dinner.find(r => / tbsp olive oil$/.test(r.data || ''))
const sp = parse(spoon?.data)
check('2d. the spoon of oil was resized to a quarter-spoon amount that is not a whole spoon', !!sp && sp.q !== 1 && Number.isInteger(sp.q * 4) && !Number.isInteger(sp.q), spoon)
check('2e. ...and she reads it with a fraction sign, not a decimal', !!spoon && /^\d*[¼½¾] tbsp olive oil$/.test(spoon.shown) && !/\d\.\d/.test(spoon.shown), spoon)
check('2f. ...while the string handed to the edit sheet is still a number it can read', !!spoon && /^\d+\.\d{1,2} tbsp olive oil$/.test(spoon.data), spoon)
check('2g. gram lines read exactly as stored (no fraction signs on grams)', afterLines.filter(r => /^\d+(g|ml) /.test(r.data)).every(r => r.shown === r.data), afterLines.filter(r => r.shown !== r.data))
check('2h. no leaked NaN / undefined', !afterLines.some(r => /NaN|undefined|\[object/.test(`${r.data} ${r.shown}`)))

await finish('A resized meal reads in amounts somebody can measure.')
