/**
 * Gate: moving a meal to another slot, and the resize that makes it fit.
 *
 * The last operation on the meal grain that existed on no surface. CLAUDE.md
 * had it MISSING "and deliberately: a dinner dropped into a breakfast slot
 * does not fit breakfast's budget, and refuse / refit / rescale is Ashley's
 * call." She made both calls — "Resize it to fit" (13 Sep 2026) and, on what
 * happens to the slot the meal left, "they swap places" (14 Sep 2026).
 *
 * WHAT THIS FILE EXISTS FOR, in order of how badly each would hurt:
 *
 *  1. THE DIETARY CHECKS RUN ON BOTH LEGS. A move cannot introduce an
 *     allergen — the foods are identical, only the amounts change — and that
 *     is exactly the reasoning that let the almond butter through the swap
 *     path, so it is verified anyway, on both halves, through the one
 *     pipeline.
 *  2. THE RESIZE ACTUALLY HITS THE DESTINATION BUDGET. "Resize it to fit" is
 *     the ruling; a move that leaves a 620 kcal dinner sitting in a 310 kcal
 *     snack slot has not done it.
 *  3. AN ABSURD RESIZE IS REFUSED, NOT FORCED. portion-scaler's existing
 *     0.4x-2.5x rule, not a new one: nobody is served a 40g dinner.
 *  4. THE MOVED MEAL IS RENAMED. A pick resolves by NAME, so an option that
 *     keeps its name is indistinguishable from the original and the screen
 *     goes on rendering the old meal while the write lands in the database.
 *     That has already happened once here, on the food edits.
 *  5. HER WORDS SURVIVE. "3 slices wholemeal bread" must not come back as
 *     "3 slice wholemeal bread" — only the number may change.
 */
import { buildMealMoveProposal, resizeMealTo, movedName } from '../src/lib/meal-move'
import { computeSlotBudgets, verifyProposal } from '../src/lib/meal-generation'
import { MIN_SCALE_FACTOR, MAX_SCALE_FACTOR } from '../src/lib/portion-scaler'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'
import type { CurrentMealForSlot } from '../src/lib/meal-food-add'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const TARGETS: MacroTargets = { calories: 2400, protein: 180, carbs: 240, fat: 80 }
const BUDGETS = computeSlotBudgets(TARGETS, 4, true)

/**
 * Meals built from REAL food-db foods, because verifyProposal resolves every
 * line against food-db and applies an 80% coverage floor. A fixture of made-up
 * ingredients would be rejected for coverage and every check below would pass
 * or fail for the wrong reason.
 */
const chickenDinner = (kcalScale = 1): CurrentMealForSlot => ({
  name: 'Chicken and Rice',
  ingredients: [`${Math.round(200 * kcalScale)}g chicken breast`, `${Math.round(180 * kcalScale)}g white rice`, `${Math.round(120 * kcalScale)}g broccoli`],
  macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
})

/**
 * THE MACROS FOOD-DB COMPUTES, not the ones the fixture claims.
 *
 * The first version of this probed `buildMealMoveProposal` and read the leg's
 * `afterKcal` — which is the calorie count AFTER the resize, so the fixture
 * ended up asserting a yoghurt snack was 653 kcal. The swap then scaled it by
 * a factor derived from that fiction and §2's "the returning meal grew" check
 * failed on correct code. Ask the verifier directly instead: in keepPortions
 * mode it skips the scaling and the slot bands, so what comes back is the
 * ingredient list's own worth.
 */
function withRealMacros(meal: CurrentMealForSlot, slot: MealSlotName): CurrentMealForSlot {
  const budget = BUDGETS[slot]!
  const log: string[] = []
  const option = verifyProposal(
    { slot, name: meal.name, ingredients: meal.ingredients, prep: '', cuisine: '' },
    slot, budget, [], log, [], undefined, true,
  )
  if (!option) throw new Error(`fixture "${meal.name}" does not verify: ${log.join(' | ')}`)
  return { ...meal, macros: option.macros }
}

