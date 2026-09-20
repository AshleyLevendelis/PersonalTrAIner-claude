// ---------------------------------------------------------------------------
// COOK ONCE, EAT TWICE
//
// Ashley, 19 Sep 2026, from four options: a setting, ON BY DEFAULT. Tonight's
// dinner is tomorrow's lunch, resized; a switch in Profile turns it off.
//
// THE COLLISION THIS FEATURE WALKED INTO, because the gate is shaped by it.
// Hours before this was built, the app was fixed to stop serving the same
// meals every day. Leftovers deliberately repeat a meal. Measured over 400
// profiles before anything was written: holding lunch to last night's dinner
// costs 4.58 -> 4.45 distinct days a week — an eighth of a day, because
// breakfast and dinner keep varying around the held slot. Real in principle,
// almost absent in practice.
//
// Two numbers from the same run that the checks below depend on:
//   - 93.3% of dinners can serve as next day's lunch inside the app's own
//     rules; the 6.7% that cannot all fail the LUNCH PROTEIN FLOOR, none on
//     portion size. So the fallback is the interesting branch, not the
//     happy path.
//   - the portion factor is a median 1.26x, NOT 2x — lunch takes 0.40 of a
//     three-meal day and dinner 0.30, so "cook double" overshoots by a third.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  leftoverLunchFrom, batchCookingOn, buildRotation, assembleRotationDay,
  ROTATION_DAYS, rotationIndexFor, type MealShape,
} from '../src/lib/meal-rotation'
import { computeSlotBudgets, type PoolOption } from '../src/lib/meal-generation'
import { computeMealMacros } from '../src/lib/food-db'
import { COOK_ONCE } from '../src/lib/coach-voice'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

/** A dinner whose stated macros ARE its ingredients' — no invented numbers. */
function realDinner(chickenG: number, riceG: number): PoolOption {
  const ingredients = [
    { name: 'chicken breast', quantity: chickenG, unit: 'g' },
    { name: 'cooked basmati rice', quantity: riceG, unit: 'g' },
  ]
  const m = computeMealMacros(ingredients)
  return {
    slot: 'dinner', name: 'Chicken and rice', ingredients,
    macros: { calories: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat) },
    tags: [],
  }
}

// ===========================================================================
console.log('\n1. Last night\'s dinner, re-portioned as lunch')
// ===========================================================================
{
  const dinner = realDinner(200, 220)
  check('the fixture is a real meal, costed from real food', dinner.macros.calories > 0 && dinner.macros.protein > 0, dinner.macros)

  // A lunch budget deliberately BIGGER than the dinner, the way a three-meal
  // split actually is (0.40 against 0.30). If the two matched, the rescale
  // would be a no-op and this section would prove nothing.
  const lunchBudget: MacroTargets = {
    calories: Math.round(dinner.macros.calories * 1.26),
    protein: Math.round(dinner.macros.protein * 1.26),
    carbs: Math.round(dinner.macros.carbs * 1.26),
    fat: Math.round(dinner.macros.fat * 1.26),
  }
  check('the fixture is under pressure: lunch wants more than dinner served',
    lunchBudget.calories > dinner.macros.calories * 1.1, { dinner: dinner.macros.calories, lunch: lunchBudget.calories })

  const leftover = leftoverLunchFrom(dinner, lunchBudget)
  check('it comes back as a lunch', leftover !== null && leftover.slot === 'lunch', leftover?.slot)
  check('...under the same name, because it is the same food',
    leftover?.name === dinner.name, leftover?.name)
  check('...marked as a leftover, so the card can say where it came from',
    leftover?.leftoverFrom === 'dinner', leftover?.leftoverFrom)
  check('...at LUNCH size, not dinner size — this is what stops the shopping list double-counting',
    leftover !== null && leftover.macros.calories > dinner.macros.calories, { dinner: dinner.macros.calories, leftover: leftover?.macros.calories })
  check('...within the lunch budget it was scaled to',
    leftover !== null && Math.abs(leftover.macros.calories - lunchBudget.calories) / lunchBudget.calories <= 0.10,
    { got: leftover?.macros.calories, wanted: lunchBudget.calories })

  // RECOMPUTED, NOT MULTIPLIED — the rule meal-refit already lives under.
  // Scaling rounds per ingredient, so a multiplied figure and a recomputed one
  // genuinely differ, and the check would be empty if they could not.
  // GUARDED so a leftover that fails to build fails the checks below rather
  // than throwing and taking the other 30 with it. A mutation that switched
  // the feature off entirely ran only 7 of 40 checks — it was still counted as
  // caught because something failed, but a crash and a catch are not the same
  // thing and the checks-ran column is what says which you have.
  const built = leftover ?? { ingredients: [], macros: { calories: -1, protein: 0, carbs: 0, fat: 0 } }
  const recomputed = computeMealMacros(built.ingredients)
  check('its macros are recomputed from the scaled food, not multiplied from the old ones',
    leftover !== null && Math.round(recomputed.kcal) === built.macros.calories, { stated: built.macros.calories, fromFood: Math.round(recomputed.kcal) })
  // TEETH FOR THE CHECK ABOVE. A first version compared the recomputed figure
  // against `dinner.calories * (lunchBudget.calories / dinner.calories)` and
  // called it the multiplied one — which is just the budget, so the comparison
  // was arithmetic that cannot fail either way. The property that actually
  // distinguishes a rescale from a pass-through is the FOOD: every quantity
  // has moved, and moved to a whole number, which is exactly why the macros
  // have to be recomputed rather than multiplied.
  const quantitiesMoved = leftover !== null && built.ingredients.every((ing, i) => ing.quantity !== dinner.ingredients[i].quantity)
  check('...because the food itself was re-portioned, not passed through',
    quantitiesMoved, { before: dinner.ingredients.map(i => i.quantity), after: built.ingredients.map(i => i.quantity) })
  check('...to whole units, which is what makes a multiplied figure wrong',
    leftover !== null && built.ingredients.every(i => Number.isInteger(i.quantity)), built.ingredients.map(i => i.quantity))
}

