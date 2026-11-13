// test:flexible-nutrition — his 13 Nov 2026 strategy, slice 4 (docs/plans/flexible-nutrition.md): freestyle with its own
// label (his ruling "Its own label"), the starter tier, staples said, the week's average, and the variety setting.
import { holdsNutritionFigure } from '../src/lib/show-numbers'
import { readFileSync } from 'fs'
import {
  freestyleOption, isFreestyle, isFreestyleDay, freestyleDayLabel, dayLineFor, FREESTYLE_TAG,
  MEAL_VARIETY_OPTIONS,
} from '../src/lib/freestyle'
import { weeklyAverage, weeklyAverageLine, weeklyLoggedLine, finishedDaysThisWeek, mondayOfDate } from '../src/lib/weekly-average'
import { starterDayLine } from '../src/lib/show-numbers'
import { historyForVariety, buildRotation } from '../src/lib/meal-rotation'
import { computeSlotBudgets, dayVerdictLabel, dayVerdict, type PoolOption } from '../src/lib/meal-generation'
import { sizedUsualLine } from '../src/components/MealPlan'
import { MY_MEAL_TAG, type MealSlotName } from '../src/lib/meal-store'
import { makeDish, mulberry32 } from './meal-fixture'
import type { MacroTargets } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const T: MacroTargets = { calories: 2200, protein: 160, carbs: 230, fat: 70 }

console.log('test:flexible-nutrition\n')

console.log('1. The week\'s average (4d): finished days, logged days only, said with how many')
check('a Monday has no finished day yet', finishedDaysThisWeek('2026-11-09').length === 0)
check('a Thursday has Monday to Wednesday', finishedDaysThisWeek('2026-11-12').join() === '2026-11-09,2026-11-10,2026-11-11')
check('a Sunday has six (today is never averaged in)', finishedDaysThisWeek('2026-11-15').length === 6 && !finishedDaysThisWeek('2026-11-15').includes('2026-11-15'))
check('the Monday of a Sunday is six days back', mondayOfDate('2026-11-15') === '2026-11-09')
const eaten = {
  '2026-11-09': { kcal: 2400, protein: 170, carbs: 250, fat: 80, meals: 3 },
  '2026-11-10': { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 },
  '2026-11-11': { kcal: 2000, protein: 150, carbs: 210, fat: 60, meals: 3 },
  '2026-11-12': { kcal: 900, protein: 50, carbs: 100, fat: 30, meals: 1 },
}
const avg = weeklyAverage(eaten, '2026-11-12', T)
check('averaged over the days logged, never the empty one', avg?.kcal === 2200 && avg?.protein === 160 && avg?.daysLogged === 2 && avg?.daysSoFar === 3, avg)
check('today (Thursday, half-eaten) is left out', avg?.kcal === 2200)
check('nothing logged this week: no line at all', weeklyAverage({}, '2026-11-12', T) === null)
check('the line says the numbers and how many days', avg != null && weeklyAverageLine(avg) === 'This week so far: 2,200 kcal a day against 2,200, protein 160 g against 160 (2 days logged of 3).', avg && weeklyAverageLine(avg))
check('the starter tier\'s line holds no figure but the day count', avg != null && !/kcal|\bg\b|\d{3}/.test(weeklyLoggedLine(avg)) && /2 days of 3/.test(weeklyLoggedLine(avg)), avg && weeklyLoggedLine(avg))

console.log('\n2. Freestyle (4a): an empty one-day meal, its own line, never "on target"')
const fo = freestyleOption('dinner', '2026-11-13')
check('the meal holds nothing and counts nothing', fo.ingredients.length === 0 && fo.macros.calories === 0 && fo.macros.protein === 0)
check('it is one day only (pin-only) and marked freestyle', (fo.tags ?? []).includes(FREESTYLE_TAG) && (fo.tags ?? []).some(t => /pin/.test(t)))
check('its name says whose choice and which day', fo.name === 'Your dinner choice (Friday)', fo.name)
check('an edited copy of it is still freestyle', isFreestyle({ name: 'Your dinner choice (Friday) + 2 eggs', tags: [] }))
check('a plan dish is not', !isFreestyle({ name: 'Chicken and rice', tags: [] }))
const plan = { name: 'Chicken and rice', tags: [] as string[] }
check('a freestyle day: every meal not yet eaten is freestyle', isFreestyleDay({ breakfast: fo, dinner: fo }))
check('a meal eaten before going freestyle still lets the rest be freestyle', isFreestyleDay({ breakfast: plan, dinner: fo }, new Set<MealSlotName>(['breakfast'])))
check('one plan meal still to come: not a freestyle day', !isFreestyleDay({ breakfast: plan, dinner: fo }))
check('before anything is in: "log what you eat"', freestyleDayLabel({ calories: 0, protein: 0, carbs: 0, fat: 0 }, T) === 'Freestyle · log what you eat')
check('protein hit and calories within range: his words exactly',
  freestyleDayLabel({ calories: 2150, protein: 158, carbs: 300, fat: 40 }, T) === 'Freestyle · protein hit · calories within range')