const move = (over: Partial<Parameters<typeof buildMealMoveProposal>[0]> = {}) => buildMealMoveProposal({
  rawArgs: { from_slot: 'dinner', to_slot: 'snack' },
  mealsBySlot: {},
  profileId: 'p', todayDate: '2026-09-14', targets: TARGETS, mealsPerDay: 4, includeSnacks: true,
  dietaryPreferences: [], dislikedFoods: [],
  ...over,
})

// ---------------------------------------------------------------------------
console.log('\n0. The fixture, and the budgets it moves between')
// ---------------------------------------------------------------------------
check('the four slots have budgets (sanity check on this file)',
  !!BUDGETS.breakfast && !!BUDGETS.lunch && !!BUDGETS.dinner && !!BUDGETS.snack, Object.keys(BUDGETS))
// THE MOVE HAS TO MATTER. If dinner and snack were worth the same, every
// resize check below would pass on a no-op.
check('...and a snack really is smaller than a dinner, or there is nothing to resize',
  BUDGETS.snack!.calories < BUDGETS.dinner!.calories * 0.75,
  { snack: BUDGETS.snack!.calories, dinner: BUDGETS.dinner!.calories })

const dinner = withRealMacros(chickenDinner(), 'dinner')
check('the fixture dinner resolves against food-db and has real calories',
  dinner.macros.calories > 300, dinner.macros.calories)

// ---------------------------------------------------------------------------
console.log('\n1. The resize hits the destination budget — "resize it to fit"')
// ---------------------------------------------------------------------------
const oneWay = move({ mealsBySlot: { dinner } })
check('a move into an empty slot is proposed', oneWay.ok === true, oneWay.ok === false ? oneWay.reason : '')
if (oneWay.ok) {
  const leg = oneWay.payload.legs[0]
  const target = BUDGETS.snack!.calories
  // WITHIN 15%, not exact: quantities round to whole grams and food-db's
  // per-100g maths cannot land on an arbitrary calorie figure. The property is
  // "it fits the slot", not "it equals a number".
  check('...and the meal really lands near the snack budget, not the dinner one',
    Math.abs(leg.afterKcal - target) / target < 0.15,
    { landed: leg.afterKcal, snackBudget: target, wasDinner: leg.beforeKcal })
  check('...which is a real change, not the same meal relabelled',
    leg.afterKcal < leg.beforeKcal * 0.8, { before: leg.beforeKcal, after: leg.afterKcal })
}

