/**
 * test:eating-out — a meal marked as eating out (docs/plans/eating-out.md).
 *
 * Ashley, 12 Nov 2026: "build it, start with out for dinner", and his ruling the same day, from three options, "Ask:
 * light/normal/big": he marks a meal on a day as out; the APP asks how big a night it is; the meal stays in the day as
 * an estimate, is never shopped for, and the rest of the day fits around it.
 *
 * Held here: the estimate at each size (mine, CSCS / population nutrition, basis in BACKLOG); the meal's name and
 * marks (one day only, cooked elsewhere, so never shopped for, resized or moved); the size read from HIS words and
 * never the coach's; the day around it; and the wiring that makes the screen and the coach one road.
 *
 * A gate has exactly one exit, at the bottom.
 */
import { readFileSync } from 'fs'
import { computeSlotBudgets, verifyProposal, type PoolOption } from '../src/lib/meal-generation'
import { fitDishToBudget } from '../src/lib/meal-library'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { serveDates, datesFrom, type MealShape } from '../src/lib/meal-rotation'
import { isCookedElsewhere } from '../src/lib/meals-elsewhere'
import { isPinOnly } from '../src/lib/meal-new-from'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'
import {
  EATING_OUT_SIZES, EATING_OUT_FACTOR, EATING_OUT_WORDS, EATING_OUT_REFUSALS, eatingOutName, eatingOutMacros,
  eatingOutOption, isEatingOut, eatingOutSizeOf, eatingOutSizeSaid, type EatingOutSize,
} from '../src/lib/eating-out'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(p, 'utf8'))

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const TARGETS: MacroTargets = { calories: 2400, protein: 160, carbs: 270, fat: 75 }
const SHAPE: MealShape = { mealsPerDay: 3, includeSnacks: true }
const BUDGETS = computeSlotBudgets(TARGETS, 3, true) as Record<MealSlotName, MacroTargets>
const kcalOf = (m: MacroTargets) => m.protein * 4 + m.carbs * 4 + m.fat * 9