// ===========================================================================
console.log('\n2. It refuses rather than forcing')
// ===========================================================================
{
  const dinner = realDinner(200, 220)
  // A lunch budget demanding far more protein than the dish can carry at any
  // sane portion — the 6.7% case, and the only one measurement found.
  const proteinHungry: MacroTargets = {
    calories: Math.round(dinner.macros.calories * 1.2),
    protein: Math.round(dinner.macros.protein * 3),
    carbs: dinner.macros.carbs, fat: dinner.macros.fat,
  }
  check('a rescale that would miss the lunch protein floor is refused',
    leftoverLunchFrom(dinner, proteinHungry) === null)
  check('no dinner means no leftover', leftoverLunchFrom(null, { calories: 800, protein: 50, carbs: 80, fat: 25 }) === null)
  check('no lunch budget means no leftover — a two-meal day has nowhere to put it',
    leftoverLunchFrom(dinner, undefined) === null)
  check('a dish with no ingredients cannot be re-portioned',
    leftoverLunchFrom({ ...dinner, ingredients: [] }, { calories: 800, protein: 50, carbs: 80, fat: 25 }) === null)
}

// ===========================================================================
console.log('\n3. The setting, and what its absence means')
// ===========================================================================
{
  check('undefined reads as ON — the default IS the decision', batchCookingOn(undefined) === true)
  check('an empty shape reads as ON', batchCookingOn({}) === true)
  check('true is on', batchCookingOn({ batchCooking: true }) === true)
  check('false is off', batchCookingOn({ batchCooking: false }) === false)

  const migration = read('supabase/migrations/20260919140000_add_batch_cooking.sql')
  check('the column exists with a default, so no profile needs a backfill',
    /ADD COLUMN IF NOT EXISTS batch_cooking boolean NOT NULL DEFAULT true/.test(migration))

  const app = read('src/App.tsx')
  check('the profile load reads it, defaulting to on', /batch_cooking: profileRow\.batch_cooking \?\? true/.test(app))
  // THE TRAP CLAUDE.md NAMES FOR EVERY NEW PROFILE COLUMN: App's onboarding
  // insert is column by column, and a column missing from it is written once
  // and never read back.
  check('the onboarding INSERT names it — or it would be written once and never read back',
    /batch_cooking: enrichedProfile\.batch_cooking \?\? true/.test(app))
  const profileScreen = read('src/components/ProfileScreen.tsx')
  check('Profile can turn it off', /batch_cooking: !\(profile\.batch_cooking \?\? true\)/.test(profileScreen))
  check('...and shows Yes when nothing is stored, matching the default',
    /\(profile\.batch_cooking \?\? true\) \? 'Yes' : 'No'/.test(profileScreen))
}