// ---------------------------------------------------------------------------
console.log('\n2. Her ruling: they swap places')
// ---------------------------------------------------------------------------
const snack = withRealMacros({
  name: 'Greek Yoghurt and Berries',
  ingredients: ['170g greek yogurt', '80g blueberries', '20g almonds'],
  macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
}, 'snack')
const swap = move({ mealsBySlot: { dinner, snack } })
check('a move into an occupied slot is proposed', swap.ok === true, swap.ok === false ? swap.reason : '')
if (swap.ok) {
  check('...as TWO legs, not one — the other meal comes back', swap.payload.legs.length === 2,
    swap.payload.legs.map(l => `${l.fromSlot}->${l.slot}`))
  const toSnack = swap.payload.legs.find(l => l.slot === 'snack')
  const toDinner = swap.payload.legs.find(l => l.slot === 'dinner')
  check('...the dinner goes to the snack slot', toSnack?.fromSlot === 'dinner', toSnack)
  check('...and the snack comes back to dinner', toDinner?.fromSlot === 'snack', toDinner)
  // BOTH RESIZED, which is the half a one-legged implementation would skip:
  // the returning meal lands in a bigger slot and has to grow to fill it.
  check('...the returning meal GREW to fill the dinner slot',
    (toDinner?.afterKcal ?? 0) > (toDinner?.beforeKcal ?? 0), { before: toDinner?.beforeKcal, after: toDinner?.afterKcal })
  check('...and nothing is left empty', swap.payload.emptiedSlot === undefined, swap.payload.emptiedSlot)
  // WHAT SHE READS BEFORE THE TAP. Both new sizes, because the resize is the
  // part she cannot predict from the request she made.
  const said = JSON.stringify(swap.diff)
  check('...the card says they swap places', /swap places/i.test(said), swap.diff.implications)
  // WHAT THE DAY ACTUALLY DOES, and the reason this check exists at all: the
  // sentence used to end "so your day still adds up the same", which was
  // FALSE — caught by reading a real screenshot, where a 480 kcal breakfast
  // became an 840 kcal dinner and a 780 kcal dinner became a 516 kcal
  // breakfast, a net +96 the card called unchanged. Each meal is resized to
  // its DESTINATION's budget, and the meals were not at their own budgets to
  // begin with, so the totals can only match by accident.
  const netKcal = swap.payload.legs.reduce((sum, l) => sum + (l.afterKcal - l.beforeKcal), 0)
  const dayLine = (swap.diff.implications ?? []).map(i => i.text).join(' ')
  check('...and never claims the day is unchanged when it is not',
    Math.abs(netKcal) < 25 || !/adds up the same|unchanged|no change to your day/i.test(dayLine),
    { netKcal, dayLine })
  check('...it states the day\'s actual change, with the real number',
    Math.abs(netKcal) < 25
      ? /within a few calories/i.test(dayLine)
      : dayLine.includes(String(Math.abs(netKcal))),
    { netKcal, dayLine })
  check('...and states BOTH new sizes',
    said.includes(`${toSnack?.afterKcal} kcal`) && said.includes(`${toDinner?.afterKcal} kcal`), swap.diff.rows)
}

// ---------------------------------------------------------------------------
console.log('\n3. A one-way move says the slot will be empty, rather than doing it quietly')
// ---------------------------------------------------------------------------
if (oneWay.ok) {
  check('the emptied slot is named in the payload', oneWay.payload.emptiedSlot === 'dinner', oneWay.payload.emptiedSlot)
  const warned = oneWay.diff.implications?.find(i => i.severity === 'warn')
  check('...and warned about on the card, not merely recorded', !!warned, oneWay.diff.implications)
  check('...saying roughly what the day loses', /\d+ kcal/.test(warned?.text ?? ''), warned?.text)
}

// ---------------------------------------------------------------------------
console.log('\n4. An absurd resize is refused, never forced')
// ---------------------------------------------------------------------------
// A meal an order of magnitude too big for the slot. portion-scaler already
// refuses outside [0.4, 2.5]; this pins that the MOVE path honours it rather
// than scaling into a portion nobody would serve.
const huge = { ...dinner, macros: { ...dinner.macros, calories: dinner.macros.calories * 8 } }
const refused = move({ mealsBySlot: { dinner: huge } })
check('a meal far too big for the slot is refused', refused.ok === false, refused.ok === true ? refused.payload : '')
if (!refused.ok) {
  check('...in plain words, with no factor or function name in it',
    /shrink|half/i.test(refused.reason) && !/scale factor|0\.4|2\.5/i.test(refused.reason), refused.reason)
  check('...and offers the nearest thing instead of stopping dead',
    /swap it for something else/i.test(refused.reason), refused.reason)
}
const tiny = { ...dinner, macros: { ...dinner.macros, calories: 40 } }
const refusedUp = move({ rawArgs: { from_slot: 'snack', to_slot: 'dinner' }, mealsBySlot: { snack: tiny } })
check('...and a meal far too small for the slot is refused the other way', refusedUp.ok === false,
  refusedUp.ok === true ? refusedUp.payload.legs[0] : '')

