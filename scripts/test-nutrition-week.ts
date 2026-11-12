/**
 * test:nutrition-week — the Nutrition Week handoff (his approval, 11 Nov 2026): N1 today's rings card, M2 the meal
 * rows' split bar, W1 a future day's planned card, W3 the week on one screen.
 *
 * verify:nutrition-week drives the screens. This holds what a screen cannot show, or shows only by accident:
 *   1. the ring sizes are the design's (N1's table; W1 at 150 and W3 at 44 from one set of proportions);
 *   2. how full a ring is: over target, capped at 100%, no target no ring, water only when it is given;
 *   3. a meal's split bar is its share of ENERGY (fat at 9 kcal a gram), never grams;
 *   4. left or over is the phrasebook's, with its unit; the week's heading across months and years;
 *   5. "Shop the whole week" asks the list for 7 days ONCE, and the list picks it as its own day choice does;
 *   6. the wiring: today's card has the water ring and a future day's has none; both verdicts are the engine's;
 *      the add-to-list lives in the planned card and not in the list; the rows draw the split bar.
 */
process.env.TZ = 'Europe/London'

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

const hash = { value: '' }
Object.defineProperty(globalThis, 'window', { value: { location: { get hash() { return hash.value }, set hash(v: string) { hash.value = v } }, addEventListener: () => {}, removeEventListener: () => {} }, configurable: true })
const lsMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => lsMap.get(k) ?? null, setItem: (k: string, v: string) => { lsMap.set(k, String(v)) }, removeItem: (k: string) => { lsMap.delete(k) } }, configurable: true })

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

