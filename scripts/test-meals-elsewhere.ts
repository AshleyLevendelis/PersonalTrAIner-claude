/**
 * test:meals-elsewhere — meals cooked for him elsewhere (docs/plans/meals-cooked-elsewhere.md).
 *
 * Ashley, 11 Nov 2026: "I have breakfast and lunch cooked for me at work Monday to Friday". His ruling, "Set days +
 * optional menu", in his words: "I dont want it to stop posing the meals, I want it to incorporate the meals into its
 * plan."
 *
 * Held here, for the standing answer and the ASSUMED meal: which dates the answer covers; that the meal stays in the
 * day at that meal's own share; that the free meals are still chosen so the day lands on his numbers; that a lunch
 * cooked for him is never last night's leftovers and a dinner cooked for him never becomes tomorrow's; that a meal
 * he picks for a date wins; that a swap elsewhere in the day never re-sizes the kitchen's portion; that every
 * surface serving a week gets the same days; and that the shopping list leaves these meals out and counts them.
 *
 * A gate has exactly one exit, at the bottom.
 */
import { readFileSync } from 'fs'
import { computeSlotBudgets, dayVerdict, verifyProposal, chosenToMealPlanDays, type PoolOption } from '../src/lib/meal-generation'
import { fitDishToBudget } from '../src/lib/meal-library'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { displayTags } from '../src/lib/meal-new-from'
import {
  buildRotation, serveDates, serveMealWeek, firstDayAfter, leftoverLunchFrom, assembleRotationDay,
  rotationIndexFor, addDays, datesFrom, type MealShape,
} from '../src/lib/meal-rotation'
import { menuFor } from '../src/lib/meal-menu'
import {
  readMealsElsewhere, hasMealsElsewhere, toggleMealElsewhere, setMealElsewhereDays, weekdayOfDate,
  weekdayOfRotationIndex, mealsElsewhereOn, assumedMeal, assumedMealName, assumedMealsOn, elsewhereState,
  isCookedElsewhere, describeMealsElsewhere, mealsElsewhereClauses, describeDays, ELSEWHERE_TAG, ELSEWHERE_WORDS, WORKING_WEEK,
  type MealsElsewhere, type Weekday,
} from '../src/lib/meals-elsewhere'
import { USER_REQUESTED_TAG, MY_MEAL_TAG, type MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'
import { DAY_MOVE, REBALANCE } from '../src/lib/coach-voice'
import { dayAsShown } from '../src/lib/day-as-shown'
import { buildMealDayMoveProposal } from '../src/lib/meal-day-move'
import { buildMealRebalanceProposal } from '../src/lib/meal-rebalance'
import { buildCustomMealProposal } from '../src/lib/custom-meal'
import { buildMealMoveProposal, MOVE_REFUSALS } from '../src/lib/meal-move'
import { isPinOnly } from '../src/lib/meal-new-from'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const TARGETS: MacroTargets = { calories: 2400, protein: 160, carbs: 270, fat: 75 }
const SHAPE: MealShape = { mealsPerDay: 3, includeSnacks: true }
const BUDGETS = computeSlotBudgets(TARGETS, 3, true) as Record<MealSlotName, MacroTargets>
type Pools = Partial<Record<MealSlotName, PoolOption[]>>

/**
 * THE REAL LIBRARY, fitted to his meals as the app fits it: a deep pool with leaner and richer dishes, real foods on
 * every line (so a leftover can be made from a dinner), and each week served from its own menu. A hand-built pool of
 * dishes each exactly their share has no room in it and no leftovers (CLAUDE.md, "a pool with no room in it").
 */
function libraryPools(): Pools {
  const out: Pools = {}
  for (const sl of SLOTS) {
    const opts: PoolOption[] = []
    for (const d of MEAL_LIBRARY) {
      if (d.slot !== sl || opts.length >= 100) continue
      const o = verifyProposal(fitDishToBudget(d, BUDGETS[sl]).dish, sl, BUDGETS[sl], [], [])
      if (o) opts.push(o)
    }
    out[sl] = opts
  }
  return out
}

const AT_WORK: MealsElsewhere = { breakfast: [...WORKING_WEEK], lunch: [...WORKING_WEEK] }
// Monday 2 November 2026 (the harness's own year); the week is found by date, never assumed.
const MONDAY = '2026-11-02'
const WEEK = datesFrom(MONDAY, 7)
const awayShape: MealShape = { ...SHAPE, elsewhere: AT_WORK }
const NO_LIKES: string[] = []
const names = (chosen: Partial<Record<MealSlotName, PoolOption>>) => SLOTS.map(s => chosen[s]?.name ?? '-').join(' | ')

function main() {
  console.log('1. The standing answer')
  check('2 Nov 2026 is a Monday and 8 Nov a Sunday', weekdayOfDate(MONDAY) === 1 && weekdayOfDate('2026-11-08') === 7, [weekdayOfDate(MONDAY), weekdayOfDate('2026-11-08')])
  check('1 Jan 1970 was a Thursday', weekdayOfDate('1970-01-01') === 4)
  check('an unreadable date has no weekday, so nothing covers it', weekdayOfDate('next tuesday') === null && mealsElsewhereOn(AT_WORK, weekdayOfDate('nope')).length === 0)
  {
    // Every date of two years: the date's weekday is the weekday of its rotation day, and it steps by one.
    let agree = 0, steps = 0
    const all = datesFrom('2026-01-01', 730)
    all.forEach((d, i) => {
      if (weekdayOfRotationIndex(rotationIndexFor(d)) === weekdayOfDate(d)) agree++
      if (i > 0 && weekdayOfDate(d) === ((weekdayOfDate(all[i - 1])! % 7) + 1)) steps++
    })
    check('a rotation day and its date agree on the weekday, every date of two years', agree === 730, agree)
    check('...and the weekday steps by one each day, clock changes included', steps === 729, steps)
    check('...against the machine\'s own calendar, read in UTC', all.every(d => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 === weekdayOfDate(d)))
  }
  check('breakfast and lunch on a Wednesday; nothing on a Saturday', mealsElsewhereOn(AT_WORK, 3).join() === 'breakfast,lunch' && mealsElsewhereOn(AT_WORK, 6).length === 0)
  check('no answer covers nothing', mealsElsewhereOn(undefined, 3).length === 0 && !hasMealsElsewhere(undefined) && !hasMealsElsewhere({}))
  check('an answer with a day is something', hasMealsElsewhere({ dinner: [7] }))
  {
    const read = readMealsElsewhere({ lunch: [5, 1, 1, 9, 'x', 3], brunch: [1], dinner: [], snack: 'daily', breakfast: [0, 8] })
    check('a stored answer is read defensively: real days once each, in order; nothing else', JSON.stringify(read) === JSON.stringify({ lunch: [1, 3, 5] }), read)
    check('nothing stored, or junk, is "nothing cooked for him"', [undefined, null, 'x', 3, [], [1, 2]].every(v => JSON.stringify(readMealsElsewhere(v)) === '{}'))
  }
  {
    const on = toggleMealElsewhere({}, 'lunch', 3)
    const two = toggleMealElsewhere(on, 'lunch', 1)
    const off = toggleMealElsewhere(toggleMealElsewhere(two, 'lunch', 3), 'lunch', 1)
    check('a tap switches one meal on one day, kept in week order', JSON.stringify(two) === JSON.stringify({ lunch: [1, 3] }), two)
    check('...and switching the last day off removes the meal', JSON.stringify(off) === '{}', off)
    check('...without changing the answer it was given', JSON.stringify(on) === JSON.stringify({ lunch: [3] }))
    check('the weekdays shortcut sets exactly Monday to Friday', JSON.stringify(setMealElsewhereDays({ lunch: [6] }, 'lunch', WORKING_WEEK)) === JSON.stringify({ lunch: [1, 2, 3, 4, 5] }))
    check('...and no days removes the meal', JSON.stringify(setMealElsewhereDays({ lunch: [6], dinner: [1] }, 'lunch', [])) === JSON.stringify({ dinner: [1] }))
  }

  console.log('\n2. The words')
  check('his own example reads "Breakfast and lunch, Monday to Friday"', describeMealsElsewhere(AT_WORK) === 'Breakfast and lunch, Monday to Friday', describeMealsElsewhere(AT_WORK))
  check('meals on different days get a clause each', describeMealsElsewhere({ lunch: [1, 2, 3, 4, 5], dinner: [5] }) === 'Lunch, Monday to Friday. Dinner, Friday' && mealsElsewhereClauses({ lunch: [1, 2, 3, 4, 5], dinner: [5] }).length === 2, describeMealsElsewhere({ lunch: [1, 2, 3, 4, 5], dinner: [5] }))
  check('scattered days are listed; all seven is "every day"', describeDays([1, 3, 5]) === 'Monday, Wednesday and Friday' && describeDays([1, 2, 3, 4, 5, 6, 7]) === 'every day' && describeDays([6, 7]) === 'Saturday and Sunday', [describeDays([1, 3, 5]), describeDays([6, 7])])
  check('nothing cooked for him says nothing', describeMealsElsewhere({}) === '' && describeMealsElsewhere(undefined) === '')
  {
    const every = [
      ELSEWHERE_WORDS.label, ELSEWHERE_WORDS.assumedBadge, ELSEWHERE_WORDS.estimateBadge, ELSEWHERE_WORDS.estimateNote, ELSEWHERE_WORDS.profileHelp,
      ELSEWHERE_WORDS.listLine(2), ELSEWHERE_WORDS.saved(true), ELSEWHERE_WORDS.saved(false), ELSEWHERE_WORDS.notSavedYet, ELSEWHERE_WORDS.notSaved,
      ELSEWHERE_WORDS.ownOffer(true), ELSEWHERE_WORDS.ownOffer(false), ELSEWHERE_WORDS.ownPrompt(true), ELSEWHERE_WORDS.ownPrompt(false),
      describeMealsElsewhere({ lunch: [1, 2, 3, 4, 5], dinner: [5] }),
      DAY_MOVE.refusals.elsewhere('lunch', 'Tuesday'), REBALANCE.refusals.elsewhere('lunch', 'today'),
      ...SLOTS.map(s => ELSEWHERE_WORDS.assumedNote(s)),
    ].join(' ')
    // His diet and allergies: the app knows nothing about a plate it has not been told, and must never say it does.
    check('no sentence claims the meal suits his diet or is free of anything', !/\b(safe|suits?|fits? your diet|free of|-free|allergen|allerg)/i.test(every), every)
    check('the assumed note says the app does not know what is on the plate', SLOTS.every(s => /doesn't know what's on the plate/.test(ELSEWHERE_WORDS.assumedNote(s)) && ELSEWHERE_WORDS.assumedNote(s).includes(s)))
    check('the list line counts one meal and several in plain words', ELSEWHERE_WORDS.listLine(1) === '1 meal is cooked for you, so it is not on this list.' && ELSEWHERE_WORDS.listLine(10) === '10 meals are cooked for you, so they are not on this list.')
    check('no dash or semicolon in a sentence he reads', !/[—–;]/.test(every))
  }

  console.log('\n3. The assumed meal')
  {
    const lunch = assumedMeal('lunch', BUDGETS.lunch)
    check('it is that meal\'s own share of his day', lunch.macros.calories === Math.round(BUDGETS.lunch.calories) && lunch.macros.protein === Math.round(BUDGETS.lunch.protein) && lunch.macros.fat === Math.round(BUDGETS.lunch.fat), lunch.macros)
    check('it has no foods, so nothing can be shopped, costed or checked against a diet', lunch.ingredients.length === 0)
    check('it says which state it is in', elsewhereState(lunch) === 'assumed' && isCookedElsewhere(lunch))
    check('its name is the meal, cooked for you', lunch.name === 'Lunch cooked for you' && assumedMealName('breakfast') === 'Breakfast cooked for you')
    check('a stored dish carrying the mark is an estimate', elsewhereState({ tags: ['x', ELSEWHERE_TAG] }) === 'estimate')
    check('an ordinary dish is neither', elsewhereState({ tags: ['British / Classic'] }) === null && !isCookedElsewhere({ tags: [] }) && !isCookedElsewhere(null))
    check('the mark is never a label on a card', displayTags(['British / Classic', ELSEWHERE_TAG]).join() === 'British / Classic', displayTags(['British / Classic', ELSEWHERE_TAG]))
    const on = assumedMealsOn(AT_WORK, 2, BUDGETS, SLOTS)
    check('a covered weekday gets one for each covered meal', Object.keys(on).sort().join() === 'breakfast,lunch')
    check('a meal the plan does not have is never added', Object.keys(assumedMealsOn({ lunch: [2], snack: [2] }, 2, BUDGETS, ['breakfast', 'lunch', 'dinner'])).join() === 'lunch')
    check('...nor one whose share of the day is nothing', Object.keys(assumedMealsOn({ lunch: [2] }, 2, { lunch: { calories: 0, protein: 0, carbs: 0, fat: 0 } }, SLOTS)).length === 0)
    check('...nor one the split gives no share of the day', Object.keys(assumedMealsOn({ lunch: [2] }, 2, { breakfast: BUDGETS.breakfast }, SLOTS)).length === 0)
  }

  console.log('\n4. A week with breakfast and lunch at work, Monday to Friday')
  const pools = libraryPools()
  const plain = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: SHAPE })
  const away = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: awayShape })
  const weekdays = away.filter(d => (weekdayOfDate(d.date) ?? 9) <= 5)
  const weekend = away.filter(d => (weekdayOfDate(d.date) ?? 0) >= 6)
  check('the fixture binds: five working days and two weekend days were served', weekdays.length === 5 && weekend.length === 2)
  check('every working day still HOLDS breakfast and lunch, as meals cooked for him', weekdays.every(d => elsewhereState(d.day.chosen.breakfast) === 'assumed' && elsewhereState(d.day.chosen.lunch) === 'assumed'), weekdays.map(d => names(d.day.chosen)))
  check('...and its dinner and snack are the plan\'s own dishes', weekdays.every(d => d.day.chosen.dinner && d.day.chosen.snack && !isCookedElsewhere(d.day.chosen.dinner) && !isCookedElsewhere(d.day.chosen.snack)))
  check('the weekend is planned as it always was: no meal is cooked for him', weekend.every(d => SLOTS.every(s => !isCookedElsewhere(d.day.chosen[s]))), weekend.map(d => names(d.day.chosen)))
  check('every day of the week still lands on his numbers', away.every(d => d.day.withinTolerance && dayVerdict(d.day.totals, TARGETS).onTarget), away.map(d => [d.date, d.day.withinTolerance]))
  check('...and its total counts the meal cooked for him', weekdays.every(d => d.day.totals.calories === SLOTS.reduce((n, s) => n + (d.day.chosen[s]?.macros.calories ?? 0), 0)))
  check('with nothing cooked for him the week is exactly the week it was', JSON.stringify(serveDates({ dates: WEEK, pools, targets: TARGETS, shape: { ...SHAPE, elsewhere: {} } }).map(d => names(d.day.chosen))) === JSON.stringify(plain.map(d => names(d.day.chosen))))
  check('...and no plain day holds a meal cooked for him', plain.every(d => SLOTS.every(s => !isCookedElsewhere(d.day.chosen[s]))))

  console.log('\n5. Leftovers')
  {
    // Batch cooking is on by default. The plain week must HAVE leftover lunches or this section proves nothing.
    const leftoverDays = plain.filter(d => d.day.chosen.lunch?.leftoverFrom === 'dinner').map(d => d.date)
    check('the fixture binds: the plain week has leftover lunches on working days', leftoverDays.filter(d => (weekdayOfDate(d) ?? 9) <= 5).length >= 2, leftoverDays)
    check('a lunch cooked for him is never last night\'s leftovers', weekdays.every(d => d.day.chosen.lunch?.leftoverFrom === undefined))
    // The night before a working day: the dinner must not promise a lunch that is being cooked for him.
    const promised = away.filter((d, i) => i + 1 < away.length && isCookedElsewhere(away[i + 1].day.chosen.lunch) && (d.day.chosen.dinner?.reusedTomorrow || d.day.chosen.dinner?.keepForTomorrow))
    check('...and the dinner the night before does not say "cook both portions"', promised.length === 0, promised.map(d => d.date))
    const plainPromised = plain.filter(d => d.day.chosen.dinner?.reusedTomorrow).length
    check('the fixture binds: the plain week does make that promise somewhere', plainPromised >= 2, plainPromised)
    // Saturday's lunch may still be Friday night's leftovers: the dinner was his own.
    const dinnerAway: MealShape = { ...SHAPE, elsewhere: { dinner: [...WORKING_WEEK] } }
    const dinners = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: dinnerAway })
    const afterAway = dinners.filter((d, i) => i > 0 && isCookedElsewhere(dinners[i - 1].day.chosen.dinner))
    check('the fixture binds: some days follow a dinner cooked for him', afterAway.length >= 4, afterAway.length)
    check('a dinner cooked for him never becomes tomorrow\'s lunch', afterAway.every(d => d.day.chosen.lunch?.leftoverFrom === undefined), afterAway.map(d => names(d.day.chosen)))
    const estimateDinner: PoolOption = { ...pools.dinner![0], name: 'Canteen curry', tags: [ELSEWHERE_TAG] }
    check('...nor does an ESTIMATED one, which has foods a leftover could be made from', leftoverLunchFrom(estimateDinner, BUDGETS.lunch) === null && leftoverLunchFrom(pools.dinner![0], BUDGETS.lunch) !== null)
  }

  console.log('\n6. A meal he picks for the date wins, and a swap leaves the kitchen\'s portion alone')
  {
    const tuesday = WEEK[1]
    const pick = pools.lunch![4]
    const picked = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: awayShape, pinsByDate: { [tuesday]: { lunch: pick } } })
    const day = picked.find(d => d.date === tuesday)!.day
    check('a lunch he picks for Tuesday is Tuesday\'s lunch (he is at home that day)', day.chosen.lunch?.name === pick.name, names(day.chosen))
    check('...his breakfast that day is still the one cooked for him', elsewhereState(day.chosen.breakfast) === 'assumed')
    check('...and no other day changed its meals cooked for him', picked.filter(d => d.date !== tuesday && (weekdayOfDate(d.date) ?? 9) <= 5).every(d => elsewhereState(d.day.chosen.lunch) === 'assumed'))
    // A swap of the plan's own dinner holds the day's other dishes and may re-size them (10 Oct). Never these.
    const dinnerSwap = pools.dinner!.find(o => o.name !== away.find(d => d.date === tuesday)!.day.chosen.dinner!.name && o.macros.fat !== away.find(d => d.date === tuesday)!.day.chosen.dinner!.macros.fat)!
    const swapped = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: awayShape, pinsByDate: { [tuesday]: { dinner: dinnerSwap } } }).find(d => d.date === tuesday)!.day
    check('after a dinner swap the day holds the new dinner', swapped.chosen.dinner?.name === dinnerSwap.name, names(swapped.chosen))
    check('...the meals cooked for him are still there, at exactly their own size', (['breakfast', 'lunch'] as MealSlotName[]).every(s => elsewhereState(swapped.chosen[s]) === 'assumed' && swapped.chosen[s]!.macros.calories === Math.round(BUDGETS[s].calories) && swapped.chosen[s]!.heldBy === undefined), [swapped.chosen.breakfast?.macros, swapped.chosen.lunch?.macros])
    // A meal he asked for by name re-plans the rest of the day (1 Sep). The meals cooked for him are not "the rest".
    const hisOwn: PoolOption = { ...pools.dinner![3], name: 'My own chilli', tags: [USER_REQUESTED_TAG] }
    const replanned = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: awayShape, pinsByDate: { [tuesday]: { dinner: hisOwn } } }).find(d => d.date === tuesday)!.day
    check('a dinner of his own re-plans the day and the meals cooked for him stay', replanned.chosen.dinner?.name === 'My own chilli' && elsewhereState(replanned.chosen.breakfast) === 'assumed' && elsewhereState(replanned.chosen.lunch) === 'assumed', names(replanned.chosen))
    const hisLunch: PoolOption = { ...pools.lunch![2], name: 'My packed lunch', tags: [USER_REQUESTED_TAG] }
    const packed = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: awayShape, pinsByDate: { [tuesday]: { lunch: hisLunch } } }).find(d => d.date === tuesday)!.day
    check('a lunch of his own on a day lunch is cooked for him is the lunch he gets', packed.chosen.lunch?.name === 'My packed lunch' && elsewhereState(packed.chosen.breakfast) === 'assumed', names(packed.chosen))
    {
      // Only breakfast is cooked for him, so lunches can still be last night's dinner. Tonight he asks for that same
      // dinner again by name: the leftover yields (cook once, not twice today) and the day is worked out again.
      const breakfastAway: MealShape = { ...SHAPE, elsewhere: { breakfast: [...WORKING_WEEK] } }
      const base = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: breakfastAway })
      const withLeftover = base.find(d => (weekdayOfDate(d.date) ?? 9) <= 5 && d.day.chosen.lunch?.leftoverFrom === 'dinner' && isCookedElsewhere(d.day.chosen.breakfast))
      check('the fixture binds: a working day has breakfast cooked for him and a leftover lunch', withLeftover !== undefined, base.map(d => names(d.day.chosen)))
      const sameAgain: PoolOption | undefined = withLeftover && { ...pools.dinner!.find(o => o.name === withLeftover.day.chosen.lunch!.name)!, tags: [USER_REQUESTED_TAG] }
      const again = withLeftover && sameAgain
        ? serveDates({ dates: WEEK, pools, targets: TARGETS, shape: breakfastAway, pinsByDate: { [withLeftover.date]: { dinner: sameAgain } } }).find(d => d.date === withLeftover.date)!.day
        : null
      check('...the same dish for dinner makes the lunch fresh, not the same dish twice', again !== null && again.chosen.dinner?.name === sameAgain!.name && again.chosen.lunch?.name !== sameAgain!.name, again && names(again.chosen))
      check('...and the breakfast cooked for him is still there', again !== null && elsewhereState(again.chosen.breakfast) === 'assumed', again && names(again.chosen))
    }
    check('...and are never among the meals a swap re-sized', !(swapped.heldAround && 'slots' in swapped.heldAround && (swapped.heldAround.slots as MealSlotName[]).some(s => s === 'breakfast' || s === 'lunch')), swapped.heldAround)
  }

  console.log('\n7. One week for every surface')
  {
    // The app builds its rotation once and hands it to the strip; the shopping list builds its own. Same days.
    const menu = menuFor(pools, MONDAY)
    const rotation = buildRotation(menu, TARGETS, [], awayShape, firstDayAfter(pools, MONDAY, menu, TARGETS, [], awayShape))
    const viaApp = serveMealWeek({ today: MONDAY, dates: WEEK, todaysPins: {}, pinsByDate: {}, pools, targets: TARGETS, softLikedFoods: [], shape: awayShape, rotation })
    const viaList = serveDates({ dates: WEEK, pools, targets: TARGETS, softLikedFoods: [], shape: awayShape })
    check('the strip (handed the app\'s rotation) and the list (building its own) serve the same week', JSON.stringify(viaApp.map(d => names(d.day.chosen))) === JSON.stringify(viaList.map(d => names(d.day.chosen))), [viaApp.map(d => names(d.day.chosen)), viaList.map(d => names(d.day.chosen))])
    // ...on every start day of twelve weeks: the rotation each surface builds for a date is told the same next first day.
    let differ = 0
    for (let w = 0; w < 12; w++) for (const offset of [0, 2, 5]) {
      const from = addDays(MONDAY, w * 7 + offset)
      const m = menuFor(pools, from)
      const r = buildRotation(m, TARGETS, [], awayShape, firstDayAfter(pools, from, m, TARGETS, [], awayShape))
      const dates = datesFrom(from, 7)
      const a = serveMealWeek({ today: from, dates, todaysPins: {}, pinsByDate: {}, pools, targets: TARGETS, softLikedFoods: NO_LIKES, shape: awayShape, rotation: r })
      const b2 = serveDates({ dates, pools, targets: TARGETS, softLikedFoods: NO_LIKES, shape: awayShape })
      if (JSON.stringify(a.map(d => names(d.day.chosen))) !== JSON.stringify(b2.map(d => names(d.day.chosen)))) differ++
    }
    check('...and on 36 other weeks and start days', differ === 0, differ)
    // The two callers that build a rotation for a date must hand its seam the SAME shape, or the app's week and the
    // list's can part at a week's last day. Over the weeks above the two happened to agree with the shape left out
    // (a mutation said so), so the property is held where it is written: each call passes its shape.
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const rotationSrc = strip(readFileSync('src/lib/meal-rotation.ts', 'utf8'))
    const appSrc = strip(readFileSync('src/App.tsx', 'utf8'))
    check('the list\'s own rotation is told the shape at its seam', /buildRotation\(dayPools, targets, softLikedFoods, shape, firstDayAfter\(pools, date, dayPools, targets, softLikedFoods, shape\)\)/.test(rotationSrc))
    check('...and so is the app\'s', /buildRotation\(menu, macros, compiledSoftFoodPreferences, mealShape, firstDayAfter\(mealPools, mealRotationDate, menu, macros, compiledSoftFoodPreferences, mealShape\)\)/.test(appSrc))
    const index = rotationIndexFor(WEEK[2])
    check('the rotation says which meals are cooked for him each day', Object.keys(rotation.elsewhereFor(index)).sort().join() === 'breakfast,lunch' && Object.keys(rotation.elsewhereFor(rotationIndexFor(WEEK[5]))).length === 0)
    check('...and keeps them apart from its leftovers', Object.keys(rotation.leftoverFor(index)).length === 0)
    const remembered = [0, 1, 2, 3, 4, 5, 6].flatMap(i => SLOTS.flatMap(sl => rotation.historyFor(i)[sl] ?? []))
    check('a meal cooked for him is not remembered as a dish served lately', remembered.length > 0 && !remembered.some(n => SLOTS.some(sl => n === assumedMealName(sl))), remembered.filter(n => /cooked for you/.test(n)).length)
    const again = assembleRotationDay(rotation, WEEK[2], menu, TARGETS, [], {})
    check('a day asked for again is the day the rotation holds', names(again.chosen) === names(rotation.days[index].chosen))
    // A deep pool: next week's first day (a Thursday) is assembled around the meals cooked for him, as the rotation's own is.
    const first = firstDayAfter({ ...pools, lunch: [...pools.lunch!] }, MONDAY, {}, TARGETS, [], awayShape)
    check('the day after a week\'s last day is told about them too', first !== undefined && elsewhereState(first.lunch) === 'assumed' && elsewhereState(first.breakfast) === 'assumed', first && names(first))
    check('...and is not, when nothing is cooked for him', (() => { const f = firstDayAfter({ ...pools }, MONDAY, {}, TARGETS, [], SHAPE); return f !== undefined && !isCookedElsewhere(f.lunch) })())
  }

  console.log('\n8. The shopping list')
  {
    const src = readFileSync('src/lib/grocery-store.ts', 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const loop = code.slice(code.indexOf('async function reconcileGenerated'))
    const skipAt = loop.indexOf('if (isCookedElsewhere(option))')
    const linesAt = loop.indexOf('shoppingLinesOf(option')
    check('the list skips a meal cooked for him before it reads the meal\'s foods', skipAt > 0 && linesAt > 0 && skipAt < linesAt, [skipAt, linesAt])
    check('...counts it', /if \(isCookedElsewhere\(option\)\) \{ cookedElsewhere\+\+; continue \}/.test(loop))
    check('...and hands the count back', /return \{ added, updated, removed, cookedElsewhere \}/.test(loop))
    check('the list builds its week from the same shape as the tab', /serveDates\(\{ dates: run, pools, targets, softLikedFoods, shape, pinsByDate, keepHeldSizes \}\)/.test(code))
    // What the list would total, from the week itself: an estimate's foods are left out, a plan dish's are counted.
    const estimate: PoolOption = { ...pools.lunch![0], name: 'Canteen curry', tags: [ELSEWHERE_TAG] }
    const shopped = (chosen: PoolOption[]) => chosen.filter(o => !isCookedElsewhere(o)).reduce((n, o) => n + o.ingredients.length, 0)
    check('an estimated meal has foods and is still left off', estimate.ingredients.length > 0 && shopped([estimate]) === 0 && shopped([pools.lunch![0]]) === pools.lunch![0].ingredients.length)
    const lines = (week: typeof away) => week.reduce((n, d) => n + shopped(Object.values(d.day.chosen) as PoolOption[]), 0)
    check('a week with ten meals cooked for him shops for fewer foods than the plain week', lines(away) < lines(plain), [lines(away), lines(plain)])
    check('...ten meals are counted', away.reduce((n, d) => n + (Object.values(d.day.chosen) as PoolOption[]).filter(isCookedElsewhere).length, 0) === 10)
  }

  console.log('\n9. Saved on his profile, read back, and handed to every surface')
  {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    const app = strip(readFileSync('src/App.tsx', 'utf8'))
    const store = strip(readFileSync('src/lib/profile-store.ts', 'utf8'))
    const profile = strip(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
    const migration = readFileSync('supabase/migrations/20261111120000_add_meals_elsewhere.sql', 'utf8')
    check('the app reads the saved answer through its reader when it restores a profile', /meals_elsewhere: readMealsElsewhere\(profileRow\.meals_elsewhere\)/.test(app))
    const shape = app.slice(app.indexOf('const mealShape: MealShape = useMemo('), app.indexOf('const mealShape: MealShape = useMemo(') + 500)
    check('...puts it on the meal shape, the one object every surface is handed', /elsewhere: profile\?\.meals_elsewhere,/.test(shape))
    check('...and rebuilds the shape when it changes', /\[[^\]]*profile\?\.meals_elsewhere[^\]]*\]\)/.test(shape), shape.slice(-160))
    check('the profile is restored with select(\'*\'), which needs no column to exist', /from\('fitness_profiles'\)\.select\('\*'\)/.test(app))
    const save = store.slice(store.indexOf('export async function saveMealsElsewhere('))
    check('the save writes only this column', /update\(\{ meals_elsewhere: answer \}\)\.eq\('id', profileId\)/.test(save))
    check('...says "not yet" when the database has no such column, and only then', /if \(isMissingColumnError\(error, 'meals_elsewhere'\)\) return 'not-yet'/.test(save) && save.indexOf("return 'not-yet'") < save.indexOf('throw error'))
    check('...and throws on any other failure, so it is never taken for saved', /throw error/.test(save) && save.indexOf("if (!error) return 'saved'") < save.indexOf('throw error'))
    const wired = profile.slice(profile.indexOf('<MealsElsewhereSection'), profile.indexOf('<MealsElsewhereSection') + 700)
    check('Profile changes the profile it holds only once the save has landed', /const result = await saveMealsElsewhere\(profileId, next\)\s*if \(result === 'saved'\) onProfileChanged\(\{ meals_elsewhere: next \}\)/.test(wired), wired.slice(0, 300))
    check('the database step adds one json column that defaults to nothing', /ADD COLUMN IF NOT EXISTS meals_elsewhere jsonb NOT NULL DEFAULT '\{\}'::jsonb/.test(migration))
  }

  console.log('\n10. Today, once something is eaten: his own meals fit around it, the kitchen\'s portion does not move')
  {
    const dinner = pools.dinner![0]
    const lunch = assumedMeal('lunch', BUDGETS.lunch)
    const chosen = { breakfast: pools.breakfast![0], lunch, dinner }
    const day3 = computeSlotBudgets(TARGETS, 3, false) as Record<MealSlotName, MacroTargets>
    // 130 kcal over: enough to take the day off target (over 5%), and inside what his one open dinner can give back
    // (about 25% either way). Measured: at 300 over, the dinner alone would have to shrink by half, and the app
    // rightly leaves the day alone and says how far over it is.
    const big = { kcal: chosen.breakfast.macros.calories + 130, protein: chosen.breakfast.macros.protein, carbs: chosen.breakfast.macros.carbs + 26, fat: chosen.breakfast.macros.fat + 3 }
    const shown = dayAsShown({ slots: ['breakfast', 'lunch', 'dinner'], chosen, eatenBySlot: { breakfast: big }, targets: { ...TARGETS, calories: chosen.breakfast.macros.calories + lunch.macros.calories + dinner.macros.calories } })
    const row = (sl: MealSlotName) => shown.slots.find(r => r.slot === sl)!
    check('the fixture binds: a bigger breakfast than planned takes the day off target and his dinner is re-sized', shown.aroundEaten.kind === 'resized' && row('dinner').resizedBy !== null && row('dinner').macros.calories < dinner.macros.calories, [shown.aroundEaten.kind, row('dinner').macros.calories, dinner.macros.calories, day3.dinner.calories])
    check('the lunch cooked for him is NOT re-sized', row('lunch').resizedBy === null && row('lunch').macros.calories === lunch.macros.calories && row('lunch').option?.name === lunch.name, row('lunch'))
    check('...and is not named among the meals that were', shown.aroundEaten.kind === 'resized' && !shown.aroundEaten.slots.includes('lunch') && shown.aroundEaten.slots.join() === 'dinner', shown.aroundEaten)
    const total = shown.totals.calories
    const want = chosen.breakfast.macros.calories + lunch.macros.calories + dinner.macros.calories
    check('...the dinner alone closes the gap: the day comes back to its target', Math.abs(total - want) <= want * 0.05, [total, want])
    // Both open meals cooked for him: nothing of his is left to fit, so nothing is re-sized and nothing is claimed.
    const both = dayAsShown({ slots: ['breakfast', 'lunch', 'dinner'], chosen: { breakfast: chosen.breakfast, lunch, dinner: assumedMeal('dinner', BUDGETS.dinner) }, eatenBySlot: { breakfast: big }, targets: TARGETS })
    const far = dayAsShown({ slots: ['breakfast', 'lunch', 'dinner'], chosen, eatenBySlot: { breakfast: { ...big, kcal: big.kcal + 170 } }, targets: { ...TARGETS, calories: want } })
    check('a gap his one open meal cannot close inside 25% is left alone and said, never taken out of the kitchen\'s portion', far.aroundEaten.kind === 'too_far' && far.slots.every(r => r.resizedBy === null), far.aroundEaten)
    check('with no meal of his own left open, nothing is re-sized', both.aroundEaten.kind === 'none' && both.slots.every(r => r.resizedBy === null), both.aroundEaten)
  }

  console.log('\n11. A meal cooked for him is not his to move, or to make bigger or smaller')
  {
    const serving = { today: MONDAY, dates: WEEK, todaysPins: {}, pinsByDate: {}, pools, targets: TARGETS, softLikedFoods: NO_LIKES, shape: awayShape, rotation: null, keepHeldSizes: [] }
    const tuesday = WEEK[1], saturday = WEEK[5]
    const move = (args: Record<string, string>) => buildMealDayMoveProposal({ profileId: 'p1', rawArgs: args as never, serving: serving as never, loggedTodaySlots: [], listDates: [] })
    const fromAway = move({ meal_slot: 'lunch', from_date: tuesday, to_date: saturday })
    check('swapping Tuesday\'s lunch (cooked for him) with Saturday\'s is refused, saying why', fromAway.ok === false && /Tuesday's lunch is cooked for you, so there's no meal of yours there to swap/.test(fromAway.reason), fromAway)
    const toAway = move({ meal_slot: 'lunch', from_date: saturday, to_date: tuesday })
    check('...and the other way round', toAway.ok === false && /Tuesday's lunch is cooked for you/.test(toAway.reason), toAway)
    const dinners = move({ meal_slot: 'dinner', from_date: tuesday, to_date: saturday })
    check('his own dinners on those two days still swap', dinners.ok === true || (dinners.ok === false && !/cooked for you/.test(dinners.reason)), dinners.ok === false ? dinners.reason : 'ok')
    const cross = move({ meal_slot: 'dinner', from_date: saturday, to_date: tuesday, to_slot: 'lunch' })
    check('a dinner cannot trade places with a lunch that is cooked for him', cross.ok === false && /cooked for you/.test(cross.reason), cross)
    const rebalance = (args: Record<string, unknown>) => buildMealRebalanceProposal({ profileId: 'p1', rawArgs: args, serving: serving as never, loggedTodaySlots: [], listDates: [] })
    const fromLunch = rebalance({ from_slot: 'lunch', to_slot: 'dinner', kcal: 150 })
    check('moving calories OUT of a lunch cooked for him is refused, saying why', fromLunch.ok === false && /lunch is cooked for you, so its size isn't yours to change/.test(fromLunch.reason) && !('ask' in fromLunch && fromLunch.ask), fromLunch)
    const intoLunch = rebalance({ from_slot: 'dinner', to_slot: 'lunch', kcal: 150 })
    check('...and INTO one', intoLunch.ok === false && /lunch is cooked for you/.test(intoLunch.reason), intoLunch)
    const weekend = rebalance({ from_slot: 'lunch', to_slot: 'dinner', kcal: 150, date: saturday })
    check('on a day both meals are his own, the same move is not refused for that', !(weekend.ok === false && /cooked for you/.test(weekend.reason)), weekend.ok === false ? weekend.reason : 'ok')
  }

  console.log('\n12. He tells the coach what the meal is: an estimate, for that one day')
  {
    const ctx = { profileId: 'p1', todayDate: MONDAY, targets: TARGETS, mealsPerDay: 3, includeSnacks: true, dietaryPreferences: [] as string[] }
    // A canteen curry as the coach is told to write it: everyday foods at ordinary portions ("chicken curry" itself is
    // not a food the app can cost, and is refused: measured, the first fixture here said exactly that).
    const lines = ['150g chicken breast', '70g dry rice', '100g broccoli', '10g olive oil']
    const args = { meal_slot: 'lunch', name: 'Canteen chicken curry', food_lines: lines, date: WEEK[1], origin_verbatim_quote: 'the canteen has chicken curry and rice on Tuesday' }
    const cooked = buildCustomMealProposal({ ...ctx, rawArgs: { ...args, cooked_for_me: true } })
    const own = buildCustomMealProposal({ ...ctx, rawArgs: args })
    check('the fixture binds: the same foods are accepted as his own meal', own.ok, own.ok ? undefined : own.reason)
    check('a meal cooked for him is accepted from the same foods', cooked.ok, cooked.ok ? undefined : cooked.reason)
    // Every check below runs every time: a refused card gives an empty option, and the checks fail rather than vanish.
    const NONE: PoolOption = { slot: 'lunch', name: '', ingredients: [], macros: { calories: 0, protein: 0, carbs: 0, fat: 0 }, tags: [] }
    const o = cooked.ok ? cooked.payload.option : NONE
    const mine = own.ok ? own.payload.option : NONE
    check('it is kept as an ESTIMATE', elsewhereState(o) === 'estimate' && isCookedElsewhere(o), o.tags)
    check('...made for one day: never searched for on any other', isPinOnly(o), o.tags)
    check('...and is NOT one of "his meals", which come first every week', cooked.ok && !o.tags.includes(MY_MEAL_TAG) && mine.tags.includes(MY_MEAL_TAG), [o.tags, mine.tags])
    check('...for the day he named, and that meal', cooked.ok && cooked.payload.date === WEEK[1] && cooked.payload.slot === 'lunch')
    check('...costed by the app from its own food table, the same numbers as his own meal of those foods', JSON.stringify(o.macros) === JSON.stringify(mine.macros) && o.macros.calories > 300, [o.macros, mine.macros])
    check('a dish named with no foods the app knows is refused, never costed from its name', (() => { const r = buildCustomMealProposal({ ...ctx, rawArgs: { ...args, food_lines: ['300g chicken curry'], cooked_for_me: true } }); return !r.ok && /don't have chicken curry in my food data/.test(r.reason) })())
    const said = cooked.ok ? [...cooked.diff.rows.map(r => `${r.field} ${r.before} ${r.after}`), ...cooked.diff.implications.map(i => i.text)].join(' | ') : ''
    const saidOwn = own.ok ? own.diff.implications.map(i => i.text).join(' | ') : ''
    check('the card says it is an estimate at ordinary portions', /An estimate, at ordinary portions/.test(said), said)
    check('...that it is kept for that day only, and never shopped for', /Kept as Tuesday's lunch only\. It isn't added to your own meals and is never on your shopping list\./.test(said), said)
    check('...and does NOT say it joins his options or that the portions are his', said.length > 0 && !/Joins your|untouched/.test(said) && /Joins your lunch options/.test(saidOwn) && /untouched/.test(saidOwn), [said, saidOwn])
    check('...and says nothing about suiting his diet', said.length > 0 && !/\b(safe|suits?|fits? your diet|free of|allerg)/i.test(said), said)
    check('the card\'s first row is headed as a meal cooked for him, which is what the chat reads to say "my estimate"', cooked.ok && cooked.diff.rows[0].field === 'Lunch cooked for you' && own.ok && own.diff.rows[0].field === 'Your lunch')
    // In the week: Tuesday's lunch is the estimate, fixed, and no other day ever serves it.
    const withEstimate: Pools = { ...pools, lunch: [...pools.lunch!, o] }
    const week = serveDates({ dates: WEEK, pools: withEstimate, targets: TARGETS, shape: awayShape, pinsByDate: { [WEEK[1]]: { lunch: o } } })
    const tue = week.find(d => d.date === WEEK[1])!.day
    check('Tuesday\'s lunch is the estimate, at exactly the size the app costed', cooked.ok && tue.chosen.lunch?.name === o.name && tue.chosen.lunch.macros.calories === o.macros.calories && elsewhereState(tue.chosen.lunch) === 'estimate', names(tue.chosen))
    check('...Tuesday\'s breakfast is still the assumed one cooked for him', elsewhereState(tue.chosen.breakfast) === 'assumed')
    check('...and his dinner and snack are chosen around it', !!tue.chosen.dinner && !isCookedElsewhere(tue.chosen.dinner) && !!tue.chosen.snack)
    check('no other day of the week serves the canteen\'s curry', cooked.ok && week.filter(d => d.date !== WEEK[1]).every(d => SLOTS.every(sl => d.day.chosen[sl]?.name !== o.name)))
    const fourWeeks = serveDates({ dates: datesFrom(MONDAY, 28), pools: withEstimate, targets: TARGETS, shape: SHAPE })
    check('...nor any day of four weeks with no pick naming it', cooked.ok && fourWeeks.every(d => SLOTS.every(sl => d.day.chosen[sl]?.name !== o.name)))
    // Where the rule BINDS: the estimate is the ONLY lunch there is, so a search that could reach it would serve it.
    // (In the weeks above a 500 kcal lunch is simply never the best fit, and a mutation letting the search reach it
    // changed nothing a check could see.)
    // (Leftovers off: with them on, last night's dinner rightly fills an empty lunch, which is not what is asked here.)
    const noLeftovers: MealShape = { ...SHAPE, batchCooking: false }
    const onlyEstimate = serveDates({ dates: WEEK, pools: { ...pools, lunch: [o] }, targets: TARGETS, shape: noLeftovers })
    check('even as the only lunch in the pool, it is served on no day that no pick names', cooked.ok && onlyEstimate.length === 7 && onlyEstimate.every(d => d.day.chosen.lunch === undefined), onlyEstimate.map(d => d.day.chosen.lunch?.name ?? '-'))
    const onlyPicked = serveDates({ dates: WEEK, pools: { ...pools, lunch: [o] }, targets: TARGETS, shape: noLeftovers, pinsByDate: { [WEEK[1]]: { lunch: o } } })
    check('...and on exactly the one day a pick does', cooked.ok && onlyPicked.filter(d => d.day.chosen.lunch?.name === o.name).map(d => d.date).join() === WEEK[1])
    check('it is never the source of the next day\'s lunch', cooked.ok && leftoverLunchFrom({ ...o, slot: 'dinner' }, BUDGETS.lunch) === null && leftoverLunchFrom({ ...mine, slot: 'dinner' }, BUDGETS.lunch) !== null)
    // The coach's view of the day: never "verified" for a meal cooked for him, and flagged so a move is refused.
    const view = chosenToMealPlanDays({ breakfast: assumedMeal('breakfast', BUDGETS.breakfast), lunch: o, dinner: pools.dinner![0] })
    const item = (m: string) => view.find(v => v.meal === m)!.items[0]
    check('the coach\'s view marks both kinds as cooked for him and neither as verified', item('Breakfast').cooked_elsewhere === true && item('Breakfast').is_verified === false && item('Lunch').cooked_elsewhere === true && item('Lunch').is_verified === false, [item('Breakfast'), item('Lunch')])
    check('...and a plan dish as neither', item('Dinner').cooked_elsewhere === undefined && item('Dinner').is_verified === true)
    const moveCtx = { profileId: 'p1', targets: TARGETS, mealsPerDay: 3, includeSnacks: true, dietaryPreferences: [] as string[], dislikedFoods: [] as string[], todayDate: MONDAY }
    const asMeal = (op: PoolOption, away = false) => ({ name: op.name, ingredients: op.ingredients.map(g => `${g.quantity}${g.unit} ${g.name}`), macros: op.macros, cookedElsewhere: away })
    const bySlot = { breakfast: asMeal(assumedMeal('breakfast', BUDGETS.breakfast), true), lunch: asMeal(pools.lunch![0]), dinner: asMeal(pools.dinner![0]) }
    const intoAway = buildMealMoveProposal({ ...moveCtx, rawArgs: { from_slot: 'dinner', to_slot: 'breakfast' }, mealsBySlot: bySlot })
    check('the coach cannot move his dinner into a breakfast cooked for him', !intoAway.ok && intoAway.reason === MOVE_REFUSALS.elsewhereTo('breakfast'), intoAway.ok ? 'accepted' : intoAway.reason)
    const awayOut = buildMealMoveProposal({ ...moveCtx, rawArgs: { from_slot: 'breakfast', to_slot: 'dinner' }, mealsBySlot: bySlot })
    check('...nor move the breakfast cooked for him', !awayOut.ok && awayOut.reason === MOVE_REFUSALS.elsewhereFrom('breakfast'), awayOut.ok ? 'accepted' : awayOut.reason)
    const ownMove = buildMealMoveProposal({ ...moveCtx, rawArgs: { from_slot: 'dinner', to_slot: 'lunch' }, mealsBySlot: bySlot })
    check('his own dinner and lunch are not refused for that', ownMove.ok || !/cooked for you/.test(ownMove.reason), ownMove.ok ? 'ok' : ownMove.reason)
    // THE ALLERGEN PATH IS THE SAME PATH. A food that clashes is refused in the same words either way.
    const nutty = { ...args, food_lines: ['150g chicken breast', '30g peanut butter', '70g dry rice'] }
    const refusedCooked = buildCustomMealProposal({ ...ctx, dietaryPreferences: ['nut-free'], rawArgs: { ...nutty, cooked_for_me: true } })
    const refusedOwn = buildCustomMealProposal({ ...ctx, dietaryPreferences: ['nut-free'], rawArgs: nutty })
    check('the fixture binds: his own meal with peanut butter is refused on a nut-free profile', !refusedOwn.ok, refusedOwn.ok ? 'accepted' : refusedOwn.reason)
    check('a meal cooked for him with the same food is refused in the SAME words', !refusedCooked.ok && !refusedOwn.ok && refusedCooked.reason === refusedOwn.reason, [refusedCooked.ok ? 'accepted' : refusedCooked.reason])
    const unread = buildCustomMealProposal({ ...ctx, rawArgs: { ...args, food_lines: ['a knob of butter', '70g dry rice'], cooked_for_me: true } })
    check('a line the app cannot read is still asked about, never guessed', !unread.ok && /how many grams|How much/i.test(unread.reason), unread.ok ? 'accepted' : unread.reason)
    const avoided = buildCustomMealProposal({ ...ctx, dislikedFoods: ['broccoli'], rawArgs: { ...args, cooked_for_me: true } })
    check('a food he avoids is still refused', !avoided.ok, avoided.ok ? 'accepted' : avoided.reason)

    const { name: _dropped, ...unnamed } = args
    const unnamedCooked = buildCustomMealProposal({ ...ctx, rawArgs: { ...unnamed, cooked_for_me: true } })
    const unnamedOwn = buildCustomMealProposal({ ...ctx, rawArgs: unnamed })
    check('given no name, an estimate is called what the row is called, and his own meal "My lunch"', unnamedCooked.ok && unnamedCooked.payload.option.name === 'Lunch cooked for you' && unnamedOwn.ok && unnamedOwn.payload.option.name === 'My lunch', [unnamedCooked.ok && unnamedCooked.payload.option.name, unnamedOwn.ok && unnamedOwn.payload.option.name])
    const notCooked = buildCustomMealProposal({ ...ctx, rawArgs: { ...args, cooked_for_me: false } })
    check('with the flag off (or anything but true) it is his own meal, as before', notCooked.ok && !isCookedElsewhere(notCooked.payload.option) && notCooked.payload.option.tags.includes(MY_MEAL_TAG) && (() => { const r = buildCustomMealProposal({ ...ctx, rawArgs: { ...args, cooked_for_me: 'no' } }); return r.ok && !isCookedElsewhere(r.payload.option) })())
    // The chat's own two lines of wiring for this, held where they are written (no test page drives a coach's card
    // for a meal cooked for him: the coach's half needs its deploy).
    const chat = readFileSync('src/components/ChatAssistant.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const estimateLead = chat.indexOf("if (pendingAction.kind === 'propose_custom_meal' && /cooked for you$/.test(rows[0].field)) return `Here's my estimate of **${rows[0].after}**:`")
    const ownLead = chat.indexOf("if (pendingAction.kind === 'propose_custom_meal') return `Here's **${rows[0].after}**, exactly as you have it:`")
    check('the chat introduces it as an estimate, never "exactly as you have it"', estimateLead > 0 && ownLead > 0 && estimateLead < ownLead, [estimateLead, ownLead])
    check('the chat tells the move builder which of today\'s meals are cooked for him', /cookedElsewhere: item\.cooked_elsewhere === true,/.test(chat))

    const coach = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
    const tool = coach.slice(coach.indexOf('name: "propose_custom_meal"'), coach.indexOf('name: "propose_meal_food_add"'))
    check('the coach\'s tool has the flag, as a true-or-false', /cooked_for_me: \{\s*type: "boolean"/.test(tool))
    check('...and is told it is for somebody else\'s cooking only', /Never set cooked_for_me for food they cook themselves/.test(tool))
    const rule = coach.slice(coach.indexOf('- A MEAL COOKED FOR THEM'), coach.indexOf('- A MEAL COOKED FOR THEM') + 2200)
    check('the coach is told: one meal a call', /ONE MEAL PER CALL/.test(rule))
    check('...never to say such a meal fits their diet or is free of anything', /NEVER say a meal cooked for them fits their diet or is free of anything/.test(rule))
    check('...that it cannot set which days, and must not claim it recorded them', /you can't set it from here/.test(rule) && /Do not claim to have recorded it/.test(rule))
    check('...and where that setting really is', /Profile, under Meals & shopping, as "Meals cooked for me"/.test(rule) && /Meals & shopping/.test(readFileSync('src/components/ProfileScreen.tsx', 'utf8')) && ELSEWHERE_WORDS.profileHeading === 'Meals cooked for me')
  }

  console.log(`\n${ran} checks ran.`)
}

main()
if (failures > 0) { console.log(`\n${failures} FAILED`); process.exit(1) }
console.log('\nMeals cooked for him stay in the day, are counted, and are never shopped for.')