// THE BOUNDS ARE THE SCALER'S, NOT A SECOND COPY. If meal-move ever grows its
// own numbers, the two can drift and this file would still pass.
check('the move path defines no bounds of its own',
  !/0\.4|2\.5/.test(strip(read('src/lib/meal-move.ts'))))
check('...it uses portion-scaler\'s (sanity check on that check)',
  MIN_SCALE_FACTOR === 0.4 && MAX_SCALE_FACTOR === 2.5, { MIN_SCALE_FACTOR, MAX_SCALE_FACTOR })

// ---------------------------------------------------------------------------
console.log('\n5. The dietary checks run on BOTH legs — the one that would hurt most')
// ---------------------------------------------------------------------------
// A vegetarian profile and a meat meal. Nothing about MOVING a meal can
// introduce meat, and that is precisely the reasoning this refuses to trust:
// the move is verified through the same verifyProposal every generated and
// edited meal goes through, so a diet that forbids the food refuses the move.
const vegetarian = move({ mealsBySlot: { dinner, snack }, dietaryPreferences: ['vegetarian'] })
check('a move that would seat a forbidden food is refused', vegetarian.ok === false,
  vegetarian.ok === true ? vegetarian.payload.legs.map(l => l.payload.option.name) : '')
// AND THE SECOND LEG IS CHECKED TOO, not just the first. The returning meal is
// the one a single-leg implementation would wave through: it is "already on
// the plan", which is exactly what was true of the meal that moved.
const dislikedReturn = move({
  rawArgs: { from_slot: 'snack', to_slot: 'dinner' },
  mealsBySlot: { dinner, snack },
  dislikedFoods: ['chicken breast'],
})
check('...and the RETURNING meal is checked as hard as the moving one',
  dislikedReturn.ok === false, dislikedReturn.ok === true ? dislikedReturn.payload.legs.map(l => l.fromSlot + '->' + l.slot) : '')
// The contrast, so the two above cannot pass because the fixture never builds.
check('...while the same move with no restrictions is allowed', swap.ok === true)

// ---------------------------------------------------------------------------
console.log('\n6. The moved meal is renamed, or the screen renders the old one')
// ---------------------------------------------------------------------------
if (swap.ok) {
  for (const leg of swap.payload.legs) {
    check(`the ${leg.fromSlot}->${leg.slot} option is not named the same as the original`,
      leg.payload.option.name !== leg.originalName, { was: leg.originalName, now: leg.payload.option.name })
    check(`...and still says which meal it is, so she recognises it`,
      leg.payload.option.name.includes(leg.originalName), leg.payload.option.name)
  }
}
check('the naming rule is one function, not spelled out at each call site',
  movedName('Chicken and Rice', 'snack') === 'Chicken and Rice (as snack)', movedName('Chicken and Rice', 'snack'))

// ---------------------------------------------------------------------------
console.log('\n7. Her words survive the resize — only the number changes')
// ---------------------------------------------------------------------------
// withQuantity exists for exactly this, and its own comment records the bug:
// parsing and re-rendering normalises "3 slices wholemeal bread" to "3 slice
// wholemeal bread". The macros would be right and the list she reads would be
// written in the app's grammar instead of hers.
const worded: CurrentMealForSlot = {
  name: 'Toast and Eggs',
  ingredients: ['3 slices wholemeal bread', '2 large eggs', '10g butter'],
  macros: { calories: BUDGETS.dinner!.calories, protein: 40, carbs: 60, fat: 20 },
}
const resized = resizeMealTo(worded, BUDGETS.snack!)
check('the worded meal resizes at all (sanity check on this check)', !('rejected' in resized), resized)
if (!('rejected' in resized)) {
  check('"slices" is still "slices", not normalised to "slice"',
    resized.ingredients.some(l => /slices wholemeal bread/.test(l)), resized.ingredients)
  check('...and "large eggs" keeps its adjective', resized.ingredients.some(l => /large eggs/.test(l)), resized.ingredients)
  check('...while the numbers really did move', resized.ingredients.join() !== worded.ingredients.join(), resized.ingredients)
  // NEVER BELOW ONE OF A COUNTED THING. Half an egg scaled down from a whole
  // one is not a portion anybody serves.
  check('...and nothing counted drops below one',
    resized.ingredients.every(l => !/^0\b|^0\.\d/.test(l.trim())), resized.ingredients)
}

