/**
 * Gate: the Nutrition tab shows the day, and says one true thing about it.
 *
 * Two failure classes, both already in this repo's history:
 *
 *  1. A MOVE THAT ONLY ADDS. The water quick-adds left this tab for Home on
 *     6 Sep 2026 and the derivation/split/method cards left the scroll for a
 *     sheet. Every one of those is a deletion from one screen and an addition
 *     to another, and the way it goes wrong is that the deletion half never
 *     happens — two screens log one number, or the "moved" card is quietly
 *     gone entirely. §1 and §3 assert both halves: not in the scroll, AND
 *     still reachable behind "How it's set".
 *
 *  2. A NUDGE THAT WILL NOT SHUT UP. The TrAIner's shortfall line is only
 *     worth anything if it stays silent on an ordinary day. That rule is
 *     three thresholds and a tie-break, which is exactly the kind of thing
 *     that cannot be checked by reading JSX — hence macro-shortfall.ts, and
 *     hence §2, which is the reason it was extracted at all.
 */
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  macroShortfallLine, SHORTFALL_SPEAK_FRACTION, COVERING_MIN_FRACTION, LOGGING_GAP_MEALS, loggingGapLine,
  type PlannedMeal,
} from '../src/lib/macro-shortfall'
import { paceClock } from '../src/lib/pace'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const nutrition = read('src/components/NutritionDisplay.tsx')
const meals = read('src/components/MealPlan.tsx')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

/**
 * The three regions this gate talks about, kept apart: the component's own
 * logic (handlers still live there wherever their control renders), the JSX
 * that scrolls, and the JSX inside the sheet. Splitting on the render return
 * rather than on the file — the first cut of this check read the handler
 * definition as "still in the scroll" and went red on correct code.
 */
const renderStart = nutrition.indexOf('\n  return (\n')
const sheetStart = nutrition.indexOf('<Dialog open={howItsSetOpen}')
const scroll = sheetStart === -1 ? nutrition : nutrition.slice(renderStart, sheetStart)
const sheet = sheetStart === -1 ? '' : nutrition.slice(sheetStart)

// ---------------------------------------------------------------------------
console.log('\n1. The scroll is the day; the set-once numbers are behind one link')
// ---------------------------------------------------------------------------
check('the sheet exists at all (sanity check on every check below)', sheetStart !== -1)
check('no Card survives on this tab', !/<Card[ >]/.test(nutrition))
// RE-ANCHORED 17 Oct 2026 (one-page Nutrition, 5c·6): the Target row is one raised row now,
// "Targets & plan settings", with the day's calorie target on it.
check('the Target row is in the scroll', /data-targets-row/.test(scroll) && /Targets &amp; plan settings/.test(scroll))
check('...with the link that opens the sheet', /setHowItsSetOpen\(true\)/.test(scroll))
// RE-ANCHORED 30 Oct 2026 ("less is more"): a plain hairline row now, still at least 52px tall.
check('...on a 44px target (the row is 52px tall)', /className="flex (min-)?h-\[52px\] w-full items-center[^"]*"[\s\S]{0,120}data-targets-row/.test(scroll))
// THE OTHER HALF. Each of these left the scroll; none of them may have left
// the app. A "cleaner tab" that dropped the method picker would be a feature
// deletion wearing a design change's clothes.
for (const [what, needle] of [
  ['the BMR/TDEE derivation', 'derivation.bmr'],
  ['the macro-split control', '<MacroSplitCard'],
  ['the dynamic week table', 'weeklySchedule[day]'],
  ['the method picker', "onMacroModeChange?.('DYNAMIC_CSCS')"],
  ['the water target editor', 'handleSaveWaterTarget'],
] as const) {
  check(`${what} left the scroll`, !scroll.includes(needle))
  check(`...and is still reachable in the sheet`, sheet.includes(needle))
}
// A dialog nothing can open is the same as a deleted card.
check('the sheet is bound to the state the link sets', /open=\{howItsSetOpen\}/.test(sheet))

