/**
 * test:meal-knock-on — what ELSE changes when a food is added to a meal (H9).
 *
 * 9 Oct 2026, the test log: 100 g of banana was added to a lunch and the
 * dinner and the snack were replaced. The card said "The rest of the day
 * re-fits around it" — an assertion written in advance. The day swap's card
 * has been "read off a trial" since 29 Sep; the older meal cards never were.
 *
 * This holds:
 *   0. the fixture is under pressure: adding the banana really does change
 *      another meal (found by an independent diff, not by the code under test);
 *   1. the builders no longer assert — the add-a-food card and the custom-meal
 *      card say only what they computed;
 *   2. the trial NAMES every other meal that changes, different dish or same
 *      dish at a different size, and nothing that does not;
 *   3. the trial is the real thing: the week it served is the week the app
 *      serves once the option is stored and picked;
 *   4. nothing else changes -> it says so; no trial -> it says it could not check;
 *   5. the shopping list: said when a changed day is on it, said when unreadable;
 *   6. a day the edit takes off target is warned about, with the trial's figure;
 *   7. the wiring: one function from the hook to the sheet and to the coach.
 *
 * It does NOT hold which outcome the day's search prefers (re-portion, or
 * different dishes): that is an open owner decision and is untouched.
 *
 * One exit, at the bottom. Every check runs every time.
 */
process.env.TZ = 'Europe/London'

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => { try { return strip(readFileSync(join(ROOT, p), 'utf8')) } catch { return '' } }

const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => storeMap.get(k) ?? null, setItem: (k: string, v: string) => { storeMap.set(k, String(v)) }, removeItem: (k: string) => { storeMap.delete(k) }, clear: () => { storeMap.clear() } },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 600)}` : ''}`) }
}

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type Opt = import('../src/lib/meal-generation').PoolOption
type Line = { severity: 'info' | 'warn'; text: string }
type KnockOn = { changes: { date: string; slot: Slot; kind: 'dish' | 'size'; from: string | null; to: string; fromKcal: number | null; toKcal: number }[]; lines: Line[]; after?: { date: string; day: { chosen: Partial<Record<Slot, Opt>>; withinTolerance: boolean; totals: { calories: number } } }[] }