// ===========================================================================
console.log('\n4. A week of it')
// ===========================================================================
{
  const targets: MacroTargets = { calories: 2200, protein: 165, carbs: 220, fat: 73 }
  const budgets = computeSlotBudgets(targets, 3, false)
  const mk = (slot: MealSlotName, i: number, chicken: number, rice: number): PoolOption => {
    const base = realDinner(chicken, rice)
    return { ...base, slot, name: `${slot}-${i}` }
  }
  // Sized so each slot's options land near its own budget.
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {
    // SIZED FOR THE TARGETS THEY ARE SEARCHED AGAINST. An earlier version used
    // dishes a third of the budget, so every combination missed tolerance and
    // the whole section tested the out-of-tolerance branch by accident — the
    // "comfortable fixture" trap inverted.
    breakfast: [0, 1, 2].map(i => mk('breakfast', i, 200 + i * 8, 240 + i * 12)),
    lunch: [0, 1, 2].map(i => mk('lunch', i, 270 + i * 8, 320 + i * 12)),
    dinner: [0, 1, 2].map(i => mk('dinner', i, 205 + i * 8, 245 + i * 12)),
  }
  const on: MealShape = { mealsPerDay: 3, includeSnacks: false, batchCooking: true }
  const off: MealShape = { ...on, batchCooking: false }

  const rotOn = buildRotation(pools, targets, [], on)
  const rotOff = buildRotation(pools, targets, [], off)

  const leftoverDays = Array.from({ length: ROTATION_DAYS }, (_, i) => rotOn.leftoverFor(i).lunch ? i : -1).filter(i => i >= 0)
  check('with batch cooking on, some days serve last night\'s dinner at lunch',
    leftoverDays.length > 0, { leftoverDays, budget: budgets.lunch })
  check('day 0 never does — the rotation\'s seam, cooked fresh',
    !leftoverDays.includes(0), leftoverDays)
  check('each leftover is the PREVIOUS day\'s dinner, not some other day\'s',
    leftoverDays.every(i => rotOn.leftoverFor(i).lunch!.name === rotOn.days[i - 1].chosen.dinner?.name),
    leftoverDays.map(i => ({ day: i, lunch: rotOn.leftoverFor(i).lunch!.name, yesterdayDinner: rotOn.days[i - 1].chosen.dinner?.name })))
  check('...and it actually reaches the day the app would show',
    leftoverDays.every(i => rotOn.days[i].chosen.lunch?.leftoverFrom === 'dinner'),
    leftoverDays.map(i => rotOn.days[i].chosen.lunch?.leftoverFrom))
  // FOUND ON A REAL SCREEN, not in this file: with the leftover pinned at
  // lunch the assembler happily chose the same dish again for dinner, so the
  // day served a roast chicken tray bake twice. The whole promise is that
  // batch cooking saves cooking, not that it feeds you one plate all day.
  const sameDayRepeats = leftoverDays.filter(i => rotOn.days[i].chosen.dinner?.name === rotOn.days[i].chosen.lunch?.name)
  check('a day that serves last night\'s dinner at lunch does not serve it AGAIN at dinner',
    sameDayRepeats.length === 0,
    sameDayRepeats.map(i => ({ day: i, lunch: rotOn.days[i].chosen.lunch?.name, dinner: rotOn.days[i].chosen.dinner?.name })))

  check('with the setting off, no day serves one',
    Array.from({ length: ROTATION_DAYS }, (_, i) => rotOff.leftoverFor(i).lunch).every(v => v === undefined))
  check('...and off is genuinely a different week from on, so the setting does something',
    JSON.stringify(rotOff.days.map(d => d.chosen)) !== JSON.stringify(rotOn.days.map(d => d.chosen)))

  // NO DOUBLE COUNTING. Each slot holds its own one-portion copy, so a day's
  // totals are the plain sum of its slots whether or not lunch is a leftover.
  // Unconditional for the same reason section 5 is: a loop over an empty list
  // makes its check VANISH rather than fail, and a gate whose check count
  // moves defeats the "how many ran" comparison that separates a crash from a
  // catch.
  const sampleDay = rotOn.days[leftoverDays[0] ?? 0]
  const summed = (Object.values(sampleDay.chosen) as PoolOption[]).reduce((a, o) => a + o.macros.calories, 0)
  check('a day with a leftover still totals the plain sum of its slots — nothing is counted twice',
    leftoverDays.length > 0 && Math.abs(summed - sampleDay.totals.calories) <= 1,
    { day: leftoverDays[0], summed, totals: sampleDay.totals.calories })
}