/** The real library fitted to his meals, as the app fits it (CLAUDE.md, "a pool with no room in it"). */
function libraryPools(): Partial<Record<MealSlotName, PoolOption[]>> {
  const out: Partial<Record<MealSlotName, PoolOption[]>> = {}
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

// Thursday 12 November 2026; Friday is the 13th. Found by date, never assumed.
const WEEK = datesFrom('2026-11-12', 7)
const FRIDAY = '2026-11-13'

function main() {
  console.log('1. The estimate at each size')
  const dinner = BUDGETS.dinner
  const est = Object.fromEntries(EATING_OUT_SIZES.map(s => [s, eatingOutMacros(dinner, s)])) as Record<EatingOutSize, MacroTargets>
  check('three sizes, in order: light, normal, big', EATING_OUT_SIZES.join() === 'light,normal,big')
  check('light is the meal\'s own share', Math.abs(est.light.calories - dinner.calories) <= 1 && Math.abs(est.light.protein - dinner.protein) <= 1 && Math.abs(est.light.carbs - dinner.carbs) <= 1 && Math.abs(est.light.fat - dinner.fat) <= 1, [est.light, dinner])
  // A literal on one side of each (CLAUDE.md, "a check compared against the constant that drives it").
  check('normal is about a third again', Math.abs(est.normal.calories - dinner.calories * 1.35) <= 1, [est.normal.calories, dinner.calories])
  check('a big night is about seven tenths more', Math.abs(est.big.calories - dinner.calories * 1.7) <= 1, [est.big.calories, dinner.calories])
  check('...and the factors read 1, 1.35, 1.7', EATING_OUT_FACTOR.light === 1 && EATING_OUT_FACTOR.normal === 1.35 && EATING_OUT_FACTOR.big === 1.7)
  check('protein stays at the meal\'s share at every size', EATING_OUT_SIZES.every(s => est[s].protein === Math.round(dinner.protein)), EATING_OUT_SIZES.map(s => est[s].protein))
  check('the extra energy is carbs and fat in the share\'s own proportion', EATING_OUT_SIZES.every(s => Math.abs((est[s].carbs * 4) / (est[s].fat * 9) - (dinner.carbs * 4) / (dinner.fat * 9)) < 0.05), EATING_OUT_SIZES.map(s => [est[s].carbs, est[s].fat]))
  check('every size adds up: protein, carbs and fat make the calories (within 2%)', EATING_OUT_SIZES.every(s => Math.abs(kcalOf(est[s]) - est[s].calories) / est[s].calories < 0.02), EATING_OUT_SIZES.map(s => [kcalOf(est[s]), est[s].calories]))
  check('a big night out is bigger than a normal one, which is bigger than a light one', est.big.calories > est.normal.calories && est.normal.calories > est.light.calories)
  {
    const noFat = eatingOutMacros({ calories: 600, protein: 40, carbs: 100, fat: 0 }, 'big')
    check('a share with no fat still gives numbers, never NaN', Object.values(noFat).every(v => Number.isFinite(v)), noFat)
  }

  console.log('\n2. The meal: one day only, never shopped for, resized or moved')
  {
    check('it is named for its meal and its day: "Dinner out (Friday)"', eatingOutName('dinner', FRIDAY) === 'Dinner out (Friday)', eatingOutName('dinner', FRIDAY))
    const names = WEEK.flatMap(d => SLOTS.map(s => eatingOutName(s, d)))
    check('...one name per meal per day across the seven days', new Set(names).size === 28, names.length)
    const o = eatingOutOption('dinner', FRIDAY, dinner, 'big')
    check('it has no foods (nothing to cook or buy)', o.ingredients.length === 0)
    check('its numbers are the estimate', JSON.stringify(o.macros) === JSON.stringify(est.big), o.macros)
    check('it is served only where it is picked', isPinOnly(o))
    check('it is cooked elsewhere: the list leaves it out, the day never resizes it, a move refuses it', isCookedElsewhere(o))
    check('it is eating out, at the size chosen', isEatingOut(o) && eatingOutSizeOf(o) === 'big')
    check('each size is read back as itself', EATING_OUT_SIZES.every(s => eatingOutSizeOf(eatingOutOption('lunch', FRIDAY, BUDGETS.lunch, s)) === s))
    const plain = libraryPools().dinner![0]
    check('a plan dish is not eating out and has no size', !isEatingOut(plain) && eatingOutSizeOf(plain) === null)
    check('a junk size tag is no size', eatingOutSizeOf({ tags: ['eating-out', 'eating-out-size:huge'] }) === null)
  }

  console.log('\n3. The size comes from HIS words, or the app asks')
  {
    const misread = EATING_OUT_SIZES.flatMap(s => SLOTS.flatMap(slot => ['today', 'on Friday'].map(day => EATING_OUT_WORDS.chatChip(s, slot, day))
      .filter(chip => eatingOutSizeSaid(chip) !== s)))
    check('every size button, for every meal and day, reads back as its own size', misread.length === 0, misread)
    const noSize = ["I'm out for dinner Friday", "we're going out for lunch tomorrow", 'eating out tonight', 'Dinner with friends on Saturday', 'out for a meal on my flight home']
    check('saying only that he is going out says no size', noSize.every(t => eatingOutSizeSaid(t) === null), noSize.map(t => [t, eatingOutSizeSaid(t)]))
    const said: [string, EatingOutSize][] = [
      ['big night out Friday', 'big'], ["it's a three courses kind of night", 'big'], ['a big dinner out tomorrow', 'big'],
      ['something light, just a salad', 'light'], ['not much, a small plate', 'light'],
      ['nothing heavy, out for dinner Friday', 'light'], ['not a big night, dinner out', 'light'],
      ['a normal dinner out', 'normal'], ['just a regular meal out', 'normal'],
    ]
    check('a size he says is the size kept', said.every(([t, s]) => eatingOutSizeSaid(t) === s), said.map(([t]) => [t, eatingOutSizeSaid(t)]))
  }

  console.log('\n4. The day around it')
  {
    const pools = libraryPools()
    // AS STORED: the shared add-a-meal write marks every added meal as his own request (so a regenerate keeps it).
    // Tested in that form, because the unmarked option was measured holding the day while the stored one re-planned it.
    const stored = (o: PoolOption): PoolOption => ({ ...o, tags: [...(o.tags ?? []), 'user-requested'] })
    const serve = (size: EatingOutSize | null) => {
      const pin = size ? { [FRIDAY]: { dinner: stored(eatingOutOption('dinner', FRIDAY, BUDGETS.dinner, size)) } } : undefined
      return serveDates({ dates: WEEK, pools, targets: TARGETS, shape: SHAPE, ...(pin ? { pinsByDate: pin } : {}) })
    }
    const plain = serve(null)
    const friday = (week: ReturnType<typeof serve>) => week.find(d => d.date === FRIDAY)!.day
    const others = (week: ReturnType<typeof serve>) => SLOTS.filter(s => s !== 'dinner').reduce((n, s) => n + (friday(week).chosen[s]?.macros.calories ?? 0), 0)
    const big = serve('big')
    const light = serve('light')
    check('the fixture binds: Friday has a plan dinner from the pool', !!friday(plain).chosen.dinner && !isEatingOut(friday(plain).chosen.dinner), friday(plain).chosen.dinner?.name)
    check('Friday\'s dinner is the meal out, at exactly the estimate', friday(big).chosen.dinner?.name === 'Dinner out (Friday)' && friday(big).chosen.dinner!.macros.calories === est.big.calories, friday(big).chosen.dinner?.macros)
    check('...and nobody resized it', friday(big).chosen.dinner?.heldBy === undefined)
    check('the rest of Friday is still planned', SLOTS.filter(s => s !== 'dinner').every(s => !!friday(big).chosen[s]))
    check('the rest of Friday gets smaller around a big night out', others(big) < others(plain), [others(big), others(plain)])
    check('...and a light night leaves more of the day than a big one', others(light) >= others(big), [others(light), others(big)])
    const poolOf = (slot: MealSlotName, name: string) => pools[slot]!.find(o => o.name === name)
    const shrunk = SLOTS.filter(s => s !== 'dinner').map(s => [s, friday(big).chosen[s]!, poolOf(s, friday(big).chosen[s]!.name)] as const)
    check('...each other meal is still its own dish, never less than three quarters of its size', shrunk.every(([, o, p]) => !!p && o.macros.calories >= p.macros.calories * 0.74), shrunk.map(([s, o, p]) => [s, o.macros.calories, p?.macros.calories]))
    check('...and at least one of them is smaller than its dish (the shrink happened)', shrunk.some(([, o, p]) => !!p && o.macros.calories < p.macros.calories * 0.95), shrunk.map(([s, o, p]) => [s, o.macros.calories, p?.macros.calories]))
    check('the rest of Friday KEEPS its dishes, at every size: nothing else on the plate changes, only how much', [big, light, serve('normal')].every(w => SLOTS.filter(s => s !== 'dinner').every(s => friday(w).chosen[s]?.name === friday(plain).chosen[s]?.name)), [big, light].map(w => SLOTS.map(s => friday(w).chosen[s]?.name)))
    check('...with no second note beside the meal out\'s own line', [big, light, serve('normal')].every(w => friday(w).heldAround === undefined), [big, light].map(w => friday(w).heldAround))
    const satPlain = plain.find(d => d.date === '2026-11-14')!.day, satBig = big.find(d => d.date === '2026-11-14')!.day
    check('the fixture binds: Saturday\'s lunch was Friday\'s dinner, as leftovers', satPlain.chosen.lunch?.leftoverFrom === 'dinner' && satPlain.chosen.lunch?.name === friday(plain).chosen.dinner?.name, [satPlain.chosen.lunch?.name, friday(plain).chosen.dinner?.name])
    check('...with Friday\'s dinner out there are no leftovers: Saturday\'s lunch is a fresh dish', satBig.chosen.lunch?.leftoverFrom !== 'dinner' && satBig.chosen.lunch?.name !== satPlain.chosen.lunch?.name, satBig.chosen.lunch?.name)
    {
      // Lunch AND dinner out, both big: only breakfast and the snack are left, so the quarter limit binds.
      const two = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: SHAPE, pinsByDate: { [FRIDAY]: {
        lunch: stored(eatingOutOption('lunch', FRIDAY, BUDGETS.lunch, 'big')), dinner: stored(eatingOutOption('dinner', FRIDAY, BUDGETS.dinner, 'big')) } } })
      const day = two.find(d => d.date === FRIDAY)!.day
      const left = (['breakfast', 'snack'] as MealSlotName[]).map(s => [s, day.chosen[s]!, poolOf(s, day.chosen[s]!.name)] as const)
      const need = (TARGETS.calories - day.chosen.lunch!.macros.calories - day.chosen.dinner!.macros.calories) / left.reduce((n, [, , p]) => n + (p?.macros.calories ?? 0), 0)
      check('the fixture binds: with two big meals out the rest would need to shrink by more than a quarter', need < 0.7, need)
      check('...and still no meal is less than three quarters of its dish', left.every(([, o, p]) => !!p && o.macros.calories >= p.macros.calories * 0.74), left.map(([s, o, p]) => [s, o.macros.calories, p?.macros.calories]))
      check('...the day says it is over rather than starving the morning', !day.withinTolerance && day.totals.calories > TARGETS.calories, day.totals)
    }
    {
      // A lunch he picked himself on the same day is his: it is never one of the meals made smaller.
      const mine: PoolOption = { ...pools.lunch![7], tags: [...(pools.lunch![7].tags ?? []), 'user-requested'] }
      const withMine = serveDates({ dates: WEEK, pools, targets: TARGETS, shape: SHAPE, pinsByDate: { [FRIDAY]: { lunch: mine, dinner: eatingOutOption('dinner', FRIDAY, BUDGETS.dinner, 'big') } } })
      const day = withMine.find(d => d.date === FRIDAY)!.day
      check('a lunch he picked keeps its own size beside a big night out', day.chosen.lunch?.name === mine.name && day.chosen.lunch!.macros.calories === mine.macros.calories, [day.chosen.lunch?.name, day.chosen.lunch?.macros.calories, mine.macros.calories])
      check('...while the breakfast he did not pick is made smaller (his own lunch re-plans the day, his 1 Sep rule)', !!day.chosen.breakfast && !!poolOf('breakfast', day.chosen.breakfast.name) && day.chosen.breakfast.macros.calories < poolOf('breakfast', day.chosen.breakfast.name)!.macros.calories, [day.chosen.breakfast?.macros.calories, poolOf('breakfast', day.chosen.breakfast?.name ?? '')?.macros.calories])
    }
    check('the write\'s own mark is checked: the stored meal out carries it', stored(eatingOutOption('dinner', FRIDAY, dinner, 'big')).tags!.includes('user-requested') && /tags: \[\.\.\.\(option\.tags \?\? \[\]\), USER_REQUESTED_TAG\]/.test(read('src/lib/pending-action-executor.ts')))
    check('the meal out itself is never shrunk', friday(big).chosen.dinner!.macros.calories === est.big.calories && friday(serve('normal')).chosen.dinner!.macros.calories === est.normal.calories)
    check('no other day serves the meal out', big.filter(d => d.date !== FRIDAY).every(d => SLOTS.every(s => !isEatingOut(d.day.chosen[s]))))
    check('no other day\'s meals changed', big.filter(d => d.date !== FRIDAY && d.date < FRIDAY).every(d => SLOTS.every(s => d.day.chosen[s]?.name === plain.find(p => p.date === d.date)!.day.chosen[s]?.name)))
    const sat = big.find(d => d.date === '2026-11-14')!.day
    check('Saturday\'s lunch is never "last night\'s" meal out', !isEatingOut(sat.chosen.lunch) && sat.chosen.lunch?.name !== 'Dinner out (Friday)', sat.chosen.lunch?.name)
  }

  console.log('\n5. One road for the screen and the coach')
  {
    const hook = read('src/hooks/useMealDays.ts')
    const mark = hook.slice(hook.indexOf('mark: async'), hook.indexOf('clear: async'))
    check('the controller refuses a day outside the strip', /if \(!dates\.includes\(date\)\) return \{ ok: false, reason: EATING_OUT_REFUSALS\.outsideWindow \}/.test(mark))
    check('...refuses a meal of today\'s already logged as eaten', /readLoggedToday\(\)/.test(mark) && /EATING_OUT_REFUSALS\.eaten\(slot\)/.test(mark))
    check('...writes through the shared add-a-meal road', /applyMealOptionToSlot\(/.test(mark) && /eatingOutOption\(/.test(mark))
    check('...and hands back what the meal showed before, and what it changes on other days', /return \{ ok: true, option, previous, elsewhere: trial\?\.elsewhere \?\? \[\] \}/.test(mark) && /const trial = await knockOn\(date, slot, option, true\)/.test(mark))
    check('the hook hands the controller out', /^\s*eatingOut,$/m.test(hook))
    const app = read('src/App.tsx')
    check('App gives the same controller to Nutrition and to the coach', /eatingOut=\{mealDays\.eatingOut\}/.test(app) && /onEatingOut=\{mealDays\.eatingOut\}/.test(app))
    const nd = read('src/components/NutritionDisplay.tsx')
    check('Nutrition hands it to the meal list', (nd.match(/eatingOut=\{eatingOut\}/g) ?? []).length >= 1)
    const mp = read('src/components/MealPlan.tsx')
    check('the meal sheet marks and clears through it', /eatingOut\.mark\(/.test(mp) && /eatingOut\.clear\(/.test(mp))
    check('...and its line names what the meal out changed on other days', /text: \[EATING_OUT_WORDS\.marked\(slot, dayWord, size\), \.\.\.r\.elsewhere\]\.join\(' '\)/.test(mp))
    const chat = read('src/components/ChatAssistant.tsx')
    const build = chat.slice(chat.indexOf('const buildEatingOutProposal'), chat.indexOf('const buildCardioLogProposal'))
    check('the coach\'s card reads the size from his message, never from the coach', /eatingOutSizeSaid\(userSaid\)/.test(build) && !/rawArgs\.size/.test(build))
    check('...and with no size said the APP asks, with the three as buttons', /EATING_OUT_WORDS\.chatAsk\(/.test(build) && /QUICK_REPLIES/.test(build) && /EATING_OUT_SIZES\.map/.test(build))
    check('...its estimate is the same function the sheet saves', /eatingOutMacros\(budget, size\)/.test(build))
    check('the coach\'s card lists the same trial\'s lines', /\.\.\.\(trial\?\.lines \?\? \[\]\)/.test(build) && /onMealKnockOn\(date, slot, eatingOutOption\(slot, date, budget, size\), true\)/.test(build))
    check('the coach\'s Apply calls the controller', /onEatingOut\.mark\(payload\.date, payload\.slot, payload\.size\)/.test(chat))
    check('...and its Undo puts back the meal it showed before', /onEatingOut\.clear\(payload\.date, payload\.slot, row\.result\?\.previousMeal \?\? null\)/.test(chat) && /previousMeal: r\.previous/.test(chat))
    const fn = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
    const declAt = fn.indexOf('name: "propose_eating_out"')
    const decl = fn.slice(declAt, fn.indexOf('name: "propose_meal_rebalance"', declAt))
    check('the coach\'s tool has no size to fill in', declAt > 0 && !/\bsize:\s*\{/.test(decl) && /meal_slot/.test(decl))
    const handler = fn.slice(fn.indexOf('if (name === "propose_eating_out")'), fn.indexOf('if (name === "propose_meal_rebalance")'))
    check('...and its handler only forwards the day and the meal', /kind: "propose_eating_out"/.test(handler) && !/size/.test(strip(handler)))
    check('the coach is told the app asks the size and never to guess one', /EATING OUT \(Ashley, 12 Nov 2026\)[^\n]*The APP asks how big a night it is[^\n]*never guess a size/.test(fn))
    check('...and never to call a meal out safe for an allergy', /EATING OUT \(Ashley, 12 Nov 2026\)[^\n]*an allergy or restriction on their profile still stands/.test(fn))
    check('the parity list names it on both surfaces', /\| `propose_eating_out` \| SCREEN \|/.test(readFileSync('docs/coach-screen-parity.md', 'utf8')))
  }

  console.log('\n6. The words')
  {
    check('the row says "Eating out" and "Estimate"', EATING_OUT_WORDS.label === 'Eating out' && EATING_OUT_WORDS.badge === 'Estimate')
    check('the sizes read Light, Normal, Big night', EATING_OUT_SIZES.map(s => EATING_OUT_WORDS.sizeLabel[s]).join() === 'Light,Normal,Big night')
    check('the line names the day, the meal and the size', EATING_OUT_WORDS.marked('dinner', "Friday's", 'big') === "Friday's dinner is out, a big night. The rest of the day fits around it.", EATING_OUT_WORDS.marked('dinner', "Friday's", 'big'))
    // RE-ANCHORED 13 Nov 2026, his ruling "A range" (strategy slice 5): the note gives the range, never one figure.
    check('the note says it is an estimate, with its range of calories', /estimate/i.test(EATING_OUT_WORDS.note('normal', 1231)) && EATING_OUT_WORDS.note('normal', 1231).includes('about 1,050–1,400 kcal') && !EATING_OUT_WORDS.note('normal', 1231).includes('1,231'), EATING_OUT_WORDS.note('normal', 1231))
    check('the question asks how big', EATING_OUT_WORDS.chatAsk('dinner', "Friday's") === "How big a night out is Friday's dinner?")
    const all = [EATING_OUT_WORDS.note('big', 1500), EATING_OUT_WORDS.marked('lunch', 'Today\'s', 'light'), ...Object.values(EATING_OUT_REFUSALS).map(v => typeof v === 'function' ? v('dinner') : v)]
    check('nothing it says calls a meal out healthy, safe, on plan or free', all.every(t => !/\b(healthy|safe|on plan|free|guilt)/i.test(t)), all)
  }
}

try { main() } catch (e) { failures++; console.log(`  FAIL: crashed — ${(e as Error).stack}`) }
console.log(`\n${ran} checks ran, ${failures} failed.`)
console.log('\nA meal out stays in the day as an estimate, the size is his, and the day fits around it.')
process.exit(failures > 0 ? 1 : 0)