async function main() {
  const { datesFrom, buildRotation, serveMealWeek, pinsFromPicks } = await import('../src/lib/meal-rotation')
  const { computeMealMacros } = await import('../src/lib/food-db')
  const { buildMealFoodAddProposal } = await import('../src/lib/meal-food-add')
  const mfa = await import('../src/lib/meal-food-add') as unknown as { withKnockOn?: (diff: { implications?: Line[] }, k: KnockOn | null) => { implications?: Line[] } }
  const { buildCustomMealProposal } = await import('../src/lib/custom-meal')
  const { isNoticeableResize } = await import('../src/lib/meal-day-move')
  const { dayLabel } = await import('../src/lib/day-labels')
  const voice = await import('../src/lib/coach-voice') as unknown as { DAY_MOVE: typeof import('../src/lib/coach-voice').DAY_MOVE; KNOCK_ON?: { none: string; unknown: string; listUnknown: string } }
  const { DAY_MOVE } = voice
  const KNOCK_ON = voice.KNOCK_ON ?? { none: '(missing)', unknown: '(missing)', listUnknown: '(missing)' }
  const { USER_REQUESTED_TAG } = await import('../src/lib/meal-store')
  const lib = await import('../src/lib/meal-knock-on').catch(() => null) as { knockOnOfPin?: (i: { serving: unknown; date: string; slot: Slot; option: Opt; listDates: string[] | null }) => KnockOn } | null

  const { dayVerdict } = await import('../src/lib/meal-generation')
  console.log('meal knock-on — what else changes when a food is added to a meal')

  // Dishes whose stored macros ARE their ingredients', as every real option is.
  const dish = (slot: string, name: string, chicken: number, rice: number, oil: number): Opt => {
    const ingredients = [
      { name: 'chicken breast', quantity: chicken, unit: 'g' },
      { name: 'white rice', quantity: rice, unit: 'g' },
      { name: 'olive oil', quantity: oil, unit: 'g' },
    ]
    const c = computeMealMacros(ingredients)
    return { slot, name, ingredients, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } } as Opt
  }
  const sum = (a: { calories: number; protein: number; carbs: number; fat: number }[]) =>
    a.reduce((s, m) => ({ calories: s.calories + m.calories, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  // MEASURED, NOT GUESSED: these pools were found by running the trial over a
  // grid of foods, amounts, meals and days and reading which ones move a
  // DISH. A first fixture of three similar dinners only ever resized one.
  const pools = {
    breakfast: [dish('breakfast', 'Oats bowl', 60, 150, 8), dish('breakfast', 'Rice porridge', 55, 160, 7), dish('breakfast', 'Egg rice', 65, 140, 9), dish('breakfast', 'Small bowl', 55, 110, 6)],
    lunch: [dish('lunch', 'Chicken salad', 150, 200, 12), dish('lunch', 'Rice and greens', 140, 220, 11), dish('lunch', 'Grain bowl', 160, 190, 13)],
    dinner: [dish('dinner', 'Tray bake', 170, 220, 14), dish('dinner', 'Rice pot', 160, 240, 12), dish('dinner', 'Baked chicken', 180, 210, 15), dish('dinner', 'Light supper', 165, 150, 9), dish('dinner', 'Chicken broth bowl', 170, 130, 8)],
  } as unknown as Record<'breakfast' | 'lunch' | 'dinner', Opt[]>
  const targets = sum([pools.breakfast[0].macros, pools.lunch[0].macros, pools.dinner[0].macros])
  const today = '2026-09-27'   // a Sunday
  const dates = datesFrom(today, 7)
  const shape = { mealsPerDay: 3, includeSnacks: false, batchCooking: false }
  type Serving = Parameters<typeof serveMealWeek>[0]
  const servingFor = (over: Partial<Serving> = {}, sh = shape): Serving =>
    ({ today, dates, todaysPins: {}, pinsByDate: {}, pools, targets, softLikedFoods: [], shape: sh, rotation: buildRotation(pools, targets, [], sh), ...over }) as Serving

  /** The add-a-food card for `lines` on a date's meal, built by the app's own builder from the meal the week serves there. */
  const addFood = (serving: Serving, date: string, slot: Slot, lines: string[]) => {
    const served = serveMealWeek(serving).find(d => d.date === date)?.day.chosen[slot]
    return buildMealFoodAddProposal({
      rawArgs: { meal_slot: slot, food_lines: lines, date },
      currentMeal: served ? { name: served.name, ingredients: served.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`), macros: served.macros } : null,
      profileId: 'p1', todayDate: today, targets, mealsPerDay: 3, includeSnacks: false, dietaryPreferences: [], dislikedFoods: [],
    })
  }
  const trial = (serving: Serving, date: string, slot: Slot, option: Opt, listDates: string[] | null = []): KnockOn => {
    try { return lib?.knockOnOfPin ? lib.knockOnOfPin({ serving, date, slot, option, listDates }) : { changes: [], lines: [] } }
    catch (err) { return { changes: [], lines: [{ severity: 'warn', text: `THREW: ${String(err).slice(0, 160)}` }] } }
  }
  /**
   * INDEPENDENT OF THE CODE UNDER TEST: do what the app does on the tap — store
   * the option beside the others tagged as hers, pick it by NAME for that date
   * — serve the week again, and diff it cell by cell against the week before.
   */
  const reallyApply = (serving: Serving, date: string, slot: Slot, option: Opt) => {
    const stored = { ...option, tags: [...(option.tags ?? []), USER_REQUESTED_TAG] } as Opt
    const after = { ...pools, [slot]: [...pools[slot as 'lunch'], stored] } as typeof pools
    const pin = pinsFromPicks({ [slot]: option.name }, after)
    const next: Serving = {
      ...serving, pools: after, rotation: buildRotation(after, targets, [], serving.shape),
      todaysPins: date === today ? { ...serving.todaysPins, ...pin } : serving.todaysPins,
      pinsByDate: date === today ? serving.pinsByDate : { ...serving.pinsByDate, [date]: { ...(serving.pinsByDate[date] ?? {}), ...pin } },
    }
    const was = serveMealWeek(serving)
    const now = serveMealWeek(next)
    const diff: string[] = []
    now.forEach((d, i) => (['breakfast', 'lunch', 'dinner', 'snack'] as Slot[]).forEach(s => {
      if (d.date === date && s === slot) return
      const a = was[i].day.chosen[s], b = d.day.chosen[s]
      if (!b) return
      if (a?.name !== b.name) diff.push(`${d.date}|${s}|dish`)
      else if (isNoticeableResize(a.macros.calories, b.macros.calories)) diff.push(`${d.date}|${s}|size`)
    }))
    return { was, now, diff: diff.sort() }
  }
  const names = (w: { date: string; day: { chosen: Partial<Record<Slot, Opt>> } }[]) => JSON.stringify(w.map(d => (['breakfast', 'lunch', 'dinner', 'snack'] as Slot[]).map(s => `${d.day.chosen[s]?.name ?? '-'}@${Math.round(d.day.chosen[s]?.macros.calories ?? 0)}`)))
  const keys = (k: KnockOn) => k.changes.map(c => `${c.date}|${c.slot}|${c.kind}`).sort()
  const text = (k: KnockOn | { implications?: Line[] }) => ('lines' in k ? k.lines : k.implications ?? []).map(l => l.text)

  // ---------------------------------------------------------------------------
  console.log('\n[0] The fixture is under pressure: the banana really does change another meal')
  const serving = servingFor()
  const banana = addFood(serving, today, 'lunch', ['100g banana'])
  const bananaOption = banana.ok ? banana.payload.option : null
  check('adding 100 g of banana to today\'s lunch is accepted by the app\'s own builder', banana.ok, banana)
  const real = bananaOption ? reallyApply(serving, today, 'lunch', bananaOption) : { was: [], now: [], diff: [] as string[] }
  check('...and, applied for real, at least one OTHER meal changes', real.diff.length >= 1, real.diff)
  check('...including a different DISH somewhere (the test log\'s case), not only a resize', real.diff.some(d => d.endsWith('|dish')), real.diff)
  check('the dinner has more than one option the week actually serves (so a different dinner is a real choice)', new Set(real.was.map(d => d.day.chosen.dinner?.name)).size >= 2, real.was.map(d => d.day.chosen.dinner?.name))

  // ---------------------------------------------------------------------------
  console.log('\n[1] The builders say what they computed, and assert nothing about the rest of the plan')
  {
    const said = banana.ok ? text(banana.diff) : []
    check('the add-a-food card no longer says the rest of the day "re-fits around it"', banana.ok && !said.some(t => /re-?fits? around/i.test(t)), said)
    check('...it still says the food joins at her amount', said.some(t => /100g banana joins it at the amount you said/.test(t)), said)
    check('...and how far the meal now is from its usual share, as a figure it computed', said.some(t => /^That is \d+ kcal (over|under) the usual lunch share\.$/.test(t)), said)
    check('...and names the day in words ("today"), never as a stored date', said.some(t => /^Just for today\. On other days your lunch stays /.test(t)) && !said.some(t => /\d{4}-\d{2}-\d{2}/.test(t)), said)
    const tuesday = addFood(serving, dates[2], 'lunch', ['100g banana'])
    check('...and another day by its weekday', tuesday.ok && text(tuesday.diff).some(t => /^Just for Tuesday\. On other days your lunch stays /.test(t)) && !text(tuesday.diff).some(t => /\d{4}-\d{2}-\d{2}/.test(t)), tuesday.ok ? text(tuesday.diff) : tuesday)
    const custom = buildCustomMealProposal({ rawArgs: { meal_slot: 'lunch', food_lines: ['200g chicken breast', '250g white rice', '1 banana'], name: 'My lunch' }, profileId: 'p1', todayDate: today, targets, mealsPerDay: 3, includeSnacks: false, dietaryPreferences: [], dislikedFoods: [] })
    const customSaid = custom.ok ? text(custom.diff) : []
    check('the custom-meal card no longer says it either', custom.ok && !customSaid.some(t => /re-?fits? around/i.test(t)), custom.ok ? customSaid : custom)
    check('...and names its day in words', customSaid.some(t => /becomes your lunch for today\.$/.test(t)) && !customSaid.some(t => /\d{4}-\d{2}-\d{2}/.test(t)), customSaid)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2] The trial names every other meal that changes — and nothing that does not')
  const k = bananaOption ? trial(serving, today, 'lunch', bananaOption) : { changes: [], lines: [] }
  {
    check('the trial exists', typeof lib?.knockOnOfPin === 'function')
    check('it finds exactly the meals the independent diff found', JSON.stringify(keys(k)) === JSON.stringify(real.diff) && real.diff.length > 0, { trial: keys(k), independent: real.diff })
    const said = text(k)
    // ONE check over every listed change (never one check per change: the
    // number of checks must not depend on what the code under test returns).
    const expectedLines = k.changes.slice(0, 4).map(c => {
      const day = dayLabel(c.date, today)
      return c.kind === 'size' ? DAY_MOVE.alsoResized(day, c.slot, c.fromKcal ?? 0, c.toKcal) : DAY_MOVE.alsoRefit(day, c.slot, c.to)
    })
    check('each is said in the day swap\'s own words: the day, the meal, and the dish it becomes', expectedLines.length >= 1 && expectedLines.every(l => said.includes(l)), { expectedLines, said })
    const dishChange = k.changes.find(c => c.kind === 'dish')
    check('a different dish is named by the dish that will be served', !!dishChange && said.some(t => t.includes(dishChange.to) && /becomes/.test(t)), { dishChange, said })
    check('...and it really is a different dish from the one there now', !!dishChange && dishChange.from !== dishChange.to && dishChange.from !== null, dishChange)
    // REVERSED 2 Nov 2026, Ashley's "Today only". This asserted that an edit to today's lunch moved a meal on a day
    // nobody named: the edited copy joined the pool and later days' searches served it. Now it is made for today, so
    // with no leftovers chain (this fixture) every other day is exactly as it was. The chain case is [3b].
    check('no meal on a day nobody named changes (the edit is for today only)', k.changes.length > 0 && k.changes.every(c => c.date === today) && real.diff.every(d => d.startsWith(`${today}|`)), { changes: k.changes, real: real.diff })
    // BOTH KINDS ON ONE CARD: chicken added to Tuesday's breakfast moves one of
    // Tuesday's meals to a different dish and resizes another. (A banana did this
    // under the old 25% bands; under the 10% bands, runs 7-10 M59, it only
    // resized, so the food was re-measured: the input changed, not the check. Written raw since 18 Oct, H36, as
    // every line now reads; re-measured again then.)
    const mixedAdd = addFood(serving, dates[2], 'breakfast', ['100g raw chicken breast'])
    const mixed = mixedAdd.ok ? trial(serving, dates[2], 'breakfast', mixedAdd.payload.option) : { changes: [], lines: [] } as KnockOn
    const mixedReal = mixedAdd.ok ? reallyApply(serving, dates[2], 'breakfast', mixedAdd.payload.option) : { diff: [] as string[] }
    check('a second case holds both kinds at once: a different dish AND the same dish at a different size', mixed.changes.some(c => c.kind === 'dish') && mixed.changes.some(c => c.kind === 'size'), mixed.changes)
    check('...and it too matches the independent diff exactly', JSON.stringify(keys(mixed)) === JSON.stringify(mixedReal.diff), { trial: keys(mixed), independent: mixedReal.diff })
    const sized = mixed.changes.find(c => c.kind === 'size')
    check('the resized one says the same dish goes from one size to the other, in kcal the trial served', !!sized && sized.from === sized.to && sized.fromKcal !== sized.toKcal && text(mixed).includes(DAY_MOVE.alsoResized(dayLabel(sized.date, today), sized.slot, sized.fromKcal ?? 0, sized.toKcal)), { sized, said: text(mixed) })
    check('...and in that card the different dish is listed first', mixed.changes[0]?.kind === 'dish' && mixed.changes[mixed.changes.length - 1]?.kind === 'size' && text(mixed).findIndex(t => /becomes/.test(t)) < text(mixed).findIndex(t => /goes from/.test(t)), text(mixed))
    check('the meal being edited is not listed as a knock-on of itself', !k.changes.some(c => c.date === today && c.slot === 'lunch') && !mixed.changes.some(c => c.date === dates[2] && c.slot === 'breakfast'))
    check('it does not say "no other meal changes" when one does', !said.includes(KNOCK_ON.none), said)
    check('no line can read "undefined" or "NaN"', !said.some(t => /undefined|NaN/.test(t)), said)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2b] An edited meal is for its own day only (Ashley, 2 Nov 2026, "Today only")')
  {
    const { isPinOnly } = await import('../src/lib/meal-new-from')
    const { topUpPlan } = await import('../src/lib/meal-top-up')
    check('the edit is marked as made for one day', !!bananaOption && isPinOnly(bananaOption), bananaOption?.tags)
    // Every date of the week, before and after, with the copy stored and picked for TODAY only.
    const copy = bananaOption?.name ?? '(none)'
    const servedCopy = real.now.filter(d => (['breakfast', 'lunch', 'dinner', 'snack'] as Slot[]).some(s => d.day.chosen[s]?.name === copy)).map(d => d.date)
    check('the edited meal is served on the day it was made for, and on no other', JSON.stringify(servedCopy) === JSON.stringify([today]), servedCopy)
    const later = (w: typeof real.now) => names(w.filter(d => d.date !== today) as never)
    check('...and every later day serves exactly what it served before', later(real.now) === later(real.was), { was: later(real.was), now: later(real.now) })
    // Picked on Tuesday by name, the same copy is served there: a pick still finds it.
    const onTue = bananaOption ? reallyApply(serving, dates[2], 'lunch', bananaOption) : null
    check('a pick that names it on another day still serves it there', onTue?.now.find(d => d.date === dates[2])?.day.chosen.lunch?.name === copy, onTue?.now.find(d => d.date === dates[2])?.day.chosen.lunch?.name)
    // The "more options" offer counts dishes she can be served: a copy made for one day is not one.
    const stored = bananaOption ? { ...bananaOption, tags: [...(bananaOption.tags ?? []), USER_REQUESTED_TAG] } as Opt : null
    const withCopy = stored ? { ...pools, lunch: [...pools.lunch, stored] } : pools
    const slots = ['breakfast', 'lunch', 'dinner'] as Slot[]
    const a = topUpPlan(pools as never, slots as never, targets as never), b = topUpPlan(withCopy as never, slots as never, targets as never)
    check('the options count does not count it', !!stored && JSON.stringify(a.have) === JSON.stringify(b.have) && JSON.stringify(a.needs) === JSON.stringify(b.needs), { without: a, with: b })
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2c] An edit to a meal ALREADY EATEN keeps the day\'s other dishes (Ashley, 2 Nov 2026, "Same dishes")')
  {
    const { isAfterEaten, displayTags } = await import('../src/lib/meal-new-from')
    const served = serveMealWeek(serving).find(d => d.date === today)?.day.chosen.lunch
    const eatenAdd = buildMealFoodAddProposal({
      rawArgs: { meal_slot: 'lunch', food_lines: ['100g banana'], date: today },
      currentMeal: served ? { name: served.name, ingredients: served.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`), macros: served.macros } : null,
      profileId: 'p1', todayDate: today, targets, mealsPerDay: 3, includeSnacks: false, dietaryPreferences: [], dislikedFoods: [],
      afterEating: true,
    } as never)
    const eatenOption = eatenAdd.ok ? eatenAdd.payload.option : null
    check('the edit is marked as made after eating', !!eatenOption && isAfterEaten(eatenOption), eatenOption?.tags)
    check('...and the mark is never shown as a label', !!eatenOption && displayTags(eatenOption.tags ?? []).length === displayTags((eatenOption.tags ?? []).filter(t => !isAfterEaten({ tags: [t] }))).length && !displayTags(eatenOption.tags ?? []).some(t => /eaten/.test(t)), eatenOption ? displayTags(eatenOption.tags ?? []) : null)
    // THE CONTRAST, same fixture, same food: not eaten, today's other meals re-plan to a different dish ([0]).
    const replanned = real.diff.filter(d => d.startsWith(`${today}|`) && d.endsWith('|dish'))
    const held = eatenOption ? reallyApply(serving, today, 'lunch', eatenOption) : null
    const heldDishes = (held?.diff ?? []).filter(d => d.startsWith(`${today}|`) && d.endsWith('|dish'))
    check('not eaten: the same edit re-plans another of today\'s meals to a different dish (the fixture binds)', replanned.length >= 1, real.diff)
    check('eaten: every other meal of today keeps its dish', !!held && heldDishes.length === 0, held?.diff)
    check('...and the trial the card reads agrees with what is served', !!eatenOption && JSON.stringify(keys(trial(serving, today, 'lunch', eatenOption))) === JSON.stringify(held?.diff ?? null), { trial: eatenOption ? keys(trial(serving, today, 'lunch', eatenOption)) : null, served: held?.diff })
    // Another day's meal cannot have been eaten yet: the flag is ignored there.
    const tueServed = serveMealWeek(serving).find(d => d.date === dates[2])?.day.chosen.lunch
    const tue = buildMealFoodAddProposal({
      rawArgs: { meal_slot: 'lunch', food_lines: ['100g banana'], date: dates[2] },
      currentMeal: tueServed ? { name: tueServed.name, ingredients: tueServed.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`), macros: tueServed.macros } : null,
      profileId: 'p1', todayDate: today, targets, mealsPerDay: 3, includeSnacks: false, dietaryPreferences: [], dislikedFoods: [],
      afterEating: true,
    } as never)
    check('a meal on another day is never marked as eaten', tue.ok && !isAfterEaten(tue.payload.option), tue.ok ? tue.payload.option.tags : tue)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2d] A meal moved to another slot: both legs pinned at once, and the day\'s total read off the trial')
  {
    const { buildMealMoveProposal } = await import('../src/lib/meal-move')
    const week = serveMealWeek(serving)
    const day0 = week.find(d => d.date === today)!.day.chosen
    const asCurrent = (o?: Opt) => o ? { name: o.name, ingredients: o.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`), macros: o.macros } : undefined
    // INDEPENDENT: store the copies and pick them by name, as executeMealMove does, and serve the week.
    const applyMove = (legs: { slot: Slot; option: Opt }[]) => {
      const afterPools = { ...pools } as Record<string, Opt[]>
      for (const l of legs) afterPools[l.slot] = [...(afterPools[l.slot] ?? []), { ...l.option, tags: [...(l.option.tags ?? []), USER_REQUESTED_TAG] } as Opt]
      const pins = pinsFromPicks(Object.fromEntries(legs.map(l => [l.slot, l.option.name])), afterPools as never)
      return serveMealWeek({ ...serving, pools: afterPools as never, rotation: buildRotation(afterPools as never, targets, [], serving.shape), todaysPins: { ...serving.todaysPins, ...pins } } as Serving)
    }
    // A MOVE WHOSE DAY TOTAL REALLY MOVES, found by the app's own numbers (a total inside 25 kcal reads the same either
    // way, so it cannot tell a trial from a guess).
    const pairs: [Slot, Slot][] = [['breakfast', 'dinner'], ['breakfast', 'lunch'], ['lunch', 'dinner']]
    let move: ReturnType<typeof buildMealMoveProposal> | null = null
    let legs: { slot: Slot; option: Opt }[] = []
    let real2: ReturnType<typeof serveMealWeek> = []
    for (const [from, to] of pairs) {
      const m = buildMealMoveProposal({
        rawArgs: { from_slot: from, to_slot: to },
        mealsBySlot: { breakfast: asCurrent(day0.breakfast), lunch: asCurrent(day0.lunch), dinner: asCurrent(day0.dinner) } as never,
        profileId: 'p1', todayDate: today, targets, mealsPerDay: 3, includeSnacks: false, dietaryPreferences: [], dislikedFoods: [],
      } as never)
      if (!m.ok || m.payload.legs.length !== 2) continue
      const l = m.payload.legs.map(x => ({ slot: x.slot as Slot, option: x.payload.option as Opt }))
      const w = applyMove(l)
      if (Math.abs(w.find(d => d.date === today)!.day.totals.calories - week.find(d => d.date === today)!.day.totals.calories) >= 25) { move = m; legs = l; real2 = w; break }
    }
    check('a swap of two meals builds, with two legs, and moves the day by 25 kcal or more (the case binds)', !!move && legs.length === 2 && real2.length > 0, move && move.ok ? move.payload.legs.map(l => l.slot) : move)
    const movedSlots = new Set(legs.map(l => l.slot))
    const t = legs.length === 2 && lib?.knockOnOfPin
      ? lib.knockOnOfPin({ serving, date: today, slot: legs[0].slot, option: legs[0].option, listDates: [], alsoPinned: legs.slice(1), sayDayTotal: true } as never)
      : { changes: [], lines: [] }
    const wasTotal = Math.round(week.find(d => d.date === today)!.day.totals.calories)
    const nowTotal = Math.round(real2.find(d => d.date === today)?.day.totals.calories ?? -1)
    const totalLine = (KNOCK_ON as unknown as { dayTotal?: (d: string, a: number, b: number) => string }).dayTotal?.('today', wasTotal, nowTotal) ?? '(missing)'
    check('the card says the day\'s total as the week will serve it', text(t).includes(totalLine), { totalLine, said: text(t) })
    check('neither moved meal is listed as a knock-on of itself', legs.length === 2 && !t.changes.some(c => c.date === today && movedSlots.has(c.slot)), t.changes)
    check('...and every other meal that moves is the independent diff\'s', JSON.stringify(t.changes.map(c => `${c.date}|${c.slot}`).sort()) === JSON.stringify(real2.flatMap((d, i) => (['breakfast', 'lunch', 'dinner', 'snack'] as Slot[]).filter(s => !(d.date === today && movedSlots.has(s))).filter(s => { const a = week[i].day.chosen[s], b = d.day.chosen[s]; return !!b && (a?.name !== b.name || isNoticeableResize(a.macros.calories, b.macros.calories)) }).map(s => `${d.date}|${s}`)).sort()), { trial: t.changes })
    // 2 Nov 2026: the move's copies are made for that day (measured before: nine meals across the week changed).
    check('a move changes no meal on any other day', legs.length === 2 && t.changes.every(c => c.date === today) && real2.every((d, i) => d.date === today || names([d] as never) === names([week[i]] as never)), t.changes.filter(c => c.date !== today))
    check('a one-meal card never states a day total (it was not asked to)', !text(k).some(l => /lands within a few calories|goes (up|down) about \d+ kcal, to/.test(l)), text(k))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[3] The trial is the real thing')
  {
    check('the week the trial served is exactly the week the app serves once the option is stored and picked', !!k.after && names(k.after as never) === names(real.now) && real.now.length === 7, k.after ? undefined : 'no week returned')
    check('...and it serves the new option in the meal she edited', k.after?.find(d => d.date === today)?.day.chosen.lunch?.name === bananaOption?.name, k.after?.find(d => d.date === today)?.day.chosen.lunch?.name)
    const before = JSON.stringify(serving)
    if (bananaOption) trial(serving, today, 'lunch', bananaOption)
    check('running the trial changes nothing it was handed', JSON.stringify(serving) === before)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[3b] With leftovers on (each lunch is last night\'s dinner), where one edit moves a chain of meals')
  {
    const shapeOn = { mealsPerDay: 3, includeSnacks: false, batchCooking: true }
    const cooked = servingFor({}, shapeOn)
    const add = addFood(cooked, today, 'dinner', ['100g banana'])
    const kk = add.ok ? trial(cooked, today, 'dinner', add.payload.option) : { changes: [], lines: [] } as KnockOn
    const rr = add.ok ? reallyApply(cooked, today, 'dinner', add.payload.option) : { diff: [] as string[], now: [] as never[], was: [] as never[] }
    check('the fixture has a leftover lunch somewhere in its week', rr.was.some((d: { day: { chosen: Partial<Record<Slot, Opt>> } }) => d.day.chosen.lunch?.leftoverFrom === 'dinner'), rr.was.length)
    check('a banana on tonight\'s dinner changes tomorrow\'s lunch as well (the leftovers follow the dinner)', rr.diff.some(x => x.startsWith(`${dates[1]}|lunch|`)), rr.diff)
    check('...and the trial finds exactly the independent diff here too', add.ok && JSON.stringify(keys(kk)) === JSON.stringify(rr.diff) && rr.diff.length >= 1, { trial: keys(kk), independent: rr.diff })
    const left = kk.changes.find(c => c.date === dates[1] && c.slot === 'lunch')
    // Which sentence is true is read off the two weeks the gate served itself.
    const wasLeft = (rr.was[1] as { day: { chosen: Partial<Record<Slot, Opt>> } } | undefined)?.day.chosen.lunch?.leftoverFrom === 'dinner'
    const nowLeft = (rr.now[1] as { day: { chosen: Partial<Record<Slot, Opt>> } } | undefined)?.day.chosen.lunch?.leftoverFrom === 'dinner'
    const day1 = dayLabel(dates[1], today)
    const truth = !left ? '' : nowLeft ? DAY_MOVE.alsoLeftover(day1, 'lunch', left.to) : wasLeft ? DAY_MOVE.alsoFresh(day1, 'lunch', left.to) : DAY_MOVE.alsoRefit(day1, 'lunch', left.to)
    check('...and says WHY in the words that are true of it (leftovers of the new dinner, or cooked fresh instead of leftovers)', !!left && (wasLeft || nowLeft) && text(kk).includes(truth), { wasLeft, nowLeft, truth, said: text(kk) })
    check('more than four changes are folded into one line that counts the rest', kk.changes.length <= 4 ? !text(kk).some(t => /more meals? changes? too/.test(t)) : text(kk).includes(DAY_MOVE.andMore(kk.changes.length - 4)), { n: kk.changes.length, said: text(kk) })
  }

  // ---------------------------------------------------------------------------
  console.log('\n[4] Nothing else changes -> it says so; no trial -> it says it could not check')
  {
    // Every meal of every day already chosen by her: nothing is free to move.
    const week = serveMealWeek(serving)
    const allPinned = servingFor({
      todaysPins: week[0].day.chosen as never,
      pinsByDate: Object.fromEntries(week.slice(1).map(d => [d.date, d.day.chosen])) as never,
    })
    const quiet = bananaOption ? trial(allPinned, today, 'lunch', bananaOption) : { changes: [{}], lines: [] } as never as KnockOn
    check('with every other meal already picked by her, nothing else changes', quiet.changes.length === 0, quiet.changes)
    check('...and the card says exactly that', text(quiet).includes(KNOCK_ON.none) && KNOCK_ON.none === 'No other meal on your plan changes.', text(quiet))
    const noTargets = bananaOption ? trial({ ...serving, targets: null } as Serving, today, 'lunch', bananaOption) : { changes: [], lines: [] }
    check('no targets, so no week to try it on: it says it could not check, and claims nothing', text(noTargets).length === 1 && text(noTargets)[0] === KNOCK_ON.unknown && noTargets.changes.length === 0, text(noTargets))
    const offStrip = bananaOption ? trial(serving, '2026-12-25', 'lunch', bananaOption) : { changes: [], lines: [] }
    check('a day the week does not serve: the same', text(offStrip).length === 1 && text(offStrip)[0] === KNOCK_ON.unknown, text(offStrip))
    const merge = mfa.withKnockOn
    const merged = merge && banana.ok ? merge(banana.diff, null) : null
    check('a card with no trial behind it says it could not check — it never falls back to an assertion', !!merged && text(merged).includes(KNOCK_ON.unknown) && !text(merged).some(t => /re-?fits? around/i.test(t)), merged ? text(merged) : 'withKnockOn missing')
    const full = merge && banana.ok ? merge(banana.diff, k) : null
    check('a card with a trial carries the builder\'s lines and then the trial\'s, in order', !!full && banana.ok && JSON.stringify(text(full)) === JSON.stringify([...text(banana.diff), ...text(k)]), full ? text(full) : 'withKnockOn missing')
    check('...and the builder\'s own card is not altered by the merge', banana.ok && !text(banana.diff).some(t => text(k).includes(t)))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[5] The shopping list')
  if (bananaOption) {
    const changedDays = [...new Set(k.changes.map(c => c.date))]
    const otherDay = changedDays.find(d => d !== today)
    check('not on the list: nothing is said about it', !text(trial(serving, today, 'lunch', bananaOption, [])).some(t => /shopping list/.test(t)))
    check('the day of the edit is on the list: rebuild it, and the day is named', text(trial(serving, today, 'lunch', bananaOption, [today])).includes(DAY_MOVE.listStale(['today'])), text(trial(serving, today, 'lunch', bananaOption, [today])))
    check('the list could not be read: said, never passed off as "not on it"', text(trial(serving, today, 'lunch', bananaOption, null)).includes(KNOCK_ON.listUnknown), text(trial(serving, today, 'lunch', bananaOption, null)))
    // A day that only changed as a knock-on counts too.
    const tue = addFood(serving, dates[2], 'lunch', ['100g banana'])
    const tk = tue.ok ? trial(serving, dates[2], 'lunch', tue.payload.option, dates.filter(d => d !== dates[2])) : { changes: [], lines: [] }
    const tkOther = [...new Set(tk.changes.map(c => c.date))].filter(d => d !== dates[2])
    check('a day whose meal changed only as a knock-on counts for the list as well', tkOther.length === 0 ? !text(tk).some(t => /shopping list/.test(t)) : text(tk).includes(DAY_MOVE.listStale(tkOther.sort().map(d => dayLabel(d, today)))), { tkOther, said: text(tk) })
    check('(the today case above had an other-day change to name, or none at all)', otherDay === undefined || text(trial(serving, today, 'lunch', bananaOption, [otherDay])).includes(DAY_MOVE.listStale([dayLabel(otherDay, today)])), { otherDay })
  } else { for (let i = 0; i < 5; i++) check('shopping-list check (no option to test with)', false) }

  // ---------------------------------------------------------------------------
  console.log('\n[6] A day the edit takes off target is warned about')
  {
    // Half a kilo of banana on a lunch cannot be absorbed by breakfast and dinner.
    const big = addFood(serving, today, 'lunch', ['900g banana'])
    const bk = big.ok ? trial(serving, today, 'lunch', big.payload.option) : { changes: [], lines: [] }
    const day = bk.after?.find(d => d.date === today)
    check('900 g of banana is accepted, and the day cannot absorb it', big.ok && day?.day.withinTolerance === false, big.ok ? { within: day?.day.withinTolerance } : big)
    const warn = bk.lines.filter(l => l.severity === 'warn').map(l => l.text)
    check('the card warns, with the day\'s total from the trial and how far over', !!day && warn.includes(DAY_MOVE.offTarget('today', Math.round(day.day.totals.calories), Math.round(day.day.totals.calories - targets.calories))), warn)
    // A DAY OFF ON A MACRO, NOT ITS CALORIES (runs 7-10, M59): 15 g of olive oil
    // on today's lunch keeps the day's calories inside 5% and puts its fat over
    // the 10% band (measured). The warning names the fat, never a calorie gap.
    const oil = addFood(serving, today, 'lunch', ['15g olive oil'])
    const ok2 = oil.ok ? trial(serving, today, 'lunch', oil.payload.option) : { changes: [], lines: [] } as KnockOn
    const oilDay = ok2.after?.find(d => d.date === today)
    const oilV = oilDay ? dayVerdict(oilDay.day.totals, targets) : null
    check('the fixture is under pressure: 15 g of oil puts today off on fat alone, calories inside', !!oilV && !oilV.onTarget && oilV.off[0]?.macro === 'fat' && !oilV.off.some(x => x.macro === 'calories'), oilV)
    const oilWarn = ok2.lines.filter(l => l.severity === 'warn').map(l => l.text)
    check('...and the card says fat, by how much, not "about N under"', !!oilV && oilWarn.length === 1 && oilWarn[0].includes(`but fat ${oilV.off[0].delta} g over your target.`) && !/about [\d,]+ (over|under)/.test(oilWarn[0]), oilWarn)
    check('the ordinary banana, which the day absorbs, carries no warning', !k.lines.some(l => l.severity === 'warn') && k.after?.find(d => d.date === today)?.day.withinTolerance === true, k.lines.filter(l => l.severity === 'warn'))
    // "SO THE DAY STILL FITS" ONLY WHEN IT DOES (8 Nov 2026, QA round 3): it was printed beside a day 21 g of protein
    // over. The day the banana takes off target changes its other meals, and none of those lines may say it fits.
    const bigChanged = bk.lines.filter(l => l.severity === 'info' && /^Today's (breakfast|lunch|dinner|snack) (goes from|becomes)/.test(l.text)).map(l => l.text)
    check('the off-target day\'s other meals change (the fixture binds)', bigChanged.length > 0, bk.lines.map(l => l.text))
    check('...and not one of those lines says the day still fits', bigChanged.every(t => !/still fits/.test(t)), bigChanged)
    const okChanged = k.lines.filter(l => l.severity === 'info' && /(goes from|becomes)/.test(l.text) && /^Today's/.test(l.text)).map(l => l.text)
    check('...while a day that does land says so', okChanged.length === 0 || okChanged.every(t => /still fits/.test(t)), okChanged)
    // The day swap and the calorie move say the same line; each hands it that day's own verdict.
    const { readFileSync: rf } = await import('fs')
    for (const f of ['src/lib/meal-day-move.ts', 'src/lib/meal-rebalance.ts']) {
      const src = rf(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      check(`${f.split('/').pop()} says "still fits" only off the day's own verdict`, /const fits = after\.find\(a => a\.date === c\.date\)\?\.day\.withinTolerance === true/.test(src) && /alsoResized\([^\n]{0,160}?, fits\)/.test(src) && /alsoRefit\([^\n]{0,80}?, fits\)/.test(src))
    }
  }

  // ---------------------------------------------------------------------------
  console.log('\n[7] One function, from the hook to the sheet and to the coach')
  {
    const hook = read('src/hooks/useMealDays.ts')
    // Re-anchored 10 Oct 2026: the week also carries the dates where Undo kept
    // a swap's planned sizes (M34), and the trial must be served the same.
    // Re-anchored 20 Oct 2026 on the PROPERTY: the week's inputs are ONE object, the strip is served from it, and the
    // trial is handed that very object (it had been the same literal written out per trial, counted here).
    const servingLiteral = /\{ today, dates, todaysPins, pinsByDate, pools, targets, softLikedFoods, shape: mealShape, rotation, keepHeldSizes: keptHeldSizes \}/g
    check('the hook runs the trial over the SAME week it hands the day swap',
      (hook.match(servingLiteral) ?? []).length === 1 && /const serving: MealDayMoveServing = useMemo\(\s*\(\) => \(\{ today, dates/.test(hook)
      && /serveMealWeek\(serving\)/.test(hook) && /knockOnOfPin\(\{\s*serving,\n/.test(hook) && /buildMealDayMoveProposal\(\{[^}]*?\n\s+serving,\n/.test(hook),
      (hook.match(servingLiteral) ?? []).length)
    // RE-ANCHORED 2 Nov 2026: the add-a-food and move trials share one reader (knockOnOf).
    check('...with the shopping list read strictly (unreadable is null, not empty)', /const knockOnOf = async[\s\S]{0,600}readGroceryCoverage\([\s\S]{0,120}?strict: true/.test(hook) && /const knockOn = \([^)]*\)[^=]*=>\s*knockOnOf\(/.test(hook))
    check('...and hands it out on the one controller both surfaces already receive', /plan: planDayMove, confirm: confirmDayMove, undo: undoDayMove, knockOn,/.test(hook))
    const mealPlan = read('src/components/MealPlan.tsx')
    check('the Nutrition screen gives the sheet the hook\'s function', /<MealFoodAddSheet[\s\S]{0,600}knockOn=\{dayMove\?\.knockOn\}/.test(mealPlan))
    const sheet = read('src/components/nutrition/MealFoodAddSheet.tsx')
    check('the sheet shows the card WITH the trial\'s lines', /withKnockOn\(proposal\.diff, trial\.knockOn\)/.test(sheet) && /\(card \?\? proposal\.diff\)\.implications/.test(sheet))
    check('...and its button waits for the trial', /disabled=\{busy \|\| !proposal\?\.ok \|\| !trialReady\}/.test(sheet) && /if \(!proposal\?\.ok \|\| !trialReady\) return/.test(sheet))
    const app = read('src/App.tsx')
    check('App gives the coach the same function', /onMealKnockOn=\{mealDays\.dayMove\.knockOn\}/.test(app) && /dayMove=\{mealDays\.dayMove\}/.test(app))
    const chat = read('src/components/ChatAssistant.tsx')
    check('the coach\'s add-a-food card is the builder\'s plus the trial', /diff: withKnockOn\(foodAdd\.diff, await mealKnockOn\(foodAdd\.payload\)\)/.test(chat))
    check('...and so is its custom-meal card', /diff: withKnockOn\(custom\.diff, await mealKnockOn\(custom\.payload\)\)/.test(chat))
    // 2 Nov 2026 (whole-app test #11): taking a food out, swapping it or changing its amount re-plans the day too, and
    // no card said so. The screen's edit sheet and the coach's edit card now carry the same trial. (Source only for the
    // coach; the screen half is driven in verify:meal-food-edit 2a2-2a3.)
    check('...and so is its card for taking out, swapping or re-weighing a food', /diff: withKnockOn\(edit\.diff, await mealKnockOn\(edit\.payload\)\)/.test(chat))
    check('the screen gives the food-edit sheet the hook\'s function too', /<MealFoodEditSheet[\s\S]{0,400}knockOn=\{dayMove\?\.knockOn\}/.test(mealPlan))
    // "Same dishes" (2 Nov 2026) reaches the builders from both surfaces: the screen from the row's own ledger, the
    // coach from the ledger read at the card. Source only; the behaviour is [2c].
    // THE MOVE, both surfaces (2 Nov 2026): the screen's sheet reads its card off the move trial and puts back each
    // slot's earlier pick on Undo (verify:meal-move 2g-2h, 6a-6d drive it; the earlier-pick half has no fixture with a
    // hand-picked slot, so it is pinned here), and the coach's card is built with the same trial.
    const moveSheet = read('src/components/nutrition/MealMoveSheet.tsx')
    check('the move sheet reads the picks before it writes, and Undo restores them', moveSheet.indexOf('getMealPicksForDate(ctx.profileId, ctx.date)') > -1 && moveSheet.indexOf('getMealPicksForDate(ctx.profileId, ctx.date)') < moveSheet.indexOf('await executeMealMove(') && /previous: before\[leg\.slot\] \?\? null/.test(moveSheet))
    check('the coach\'s move card is the builder\'s plus the move trial, from the hook', /diff: withKnockOn\(moved\.diff, moveTrial\)/.test(chat) && /onMealKnockOnMove\(moved\.payload\.date/.test(chat) && /onMealKnockOnMove=\{mealDays\.dayMove\.knockOnMove\}/.test(app) && /onMealKnockOnMove=\{mealDays\.dayMove\.knockOnMove\}/.test(read('.tour-harness/chat.tsx')))
    check('the screen tells both edit sheets when the meal is already eaten', /afterEating: \(loggedBySlot\[slot\]\?\.length \?\? 0\) > 0/.test(mealPlan) && /meal: ctx\.meal, afterEating: ctx\.afterEating/.test(mealPlan)
      && /afterEating: ctx\.afterEating/.test(read('src/components/nutrition/MealFoodEditSheet.tsx')) && /afterEating: ctx\.afterEating/.test(sheet))
    check('...and so does the coach, on its add card and its edit card', (chat.match(/afterEating: await slotEatenToday\(slotName\)/g) ?? []).length === 2 && /const slotEatenToday = async[\s\S]{0,400}getTodayLedger\(/.test(chat))
    check('...through the prop, never a second copy of the trial', /const mealKnockOn = async[\s\S]{0,300}onMealKnockOn\(payload\.date, payload\.slot, payload\.option\)/.test(chat) && !/knockOnOfPin/.test(chat))
    check('the harness pages hand over the hook\'s function too, not a copy', /onMealKnockOn=\{mealDays\.dayMove\.knockOn\}/.test(read('.tour-harness/chat.tsx')) && /dayMove=\{mealDays\.dayMove\}/.test(read('.tour-harness/real.tsx')))
    const libSrc = read('src/lib/meal-knock-on.ts')
    check('the trial stores the option the way the executor does: tagged as hers', /USER_REQUESTED_TAG/.test(libSrc) && /tags: \[\.\.\.\(option\.tags \?\? \[\]\), USER_REQUESTED_TAG\]/.test(read('src/lib/pending-action-executor.ts')))
  }

  console.log(`\n${ran} checks ran.`)
  if (failed > 0) { console.error(`${failed} check(s) failed\n`); process.exit(1) }
  console.log('The add-a-food card is read off a trial.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
