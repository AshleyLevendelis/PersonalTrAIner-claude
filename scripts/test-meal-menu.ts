/**
 * test:meal-menu — the week's menu a deep pool is served from (docs/plans/deep-meal-pool.md, 9 Nov 2026).
 *
 * Ashley, 9 Nov 2026: "We need a much deeper pool of meals to choose from not only 14". The day picker tries every
 * combination of one dish a meal, so a deep pool is served from a WEEK'S MENU of MENU_SIZE dishes a meal, and
 * successive weeks take successive dishes so the whole pool comes round. This gate holds that function, and that the
 * week the app serves is drawn from it.
 */
import { readFileSync } from 'fs'
import { MENU_SIZE, menuFor, menuForSlot, menuWeekOf } from '../src/lib/meal-menu'
import { serveDates, rotationIndexFor, addDays } from '../src/lib/meal-rotation'
import { fittingCounts, topUpPlan, topUpOffer } from '../src/lib/meal-top-up'
import { DEEP_POOL_SIZE } from '../src/lib/meal-generation'
import { isExoticOption, type PoolOption } from '../src/lib/meal-generation'
import { USER_REQUESTED_TAG, type MealSlotName } from '../src/lib/meal-store'
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

/** A plausible whole: every dish is near its meal's share of the day, so days land on target and the search works. */
function dish(slot: MealSlotName, i: number, cuisine = 'British / Classic', tags: string[] = []): PoolOption {
  const k = SHARE[slot] * (0.94 + ((i * 7) % 13) / 100)
  return {
    slot, name: `${slot} dish ${String(i).padStart(3, '0')}`,
    ingredients: [{ name: 'chicken breast raw', quantity: Math.round(k * 700), unit: 'g' }],
    macros: { calories: Math.round(TARGETS.calories * k), protein: Math.round(TARGETS.protein * k), carbs: Math.round(TARGETS.carbs * k), fat: Math.round(TARGETS.fat * k) },
    tags: [cuisine, ...tags],
  }
}
const deepPools = (n: number): Partial<Record<MealSlotName, PoolOption[]>> =>
  Object.fromEntries(SLOTS.map(s => [s, Array.from({ length: n }, (_, i) => dish(s, i))]))

