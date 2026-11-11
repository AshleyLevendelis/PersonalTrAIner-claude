/**
 * test:usual-meals — "My usual meals first" (docs/plans/usual-meals-first.md).
 *
 * Ashley, 11 Nov 2026: "how do we ensure we are helping users fit meals around foods they already enjoy without always
 * prescribing meals they have never had before?" His ruling, from three options: "My usual meals first".
 *
 * Held here: what makes a dish his (one mark, written where HE adds a meal and never where the app copies one); that
 * his meals take the first call on a week's menu; that the day's pick works towards about half its meals being his
 * while VARIETY STILL COMES FIRST and a day off target is never bought with it; that a like naming several foods
 * matches a dish holding all of them; and that a meal typed on the screen goes through the coach's own builder, so
 * the screen cannot keep a dish the coach would refuse.
 *
 * A gate has exactly one exit, at the bottom.
 */
import { readFileSync } from 'fs'
import { MENU_SIZE, menuForSlot } from '../src/lib/meal-menu'
import {
  assembleDay, isFamiliarOption, familiarShortfall, optionMatchesLikedFood, likedParts, type PoolOption,
} from '../src/lib/meal-generation'
import { MY_MEAL_TAG, FAVOURITE_TAG, USER_REQUESTED_TAG, tagsMyMeal, type MealSlotName } from '../src/lib/meal-store'
import { displayTags, tagsPinOnly } from '../src/lib/meal-new-from'
import { listMyMeals, planMyMeal, mealsOffered, myMealJoins, type MyMealContext } from '../src/lib/my-meals'
import { buildMealAdditionProposal } from '../src/lib/meal-addition'
import { buildCustomMealProposal } from '../src/lib/custom-meal'
import { computeSlotBudgets, verifyProposal } from '../src/lib/meal-generation'
import { dishLandsADay } from '../src/lib/meal-top-up'
import { fitDishToBudget } from '../src/lib/meal-library'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { buildRotation, firstDayAfter, serveDates, addDays, rotationIndexFor } from '../src/lib/meal-rotation'
import { menuFor, menuWeekOf } from '../src/lib/meal-menu'
import { splitUsualFoods, splitFoodList } from '../src/lib/food-list'
import { ONBOARDING_SLOTS, NEVER_BLOCKING_SLOTS } from '../src/lib/onboarding-slots'
import type { MacroTargets } from '../src/lib/types'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const TARGETS: MacroTargets = { calories: 2400, protein: 160, carbs: 270, fat: 75 }
const SHARE: Record<MealSlotName, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 }

/** A plausible whole: every dish is exactly its meal's share of the day, so EVERY day is on target and only the keys decide. */
function dish(slot: MealSlotName, i: number, tags: string[] = [], name?: string): PoolOption {
  const k = SHARE[slot]
  return {
    slot, name: name ?? `${slot} dish ${String(i).padStart(3, '0')}`,
    ingredients: [{ name: 'chicken breast raw', quantity: Math.round(k * 700), unit: 'g' }],
    macros: { calories: Math.round(TARGETS.calories * k), protein: Math.round(TARGETS.protein * k), carbs: Math.round(TARGETS.carbs * k), fat: Math.round(TARGETS.fat * k) },
    tags: ['British / Classic', ...tags],
  }
}
type Pools = Partial<Record<MealSlotName, PoolOption[]>>
const pools = (n: number, mine: Partial<Record<MealSlotName, number[]>> = {}, mark: string[] = [MY_MEAL_TAG]): Pools =>
  Object.fromEntries(SLOTS.map(s => [s, Array.from({ length: n }, (_, i) => dish(s, i, mine[s]?.includes(i) ? mark : []))]))
/**
 * A pool with ROOM in it, for judging whether a new dish can land a day: each meal has leaner, even and richer dishes
 * in protein (0.6x, 1x, 1.4x of its share) and in fat (0.5x, 1x, 1.6x), carbs making up the energy. In `pools()` every
 * dish is exactly its share, so a dish with more protein or less fat than its meal's share can never be offset and
 * nothing new would ever "fit": measured, an ordinary chicken and rice sized to lunch is 1.3x the protein and 0.3x
 * the fat of a lunch's share.
 */
const roomyPools = (): Pools => {
  // The APP's own share of the day for each meal (a lunch is 36% here, not the 30% `dish()` assumes): a dish sized to
  // the app's lunch against a pool built on another split is 6% of the day over on energy before anything else.
  const budgets = computeSlotBudgets(TARGETS, 3, true) as Record<MealSlotName, MacroTargets>
  return Object.fromEntries(SLOTS.map(s => [s, [0.6, 1, 1.4].flatMap((pf, i) => [0.5, 1, 1.6].map((ff, j) => {
    const b = budgets[s]
    const protein = Math.round(b.protein * pf)
    const fat = Math.round(b.fat * ff)
    const carbs = Math.round(b.carbs + (b.protein - protein) + ((b.fat - fat) * 9) / 4)
    return { ...dish(s, i * 3 + j), macros: { calories: Math.round(b.calories), protein, fat, carbs } }
  }))]))
}
const familiarIn = (chosen: Partial<Record<MealSlotName, PoolOption>>) => SLOTS.filter(s => chosen[s] && isFamiliarOption(chosen[s]!)).length