check('...judged on protein and calories only (carbs and fat way off do not matter)',
  dayVerdictLabel({ calories: 2150, protein: 158, carbs: 300, fat: 40 }, T) !== 'on target')
// LITERAL sides (target 160 g, 2,200 kcal): a check against the constant itself would move with a changed constant.
check('protein at 152 g of 160 is hit, 150 g is "2 g short" (the 95% floor binds)',
  /protein hit/.test(freestyleDayLabel({ calories: 2200, protein: 152, carbs: 0, fat: 0 }, T))
  && /protein 2 g short/.test(freestyleDayLabel({ calories: 2200, protein: 150, carbs: 0, fat: 0 }, T)))
check('2,419 kcal of 2,200 is in range, 2,425 is "225 kcal over", 1,975 is "225 kcal under" (±10%)',
  /within range/.test(freestyleDayLabel({ calories: 2419, protein: 160, carbs: 0, fat: 0 }, T))
  && /^Freestyle · protein hit · 225 kcal over$/.test(freestyleDayLabel({ calories: 2425, protein: 160, carbs: 0, fat: 0 }, T))
  && /^Freestyle · protein hit · 225 kcal under$/.test(freestyleDayLabel({ calories: 1975, protein: 160, carbs: 0, fat: 0 }, T))
  && /within range/.test(freestyleDayLabel({ calories: 1981, protein: 160, carbs: 0, fat: 0 }, T)))
check('a freestyle day that lands exactly on target still never says "on target"',
  dayLineFor({ dinner: fo }, T, T) !== 'on target' && /^Freestyle/.test(dayLineFor({ dinner: fo }, T, T)), dayLineFor({ dinner: fo }, T, T))
