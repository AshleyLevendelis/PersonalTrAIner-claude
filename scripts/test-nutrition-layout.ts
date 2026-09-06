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
  macroShortfallLine, SHORTFALL_SPEAK_FRACTION, COVERING_MIN_FRACTION,
  type PlannedMeal,
} from '../src/lib/macro-shortfall'

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
check('the Target row is in the scroll', /className="ds-label">Target</.test(scroll))
check('...with the link that opens the sheet', /setHowItsSetOpen\(true\)/.test(scroll))
check('...on a 44px target', /hit-slop-44[^"]*"\s*\n?\s*>\s*\n?\s*How it's set/.test(scroll)
  || /How it's set/.test(scroll) && /hit-slop-44/.test(scroll))
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
    ({ label, logged, macros: { calories: 600, protein, carbs: 60, fat: 20 } })
  const base = {
    targets: T,
    eaten: { protein: 0, carbs: 0, fat: 0 },
    waterTargetMl: 2000,
    waterMl: 2000,
    meals: [] as PlannedMeal[],
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

  // Only the WIDEST, so a bad day is one sentence and not four.
  // Fat 65/70 behind (93%) beats protein 80/180 (44%) — the widest SHARE,
  // not the biggest number, which is the whole point of the tie-break.
  const twoBehind = macroShortfallLine({ ...base, eaten: { protein: 100, carbs: 240, fat: 5 } })
  check('two macros behind → only the wider one is named',
    /^Fat is behind/.test(twoBehind ?? '') && !/Protein/.test(twoBehind ?? ''), twoBehind)

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
  check('...and renders the result through the shared nudge',
    /\{macroNudge && <TrainerNudge/.test(nutrition))
}

// ---------------------------------------------------------------------------
console.log('\n3. The legend is four rows in two columns, beside the rings')
// ---------------------------------------------------------------------------
check('a 2-column grid holds it', /grid-cols-2 gap-x-3 gap-y-1/.test(nutrition))
for (const letter of ["label: 'P'", "label: 'C'", "label: 'F'", "label: 'H\\u2082O'"]) {
  check(`the legend carries ${letter}`, nutrition.includes(letter))
}
check('calories stay the hero number, not a legend row', /ds-num-mega/.test(nutrition) && !/label: 'K'/.test(nutrition))
check('the caption says what is left, not only what is eaten', /kcal · <span className="tabular-mono">/.test(nutrition))

// ---------------------------------------------------------------------------
console.log('\n4. The meal list points at the list it fills')
// ---------------------------------------------------------------------------
check('the header links to the grocery list', /Grocery list ›/.test(meals))
check('...at the real Tools route, not a hand-written hash',
  /tabHash\('tools'\)/.test(meals) && !/'#\/tab\/tools'/.test(meals))
check('...and Tools really is where the list lives (sanity check on this check)',
  /GroceryList/.test(read('src/components/ToolsTab.tsx')))
check('regenerating all the meals is still reachable', /onClick=\{onRegenerateAll\}/.test(meals))
check('a collapsed row ends in a chevron', /<ChevronRight className="size-3\.5/.test(meals))
check('...with the logged tick after the number, not before',
  /\{Math\.round\(isLogged \? loggedKcal : option\.macros\.calories\)\} kcal\{isLogged \? ' ✓' : ''\}/.test(meals))

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