function main() {
  console.log('1. A pool no deeper than a menu is its own menu, exactly as before')
  const small = deepPools(7)
  check(`a ${7}-dish pool is returned as the SAME object (the rotation's identity shortcuts still hold)`, menuFor(small, '2026-11-09') === small)
  const atSize = deepPools(MENU_SIZE)
  check(`...and so is one of exactly MENU_SIZE (${MENU_SIZE})`, menuFor(atSize, '2026-11-09') === atSize)

  console.log('\n2. A deep pool: a menu a week, drawn from the pool')
  const N = 60
  const deep = deepPools(N)
  const d0 = '2026-11-09'
  const m0 = menuFor(deep, d0)
  check('a deep pool gets a menu that is a different object', m0 !== deep)
  check(`every meal's menu holds MENU_SIZE dishes (${MENU_SIZE}), all from that meal's pool`, SLOTS.every(s => m0[s]!.length === MENU_SIZE && m0[s]!.every(o => deep[s]!.includes(o))), SLOTS.map(s => m0[s]!.length))
  check('the same inputs return the same object (a rotation built from it is found again)', menuFor(deep, d0) === m0)
  // Every date of one rotation week has the same menu, so the menu never changes mid-week.
  const weekStart = (() => { let d = d0; while (rotationIndexFor(d) !== 0) d = addDays(d, -1); return d })()
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  check('a menu week is a rotation week: the seven dates whose rotation index runs 0..6 share one menu', weekDates.every(d => menuFor(deep, d) === menuFor(deep, weekStart)) && menuFor(deep, addDays(weekStart, 7)) !== menuFor(deep, weekStart), weekDates.map(d => [d, rotationIndexFor(d), menuWeekOf(d)]))
  const next = menuFor(deep, addDays(weekStart, 7))
  const overlap = SLOTS.map(s => next[s]!.filter(o => menuFor(deep, weekStart)[s]!.includes(o)).length)
  check('consecutive weeks share no dish while the pool is at least two menus deep', overlap.every(n => n === 0), overlap)
  const weeksToCover = Math.ceil(N / MENU_SIZE)
  const seen = new Set<string>()
  for (let w = 0; w < weeksToCover; w++) for (const o of menuFor(deep, addDays(weekStart, 7 * w)).lunch!) seen.add(o.name)
  check(`the whole pool comes round: ${weeksToCover} weeks of menus cover all ${N} lunches`, seen.size === N, seen.size)

  console.log('\n3. What a menu keeps, and what it leaves out')
  const withBreakers = deepPools(30)
  withBreakers.dinner = withBreakers.dinner!.map((o, i) => (i % 2 === 0 ? { ...o, breaksRestriction: true as const } : o))
  const mb = menuFor(withBreakers, d0).dinner!
  check('a dish that breaks a current restriction is never on a menu (it would never be served)', mb.length > 0 && mb.every(o => !o.breaksRestriction), mb.map(o => o.name))
  const exoticPool = Array.from({ length: 30 }, (_, i) => dish('lunch', i, i % 2 ? 'Thai' : 'British / Classic'))
  const exoticCounts = Array.from({ length: 6 }, (_, w) => menuForSlot(exoticPool, w).filter(isExoticOption).length)
  check('at most one adventurous cuisine a meal on any week\'s menu (the cap that was on the pool)', exoticCounts.every(n => n <= 1) && exoticCounts.some(n => n === 1), exoticCounts)
  const liked = deepPools(40)
  liked.lunch = liked.lunch!.map((o, i) => (i === 33 ? { ...o, name: 'Salmon teriyaki bowl', ingredients: [{ name: 'salmon', quantity: 150, unit: 'g' }] } : o))
  const likedOnEvery = Array.from({ length: 6 }, (_, w) => menuFor(liked, addDays(weekStart, 7 * w), ['salmon']).lunch!.some(o => o.name === 'Salmon teriyaki bowl'))
  check('a dish with a food she likes is on every week\'s menu', likedOnEvery.every(Boolean), likedOnEvery)
  const base = dish('dinner', 0)
  const copy: PoolOption = { ...base, name: `${base.name} + 1 sachet honey`, tags: [...base.tags, USER_REQUESTED_TAG] }
  const withCopy = [base, copy, ...Array.from({ length: 20 }, (_, i) => dish('dinner', i + 1))]
  const copyWeeks = Array.from({ length: 4 }, (_, w) => menuForSlot(withCopy, w)).map(m => m.filter(o => o === base || o === copy).length)
  check('an edited copy and its base are one dish: never both on a menu, and the copy stands for them', copyWeeks.every(n => n <= 1) && Array.from({ length: 4 }, (_, w) => menuForSlot(withCopy, w)).every(m => !m.includes(base)), copyWeeks)

  console.log('\n4. The week the app serves is drawn from the menu')
  const dates = Array.from({ length: 28 }, (_, i) => addDays(weekStart, i))
  const served = serveDates({ dates, pools: deep, targets: TARGETS, shape: { mealsPerDay: 3, includeSnacks: true } })
  const offMenu: string[] = []
  for (const d of served) for (const s of SLOTS) {
    const o = d.day.chosen[s]
    if (o && !menuFor(deep, d.date)[s]!.includes(o)) offMenu.push(`${d.date} ${s} ${o.name}`)
  }
  check('every dish served on a date is on that date\'s menu', served.length === 28 && offMenu.length === 0, offMenu.slice(0, 4))
  const distinct = SLOTS.map(s => new Set(served.map(d => d.day.chosen[s]?.name).filter(Boolean)).size)
  // A 7-day rotation over one pool can serve at most 7 dishes a meal in four weeks; menus that move on serve more.
  check('four weeks serve more than seven different dishes a meal (the rotation used to repeat the same week)', distinct.every(n => n > 7), distinct)
  const onTarget = served.filter(d => d.day.withinTolerance).length
  check('...and the days still land on target (the fixture is a plausible whole)', onTarget >= 26, onTarget)

  console.log('\n5. Nothing searches a deep pool whole')
  const counts = fittingCounts(deep, SLOTS, TARGETS, d0)
  check('the "how many fit" count behind the more-meals offer is taken on the menu for a deep pool, so no meal counts more than MENU_SIZE', SLOTS.every(s => (counts[s] ?? 0) > 0 && (counts[s] ?? 0) <= MENU_SIZE), counts)
  const ten = deepPools(10)
  const tenCounts = fittingCounts(ten, SLOTS, TARGETS, d0)
  check('...but a pool of ten or fewer is counted whole (a fitting dish this week\'s menu leaves out still counts)', SLOTS.every(s => (tenCounts[s] ?? 0) > MENU_SIZE), tenCounts)
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const app = strip(readFileSync('src/App.tsx', 'utf8'))
  check('App builds its rotation from this week\'s menu, never the whole pool', /buildRotation\(menuFor\(poolsServedOn\(mealPools, mealRotationDate\), mealRotationDate, compiledSoftFoodPreferences\)/.test(app) && !/buildRotation\(mealPools\b/.test(app))
  const rot = strip(readFileSync('src/lib/meal-rotation.ts', 'utf8'))
  check('serveDates draws each date\'s pool through the menu, after the pool as it stood that day', /canonical\(menuFor\(poolsServedOn\(pools, date\), date, softLikedFoods\)\)/.test(rot))
  const gen = strip(readFileSync('src/lib/meal-generation.ts', 'utf8'))
  check('the fit test while adding dishes judges the other meals on a menu, never the whole pool', /usable\[s\]!?\.length > MENU_SIZE\) usable\[s\] = menuForSlot\(usable\[s\]!, 0\)/.test(gen))

  console.log('\n6. The offer of the library, on a plan that has not had it')
  const seven = deepPools(7)
  const offered = topUpPlan(seven, SLOTS, TARGETS, undefined, d0, true)
  check('a plan of seven a meal is offered the library: each meal asked for up to DEEP_POOL_SIZE less what it has', offered.deep && SLOTS.every(s => offered.needs[s] === DEEP_POOL_SIZE - 7), offered.needs)
  const offerText = topUpOffer(offered)?.text ?? ''
  check('...in the library\'s own words, keeping the promise about today and the shopping list', /every dish from our own meal library that suits you/.test(offerText) && /Today, and any day on your shopping list, stay exactly as they are/.test(offerText), offerText)
  const old = topUpPlan(seven, SLOTS, TARGETS, undefined, d0)
  check('...and only when App asks for it: without the flag the plan is the old count-and-fit one (seven is not short)', !old.deep && Object.keys(old.needs).length === 0, old)
  const deepAlready = topUpPlan(deep, SLOTS, TARGETS, undefined, d0, true)
  check('a plan that already has a deep pool is offered nothing', !deepAlready.deep && Object.keys(deepAlready.needs).length === 0 && topUpOffer(deepAlready) === null, deepAlready.needs)

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.log(`${failures} meal-menu check(s) FAILED.`); process.exit(1) }
  console.log('All meal-menu checks passed.')
}

main()