// ---------------------------------------------------------------------------
console.log('\n2. The shortfall line only speaks when there is something to say')
// ---------------------------------------------------------------------------
{
  const T = { calories: 2400, protein: 180, carbs: 240, fat: 70 }
  const meal = (label: string, logged: boolean, protein: number): PlannedMeal =>
    ({ slot: label.toLowerCase() as PlannedMeal['slot'], label, logged, macros: { calories: 600, protein, carbs: 60, fat: 20 } })
  // THE CLOCK, since 9 Oct 2026 (test:pace-clock holds what it does). These
  // checks are about the thresholds and the covering meal, so they stand at
  // 22:30 on an ordinary day — every meal's time has passed and the whole of
  // each target was due — where the clock is not what decides the answer.
  const base = {
    targets: T,
    eaten: { protein: 0, carbs: 0, fat: 0 },
    waterTargetMl: 2000,
    waterMl: 2000,
    meals: [] as PlannedMeal[],
    clock: paceClock(new Date('2026-03-11T22:30:00'), ['2026-02-01T09:00:00']),
  }

  check('nothing behind → silent',
    macroShortfallLine({ ...base, eaten: { protein: 180, carbs: 240, fat: 70 } }) === null)
  check('no targets at all → silent, not "100% behind"',
    macroShortfallLine({ ...base, targets: null, waterTargetMl: 0 }) === null)
  // Just under the threshold and just over it, so the constant is the thing
  // being tested rather than a number that happens to work.
  const justUnder = T.protein * (SHORTFALL_SPEAK_FRACTION - 0.02)
  const justOver = T.protein * (SHORTFALL_SPEAK_FRACTION + 0.02)
  check('a small gap → silent',
    macroShortfallLine({ ...base, eaten: { protein: T.protein - justUnder, carbs: 240, fat: 70 } }) === null)
  check('a wide gap → spoken',
    /Protein is behind/.test(macroShortfallLine({ ...base, eaten: { protein: T.protein - justOver, carbs: 240, fat: 70 } }) ?? ''))

  // ONE, so a bad day is one sentence and not four. Re-anchored 10 Oct 2026
  // (runs 3-4, LOW): PROTEIN FIRST whenever it is one of the gaps — fat at
  // 93% behind beat protein at 44% on share, and the tester read "Fat is
  // behind" at 9pm on a day planned around protein.
  const twoBehind = macroShortfallLine({ ...base, eaten: { protein: 100, carbs: 240, fat: 5 } })
  check('protein and fat behind → protein is named, and only protein',
    /^Protein is behind/.test(twoBehind ?? '') && !/Fat/.test(twoBehind ?? ''), twoBehind)
  // Without protein in it, the widest SHARE still decides: carbs 200/240
  // (83%) beats fat 40/70 (57%) though fat is not the bigger number.
  const noProtein = macroShortfallLine({ ...base, eaten: { protein: 180, carbs: 40, fat: 30 } })
  check('protein fine, carbs and fat behind → the wider share is named',
    /^Carbs is behind/.test(noProtein ?? '') && !/Fat/.test(noProtein ?? ''), noProtein)

  // A LOGGING GAP IS NOT AN EATING GAP (runs 3-4, LOW). 22:30, so every meal
  // is past its time: three unlogged says what is unlogged, two does not.
  const four = (logged: boolean[]) => (['breakfast', 'lunch', 'snack', 'dinner'] as const)
    .map((slot, i) => ({ slot, label: slot[0].toUpperCase() + slot.slice(1), logged: logged[i], macros: { calories: 500, protein: 40, carbs: 60, fat: 18 } }))
  const threeOpen = macroShortfallLine({ ...base, eaten: { protein: 40, carbs: 60, fat: 18 }, meals: four([true, false, false, false]) })
  check(`${LOGGING_GAP_MEALS} meals past their time unlogged → the line is about logging, not a macro`,
    threeOpen === loggingGapLine(3) && !/behind/.test(threeOpen ?? ''), threeOpen)
  const twoOpen = macroShortfallLine({ ...base, eaten: { protein: 80, carbs: 120, fat: 36 }, meals: four([true, true, false, false]) })
  check('...two unlogged keeps the ordinary line', /behind/.test(twoOpen ?? ''), twoOpen)
  // Dinner is not due at 13:00, so it is not counted as unlogged.
  const midday = macroShortfallLine({ ...base, clock: paceClock(new Date('2026-03-11T15:00:00'), ['2026-02-01T09:00:00']),
    eaten: { protein: 0, carbs: 0, fat: 0 }, meals: four([false, false, false, false]) })
  check('...and a meal whose time has not come is not counted (15:00, two due)', midday !== null && midday !== loggingGapLine(4) && midday !== loggingGapLine(2) && /behind/.test(midday), midday)
  // RUN 7, L48: 18:00, all four unlogged, three of them due. The line said "3 of today's meals still to log".
  const evening = macroShortfallLine({ ...base, clock: paceClock(new Date('2026-03-11T18:00:00'), ['2026-02-01T09:00:00']),
    eaten: { protein: 0, carbs: 0, fat: 0 }, meals: four([false, false, false, false]) })
  check('...and the number said is every meal still to log, not only the due ones (18:00, four unlogged: "4")', evening === loggingGapLine(4), evening)
  const eveningTwoDue = macroShortfallLine({ ...base, clock: paceClock(new Date('2026-03-11T18:00:00'), ['2026-02-01T09:00:00']),
    eaten: { protein: 40, carbs: 60, fat: 18 }, meals: four([true, false, false, false]) })
  check('...while speaking still waits for three DUE (18:00, breakfast logged: two due, no logging line)', eveningTwoDue !== loggingGapLine(3) && eveningTwoDue !== loggingGapLine(2), eveningTwoDue)
  check('...and water alone never becomes a logging line',
    macroShortfallLine({ ...base, eaten: { protein: 180, carbs: 240, fat: 70 }, waterMl: 0, meals: four([false, false, false, false]) }) === 'Water is behind — 2000ml to go.')

  // The covering meal.
  const withDinner = macroShortfallLine({
    ...base, eaten: { protein: 40, carbs: 240, fat: 70 },
    meals: [meal('Lunch', true, 90), meal('Dinner', false, 60)],
  })
  check('an unlogged meal that covers the gap is named', /your dinner has 60g of it/i.test(withDinner ?? ''), withDinner)
  check('...and a LOGGED meal never is', !/lunch/i.test(withDinner ?? ''), withDinner)

  // Capped at the gap: a 200g meal against a 60g shortfall covers 60 of it.
  const capped = macroShortfallLine({
    ...base, eaten: { protein: T.protein - 70, carbs: 240, fat: 70 },
    meals: [meal('Dinner', false, 200)],
  })
  check('what the meal covers is capped at what is missing', /has 70g of it/.test(capped ?? ''), capped)

  // Below the covering threshold the meal is not worth naming — saying it
  // makes the gap look handled.
  const tiny = macroShortfallLine({
    ...base, eaten: { protein: 40, carbs: 240, fat: 70 },
    meals: [meal('Snack', false, Math.floor((T.protein - 40) * (COVERING_MIN_FRACTION - 0.05)))],
  })
  check('a meal that barely dents it is not named', /^Protein is behind — 140g to go\.$/.test(tiny ?? ''), tiny)

  // Water has no planned meal behind it.
  const water = macroShortfallLine({
    ...base, eaten: { protein: 180, carbs: 240, fat: 70 }, waterMl: 200,
    meals: [meal('Dinner', false, 60)],
  })
  check('a water gap is spoken', /^Water is behind — 1800ml to go\.$/.test(water ?? ''), water)
  check('...and never names a meal', !/dinner/i.test(water ?? ''), water)

  // The component must actually use it, or the whole section tests a module
  // nothing renders — the failure this repo has already shipped twice.
  check('NutritionDisplay calls the rule rather than keeping a copy',
    /macroShortfallLine\(/.test(nutrition) && !/const gaps = \[/.test(nutrition))
  // ...one coach voice (17 Oct 2026): a resize or top-up offer showing takes the line's place.
  check('...and renders the result through the shared nudge',
    /\{macroNudge && !mealRefit && !\(mealTopUp && !mealTopUpNote\) && <TrainerNudge/.test(nutrition))
}

// ---------------------------------------------------------------------------
console.log('\n3. The legend is four rows in two columns, beside the rings')
// ---------------------------------------------------------------------------
// RE-ANCHORED 10 Oct 2026 (design handoff 2b): the legend became the RING
// KEY — four rows in a 2x2 grid, named in full, in the order the rings sit —
// and fat, which lost its ring, is a muted line under it so its number stays.
// RE-ANCHORED 17 Oct 2026 (one-page Nutrition, 5c·6): NO RINGS on this screen. The calories are a bar
// under the number left, and the four macros sit in a 2x2 grid, each with its own bar — fat included, so
// fat has its own cell again rather than a muted line.
// RE-ANCHORED 30 Oct 2026 ("less is more", her "Move things"): the four sit in ONE row of four, no icons.
check('a one-row grid of four holds it', /grid grid-cols-4[^"]*" data-ring-key/.test(nutrition))
for (const label of ['label="Protein"', 'label="Carbs"', 'label="Fat"', 'label="Water"']) {
  check(`the grid carries ${label}`, nutrition.includes(label))
}
check('the cells are those four, in that order (protein, carbs / fat, water)',
  /k="protein"[\s\S]{0,400}k="carbs"[\s\S]{0,400}k="fat"[\s\S]{0,400}k="water"/.test(nutrition))
check('the calories are a bar, not a ring', /testid="kcal-bar"/.test(nutrition) && !/<circle/.test(nutrition))
check('the hero is what is LEFT (2b), the eaten figure under it', /data-testid="kcal-left-number"/.test(nutrition) && /data-testid="kcal-eaten"/.test(nutrition) && /ds-num-mega/.test(nutrition))
check('the caption says left or over, from the phrasebook', /kcalLeftOrOver\(macros\.calories - eaten\.kcal\)/.test(nutrition) && /data-testid="kcal-left">kcal \{word\}/.test(nutrition))

// ---------------------------------------------------------------------------
console.log('\n4. The meal list points at the list it fills')
// ---------------------------------------------------------------------------
// RE-ANCHORED 10 Oct 2026 (2b): the link is the "Grocery" pill in the
// Nutrition header now, there even before any meals are; the day-added row's
// "Open list ›" in MealPlan still goes to the same route.
// 17 Oct 2026 (5c·6): a 40px round basket button, named for a screen reader.
check('the header links to the grocery list', /aria-label="Grocery list"\s*data-grocery-pill/.test(nutrition) && /<ShoppingBasket /.test(nutrition))
// THE LIST MOVED OFF TOOLS, 12 Sep 2026 (design handoff 2b ›). It has a
// screen of its own under Nutrition — where it is built from — so the link
// goes there and the sanity check follows it. The property is unchanged: the
// header must point at somewhere the list actually is.
check('...at the real grocery route, not a hand-written hash',
  /window\.location\.hash = groceryHash\(\)/.test(nutrition) && !/'#\/nutrition\/grocery'/.test(nutrition) && !/'#\/nutrition\/grocery'/.test(meals))
check('...and that route really is where the list lives (sanity check on this check)',
  /groceryHash\(\)/.test(read('src/App.tsx')) && /<GroceryList/.test(read('src/components/GroceryScreen.tsx')))
check('regenerating all the meals is still reachable', /onClick=\{onRegenerateAll\}/.test(meals))
check('a collapsed row ends in a chevron', /<ChevronRight className="size-3\.5/.test(meals))
// 2b: a logged meal sits under "Eaten" with a tick circle before it, and its
// number is what was LOGGED (the meal actually eaten), not the plan's dish.
check('...and a logged meal shows what was logged, with its tick',
  /const kcalShown = Math\.round\(isLogged \? loggedKcal : \(option\?\.macros\.calories \?\? 0\)\)/.test(meals)
  && /variant === 'eaten' && \([\s\S]{0,400}<Check /.test(meals))

// ---------------------------------------------------------------------------
console.log('\n5. Every file this gate speaks for is actually mounted')
// ---------------------------------------------------------------------------
for (const rel of ['src/components/NutritionDisplay.tsx', 'src/components/MealPlan.tsx', 'src/lib/macro-shortfall.ts']) {
  check(`${rel} exists`, existsSync(join(ROOT, rel)))
  const base = rel.split('/').pop()!.replace(/\.tsx?$/, '')
  const importers = execSync(
    `grep -rl "from '[^']*${base}'" src/ --include=*.tsx --include=*.ts || true`,
    { cwd: ROOT, encoding: 'utf8' },
  ).split('\n').filter(l => l.trim() && !l.endsWith(rel))
  check(`...and something imports ${base}`, importers.length > 0, importers)
}

if (failures > 0) { console.error(`\n${failures} nutrition-layout check(s) FAILED\n`); process.exit(1) }
console.log('\nAll nutrition-layout checks passed.\n')