// ===========================================================================
console.log('\n5. The promise on tonight\'s dinner')
// ===========================================================================
{
  const targets: MacroTargets = { calories: 2200, protein: 165, carbs: 220, fat: 73 }
  const mk = (slot: MealSlotName, i: number, chicken: number, rice: number): PoolOption => {
    const base = realDinner(chicken, rice)
    return { ...base, slot, name: `${slot}-${i}` }
  }
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {
    // SIZED FOR THE TARGETS THEY ARE SEARCHED AGAINST. An earlier version used
    // dishes a third of the budget, so every combination missed tolerance and
    // the whole section tested the out-of-tolerance branch by accident — the
    // "comfortable fixture" trap inverted.
    breakfast: [0, 1, 2].map(i => mk('breakfast', i, 200 + i * 8, 240 + i * 12)),
    lunch: [0, 1, 2].map(i => mk('lunch', i, 270 + i * 8, 320 + i * 12)),
    dinner: [0, 1, 2].map(i => mk('dinner', i, 205 + i * 8, 245 + i * 12)),
  }
  const shape: MealShape = { mealsPerDay: 3, includeSnacks: false, batchCooking: true }
  const rot = buildRotation(pools, targets, [], shape)

  // A date whose NEXT rotation day carries a leftover, found rather than guessed.
  const dates = Array.from({ length: 14 }, (_, k) => `2026-09-${String(k + 1).padStart(2, '0')}`)
  const promising = dates.find(d => rot.leftoverFor(rotationIndexFor(d) + 1).lunch !== undefined)
  check('the fixture contains a day that promises tomorrow\'s lunch', promising !== undefined, dates.map(rotationIndexFor))

  // NO CONDITIONAL BLOCKS BELOW, and that is deliberate. An earlier version
  // wrapped these in `if (promising)`, so switching the feature off made the
  // checks VANISH rather than fail — 37 of 42 ran and the mutation harness
  // could not tell a crash from a skip. A gate's check count should be the
  // same number every run, whatever the code under it is doing.
  const someDate = promising ?? dates[0]
  const day = assembleRotationDay(rot, someDate, pools, targets, [], {})
  check('tonight\'s dinner says it is being cooked for two meals',
    promising !== undefined && day.chosen.dinner?.reusedTomorrow === true, day.chosen.dinner?.name)

  // ...unless the user swapped it. Then the promise is not true any more and
  // must not be made — checked by pinning a DIFFERENT dinner.
  const other = pools.dinner!.find(o => o.name !== day.chosen.dinner?.name) ?? pools.dinner![0]
  const swapped = assembleRotationDay(rot, someDate, pools, targets, [], { dinner: other })
  check('...and stops saying it the moment the user swaps that dinner out',
    swapped.chosen.dinner?.name === other.name && swapped.chosen.dinner?.reusedTomorrow !== true,
    { name: swapped.chosen.dinner?.name, promised: swapped.chosen.dinner?.reusedTomorrow })

  // THE DAY THE APP SHOWS MUST CARRY THE ROTATION'S OWN LEFTOVER, not a fresh
  // answer of its own. Nothing checked that, and a mutation dropping it from
  // the pin map sailed through: every other check read the rotation's internal
  // days rather than the object assembleRotationDay actually returns, which is
  // what the screen renders.
  const leftoverDate = dates.find(d => rot.leftoverFor(rotationIndexFor(d)).lunch !== undefined)
  check('a date whose rotation day carries a leftover exists in the fixture', leftoverDate !== undefined)
  const served = assembleRotationDay(rot, leftoverDate ?? dates[0], pools, targets, [], {})
  const expected = rot.leftoverFor(rotationIndexFor(leftoverDate ?? dates[0])).lunch
  check('...and the day the app would show serves exactly that leftover',
    leftoverDate !== undefined && served.chosen.lunch?.leftoverFrom === 'dinner' && served.chosen.lunch?.name === expected?.name,
    { served: served.chosen.lunch?.name, expected: expected?.name, marked: served.chosen.lunch?.leftoverFrom })
}

// ===========================================================================
console.log('\n6. Both cards say which repeat this is')
// ===========================================================================
{
  const card = read('src/components/MealPlan.tsx')
  check('the lunch says where it came from', /data-meal-leftover=/.test(card) && /COOK_ONCE\.lunch/.test(card))
  check('...only on a meal that actually is one', /option\.leftoverFrom === 'dinner' &&/.test(card))
  check('the dinner promises the repeat before it happens', /data-meal-cook-extra=/.test(card) && /COOK_ONCE\.dinner/.test(card))
  check('...only on a dinner that is actually being doubled', /option\.reusedTomorrow === true &&/.test(card))
  check('both sentences come from the shared phrasebook, not written inline',
    /import \{ COOK_ONCE \}/.test(card) && !/Last night's dinner'/.test(strip(card)))
  check('the phrasebook says tomorrow\'s lunch is this one', /tomorrow/i.test(COOK_ONCE.dinner))
  check('...and names last night on the other side', /last night/i.test(COOK_ONCE.lunch))
}

console.log(failures === 0 ? '\nAll leftovers checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
