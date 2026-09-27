/**
 * test:kept-meal-restriction — a kept meal that breaks a later restriction is
 * not served (27 Sep 2026).
 *
 * Ashley's ruling, from three options: "stop serving it". It stays in the
 * hearted list, marked as clashing, never appears in a day while the
 * restriction is on, and comes back if the restriction is lifted. Plan:
 * docs/plans/kept-meal-restriction.md.
 *
 * verify:kept-meal drives the screens. This holds:
 *   1. the day's pick, on real food: a marked meal is never chosen, not even
 *      as the best or the only fit, and a pick naming it is set aside, not
 *      deleted, so unmarking brings both back;
 *   2. the whole week: none of seven days serves it;
 *   3. the wiring: App and the harness read the same hook, and the screens
 *      agree with the day's pick.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { assembleDay, type PoolOption } from '../src/lib/meal-generation'
import { markRestrictionBreakers } from '../src/lib/meal-restriction-check'
import { buildRotation, assembleRotationDay } from '../src/lib/meal-rotation'
import { computeMealMacros } from '../src/lib/food-db'
import type { MealSlotName } from '../src/lib/meal-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

// REAL FOOD, costed from the food database, so every resize the search tries
// is a real one (the 27 Sep likes review found a fixture with invented macros
// hiding the resize branch entirely).
const L = (name: string, quantity: number, unit = 'g') => ({ name, quantity, unit })
const dish = (slot: MealSlotName, name: string, ing: { name: string; quantity: number; unit: string }[], tags: string[] = []): PoolOption => {
  const c = computeMealMacros(ing)
  return { slot, name, ingredients: ing, tags, macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
}
const porridge = dish('breakfast', 'Porridge', [L('oats', 80), L('semi-skimmed milk', 250, 'ml')])
const chicken = dish('dinner', 'Chicken and rice', [L('chicken breast', 200), L('white rice', 200), L('broccoli', 100), L('olive oil', 10)])
const risotto = dish('dinner', 'Chicken and mushroom risotto', [L('chicken breast', 190), L('white rice', 200), L('mushrooms', 100), L('olive oil', 10)], ['favourite'])
// The day is porridge plus the RISOTTO exactly: unmarked, the risotto is the
// best fit and wins, so anything else being served is the marking at work.
const day = {
  calories: porridge.macros.calories + risotto.macros.calories, protein: porridge.macros.protein + risotto.macros.protein,
  carbs: porridge.macros.carbs + risotto.macros.carbs, fat: porridge.macros.fat + risotto.macros.fat,
}
const kept = { breakfast: [porridge], dinner: [chicken, risotto] }

console.log('kept meal restriction — a kept meal she now avoids is not served')

console.log('\n[1] The day\'s pick')
{
  const unmarked = assembleDay(kept, day)
  check('the sanity check: unmarked, the kept risotto is the best fit and is served', unmarked.chosen.dinner?.name === risotto.name, unmarked.chosen.dinner?.name)
  const marked = markRestrictionBreakers(kept, [], ['mushroom'])
  const served = assembleDay(marked, day)
  check('once mushrooms are avoided it is NOT served, though it fits best', served.chosen.dinner?.name === chicken.name, served.chosen.dinner?.name)
  check('...and the swap list still has it, so it can be shown marked', (served.alternatives.dinner ?? []).some(o => o.name === risotto.name))

  const onlyIt = assembleDay(markRestrictionBreakers({ breakfast: [porridge], dinner: [risotto] }, [], ['mushroom']), day)
  check('as the ONLY dinner it is still not served: the slot has no meal', onlyIt.chosen.dinner === undefined, onlyIt.chosen.dinner?.name)
  check('...and the slot is reported missing, not quietly dropped', onlyIt.missingSlots.includes('dinner'), onlyIt.missingSlots)
  check('...while the other slot is still served', onlyIt.chosen.breakfast?.name === porridge.name)

  // A PICK FOR THIS DATE, made before the restriction: set aside, not deleted.
  const pinnedMarked = assembleDay(marked, day, {}, [], { dinner: marked.dinner![1] })
  check('a pick for the day naming it is set aside: the other dinner is served', pinnedMarked.chosen.dinner?.name === chicken.name, pinnedMarked.chosen.dinner?.name)
  const pinnedOther = assembleDay(marked, day, {}, [], { dinner: marked.dinner![0] })
  check('...while a pick naming a meal she can eat is honoured as always', pinnedOther.chosen.dinner?.name === chicken.name)

  const lifted = markRestrictionBreakers(marked, [], [])
  check('lifting the restriction brings it back', assembleDay(lifted, day).chosen.dinner?.name === risotto.name)
  check('...and the pick for the day with it', assembleDay(lifted, day, {}, [], { dinner: lifted.dinner![1] }).chosen.dinner?.name === risotto.name)

  const byDiet = assembleDay(markRestrictionBreakers(kept, ['vegetarian'], []), { ...day })
  check('a diet restriction marks the same way (vegetarian: neither dinner, the breakfast still served)',
    byDiet.chosen.dinner === undefined && byDiet.chosen.breakfast?.name === porridge.name, byDiet.chosen)
}

console.log('\n[2] The whole week')
{
  const shape = { mealsPerDay: 2, includeSnacks: false, batchCooking: false }
  const lunch = dish('lunch', 'Chicken wrap', [L('chicken breast', 150), L('tortilla wrap', 60)])
  const pools = { breakfast: [porridge], lunch: [lunch], dinner: [chicken, risotto] }
  const weekDay = { ...day, calories: day.calories + lunch.macros.calories, protein: day.protein + lunch.macros.protein, carbs: day.carbs + lunch.macros.carbs, fat: day.fat + lunch.macros.fat }
  const dates = Array.from({ length: 7 }, (_, i) => `2026-09-${String(21 + i).padStart(2, '0')}`)
  const week = (p: typeof pools) => { const r = buildRotation(p, weekDay, [], shape); return dates.map(d => assembleRotationDay(r, d, p, weekDay, [], {}).chosen.dinner?.name) }
  const freeWeek = week(pools)
  check('the sanity check: unmarked, the risotto is served on some days', freeWeek.includes(risotto.name), freeWeek)
  const avoidWeek = week(markRestrictionBreakers(pools, [], ['mushroom']) as typeof pools)
  check('once avoided, on none of the seven', !avoidWeek.includes(risotto.name) && avoidWeek.every(n => n === chicken.name), avoidWeek)
}

console.log('\n[3] The wiring')
{
  const app = read('src/App.tsx')
  check('App assembles from the shared hook\'s pools', /const mealPools = useServablePools\(storedMealPools, profile\?\.dietary_preferences, memoryFacts\)/.test(app))
  check('...and nothing that assembles a day reads the stored ones directly',
    !/(buildRotation|assembleRotationDay|checkMealRefit|useMealDays)\([^;]*storedMealPools/.test(app) && !/mealPools=\{storedMealPools\}/.test(app))
  const hook = read('src/hooks/useServablePools.ts')
  check('the hook marks with the meal card\'s own check, from her dislikes', /markRestrictionBreakers\(stored, dietaryPreferences \?\? \[\], compileFoodDislikes\(facts\)\)/.test(hook))
  const harness = read('.tour-harness/real.tsx')
  check('the browser harness runs the SAME hook, so verify:kept-meal measures the app\'s marking',
    /useServablePools\(livePools as never, profile\.dietary_preferences, AVOID_FACTS\)/.test(harness) && /pools: servablePools,/.test(harness))

  const plan = read('src/components/MealPlan.tsx')
  check('the "no longer fit your restrictions" notice also covers a slot where every saved option clashes',
    /!chosen\[s\] && \(pools\[s\]\?\.length \?\? 0\) > 0 && pools\[s\]!\.every\(o => o\.breaksRestriction\)/.test(plan))
  check('...and the empty row says nothing saved fits, not that nothing was made', /'Nothing saved fits what you avoid'/.test(plan))
  check('the swap list cannot offer what the day\'s pick will not serve', /const verdict = !checked\.ok \|\| !alt\.breaksRestriction \? checked : \{ \.\.\.checked, ok: false \}/.test(plan))

  const prof = read('src/components/ProfileScreen.tsx')
  check('Profile marks a clashing heart from the stored pools and the same check',
    /getPools\(profileId\)/.test(prof) && /markRestrictionBreakers\(storedPools, profile\.dietary_preferences \?\? \[\], compileFoodDislikes\(facts\)\)/.test(prof)
    && /data-clashes=\{clashingHearts\.has\(name\) \? 'yes' : 'no'\}/.test(prof))

  // Already true before today, and the reason the ruling needed no coach
  // change: the coach's swap refuses a meal she avoids, named or not.
  const swap = read('src/lib/meal-swap-proposal.ts')
  check('the coach\'s swap already refuses a meal she avoids', /const allowed = options\.filter\(o => optionBlockedBy\(o, disliked, prefs\) === null\)/.test(swap))
}

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('kept meal restriction: all checks passed')