// ---------------------------------------------------------------------------
console.log('\n8. The dead ends say something useful')
// ---------------------------------------------------------------------------
const noSlot = move({ rawArgs: { from_slot: 'dinner' } })
check('no destination asks where, rather than guessing', noSlot.ok === false && /where should/i.test(noSlot.reason),
  noSlot.ok === false ? noSlot.reason : '')
const same = move({ rawArgs: { from_slot: 'dinner', to_slot: 'dinner' }, mealsBySlot: { dinner } })
check('moving a meal to where it already is says so', same.ok === false && /already where/i.test(same.reason),
  same.ok === false ? same.reason : '')
const noMeal = move({ mealsBySlot: {} })
check('moving a slot with nothing in it says so', noMeal.ok === false && /no .*dinner/i.test(noMeal.reason),
  noMeal.ok === false ? noMeal.reason : '')
// A SLOT THE PROFILE DOES NOT HAVE. Three meals a day and no snacks: the
// snack slot has no budget, so a move into it is a control that cannot take
// effect, and the sentence points at the one screen that can change it.
const noSnacks = buildMealMoveProposal({
  rawArgs: { from_slot: 'dinner', to_slot: 'snack' },
  mealsBySlot: { dinner },
  profileId: 'p', todayDate: '2026-09-14', targets: TARGETS, mealsPerDay: 3, includeSnacks: false,
  dietaryPreferences: [], dislikedFoods: [],
})
check('a slot the profile does not have is refused', noSnacks.ok === false, noSnacks.ok === true ? noSnacks.payload : '')
check('...and points at Profile, where it can be changed',
  noSnacks.ok === false && /Profile/.test(noSnacks.reason), noSnacks.ok === false ? noSnacks.reason : '')

// ---------------------------------------------------------------------------
console.log('\n9. Same day only, and the code says so rather than half-trying')
// ---------------------------------------------------------------------------
// CLAUDE.md's rule 1: a feature touching a grain supports every operation
// listed for it, or names which it does not and why. Moving to another DAY is
// not built because no screen renders another day's meals, so the destination
// would be somewhere she cannot see, check or undo by looking.
const src = strip(read('src/lib/meal-move.ts'))
check('the builder takes one date, not a from-date and a to-date',
  !/to_date|toDate/.test(src))
check('...and the plan doc names the omission rather than omitting it',
  /NOT BUILT/.test(read('docs/plans/moving-a-meal.md'))
  && /another day/i.test(read('docs/plans/moving-a-meal.md')))

// ---------------------------------------------------------------------------
console.log('\n10. Both legs land or neither does')
// ---------------------------------------------------------------------------
const exec = strip(read('src/lib/pending-action-executor.ts'))
const at = exec.indexOf('export async function executeMealMove')
const body = at === -1 ? '' : exec.slice(at, exec.indexOf('\nexport ', at + 10))
check('the executor was found and bounded (sanity check on this check)', body.length > 200, body.length)
check('it applies each leg through the shared writer, not a second copy',
  /applyMealOptionToSlot/.test(body) && !/from\('meal_plan_slots'\)/.test(body))
check('...and undoes what already landed when a later leg fails',
  /undoMealAddition/.test(body) && /for \(const prior of done\)/.test(body))
check('...reporting nothing as landed when it rolled back',
  /landed: \[\],\s*\n?\s*failed:/.test(body))

console.log(failures === 0 ? '\nAll meal-move checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
