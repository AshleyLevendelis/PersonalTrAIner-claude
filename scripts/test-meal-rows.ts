/**
 * Gate: which meals the Nutrition list draws (the Profile walk, 19 Nov 2026; his 14 Nov ruling "a day serves only the
 * meals the profile says").
 *
 * Two meals a day, or no snacks, left "Lunch · No option generated" and "Snack · No option generated" on Nutrition,
 * each with a Generate button: the list drew a row for any meal that still had saved dishes, and a change of setting
 * rightly keeps those dishes. The rule is one function (mealRowsFor); the screen is driven by verify:meal-shape-rows.
 *
 * The `serves` lists here come from the app's own computeSlotBudgets, never typed in, so this cannot agree with
 * itself about which meals a two-meal day has.
 */
import { readFileSync } from 'fs'
import { mealRowsFor } from '../src/lib/meal-sections'
import { computeSlotBudgets } from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'

let ran = 0, failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const ORDER: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const targets = { calories: 2400, protein: 160, carbs: 280, fat: 70 } as unknown as MacroTargets
const serves = (meals: number | null, snacks: boolean | null, skipBreakfast = false): Slot[] =>
  meals == null ? [] : (Object.keys(computeSlotBudgets(targets, meals, snacks ?? undefined, skipBreakfast)) as Slot[])
const dish = [{ name: 'a dish' }]
const full = { breakfast: dish, lunch: dish, dinner: dish, snack: dish }
const none = () => false
const rows = (pools: Partial<Record<Slot, unknown[]>>, s: Slot[], snacksUnset = false, logged: (x: Slot) => boolean = none) =>
  mealRowsFor({ order: ORDER, pools, serves: s, snacksUnset, logged })

console.log('\n1. The meals the profile serves are the meals listed')
check('the app serves breakfast and dinner on a two-meal day (the fixture binds)', serves(2, false).join(',') === 'breakfast,dinner', serves(2, false))
check('three meals and a snack: all four', rows(full, serves(3, true)).listed.join(',') === 'breakfast,lunch,dinner,snack')
check('two meals, no snacks: breakfast and dinner only, though lunch and the snack still have saved dishes', rows(full, serves(2, false)).listed.join(',') === 'breakfast,dinner', rows(full, serves(2, false)))
check('three meals, no snacks: the snack goes and nothing else', rows(full, serves(3, false)).listed.join(',') === 'breakfast,lunch,dinner')
check('two meals with breakfast skipped: lunch and dinner', rows(full, serves(2, false, true)).listed.join(',') === 'lunch,dinner', rows(full, serves(2, false, true)))
check('the order is the day\'s, whatever order the lists come in', rows(full, ['snack', 'dinner', 'breakfast'] as Slot[]).listed.join(',') === 'breakfast,dinner,snack')

console.log('\n2. A meal the profile does not serve is never drawn as empty')
const lunchEmpty = { breakfast: dish, lunch: [], dinner: dish, snack: [] }
check('a served meal with no dish IS drawn as empty (it needs making)', rows(lunchEmpty, serves(3, true)).empty.join(',') === 'lunch,snack', rows(lunchEmpty, serves(3, true)))
check('...and a served meal the store has no row for at all', rows({ breakfast: dish }, serves(3, false)).empty.join(',') === 'lunch,dinner')
check('a meal he no longer eats is not, even with an empty list left behind', rows(lunchEmpty, serves(2, false)).empty.length === 0, rows(lunchEmpty, serves(2, false)))
check('...and is not listed either', rows(lunchEmpty, serves(2, false)).listed.join(',') === 'breakfast,dinner')

console.log('\n3. What he ate is never hidden, and an unknown profile drops nothing')
check('a lunch logged today stays listed after he changes to two meals', rows(full, serves(2, false), false, s => s === 'lunch').listed.join(',') === 'breakfast,lunch,dinner')
check('...but a logged meal with no saved dish is not invented as a row', rows({ breakfast: dish, dinner: dish }, serves(2, false), false, s => s === 'lunch').listed.join(',') === 'breakfast,dinner')
check('a profile with no meal count (an older one) lists every meal with dishes', rows(full, serves(null, null)).listed.join(',') === 'breakfast,lunch,dinner,snack')
check('...and draws an empty list as empty, as it always did', rows(lunchEmpty, serves(null, null)).empty.join(',') === 'lunch,snack')
// A profile that never said whether snacks are on: the day engine keeps the snack (poolsForShape), and so does the list.
const noSnackSaid = serves(3, false)
check('snacks never answered: the snack stays, as the day engine keeps it', rows(full, noSnackSaid, true).listed.join(',') === 'breakfast,lunch,dinner,snack' && rows(full, noSnackSaid, false).listed.join(',') === 'breakfast,lunch,dinner')

console.log('\n4. The screen asks the rule')
const screen = readFileSync('src/components/MealPlan.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check('the list and the empty rows both come from mealRowsFor, on the profile\'s own meals',
  /const \{ listed: activeSlots, empty: emptySlots \} = mealRowsFor\(\{\s*order: SLOT_ORDER, pools, serves: expectedSlots, snacksUnset: includeSnacks == null,/.test(screen))
check('...and neither is worked out a second way', !/const activeSlots = SLOT_ORDER\.filter/.test(screen) && !/const emptySlots = SLOT_ORDER\.filter/.test(screen))

console.log(`\n${ran} checks ran. ${failures === 0 ? 'Nutrition lists the meals the profile serves.' : `${failures} FAILED.`}`)
process.exit(failures === 0 ? 0 : 1)
