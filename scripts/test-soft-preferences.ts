/**
 * Gate: a soft preference is a LEAN, and something actually reads it.
 *
 * Found by tracing where onboarding/chat answers end up: "I prefer chicken to
 * fish", "not a fan of burpees but I'll do them" were recorded, compiled by
 * compileSoftExercisePreferences / compileSoftFoodPreferences — and read by
 * NOTHING. Zero call sites outside the file defining them. Worse, the comment
 * above the exercise one said "scoped to swap-candidate ranking only
 * (mesocycle-edit.getReplacementCandidates)", describing a consumer that did
 * not exist. A truthful-looking comment over dead code is how the next person
 * gets misled.
 *
 * VISION-ARCHITECTURE.md §1.2 had already decided the behaviour — soft
 * exercise preferences rank `getReplacementCandidates` and leave rotation
 * alone — so wiring it executes an existing decision rather than inventing
 * one.
 *
 * The invariant that matters: it REORDERS, it never REMOVES. A lean is not a
 * ban; someone who asks for a swap may still pick the thing they said they
 * were lukewarm about.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { compileSoftExercisePreferences, compileSoftFoodPreferences } from '../src/lib/fact-compiler'
import { assembleDay, DAY_CALORIE_TOLERANCE, type PoolOption } from '../src/lib/meal-generation'
import { markRestrictionBreakers } from '../src/lib/meal-restriction-check'
import { computeMealMacros } from '../src/lib/food-db'
import type { MealSlotName } from '../src/lib/meal-store'
import type { UserProfile } from '../src/lib/types'
import type { UserFactRow } from '../src/lib/memory-store'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower',
  training_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, available: i < 4 })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

console.log('\n1. The compiler has a real consumer now')
{
  const meso = readFileSync(join(ROOT, 'src/lib/mesocycle-edit.ts'), 'utf8')
  check('getReplacementCandidates accepts soft preferences', /soft\?: \{ liked: string\[\]; disliked: string\[\] \}/.test(meso))
  // The point of the fix: it must be READ, not merely accepted.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('App compiles them from memory', /compileSoftExercisePreferences\(memoryFacts\)/.test(app))
  check('...and passes them down', /softExercisePreferences=\{compiledSoftExercisePreferences\}/.test(app))
  // ExercisePlan.tsx (which carried its own inline swap dialog) is deleted —
  // design 5a's ProgramBrowse routes every swap through the ONE shared
  // SwapDialog, so the chain is two files now, and the "actually asked"
  // check anchors on the dialog that does the asking.
  for (const rel of ['src/components/exercise/ExerciseTab.tsx', 'src/components/exercise/SwapDialog.tsx']) {
    check(`${rel.split('/').pop()} carries them through`, /softExercisePreferences/.test(readFileSync(join(ROOT, rel), 'utf8')))
  }
  check('the swap list is actually asked with them',
    /getReplacementCandidates\([^)]*softExercisePreferences\)/.test(readFileSync(join(ROOT, 'src/components/exercise/SwapDialog.tsx'), 'utf8')))
}

console.log('\n2. It REORDERS and never REMOVES')
{
  const baseline = getReplacementCandidates('Barbell Bench Press', profile, [])
  check('there are candidates to rank', baseline.length > 2, baseline.length)
  const names = baseline.map(c => c.exercise.name)
  const last = names[names.length - 1]
  const first = names[0]

  const liked = getReplacementCandidates('Barbell Bench Press', profile, [], { liked: [last], disliked: [] })
  check('a liked movement moves to the front', liked[0].exercise.name === last, liked.slice(0, 2).map(c => c.exercise.name))
  check('...and nothing is lost', liked.length === baseline.length, [liked.length, baseline.length])

  const disliked = getReplacementCandidates('Barbell Bench Press', profile, [], { liked: [], disliked: [first] })
  check('a disliked movement sinks', disliked[disliked.length - 1].exercise.name === first)
  // THE line between soft and hard. A ban belongs in exclusions; a lean must
  // still leave the option on the table.
  check('...but is STILL OFFERED — a lean is not a ban',
    disliked.some(c => c.exercise.name === first) && disliked.length === baseline.length)

  const empty = getReplacementCandidates('Barbell Bench Press', profile, [], { liked: [], disliked: [] })
  check('no preferences changes nothing', JSON.stringify(empty.map(c => c.exercise.name)) === JSON.stringify(names))
  const omitted = getReplacementCandidates('Barbell Bench Press', profile, [])
  check('omitting the argument changes nothing', JSON.stringify(omitted.map(c => c.exercise.name)) === JSON.stringify(names))
}

console.log('\n3. Only SOFT facts reach it — hard ones are a different channel')
{
  const facts = [
    { kind: 'exercise_preference', polarity: 'dislike', hardness: 'hard', resolved_refs: ['Burpees'], retired_at: null },
    { kind: 'exercise_preference', polarity: 'dislike', hardness: 'soft', resolved_refs: ['Lunges'], retired_at: null },
    { kind: 'exercise_preference', polarity: 'like', hardness: 'soft', resolved_refs: ['Pull-Ups'], retired_at: null },
  ] as unknown as UserFactRow[]
  const soft = compileSoftExercisePreferences(facts)
  check('a soft dislike is picked up', soft.disliked.includes('Lunges'))
  check('a soft like is picked up', soft.liked.includes('Pull-Ups'))
  // A hard dislike must never arrive here — it is an EXCLUSION, and ranking it
  // down instead of removing it would leave a banned movement on offer.
  check('a HARD dislike does not leak into ranking', !soft.disliked.includes('Burpees'), soft.disliked)
}

console.log('\n4. The FOOD half — soft likes now bias which day gets assembled')
{
  // The other half of the same finding. compileSoftFoodPreferences had zero
  // call sites too, so "I love salmon" was recorded, shown back in the memory
  // screen, and read by nothing. VISION-ARCHITECTURE.md §1.2 named assembleDay
  // as the consumer; this is that consumer existing.
  const opt = (slot: MealSlotName, name: string, ingredients: string[], m: [number, number, number, number]): PoolOption => ({
    slot, name,
    ingredients: ingredients.map(n => ({ name: n, quantity: 100, unit: 'g' })),
    macros: { calories: m[0], protein: m[1], carbs: m[2], fat: m[3] },
    tags: ['British', 'quick'],
  })
  // Two dinners with IDENTICAL macros, so nothing but the preference can
  // separate them. That is the whole test: if the bias did nothing, the tie
  // would break on pool order and the salmon would never be preferred.
  const pools = {
    breakfast: [opt('breakfast', 'Porridge', ['oats', 'milk'], [500, 25, 70, 12])],
    dinner: [
      opt('dinner', 'Chicken and rice', ['chicken breast', 'white rice'], [700, 55, 70, 20]),
      opt('dinner', 'Salmon and rice', ['salmon', 'white rice'], [700, 55, 70, 20]),
    ],
  }
  const targets = { calories: 1200, protein: 80, carbs: 140, fat: 32 }

  const neutral = assembleDay(pools, targets)
  check('with no preference the first pool option wins the tie', neutral.chosen.dinner?.name === 'Chicken and rice', neutral.chosen.dinner?.name)

  const liked = assembleDay(pools, targets, {}, ['salmon'])
  check('a liked INGREDIENT flips an otherwise identical tie', liked.chosen.dinner?.name === 'Salmon and rice', liked.chosen.dinner?.name)

  // A like far more often names a dish than an ingredient — "I love a curry",
  // "porridge is my go-to" — so the name is matched too. This is deliberately
  // WIDER than the hard dislike filter, because a false positive on a nudge
  // costs nothing while a false positive on a filter takes food off the plate.
  const byName = assembleDay(pools, targets, {}, ['salmon and rice'])
  check('a liked DISH NAME matches too', byName.chosen.dinner?.name === 'Salmon and rice', byName.chosen.dinner?.name)

  const unrelated = assembleDay(pools, targets, {}, ['tofu'])
  check('a preference nothing satisfies changes nothing', unrelated.chosen.dinner?.name === neutral.chosen.dinner?.name)

  // THE SAME LINE AS THE EXERCISE HALF: a lean, not a filter. The disliked
  // option must still be reachable, and macro fit must still win outright.
  check('both options are still offered', (liked.alternatives.dinner?.length ?? 0) === 2)

  // FAVOURED, NOT A TIEBREAK — Ashley, 27 Sep 2026: "favoured when picking
  // each day". Until then this section pinned the opposite: a liked dinner 16
  // kcal worse LOST, because the like was a 0.01 penalty.
  //
  // REAL FOOD, NOT INVENTED MACROS. The first version of these checks gave
  // 100 g of salmon and rice 700-900 kcal. The ranking resizes a dish from its
  // INGREDIENTS, so an invented dish could never be quietly resized into the
  // band and "outside the band the like loses" passed because of the fixture
  // (27 Sep 2026 review). Every dish below is costed from the food database,
  // and each case was measured before it was written down. Cod, not salmon,
  // because a salmon dinner cannot reach this day's protein at any portion.
  const L = (name: string, quantity: number, unit = 'g') => ({ name, quantity, unit })
  const dish = (slot: MealSlotName, name: string, ing: { name: string; quantity: number; unit: string }[]): PoolOption => {
    const c = computeMealMacros(ing)
    return { slot, name, ingredients: ing, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
  }
  const porridge = dish('breakfast', 'Porridge', [L('oats', 80), L('semi-skimmed milk', 250, 'ml')])
  const chicken = dish('dinner', 'Chicken and rice', [L('chicken breast', 200), L('white rice', 200), L('broccoli', 100), L('olive oil', 10)])
  const cod = (g: number, rice: number, oil: number) => dish('dinner', 'Cod curry with rice', [L('cod', g), L('white rice', rice), L('broccoli', 100), L('olive oil', oil)])
  // The day is porridge plus the chicken dinner EXACTLY, so without a like the
  // chicken always fits closest and wins.
  const day: typeof targets = {
    calories: porridge.macros.calories + chicken.macros.calories, protein: porridge.macros.protein + chicken.macros.protein,
    carbs: porridge.macros.carbs + chicken.macros.carbs, fat: porridge.macros.fat + chicken.macros.fat,
  }
  const pick = (dinner: PoolOption, likes: string[], recent: Partial<Record<MealSlotName, string[]>> = {}) =>
    assembleDay({ breakfast: [porridge], dinner: [chicken, dinner] }, day, recent, likes)
  const off = (d: PoolOption) => Math.round(((porridge.macros.calories + d.macros.calories) - day.calories) / day.calories * 1000) / 10

  const inBand = cod(280, 230, 14) // measured: +3.5% on the day
  const nearBand = cod(320, 270, 16) // +13.3%: a quiet resize (about 0.82x) brings it in
  const farBand = cod(360, 300, 18) // +22%: would need under 0.75x, past the quiet resize
  const wrongShape = cod(250, 200, 40) // the oil puts fat far out; no single scale fixes a shape
  check('the sanity check on these fixtures: the in-band dinner is inside the calorie band on its own',
    Math.abs(off(inBand)) <= DAY_CALORIE_TOLERANCE * 100, off(inBand))
  check('...the near one is outside it by more than the band', off(nearBand) > DAY_CALORIE_TOLERANCE * 100, off(nearBand))

  const insideDay = pick(inBand, ['cod'])
  check(`a liked dinner that fits less closely, the day still inside the band (${off(inBand)}%), WINS`,
    insideDay.chosen.dinner?.name === 'Cod curry with rice' && insideDay.withinTolerance, insideDay.chosen.dinner?.name)
  check('...and without the like, the closer dinner wins, so the like is what decided it',
    pick(inBand, []).chosen.dinner?.name === 'Chicken and rice')
  // What the ComboRank doc says and the old fixture could not show: a quiet
  // resize is the app's own way of making a correct day, and a like may spend
  // one, as variety may. What it gets is still a correct day, at portions the
  // app already changes without a word.
  const nearDay = pick(nearBand, ['cod'])
  check(`a liked dinner a quiet resize brings into the band (${off(nearBand)}%) wins, served resized`,
    nearDay.chosen.dinner?.name === 'Cod curry with rice' && nearDay.withinTolerance
      && (nearDay.chosen.dinner?.macros.calories ?? 0) < nearBand.macros.calories, nearDay.chosen.dinner)
  const farDay = pick(farBand, ['cod'])
  check(`...but one too far for a quiet resize (${off(farBand)}%) loses: a like never buys an off-target day or a big resize`,
    farDay.chosen.dinner?.name === 'Chicken and rice' && farDay.withinTolerance, farDay.chosen.dinner?.name)
  const shapeDay = pick(wrongShape, ['cod'])
  check('...and so does one whose shape no resize can fix (fat far out)',
    shapeDay.chosen.dinner?.name === 'Chicken and rice' && shapeDay.withinTolerance, shapeDay.chosen.dinner?.name)

  // THE SAME MATCHER AS THE DISLIKE FILTER (27 Sep 2026 review): a plural, a
  // category and a dish name all reach it. Each used to be a raw substring
  // that matched nothing and changed nothing, silently.
  check('a like of "curries" finds a curry by its name', pick(inBand, ['curries']).chosen.dinner?.name === 'Cod curry with rice')
  check('a like of "fish" finds the cod, through the food database', pick(inBand, ['fish']).chosen.dinner?.name === 'Cod curry with rice')

  // A LIKE NEVER OVERRIDES WHAT SHE AVOIDS. She hearted the cod curry, then
  // added cod to her foods to avoid; the meal is still in the pool (kept meals
  // survive a regenerate), and the like must not be what serves it.
  const hearted = ['Cod curry with rice']
  check('the sanity check: unmarked, a hearted dinner wins as a like', pick(inBand, hearted).chosen.dinner?.name === 'Cod curry with rice')
  const marked = markRestrictionBreakers({ breakfast: [porridge], dinner: [chicken, inBand] }, [], ['cod'])
  check('the marker flags the meal that breaks the new avoid, and only it',
    marked.dinner?.[1]?.breaksRestriction === true && !marked.dinner?.[0]?.breaksRestriction && !marked.breakfast?.[0]?.breaksRestriction, marked.dinner?.map(o => o.breaksRestriction))
  const avoided = assembleDay(marked, day, {}, hearted)
  check('...and then the like does not pick it: the closer dinner is served', avoided.chosen.dinner?.name === 'Chicken and rice', avoided.chosen.dinner?.name)
  const cleared = markRestrictionBreakers(marked, [], [])
  check('...and a stale mark comes off when the avoid is removed', !cleared.dinner?.[1]?.breaksRestriction && pick(inBand, hearted).chosen.dinner?.name === 'Cod curry with rice')
  const byDiet = markRestrictionBreakers({ dinner: [chicken, inBand] }, ['pescatarian'], [])
  check('...and a diet restriction marks a meal the same way (pescatarian: the chicken)', byDiet.dinner?.[0]?.breaksRestriction === true && !byDiet.dinner?.[1]?.breaksRestriction, byDiet.dinner?.map(o => o.breaksRestriction))

  // VARIETY COMES FIRST. A dish she loves is served, eaten, and then rests like
  // any other — the reason a like as a key is not a like as a rut.
  const rested = pick(inBand, ['cod'], { dinner: ['Cod curry with rice'] })
  check('a liked dinner eaten yesterday gives way to one she has not had',
    rested.chosen.dinner?.name === 'Chicken and rice', rested.chosen.dinner?.name)

  // EVERY LIKE, NO DISLIKE. A hard dislike is a generation-time filter and
  // must never arrive here as a ranking hint. A HARD like must (27 Sep 2026):
  // the coach may file "I always have salmon" as hard, Profile lists it, and a
  // soft-only read left it shown and read by nothing.
  const facts = [
    { kind: 'food_preference', polarity: 'like', hardness: 'soft', resolved_refs: ['salmon'], retired_at: null },
    { kind: 'food_preference', polarity: 'like', hardness: 'hard', resolved_refs: ['porridge'], retired_at: null },
    { kind: 'food_preference', polarity: 'dislike', hardness: 'hard', resolved_refs: ['mushroom'], retired_at: null },
    { kind: 'food_preference', polarity: 'dislike', hardness: 'soft', resolved_refs: ['tofu'], retired_at: null },
  ] as unknown as UserFactRow[]
  const compiled = compileSoftFoodPreferences(facts)
  check('a soft food like is picked up', compiled.includes('salmon'))
  check('...and so is a hard one', compiled.includes('porridge'), compiled)
  check('a hard dislike does not leak into ranking', !compiled.includes('mushroom'), compiled)
  check('a dislike of any hardness does not leak in either', !compiled.includes('tofu'), compiled)

  // Wired, not merely accepted — the failure this whole file exists for.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('App compiles food likes from memory', /compileSoftFoodPreferences\(memoryFacts\)/.test(app))
  // The fifth argument (pinnedMeals) arrived with the custom-meals build —
  // soft food preferences still ride in position 4, which is what this pins.
  // Property, not the call's text — see the same re-anchoring in
  // test-custom-meal.ts. The old literal included the empty variety history,
  // so fixing that on 19 Sep 2026 reddened this check for no good reason.
  const assemblyDeclSP = (() => {
    const a = app.indexOf('const assembledMeals')
    const b = app.indexOf('const chosenMeals', a)
    return a < 0 ? '' : (b < 0 ? app.slice(a) : app.slice(a, b))
  })()
  check('...and the assembled day is built with them',
    /\bcompiledSoftFoodPreferences\b/.test(assemblyDeclSP), assemblyDeclSP.slice(0, 120))

  // The shopping list assembles the SAME days the Nutrition tab shows.
  // Withhold the preferences from one and the two diverge — a list for meals
  // the app never serves.
  const grocery = readFileSync(join(ROOT, 'src/lib/grocery-store.ts'), 'utf8')
  // Property, not the call's text: the horizon's assembly must be given the
  // soft likes. Pinning the exact argument list broke the day the call gained
  // a leftovers pin — the same re-anchoring as test:custom-meal above.
  // RE-ANCHORED 27 Sep 2026: the list stopped walking its own days and now
  // builds each date with the tab's own day function (the day strip's fix),
  // so this reads that call. The property is unchanged: the list assembles
  // with the same likes the tab does.
  check('the grocery list passes them to the tab\'s own day function',
    /assembleRotationDay\(rotation, date, pools, targets, softLikedFoods/.test(grocery))
  check('...and they reach it from the caller, on Rebuild and when a day is added',
    /assembleDates\(input\.mealPools, input\.targets, datesFrom\(input\.startDate, days\), input\.softLikedFoods/.test(grocery)
    // BOTH the add and its undo: one line each, and a check satisfied by
    // either would pass with the other one broken (it did, under mutation).
    && (grocery.match(/assembleDates\(input\.mealPools, input\.targets, covered, input\.softLikedFoods/g) ?? []).length === 2)
  check('App gives the grocery tab the same value it gave assembleDay',
    /softLikedFoods=\{compiledSoftFoodPreferences\}/.test(app))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll soft-preference checks passed.\n')