function main() {
  console.log('1. What makes a dish his')
  check('a dish he added is familiar', isFamiliarOption(dish('lunch', 0, [MY_MEAL_TAG])))
  check('a dish he hearted is familiar', isFamiliarOption(dish('lunch', 0, [FAVOURITE_TAG])))
  check('a plain plan dish is not', !isFamiliarOption(dish('lunch', 0)))
  check('...and nor is one merely marked as asked for or edited (the mark every app-made COPY carries)', !isFamiliarOption(dish('lunch', 0, [USER_REQUESTED_TAG])))
  check('a dish he now avoids is never familiar, even if it is his', !isFamiliarOption({ ...dish('lunch', 0, [MY_MEAL_TAG]), breaksRestriction: true } as PoolOption))
  check('the mark is added once', tagsMyMeal([MY_MEAL_TAG]).length === 1 && tagsMyMeal(undefined).join() === MY_MEAL_TAG && tagsMyMeal(['x']).join() === `x,${MY_MEAL_TAG}`)
  check('the mark is never shown as a label on a meal card', displayTags(['British / Classic', MY_MEAL_TAG]).join() === 'British / Classic', displayTags(['British / Classic', MY_MEAL_TAG]))

  console.log('\n2. The shortfall: how far a day is from half its meals being his')
  check('four meals, none his: short by 2', familiarShortfall(4, 0, true) === 2)
  check('four meals, one his: short by 1', familiarShortfall(4, 1, true) === 1)
  check('four meals, two or more his: not short', familiarShortfall(4, 2, true) === 0 && familiarShortfall(4, 4, true) === 0)
  check('three meals: half is two', familiarShortfall(3, 1, true) === 1 && familiarShortfall(3, 2, true) === 0)
  check('with no familiar dish anywhere it is always zero (nothing changes for a plan without his meals)', familiarShortfall(4, 0, false) === 0)

  console.log('\n3. The day\'s pick works towards about half, and variety still comes first')
  {
    // Six dishes a meal; ONE of his in lunch and ONE in dinner, deliberately NOT the first in the list.
    const p = pools(6, { lunch: [4], dinner: [5] })
    const day = assembleDay(p, TARGETS)
    check('harness: the day is on target (the key only ever chooses among correct days)', day.withinTolerance === true, day.totals)
    check('with one of his in lunch and one in dinner, the day serves BOTH', day.chosen.lunch?.name === 'lunch dish 004' && day.chosen.dinner?.name === 'dinner dish 005',
      SLOTS.map(s => day.chosen[s]?.name))
    // THE CONTRAST, so the mark binds: the identical pools without it serve neither.
    const plain = assembleDay(pools(6), TARGETS)
    check('...and the same pools with no mark serve neither of those dishes', plain.chosen.lunch?.name !== 'lunch dish 004' && plain.chosen.dinner?.name !== 'dinner dish 005',
      SLOTS.map(s => plain.chosen[s]?.name))
    // HALF, NOT ALL: with one of his in every meal, a day already at half is not pushed to four.
    const everywhere = pools(6, { breakfast: [3], lunch: [4], dinner: [5], snack: [2] })
    const full = assembleDay(everywhere, TARGETS)
    check('with one of his in every meal the day holds at least half his', familiarIn(full.chosen) >= 2, familiarIn(full.chosen))
    // VARIETY OUTRANKS IT: yesterday's dinner was his dinner, so today serves a different one.
    const afterIt = assembleDay(p, TARGETS, { dinner: ['dinner dish 005'], lunch: ['lunch dish 004'] })
    check('VARIETY FIRST: his dinner was served yesterday, so today\'s dinner is a different dish', afterIt.chosen.dinner?.name !== 'dinner dish 005', afterIt.chosen.dinner?.name)
    check('...and so is today\'s lunch', afterIt.chosen.lunch?.name !== 'lunch dish 004', afterIt.chosen.lunch?.name)
    // A MEAL OF HIS COUNTS ONLY ONCE IT HAS RESTED. Two dinners, both served in the last three days, neither
    // yesterday: one of them has to come back. His was two days ago and the plan's three days ago, so the plan's has
    // rested longer and is the one to serve. Counting his anyway would bring his back a day early.
    const two = pools(2, { dinner: [0] })
    const lately = assembleDay(two, TARGETS, { dinner: ['dinner dish 001', 'dinner dish 000', 'a dinner not in this plan'] })
    check('his dinner, served two days ago, does not jump a plan dinner that has rested longer', lately.chosen.dinner?.name === 'dinner dish 001', lately.chosen.dinner?.name)
    // BOTH rested (five and four days ago), so nothing about variety separates them except which has rested longer,
    // and that is the plan's. His is served all the same: a rested meal of his counts, and counting it ranks ahead of
    // "rested longest". (A rule that never counted a meal still in the week's memory would serve the plan's here.)
    const restedHis = assembleDay(two, TARGETS, { dinner: ['dinner dish 001', 'dinner dish 000', 'x', 'y', 'z'] })
    check('...and once his has rested past the three days it comes first again, ahead of a plan dinner rested longer', restedHis.chosen.dinner?.name === 'dinner dish 000', restedHis.chosen.dinner?.name)
    // NEVER BUYS AN OFF-TARGET DAY: his dinner is far too big, every other dinner fits.
    const big = pools(6)
    big.dinner![5] = { ...dish('dinner', 5, [MY_MEAL_TAG]), macros: { calories: 2400, protein: 160, carbs: 270, fat: 75 } }
    const kept = assembleDay(big, TARGETS)
    check('a meal of his that would take the day off target is not served at that size for the sake of being his',
      kept.withinTolerance === true, { dinner: kept.chosen.dinner?.name, within: kept.withinTolerance })
    // A hearted dish counts the same way.
    const hearted = assembleDay(pools(6, { lunch: [4] }, [FAVOURITE_TAG]), TARGETS)
    check('a hearted dish is served ahead of a plain one, as his own meal is', hearted.chosen.lunch?.name === 'lunch dish 004', hearted.chosen.lunch?.name)
  }

  console.log('\n4. The week\'s menu: his meals take the first call on the liked half')
  {
    const N = 40
    const half = Math.floor(MENU_SIZE / 2)
    const mine = [3, 17, 31]
    const lunch = Array.from({ length: N }, (_, i) => dish('lunch', i, mine.includes(i) ? [MY_MEAL_TAG] : []))
    const weeks = [0, 1, 2, 3, 4, 5]
    const onEvery = weeks.every(w => mine.every(i => menuForSlot(lunch, w).some(o => o.name === lunch[i].name)))
    check(`three of his lunches in a pool of ${N}: all three are on EVERY week's menu`, onEvery, weeks.map(w => menuForSlot(lunch, w).filter(o => isFamiliarOption(o)).length))
    const plainEvery = weeks.every(w => mine.every(i => menuForSlot(Array.from({ length: N }, (_, k) => dish('lunch', k)), w).some(o => o.name === lunch[i].name)))
    check('...and without the mark they are not (the contrast: a dish in forty is rarely on a menu of eight)', !plainEvery)
    // More of his than the half has room for: they rotate among themselves and never take more than half.
    const many = Array.from({ length: N }, (_, i) => dish('lunch', i, i < 10 ? [MY_MEAL_TAG] : []))
    const counts = weeks.map(w => menuForSlot(many, w).filter(o => isFamiliarOption(o)).length)
    check(`ten of his: each menu holds at least half (${half}) of his, and the menu is still ${MENU_SIZE}`, counts.every(c => c >= half) && weeks.every(w => menuForSlot(many, w).length === MENU_SIZE), counts)
    const seen = new Set(weeks.flatMap(w => menuForSlot(many, w).filter(o => isFamiliarOption(o)).map(o => o.name)))
    check('...and over six weeks all ten come round', seen.size === 10, seen.size)
    // His come BEFORE dishes that merely contain a liked food.
    const liked = Array.from({ length: N }, (_, i) => dish('lunch', i, i === 0 ? [MY_MEAL_TAG] : [], i >= 1 && i <= 8 ? `salmon lunch ${i}` : undefined))
    const menus = weeks.map(w => menuForSlot(liked, w, ['salmon']))
    check('with eight liked-food lunches competing for the same half, his one lunch is still on every menu', menus.every(m => m.some(o => o.name === liked[0].name)),
      menus.map(m => m.filter(o => isFamiliarOption(o)).length))
    check('a copy made for one day is not listed as one of his meals', listMyMeals({ lunch: [{ ...dish('lunch', 1, [MY_MEAL_TAG]), tags: tagsPinOnly([MY_MEAL_TAG]) }, dish('lunch', 2, [MY_MEAL_TAG])] }).map(m => m.name).join() === 'lunch dish 002')
  }

  console.log('\n5. A like that names several foods is a meal: a dish holding all of them matches')
  {
    const curry: PoolOption = { ...dish('dinner', 0), name: 'Weeknight curry', ingredients: [{ name: 'chicken breast raw', quantity: 150, unit: 'g' }, { name: 'white rice dry', quantity: 70, unit: 'g' }] }
    const noRice: PoolOption = { ...dish('dinner', 1), name: 'Roast chicken salad', ingredients: [{ name: 'chicken breast raw', quantity: 150, unit: 'g' }, { name: 'lettuce', quantity: 80, unit: 'g' }] }
    check('"chicken and rice" splits into its two foods', likedParts('chicken and rice').join('|') === 'chicken|rice', likedParts('chicken and rice'))
    check('"porridge with banana", "eggs & toast", "tuna, pasta" split too',
      likedParts('porridge with banana').join('|') === 'porridge|banana' && likedParts('eggs & toast').join('|') === 'eggs|toast' && likedParts('tuna, pasta').join('|') === 'tuna|pasta')
    check('one food stays one part ("salmon"), and a word holding "and" is not split ("sandwich")', likedParts('salmon').join() === 'salmon' && likedParts('sandwich').join() === 'sandwich' && likedParts('grandma\'s withered greens').length === 1, [likedParts('salmon'), likedParts('sandwich')])
    check('"chicken and rice" matches a dish with chicken AND rice', optionMatchesLikedFood(curry, ['chicken and rice']))
    check('...and NOT a dish with chicken and no rice (every part must be there)', !optionMatchesLikedFood(noRice, ['chicken and rice']))
    check('a one-food like still matches as it did', optionMatchesLikedFood(noRice, ['chicken']) && !optionMatchesLikedFood(noRice, ['salmon']))
  }

  console.log('\n6. A meal he adds, by either builder, is marked as his')
  const base = { profileId: 'p1', targets: TARGETS, mealsPerDay: 3, includeSnacks: true, dietaryPreferences: [] as string[], dislikedFoods: [] as string[], todayDate: '2026-11-11' }
  {
    const added = buildMealAdditionProposal({ ...base, rawArgs: { meal_name: 'Chicken and rice', meal_slot: 'lunch', ingredients: ['150g chicken breast raw', '70g white rice dry', '100g broccoli'] } })
    check('harness: the coach\'s "add a meal" builds this dish', added.ok === true, added.ok ? '' : added.reason)
    check('the dish it would keep carries the mark', added.ok && (added.payload.option.tags ?? []).includes(MY_MEAL_TAG), added.ok ? added.payload.option.tags : null)
    const custom = buildCustomMealProposal({ ...base, rawArgs: { name: 'My omelette', meal_slot: 'breakfast', food_lines: ['3 eggs', '30g cheddar cheese'] } })
    check('harness: the coach\'s "my own foods" builds this dish', custom.ok === true, custom.ok ? '' : custom.reason)
    check('...and it carries the mark too', custom.ok && (custom.payload.option.tags ?? []).includes(MY_MEAL_TAG), custom.ok ? custom.payload.option.tags : null)
  }

  console.log('\n7. Adding a meal on the screen: the coach\'s own check, and plain reasons')
  {
    const ctx: MyMealContext = { ...base, pools: roomyPools() }
    const ok = planMyMeal(ctx, { name: 'Chicken and rice', slot: 'lunch', lines: '150g chicken breast raw\n70g white rice dry\n100g broccoli' })
    check('a meal with readable foods and amounts is planned', ok.ok === true, ok.ok ? '' : ok.reason)
    if (ok.ok) {
      check('...marked as his', (ok.payload.option.tags ?? []).includes(MY_MEAL_TAG))
      check('...with its numbers and its portions on the card', /kcal · \d+g protein/.test(ok.card.numbers) && /^Sized to your lunch: /.test(ok.card.portions) && /chicken breast/.test(ok.card.portions), ok.card)
      check('...and the card says what happens: it joins his options and comes first, without promising a share of the week',
        ok.card.what === myMealJoins('lunch') && /Joins your lunch options/.test(ok.card.what) && /come first/.test(ok.card.what) && !/half|%/.test(ok.card.what), ok.card.what)
      const typed = ['150g chicken breast raw', '70g white rice dry', '100g broccoli']
      const lunchBudget = (computeSlotBudgets(TARGETS, 3, true) as Record<MealSlotName, MacroTargets>).lunch
      const reportioned = fitDishToBudget({ slot: 'lunch', name: 'Chicken and rice', ingredients: typed, prep: '', cuisine: '' }, lunchBudget).dish.ingredients
      const byEnergy = buildMealAdditionProposal({ ...base, rawArgs: { meal_name: 'Chicken and rice', meal_slot: 'lunch', ingredients: typed } })
      const byShape = buildMealAdditionProposal({ ...base, rawArgs: { meal_name: 'Chicken and rice', meal_slot: 'lunch', ingredients: reportioned } })
      check('harness: re-portioning moves this dish, and the coach\'s builder accepts both versions', reportioned.join() !== typed.join() && byEnergy.ok && byShape.ok, reportioned)
      check('...the dish kept is one the coach\'s builder made, from his lines re-portioned', byShape.ok && JSON.stringify(byShape.payload.option) === JSON.stringify(ok.payload.option), ok.payload.option.ingredients)
      const grams = (o: PoolOption, food: RegExp) => o.ingredients.find(i => food.test(i.name))?.quantity ?? 0
      check('...with LESS chicken than sizing by energy alone gives (measured: 150g typed became 350g to fill a dinner)',
        byEnergy.ok && grams(ok.payload.option, /chicken/) < grams(byEnergy.payload.option, /chicken/) && grams(ok.payload.option, /chicken/) > 0,
        byEnergy.ok ? [grams(ok.payload.option, /chicken/), grams(byEnergy.payload.option, /chicken/)] : null)
      check('...and nearer the meal\'s own protein', byEnergy.ok && ok.payload.option.macros.protein < byEnergy.payload.option.macros.protein && ok.payload.option.macros.protein >= lunchBudget.protein * 0.95,
        [ok.payload.option.macros.protein, lunchBudget.protein])
    } else { for (let i = 0; i < 7; i++) check('(not planned, so this cannot be read)', false) }
    const noName = planMyMeal(ctx, { name: '  ', slot: 'lunch', lines: '150g chicken breast raw' })
    check('no name: asked for one', !noName.ok && /name/.test(noName.reason), noName)
    const noLines = planMyMeal(ctx, { name: 'Lunch', slot: 'lunch', lines: '  ' })
    check('no foods: asked for them', !noLines.ok && /one food per line/.test(noLines.reason), noLines)
    const unread = planMyMeal(ctx, { name: 'Mystery bowl', slot: 'lunch', lines: 'a handful of zxqvwy' })
    check('a line the app cannot read or cost is refused in plain words, never guessed', !unread.ok && unread.reason.length > 20, unread)
    const dup = planMyMeal(ctx, { name: 'LUNCH DISH 001', slot: 'lunch', lines: '150g chicken breast raw' })
    check('a name already among that meal\'s options is refused', !dup.ok && /already one of your lunch options/.test(dup.reason), dup)
    const diet = planMyMeal({ ...ctx, dietaryPreferences: ['Vegetarian'] }, { name: 'Chicken and rice', slot: 'lunch', lines: '150g chicken breast raw\n70g white rice dry' })
    check('a meal that breaks his diet is refused by the same check the coach\'s goes through', !diet.ok, diet)
    const avoided = planMyMeal({ ...ctx, dislikedFoods: ['broccoli'] }, { name: 'Chicken and greens', slot: 'lunch', lines: '150g chicken breast raw\n70g white rice dry\n100g broccoli' })
    check('...and so is one holding a food he avoids', !avoided.ok, avoided)
    // A USUAL MEAL THAT CANNOT BE SIZED IS KEPT, NOT REFUSED. Porridge and a banana is leaner than a breakfast here.
    const porridgeLines = ['80g oats', '300ml semi-skimmed milk', '120g banana']
    const sizedPorridge = buildMealAdditionProposal({ ...base, rawArgs: { meal_name: 'Porridge with banana', meal_slot: 'breakfast', ingredients: porridgeLines } })
    check('harness: the sizing builder refuses this porridge (so the next checks are about the fallback)', sizedPorridge.ok === false, sizedPorridge.ok ? sizedPorridge.payload.option.ingredients : '')
    const porridge = planMyMeal(ctx, { name: 'Porridge with banana', slot: 'breakfast', lines: porridgeLines.join('\n') })
    check('...and the form keeps it, at his amounts', porridge.ok === true, porridge.ok ? '' : porridge.reason)
    const pIng = porridge.ok ? porridge.payload.option.ingredients : []
    check('...the amounts are the ones he typed, not resized', pIng.find(i => /oats/.test(i.name))?.quantity === 80 && pIng.find(i => /banana/.test(i.name))?.quantity === 120, pIng)
    check('...the card says so, and never "sized"', porridge.ok && /^Kept at your amounts: /.test(porridge.card.portions) && !/Sized/.test(porridge.card.portions), porridge.ok ? porridge.card.portions : '')
    check('...and it is marked as his', porridge.ok && (porridge.payload.option.tags ?? []).includes(MY_MEAL_TAG))
    // The fallback is not a way round a check: a lean snack with a food his diet rules out is still refused.
    const nutLines = '40g peanut butter\n1 banana'
    check('harness: that snack is kept for someone with no restriction', planMyMeal(ctx, { name: 'Peanut banana', slot: 'snack', lines: nutLines }).ok === true)
    const nut = planMyMeal({ ...ctx, dietaryPreferences: ['nut-free'] }, { name: 'Peanut banana', slot: 'snack', lines: nutLines })
    check('...and refused for someone nut-free, naming the food', !nut.ok && /peanut butter/.test(nut.reason) && /nut-free/.test(nut.reason), nut)
    const mince = planMyMeal(ctx, { name: 'Chilli', slot: 'dinner', lines: '200g beef mince\n70g dry rice' })
    check('...and plain mince is still asked about, never guessed', !mince.ok && /What fat was the beef mince/.test(mince.reason), mince)
    // WHAT THE CARD PROMISES FOLLOWS WHAT THE DISH CAN DO.
    check('a meal that can be part of a day on his targets is told it comes first', porridge.ok && /come first/.test(porridge.card.what) && !/won't come up often/.test(porridge.card.what), porridge.ok ? porridge.card.what : '')
    const huge = planMyMeal(ctx, { name: 'Rice mountain', slot: 'dinner', lines: '900g dry rice\n500g butter' })
    check('a meal that cannot is kept, and told it will not come up often, never that it comes first',
      huge.ok && /Joins your dinner options/.test(huge.card.what) && /won't come up often/.test(huge.card.what) && !/come first/.test(huge.card.what), huge.ok ? huge.card.what : huge)
    check('...and it is kept as he wrote it: no size of it fits, so none is invented', huge.ok && /^Kept at your amounts: /.test(huge.card.portions) && /900g/.test(huge.card.portions), huge.ok ? huge.card.portions : '')
    // EVERY VERSION IS VALID AND NONE LANDS: 400g of chicken is a lunch nobody's day fits around at any size. It is
    // kept as he wrote it, not as the first size tried.
    const chickenOnly = planMyMeal(ctx, { name: 'Chicken only', slot: 'lunch', lines: '400g chicken breast' })
    const sizedChicken = buildMealAdditionProposal({ ...base, rawArgs: { meal_name: 'Chicken only', meal_slot: 'lunch', ingredients: ['400g chicken breast'] } })
    check('harness: sizing ACCEPTS this lunch, so "kept as written" below is a choice and not the only version left', sizedChicken.ok === true, sizedChicken.ok ? '' : sizedChicken.reason)
    check('a meal no size of which fits a day is kept at his amounts, and told it will not come up often',
      chickenOnly.ok && /^Kept at your amounts: /.test(chickenOnly.card.portions) && /won't come up often/.test(chickenOnly.card.what), chickenOnly.ok ? chickenOnly.card : chickenOnly)
    // THE FIRST VERSION THAT LANDS, NOT THE FIRST VERSION. Found by measuring real plans, not written by hand: at
    // 3,100 kcal, eggs on toast sized to breakfast by energy cannot be part of a day on target, and as he eats it, can.
    {
      const big: MacroTargets = { calories: 3100, protein: 180, fat: 96, carbs: 379 }
      const budgets = computeSlotBudgets(big, 3, true) as Record<MealSlotName, MacroTargets>
      const real: Pools = {}
      for (const sl of SLOTS) {
        const out: PoolOption[] = []
        for (const d of MEAL_LIBRARY) {
          if (d.slot !== sl || out.length >= 100) continue
          const o = verifyProposal(fitDishToBudget(d, budgets[sl]).dish, sl, budgets[sl], [], [])
          if (o) out.push(o)
        }
        real[sl] = out
      }
      const bigBase = { ...base, targets: big, todayDate: '2026-11-09' }
      const lines = ['3 eggs', '2 slices wholemeal bread']
      const byEnergy = buildMealAdditionProposal({ ...bigBase, rawArgs: { meal_name: 'Eggs on toast', meal_slot: 'breakfast', ingredients: lines } })
      const asWritten = buildCustomMealProposal({ ...bigBase, rawArgs: { name: 'Eggs on toast', meal_slot: 'breakfast', food_lines: lines } })
      check('harness: on this real plan the sized version is valid and does NOT land a day, and the typed one does',
        byEnergy.ok && asWritten.ok && dishLandsADay(real, SLOTS, big, 'breakfast', byEnergy.payload.option, '2026-11-09') === false && dishLandsADay(real, SLOTS, big, 'breakfast', asWritten.payload.option, '2026-11-09') === true,
        SLOTS.map(sl => real[sl]!.length))
      const eggs = planMyMeal({ ...bigBase, pools: real }, { name: 'Eggs on toast', slot: 'breakfast', lines: lines.join('\n') })
      check('...so it is kept as he eats it and told it comes first, not kept in a size that never comes up',
        eggs.ok && /^Kept at your amounts: /.test(eggs.card.portions) && /come first/.test(eggs.card.what), eggs.ok ? eggs.card : eggs)
    }
    check('the judgement is the day search\'s own, asked of both dishes', porridge.ok && huge.ok
      && dishLandsADay(ctx.pools, ['breakfast', 'lunch', 'dinner', 'snack'], TARGETS, 'breakfast', porridge.payload.option, base.todayDate) === true
      && dishLandsADay(ctx.pools, ['breakfast', 'lunch', 'dinner', 'snack'], TARGETS, 'dinner', huge.payload.option, base.todayDate) === false)
    check('...and a plan with nothing to serve beside it cannot be judged, so nothing is claimed against the dish',
      porridge.ok && dishLandsADay({ breakfast: [] }, ['breakfast', 'lunch'], TARGETS, 'breakfast', porridge.payload.option) === null && /come first/.test(myMealJoins('breakfast', null)))
    check('the form offers only the meals his plan has', mealsOffered({ breakfast: [dish('breakfast', 0)], dinner: [dish('dinner', 0)] }).join() === 'breakfast,dinner')
    const mine = listMyMeals({ lunch: [dish('lunch', 0), dish('lunch', 1, [MY_MEAL_TAG])], breakfast: [dish('breakfast', 0, [MY_MEAL_TAG])] })
    check('his meals are listed in meal order with their numbers, and plan dishes are not', mine.map(m => `${m.slot}:${m.name}`).join() === 'breakfast:breakfast dish 000,lunch:lunch dish 001' && mine.every(m => m.calories > 0 && m.protein > 0), mine)
  }

  console.log('\n8. The wiring (source; the driver reads the screen)')
  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const gen = strip(readFileSync('src/lib/meal-generation.ts', 'utf8'))
    const menu = strip(readFileSync('src/lib/meal-menu.ts', 'utf8'))
    const mine = strip(readFileSync('src/lib/my-meals.ts', 'utf8'))
    check('the day search counts his RESTED meals into the key, ahead of the like', /familiarShortfall\(slots\.length, slots\.filter\(s => familiarOption\.get\(combo\[s\]!\) && !servedLately\(s, combo\[s\]!\)\)\.length, hasAnyFamiliar\) \* 2 \+ noLike/.test(gen))
    check('the menu takes his dishes before liked ones', /for \(const group of \[familiar, likedOnly\]\)/.test(menu) && /const familiar = dishes\.filter\(\(\[, o\]\) => isFamiliarOption\(o\)\)/.test(menu))
    check('the screen plans through the coach\'s builder, called', /buildMealAdditionProposal\(\{/.test(mine))
    check('the three versions are tried in order: re-portioned, sized by energy, as written', (() => {
      const a = mine.indexOf('versions.push({ built: sizedFrom(fitted), sized: true })')
      const b = mine.indexOf('versions.push({ built: sizedFrom(foodLines), sized: true })')
      const c = mine.indexOf('versions.push({ built: buildCustomMealProposal({')
      return a > 0 && b > a && c > b
    })())
    const app = strip(readFileSync('src/App.tsx', 'utf8'))
    const rot = strip(readFileSync('src/lib/meal-rotation.ts', 'utf8'))
    check('both places that build a week\'s rotation tell it what the next first day serves', /buildRotation\(menu, macros, compiledSoftFoodPreferences, mealShape, firstDayAfter\(/.test(app) && /buildRotation\(dayPools, targets, softLikedFoods, shape, firstDayAfter\(pools, date, dayPools, targets, softLikedFoods[^)]*\)\)/.test(rot))
    const section = strip(readFileSync('src/components/MyMealsSection.tsx', 'utf8'))
    check('App hands Profile the facts a meal is planned against, and the section builds the planner from them',
      /myMeals=\{myMealsSource\}/.test(app) && /pools: mealPools,\s*\},\s*reload: /.test(app) && /makeMyMealsController\(source\.context, source\.reload\)/.test(section))
    check('...so the planner is not part of opening the app: App imports only its type', /import type \{ MyMealsSource \} from '@\/lib\/my-meals'/.test(app) && !/import \{[^}]*\} from '@\/lib\/my-meals'/.test(app))
    check('saving writes the dish and no day\'s pick', /executeMealAddition\(profileId, plan\.payload\)/.test(mine) && !/setMealPick|applyMealOptionToSlot/.test(mine))
  }

  console.log('\n9. The week\'s seam: the last day of a cycle is followed by a first day')
  {
    const off = { mealsPerDay: 3, includeSnacks: true, batchCooking: false }
    // THREE dishes a meal and a three-day rest: left alone, the cycle runs 0,1,2,0,1,2,0 and its last day serves what
    // its first day serves the next morning.
    const three = pools(3)
    const rot = buildRotation(three, TARGETS, [], off)
    const name = (i: number, s: MealSlotName) => rot.days[i].chosen[s]?.name
    check('harness: the cycle is seven days, all on target', rot.days.length === 7 && rot.days.every(d => d.withinTolerance))
    check('no meal of the last day is the same dish as the first day\'s, which is served the next morning', SLOTS.every(s => name(6, s) !== name(0, s)), SLOTS.map(s => [name(6, s), name(0, s)]))
    check('...and it is still not yesterday\'s either', SLOTS.every(s => name(6, s) !== name(5, s)), SLOTS.map(s => [name(6, s), name(5, s)]))
    const again = assembleDay(three, TARGETS, rot.historyFor(6), [], {})
    check('re-assembling the last day from the history the rotation hands out gives the same day back', SLOTS.every(s => again.chosen[s]?.name === name(6, s)), SLOTS.map(s => again.chosen[s]?.name))
    // TOLD WHAT A DIFFERENT NEXT DAY SERVES (a deep pool's next menu), it avoids THAT instead.
    const nextFirst = Object.fromEntries(SLOTS.map(s => [s, three[s]![1]])) as Partial<Record<MealSlotName, PoolOption>>
    const told = buildRotation(three, TARGETS, [], off, nextFirst)
    check('told the next first day serves each meal\'s second dish, the last day serves none of those', SLOTS.every(s => told.days[6].chosen[s]?.name !== three[s]![1].name), SLOTS.map(s => told.days[6].chosen[s]?.name))
    check('...which is a different last day from the untold one (so the argument is used, not just passed)', SLOTS.some(s => told.days[6].chosen[s]?.name !== name(6, s)))
    check('...and the earlier days are untouched', [0, 1, 2, 3, 4, 5].every(i => SLOTS.every(s => told.days[i].chosen[s]?.name === name(i, s))))

    // WHICH DAY COMES NEXT. A shallow pool's own cycle comes round; a deep pool's next week has its own menu.
    const today = '2026-11-11'
    check('a pool no deeper than a menu comes round to its own first day (nothing to pass)', firstDayAfter(three, today, menuFor(three, today), TARGETS) === undefined)
    const deep = pools(12, { dinner: [0, 1], lunch: [2] })
    const menu = menuFor(deep, today)
    const nextThursday = addDays(today, 7 - rotationIndexFor(today))
    const after = firstDayAfter(deep, today, menu, TARGETS)
    const nextRot = buildRotation(menuFor(deep, nextThursday), TARGETS, [], off)
    check('harness: the deep pool has a different menu next week, and next week starts on the cycle\'s first day', menuFor(deep, nextThursday) !== menu && rotationIndexFor(nextThursday) === 0, nextThursday)
    check('for a deep pool it is the NEXT menu\'s first day, dish for dish', !!after && SLOTS.every(s => after[s]?.name === nextRot.days[0].chosen[s]?.name), after ? SLOTS.map(s => after[s]?.name) : null)
    const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(nextThursday, i)) // Thursday to Wednesday: one cycle
    const afterEach = thisWeek.map(d => firstDayAfter(deep, d, menuFor(deep, d), TARGETS))
    const followingRot = buildRotation(menuFor(deep, addDays(nextThursday, 7)), TARGETS, [], off)
    check('...whichever day of the week asks: Thursday and the Wednesday after it name the same next first day', afterEach.every(a => !!a && SLOTS.every(s => a[s]?.name === followingRot.days[0].chosen[s]?.name)),
      afterEach.map(a => a?.dinner?.name))
    // ON SERVED DATES: four weeks, his meals on every week's menu. No dish of his is served on a Wednesday and again
    // on the Thursday, which is where one week's menu hands over to the next.
    const dates = Array.from({ length: 28 }, (_, i) => addDays('2026-11-05', i)) // a Thursday: four whole cycles
    const served = serveDates({ dates, pools: deep, targets: TARGETS, shape: off })
    const handovers: string[] = []
    let hisServed = 0
    served.forEach((d, i) => {
      for (const s of SLOTS) {
        const o = d.day.chosen[s]
        if (o && isFamiliarOption(o)) hisServed++
        if (i > 0 && rotationIndexFor(d.date) === 0 && o && served[i - 1].day.chosen[s]?.name === o.name) handovers.push(`${d.date} ${s} ${o.name}`)
      }
    })
    check('harness: his meals are served in those four weeks, across three handovers', hisServed >= 12 && dates.filter((d, i) => i > 0 && rotationIndexFor(d) === 0).length === 3, hisServed)
    check('no dish is served on the last day of one week\'s menu and again on the first day of the next', handovers.length === 0, handovers)
  }

  console.log('\n10. A deep meal has a different menu each week, so one week is not the whole answer')
  {
    // Twelve breakfasts, ONE of them lean in protein; three of everything else, each exactly its share. A dinner with
    // 25g more protein than a dinner's share lands a day only beside the lean breakfast, and the lean breakfast is on
    // some weeks' menus of eight and not others.
    const budgets = computeSlotBudgets(TARGETS, 3, true) as Record<MealSlotName, MacroTargets>
    const onShare = (sl: MealSlotName, i: number, protein = budgets[sl].protein): PoolOption => ({
      ...dish(sl, i), macros: { calories: Math.round(budgets[sl].calories), protein: Math.round(protein), fat: Math.round(budgets[sl].fat), carbs: Math.round(budgets[sl].carbs + (budgets[sl].protein - protein)) },
    })
    const lean = onShare('breakfast', 99, budgets.breakfast.protein * 0.5)
    const pool: Pools = { breakfast: [...Array.from({ length: 11 }, (_, i) => onShare('breakfast', i)), lean], lunch: [0, 1, 2].map(i => onShare('lunch', i)), dinner: [0, 1, 2].map(i => onShare('dinner', i)), snack: [0, 1, 2].map(i => onShare('snack', i)) }
    const rich = { ...onShare('dinner', 50, budgets.dinner.protein + 25), name: 'His protein-heavy dinner' }
    const onMenu = (date: string) => menuForSlot(pool.breakfast!, menuWeekOf(date)).some(o => o.name === lean.name)
    const landsOn = (date: string) => assembleDay({ ...pool, breakfast: menuForSlot(pool.breakfast!, menuWeekOf(date)), dinner: [...pool.dinner!, rich] }, TARGETS, {}, [], { dinner: rich }).withinTolerance
    const thursdays = Array.from({ length: 30 }, (_, i) => addDays('2026-11-05', i * 7))
    const start = thursdays.find(d => !onMenu(d) && [1, 2, 3].some(k => onMenu(addDays(d, k * 7))))
    check('harness: there is a week whose menu lacks the lean breakfast while one of the next three has it', !!start, thursdays.map(onMenu))
    check('harness: on that week\'s menu alone the dinner cannot land a day, and on the later one it can', !!start && landsOn(start) === false && [1, 2, 3].some(k => landsOn(addDays(start, k * 7))))
    check('the dinner is judged over the coming weeks, so it is one that lands', !!start && dishLandsADay(pool, SLOTS, TARGETS, 'dinner', rich, start) === true)
    const never = thursdays.find(d => [0, 1, 2, 3].every(k => !onMenu(addDays(d, k * 7))))
    check('...and four weeks is where it stops: a dish that fits none of them is one that will not come up often', !never || dishLandsADay(pool, SLOTS, TARGETS, 'dinner', rich, never) === false, never)
  }

  console.log('\n11. Setup asks what he usually eats, and keeps it as likes')
  {
    check('one entry per meal or food: commas, semicolons and new lines separate them',
      splitUsualFoods('Porridge with banana, chicken and rice; Spag bol\n eggs on toast').join('|') === 'porridge with banana|chicken and rice|spag bol|eggs on toast', splitUsualFoods('Porridge with banana, chicken and rice; Spag bol\n eggs on toast'))
    check('"chicken and rice" is ONE meal here', splitUsualFoods('chicken and rice').join('|') === 'chicken and rice')
    check('...where on Foods to avoid the same words are two foods (so the two splits are not one function)', splitFoodList('chicken and rice').join('|') === 'chicken|rice', splitFoodList('chicken and rice'))
    check('"nothing really" and an empty answer are an empty list, and a meal said twice is kept once', splitUsualFoods('nothing really').length === 0 && splitUsualFoods('  ').length === 0 && splitUsualFoods('Porridge, porridge').join() === 'porridge')
    // What he typed becomes a like that FINDS his meal: the reason the split keeps a meal whole.
    const chickenRice: PoolOption = { ...dish('dinner', 0), name: 'Chicken with rice and greens', ingredients: [{ name: 'chicken breast raw', quantity: 180, unit: 'g' }, { name: 'white rice dry', quantity: 80, unit: 'g' }, { name: 'broccoli', quantity: 100, unit: 'g' }] }
    const riceOnly: PoolOption = { ...dish('dinner', 1), name: 'Rice and beans', ingredients: [{ name: 'white rice dry', quantity: 90, unit: 'g' }, { name: 'kidney beans', quantity: 200, unit: 'g' }] }
    const likes = splitUsualFoods('porridge with banana, chicken and rice')
    check('the like "chicken and rice" matches a dish holding both, and not one holding only rice', optionMatchesLikedFood(chickenRice, likes) && !optionMatchesLikedFood(riceOnly, likes))
    const asked = ONBOARDING_SLOTS.findIndex(sd => sd.key === 'usualFoods')
    const avoid = ONBOARDING_SLOTS.findIndex(sd => sd.key === 'dislikedFoods')
    const def = ONBOARDING_SLOTS[asked]
    check('setup has the question, typed, optional, and ASKED (not one of the recorded-if-volunteered ones)', asked >= 0 && def.control === 'text' && def.required === false && !NEVER_BLOCKING_SLOTS.includes('usualFoods') && /usually eat/i.test(def.question), def)
    check('...straight after the foods to leave out', asked === avoid + 1, { asked, avoid })
    check('...kept as remembered likes, never a profile column', def?.destination === 'user_facts')
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const slots = strip(readFileSync('src/lib/onboarding-slots.ts', 'utf8'))
    const app = strip(readFileSync('src/App.tsx', 'utf8'))
    const prof = strip(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
    const onb = strip(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
    const fn = readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
    check('the finished profile carries one entry per meal', /usual_foods: splitUsualFoods\(data\.usualFoods\)/.test(slots))
    // The SAME row Profile writes for a liked food, so it shows there and comes off there.
    const row = /kind: 'food_preference',[\s\S]{0,160}?displayText: `likes \$\{(\w+)\}`,\s*polarity: 'like',\s*hardness: 'soft',\s*resolvedRefs: resolveFoodTarget\(\1\)/
    const profRow = /kind: 'food_preference', source: 'manual',\s*rawPhrase: v, displayText: `likes \$\{v\}`,\s*polarity: 'like', hardness: 'soft', resolvedRefs: resolveFoodTarget\(v\)/
    check('at signup each is written as the row Profile writes for a liked food (a soft like, "likes X")', row.test(app) && profRow.test(prof) && /source: 'onboarding',\s*rawPhrase: meal,/.test(app))
    check('...except one he also said to leave out: an avoid wins', /usual_foods \?\? \[\]\)\.filter\(meal => !\(enrichedProfile\.disliked_foods \?\? \[\]\)\.some\(avoid => avoid\.trim\(\) && containsPhrase\('', \[meal\], avoid\)\)\)/.test(app))
    check('the first plan is made with them in mind, before they are rows', /likedFoods: \[\.\.\.new Set\(\[\.\.\.typedFoodLikes, \.\.\.\(forProfile\.usual_foods \?\? \[\]\)\]\)\]/.test(app))
    check('the app keeps his typed reply as the answer when the coach records nothing, and never a question of his own',
      /textQuestionOnScreen\(messages, ws\.confirmed\) === 'usualFoods' && !responseWs\.confirmed\.has\('usualFoods'\) && !trimmed\.includes\('\?'\)/.test(onb) && /applySlot\(responseWs, 'usualFoods', isPlainNone\(trimmed\) \? '' : trimmed, responseWs\.values\)/.test(onb))
    check('a typed question the app asks itself names its question, all three places', (onb.match(/asksSlot: (?:nextDef|def)\.control === 'text' \? (?:nextDef\.key|target|next|key) : undefined/g) ?? []).length === 4, (onb.match(/asksSlot: (?:nextDef|def)\.control === 'text' \? (?:nextDef\.key|target|next|key) : undefined/g) ?? []).length)
    check('the setup coach is told to record it in his words, whole meals, and to add nothing', /set_slot\(usualFoods = /.test(fn) && /"chicken and rice" is one entry, never two/.test(fn) && /Never add a food they did not say/.test(fn))
  }

  console.log('\n12. The meal writer writes a meal he already eats as itself')
  {
    // "without always prescribing meals they have never had before": a like naming a whole meal was only an ingredient
    // hint, so the writer returned new dishes that happened to hold chicken. Held by source: the writer is a model.
    const writer = readFileSync('supabase/functions/generate-meals/index.ts', 'utf8')
    const block = writer.slice(writer.indexOf('function likesBlock'), writer.indexOf('function dislikedFoodsBlock'))
    const said = block.slice(block.indexOf('const asItself'))
    check('it is told a whole meal he already eats is written as ONE option that IS that meal', /make ONE option, in the meal it belongs to, that IS that meal/.test(said), said.slice(0, 200))
    check('...the same main foods, named as he named it, nothing main added', /the same main foods, plainly cooked, named much as they named it/.test(said) && /no extra main ingredient they did not say/.test(said))
    check('...and not a new dish inspired by it', /Not a new dish inspired by it/.test(said))
    check('...only when he has told us a food or meal he likes (a favourite alone is a dish the plan already has)', /const asItself = foods\.length > 0\s*\?/.test(said))
    check('the sentence is in what the writer is sent, after the likes themselves', /\$\{lines\.join\(" "\)\}\$\{asItself\}`;/.test(block))
    check('...and the rule that a like never breaks another rule still stands', /never break any other rule in this prompt to fit one in/.test(block))
  }

  console.log('\n13. The way to My meals from Nutrition')
  {
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    const app = strip(readFileSync('src/App.tsx', 'utf8'))
    const profile = strip(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
    const nutrition = strip(readFileSync('src/components/NutritionDisplay.tsx', 'utf8'))
    const plan = strip(readFileSync('src/components/MealPlan.tsx', 'utf8'))
    check('the app opens Profile at My meals when Nutrition asks', /onOpenMyMeals=\{\(\) => \{ setProfileInfoSection\('myMeals'\); setProfileInfoOpen\(true\) \}\}/.test(app))
    const map = /const SHEET_FOR_SECTION[^=]*= \{([^}]*)\}/.exec(profile)?.[1] ?? ''
    check('that section is on the sheet My meals is drawn on', /myMeals: 'likes'/.test(map) && /<div ref=\{myMealsRef\}><MyMealsSection /.test(profile) && profile.indexOf("case 'likes':") < profile.indexOf('<div ref={myMealsRef}>') && profile.indexOf('<div ref={myMealsRef}>') < profile.indexOf("case 'avoid':"), map)
    check('...and Profile scrolls to it', /initialSection === 'myMeals' \? myMealsRef/.test(profile))
    check('Nutrition hands the link to today\'s list AND an upcoming day\'s', (nutrition.match(/onOpenMyMeals=\{onOpenMyMeals\}/g) ?? []).length === 2, (nutrition.match(/onOpenMyMeals=\{onOpenMyMeals\}/g) ?? []).length)
    check('the link closes the meal\'s sheet before it opens Profile', /onClick=\{\(\) => \{ onToggle\(\); onOpenMyMeals\(\) \}\}/.test(plan))
    check('...and is not drawn where nothing would open', /\{onOpenMyMeals && \(\s*<button/.test(plan))
  }

  console.log(`\n${ran} checks ran, ${failures} failed`)
}
main()
if (failures > 0) process.exit(1)