async function main() {
  const nw = await import('../src/lib/nutrition-week')
  const route = await import('../src/lib/app-route')

  console.log('\n1. The ring sizes are the design\'s')
  const today = nw.TODAY_RINGS.map(r => [r.key, r.radius, r.stroke, !!r.glow])
  check('N1: water 94/6, calories 80/13 glowing, protein 63, carbs 50, fat 37 at 9, outside in, 196px',
    JSON.stringify(today) === JSON.stringify([['water', 94, 6, false], ['calories', 80, 13, true], ['protein', 63, 9, false], ['carbs', 50, 9, false], ['fat', 37, 9, false]]) && nw.TODAY_RING_SIZE === 196, today)
  const w1 = nw.plannedRings(150).map(r => [r.key, r.radius, r.stroke])
  check('W1 at 150px: 66, 49.5, 35.2, 21 at 12.8 and 9.8, as drawn', JSON.stringify(w1) === JSON.stringify([['calories', 66, 12.8], ['protein', 49.5, 9.8], ['carbs', 35.2, 9.8], ['fat', 21, 9.8]]), w1)
  // THE DESIGN'S TWO SIZES ARE NOT ONE EXACT PROPORTION: its outer stroke is 12.8 at 150 (0.0853) and 3.7 at 44
  // (0.0841). One proportion gives 3.8 at 44, a tenth of a pixel thicker, so this size is held to the design within
  // 0.1px rather than a second set of numbers that could drift from the first.
  const w3 = nw.plannedRings(44)
  const want: [string, number, number][] = [['calories', 19.4, 3.7], ['protein', 14.5, 2.9], ['carbs', 10.3, 2.9], ['fat', 6.2, 2.9]]
  check('W3 at 44px: 19.4, 14.5, 10.3, 6.2 at 3.7 and 2.9, as drawn (within 0.1px)',
    w3.length === 4 && w3.every((r, i) => r.key === want[i][0] && Math.abs(r.radius - want[i][1]) <= 0.1001 && Math.abs(r.stroke - want[i][2]) <= 0.1001), w3)
  check('a planned circle has no water ring at any size: water is logged, never planned',
    [44, 150, 196].every(s => !nw.plannedRings(s).some(r => r.key === 'water')))
  check('...and every planned ring fits inside its circle (outer edge within the box)',
    [44, 150].every(s => nw.plannedRings(s).every(r => r.radius + r.stroke / 2 <= s / 2)))

  console.log('\n2. How full each ring is')
  const T = { calories: 3040, protein: 160, carbs: 411, fat: 84 }
  const sh = nw.ringShares({ calories: 1630, protein: 98, carbs: 210, fat: 44 }, T, { ml: 1250, targetMl: 2500 })
  check('eaten over target: calories 1630/3040, water 1.25/2.5', Math.abs((sh.calories ?? 0) - 1630 / 3040) < 1e-9 && sh.water === 0.5, sh)
  const over = nw.ringShares({ calories: 3500, protein: 200, carbs: 0, fat: 84 }, T)
  check('capped at 100%, never past it; zero is empty', over.calories === 1 && over.protein === 1 && over.carbs === 0 && over.fat === 1, over)
  const none = nw.ringShares({ calories: 1630, protein: 98, carbs: 210, fat: 44 }, null)
  check('no targets: no share (a bare track), never full or empty', Object.values(none).every(v => v === null), none)
  check('water only when it is given (a planned day has no water key)', !('water' in nw.ringShares({ calories: 1, protein: 1, carbs: 1, fat: 1 }, T)) && 'water' in sh)

  console.log('\n3. A meal\'s split bar is its share of energy')
  const split = nw.macroEnergySplit(42, 92, 18)
  // 42*4 = 168, 92*4 = 368, 18*9 = 162 → 698
  check('42 g protein, 92 g carbs, 18 g fat: 168, 368 and 162 kcal of 698', !!split && Math.abs(split.protein - 168 / 698) < 1e-9 && Math.abs(split.carbs - 368 / 698) < 1e-9 && Math.abs(split.fat - 162 / 698) < 1e-9, split)
  const fatty = nw.macroEnergySplit(10, 0, 10)
  check('fat counts at 9 a gram, not by its grams (10 g each: fat is 90 of 130 kcal)', !!fatty && Math.abs(fatty.fat - 90 / 130) < 1e-9 && Math.abs(fatty.protein - 40 / 130) < 1e-9, fatty)
  check('a meal with no macros has no bar, never three equal thirds', nw.macroEnergySplit(0, 0, 0) === null)
  check('the three shares make the whole bar', !!split && Math.abs(split.protein + split.carbs + split.fat - 1) < 1e-9)

  console.log('\n4. Left or over, and the week\'s heading')
  check('"1,410 left" with the number grouped', nw.leftOrOverLabel(3040, 1630).text === '1,410 left', nw.leftOrOverLabel(3040, 1630))
  check('over is said as over: "120 over"', nw.leftOrOverLabel(3040, 3160).text === '120 over')
  check('grams carry their unit: "62g left"', nw.leftOrOverLabel(160, 98, 'g').text === '62g left')
  check('litres as he reads them: 1.25, 2.5, 0', nw.litres(1250) === '1.25' && nw.litres(2500) === '2.5' && nw.litres(0) === '0')
  check('one month: "16 – 22 September"', nw.weekRangeLabel(['2026-09-16', '2026-09-22']) === '16 – 22 September', nw.weekRangeLabel(['2026-09-16', '2026-09-22']))
  check('across a month: "28 September – 4 October"', nw.weekRangeLabel(['2026-09-28', '2026-10-04']) === '28 September – 4 October', nw.weekRangeLabel(['2026-09-28', '2026-10-04']))
  check('across a year names both', nw.weekRangeLabel(['2026-12-29', '2027-01-04']) === '29 December 2026 – 4 January 2027', nw.weekRangeLabel(['2026-12-29', '2027-01-04']))

  console.log('\n5. "Shop the whole week" asks for 7 days, once')
  route.openGroceryForDays(7)
  check('it opens the shopping list', hash.value === route.groceryHash(), hash.value)
  const first = route.takeRequestedGroceryDays()
  const second = route.takeRequestedGroceryDays()
  check('the list reads the request once: 7, then nothing (a reload never rebuilds twice)', first === 7 && second === null, [first, second])
  const list = read('src/components/GroceryList.tsx')
  const asked = list.slice(list.indexOf('takeRequestedGroceryDays()'), list.indexOf('takeRequestedGroceryDays()') + 500)
  check('the list takes it on the way in, and a different number rebuilds at once as its day choice does',
    list.includes('takeRequestedGroceryDays()') && /if \(d == null \|\| d === horizonDays\) return/.test(asked) && /setHorizonDays\(d\)/.test(asked) && /handleGenerate\(d\)/.test(asked), asked.slice(0, 300))
  const week = read('src/components/NutritionDisplay.tsx')
  check('the week view\'s Shop button asks for 7', /onShopWeek=\{\(\) => \{[^}]*openGroceryForDays\(7\)/.test(week))

  console.log('\n6. The wiring')
  const nutrition = week
  const card = nutrition.slice(nutrition.indexOf('data-nutrition-hero'), nutrition.indexOf('data-ring-key>') + 1200)
  check('today\'s card draws the five rings, water included, from eaten over target',
    /<NestedRings\s+size=\{TODAY_RING_SIZE\}\s+rings=\{TODAY_RINGS\}/.test(card) && /ringShares\(\{ calories: eaten\.kcal, protein: eaten\.protein, carbs: eaten\.carbs, fat: eaten\.fat \}, macros, \{ ml: todayWaterMl, targetMl: waterTarget \}\)/.test(card), card.slice(0, 300))
  check('...one named row per ring, five, water last', (card.match(/<RingRow k="(\w+)"/g) ?? []).join(',') === '<RingRow k="calories",<RingRow k="protein",<RingRow k="carbs",<RingRow k="fat",<RingRow k="water"', card.match(/<RingRow k="(\w+)"/g))
  check('"+ Water" opens the same quick-add (his 17 Oct "water from Nutrition")', /onClick=\{\(\) => setWaterOpen\(o => !o\)\}[\s\S]{0,800}\+ Water/.test(nutrition) && /handleAddWater\(ml\)/.test(nutrition))
  const planned = read('src/components/nutrition/NutritionWeek.tsx')
  const plannedCard = planned.slice(planned.indexOf('export function PlannedDayCard'), planned.indexOf('export interface WeekViewDay'))
  check('W1: the planned card\'s rings are planned over target, with no water', /rings=\{plannedRings\(150\)\}/.test(plannedCard) && /ringShares\(totals, targets\)/.test(plannedCard) && !/water/i.test(plannedCard.replace(/water is logged, never planned/gi, '')))
  check('W1: the verdict is the engine\'s dayVerdictLabel, never a second opinion', /dayVerdictLabel\(totals, targets\)/.test(plannedCard) && /\{verdict\}/.test(plannedCard))
  check('W1: the add-to-list is in the card', /<AddDayToGrocery\b/.test(plannedCard))
  const meals = read('src/components/MealPlan.tsx')
  check('...and no longer in the meal list (one door, not two)', !/<AddDayToGrocery\b/.test(meals))
  check('...and an upcoming day\'s planned total and verdict are the card\'s, not a second line under it', /\{targets && !upcoming && <TotalsHero/.test(meals))
  const weekView = planned.slice(planned.indexOf('export function NutritionWeekView'))
  check('W3: one day open at a time (one piece of state, a date or none)', /useState<string \| null>\(null\)/.test(weekView) && /setOpen\(o => \(o === day\.date \? null : day\.date\)\)/.test(weekView))
  check('W3: an open day\'s verdict is dayVerdictLabel too', /dayVerdictLabel\(day\.totals, targets\)/.test(weekView))
  check('W3: small rings are planned over target, 44px, no water', /size=\{44\}\s+rings=\{plannedRings\(44\)\}/.test(weekView) && /ringShares\(day\.totals, targets\)/.test(weekView))
  check('W3: today\'s row is the day the today list shows (its chosen meals and their total)', /d\.date === mealStrip\.today \? \{ \.\.\.d, chosen, totals: mealTotals \} : d/.test(nutrition))
  const hook = read('src/hooks/useMealDays.ts')
  check('W3: the days come off the week the strip serves', /week: weekDays/.test(hook) && /week\.map\(\(\{ date, day \}\) => \(\{ date, dayName: weekdayLong\(date\), chosen: day\.chosen, totals: sumChosenMacros\(day\.chosen\) \}\)\)/.test(hook))
  const rows = meals.slice(meals.indexOf('function MealSlotRow'), meals.indexOf('function MealStatus'))
  check('M2: every meal row draws the split bar (the plan\'s and a meal cooked for him)', (rows.match(/<MealMacros\b/g) ?? []).length === 2 && !/<MacroLine protein=\{rowMacros/.test(rows))
  check('M2: "· eaten" once logged and "· leftovers" on last night\'s dinner', /variant === 'eaten' && !upcoming \? ' · eaten' : ''/.test(rows) && /option\?\.leftoverFrom === 'dinner'[\s\S]{0,160}· leftovers/.test(rows))
  const stripSrc = read('src/components/nutrition/MealDayStrip.tsx')
  check('W1: a selected future day is violet, today selected mint', /isSelected && isToday\s*\?\s*\{ background: 'rgba\(var\(--glow-rgb\),\.14\)'/.test(stripSrc) && /var\(--chart-2\) 16%/.test(stripSrc))

  // ONE EXIT: a gate that can print FAIL and exit 0 is worse than none.
  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) process.exit(1)
}

main().catch(err => { console.error(err); console.log(`\n${ran} checks ran, ${failures} failed (crashed).`); process.exit(1) })