check('a plan day reads the plan\'s own verdict through the same function', dayLineFor({ dinner: plan as PoolOption }, T, T) === 'on target')
const ui = ['src/components/MealPlan.tsx', 'src/components/nutrition/NutritionWeek.tsx'].map(f => strip(readFileSync(f, 'utf8'))).join('\n')
check('every day line on screen comes through dayLineFor (no screen calls the plan verdict directly)', !/dayVerdictLabel\(/.test(ui) && (ui.match(/dayLineFor\(/g) ?? []).length >= 3)
const grocery = strip(readFileSync('src/lib/grocery-store.ts', 'utf8'))
check('the shopping list skips a freestyle meal (with foods added or not)', /if \(isFreestyle\(option\)\) continue/.test(grocery))
const mp = strip(readFileSync('src/components/MealPlan.tsx', 'utf8'))
check('an empty freestyle meal cannot be logged as eaten', /emptyFreestyle = !!option && isFreestyle\(option\) && option\.ingredients\.length === 0/.test(mp)
  && /disabled=\{busy \|\| \(\(blocked \|\| emptyFreestyle\) && !isLogged\)\}/.test(mp) && /if \(\(blocked \|\| emptyFreestyle\) && !isLogged\) return/.test(mp))

console.log('\n3. The starter tier (4b): one switch, no numbers')
check('the day line counts meals, never numbers', starterDayLine(2, 4) === 'Logged 2 of 4 meals' && starterDayLine(0, 3) === '3 meals planned')
const files = ['src/components/NutritionDisplay.tsx', 'src/components/Dashboard.tsx', 'src/components/nutrition/NutritionWeek.tsx', 'src/components/nutrition/NutritionRings.tsx', 'src/components/MealPlan.tsx']
const readers = files.filter(f => /useShowNumbers\(\)/.test(strip(readFileSync(f, 'utf8'))))
check('a coach line with a calorie or gram figure is recognised; a weight on the bar and minutes are not',
  holdsNutritionFigure('Protein is behind — 160g to go') && holdsNutritionFigure('2,400 kcal so far') && holdsNutritionFigure('about 12 g of fat')
  && !holdsNutritionFigure('Squat 80 kg today') && !holdsNutritionFigure('A 30 minute walk') && !holdsNutritionFigure('3 meals planned'))
check('every screen part that draws a nutrition number reads the one switch', readers.length === files.length, files.filter(f => !readers.includes(f)))
const app = strip(readFileSync('src/App.tsx', 'utf8'))
check('the app provides it from the profile, absent reading as on', /<ShowNumbersContext\.Provider value=\{profile\?\.show_numbers !== false\}>/.test(app))
const rings = strip(readFileSync('src/components/nutrition/NutritionRings.tsx', 'utf8'))
check('a meal\'s macros are not drawn on the starter tier', /if \(!useShowNumbers\(\)\) return null/.test(rings))
const coach = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
check('the coach is told, and told not to quote calories or macros', /context\.show_numbers === false/.test(coach) && /Never quote a calorie/.test(coach))

console.log('\n4. Staples (4c): his own meal, resized, says so')
const mine: PoolOption = { slot: 'dinner', name: 'My chilli', ingredients: [], macros: { calories: 700, protein: 50, carbs: 60, fat: 20 }, tags: [MY_MEAL_TAG] }
check('his meal at another size says so', sizedUsualLine({ ...mine, macros: { ...mine.macros, calories: 800 } }, [mine]) === "Your usual, sized to today's targets.")
check('...at his own size it says nothing', sizedUsualLine(mine, [mine]) === null)
check('...within 3% it says nothing (a rounding is not a resize)', sizedUsualLine({ ...mine, macros: { ...mine.macros, calories: 715 } }, [mine]) === null)
check('a plan dish resized says nothing (only his own meals)', sizedUsualLine({ ...mine, tags: [], macros: { ...mine.macros, calories: 800 } }, [{ ...mine, tags: [] }]) === null)

console.log('\n5. Meal variety (4e): how much it remembers, never past the targets')
const h = { dinner: ['a', 'b', 'c', 'd'], lunch: ['x', 'y'] }
check('"Lots of variety" is today\'s rules, untouched', historyForVariety(h, { variety: 'variety' }) === h && historyForVariety(h, {}) === h)
check('"Some repeats" remembers only yesterday', JSON.stringify(historyForVariety(h, { variety: 'some' })) === JSON.stringify({ dinner: ['d'], lunch: ['y'] }))
check('"Same meals most days" remembers nothing', JSON.stringify(historyForVariety(h, { variety: 'same' })) === '{}')
check('three choices offered, in his words', MEAL_VARIETY_OPTIONS.map(o => o.label).join('|') === 'Lots of variety|Some repeats|Same meals most days')
// ON A REAL POOL: dishes from real foods, five a meal, a week each way.
const rnd = mulberry32(1311)
const budgets = computeSlotBudgets(T, 3, false)
const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlotName[]) {
  pools[slot] = Array.from({ length: 5 }, (_, i) => makeDish(rnd, slot, i, budgets[slot]!, { shape: 0.1 })).filter((d): d is PoolOption => !!d)
}
const distinct = (shape: { variety?: 'variety' | 'some' | 'same' }) => {
  const rot = buildRotation(pools, T, [], { mealsPerDay: 3, includeSnacks: false, batchCooking: false, ...shape })
  const dinners = rot.days.map(d => d.chosen.dinner?.name)
  const onTarget = rot.days.filter(d => dayVerdict(Object.values(d.chosen).reduce((a, o) => ({ calories: a.calories + o!.macros.calories, protein: a.protein + o!.macros.protein, carbs: a.carbs + o!.macros.carbs, fat: a.fat + o!.macros.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), T).onTarget).length
  return { kinds: new Set(dinners).size, backToBack: dinners.filter((n, i) => i > 0 && n === dinners[i - 1]).length, onTarget }
}
const lots = distinct({ variety: 'variety' })
const same = distinct({ variety: 'same' })
console.log(`  (measured: lots of variety ${lots.kinds} dinners, ${lots.backToBack} back to back, ${lots.onTarget}/7 on target; same meals ${same.kinds} dinners, ${same.backToBack} back to back, ${same.onTarget}/7 on target)`)
check('the pool is deep enough for this to mean something (5 dishes each)', (pools.dinner?.length ?? 0) === 5 && (pools.lunch?.length ?? 0) === 5)
check('"Same meals" serves fewer different dinners than "Lots of variety"', same.kinds < lots.kinds, { lots, same })
check('"Same meals" lets a dinner come back the next day', same.backToBack > 0, same)
check('"Lots of variety" never serves the same dinner two days running here', lots.backToBack === 0, lots)
check('no setting buys a day off target (same days on target or more)', same.onTarget >= lots.onTarget, { lots, same })

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
