// ---------------------------------------------------------------------------
// Gate: the Sal and Margaret fixes (his two live setups, 14 Nov 2026; docs/audits/onboarding-live-test-2026-11-14.md).
// Each section calls the app's own functions with the case that went wrong. The screens are held by
// verify:new-plan-carryover (a new plan carries nothing over) and verify:onboarding-turns §29 (the beginner switch).
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL ??= 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY ??= 'anon'
import { assembleProfile, initialSlotValues, type OnboardingSlotValues } from '../src/lib/onboarding-slots'
import { computeSlotBudgets, skipsBreakfast, verifyProposal, generateMealPools, isHisUsualMeal, type PoolOption } from '../src/lib/meal-generation'
import { setSupabaseClient } from '../src/lib/supabase'
import { generateExercisePlan, OPTIONAL_CARDIO_FOCUS, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { MY_MEAL_TAG } from '../src/lib/meal-store'
import { unloadedLoadLabel } from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { fitDishToBudget } from '../src/lib/meal-library'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { serveDates, poolsForShape, datesFrom, type MealShape } from '../src/lib/meal-rotation'
import { moreMealFitOffer } from '../src/lib/coach-voice'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const answers = (over: Partial<OnboardingSlotValues>): OnboardingSlotValues => ({
  ...initialSlotValues(),
  displayName: 'Sal', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate', activityLevel: 'moderate',
  equipment: 'full_gym', injuries: [], trainingDays: ['Mon', 'Wed', 'Fri'], sessionDuration: '45-60',
  trainingStyle: 'functional', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
  age: '58', heightCm: '165', weightKg: '72', gender: 'female', mealsPerDay: 3, dietaryPreferences: [],
  ...over,
} as OnboardingSlotValues)

console.log('\n6. Lift numbers are saved only where the lift questions apply (his ruling: "a beginner won\'t know their numbers")')
{
  const lifts = { knowsWorkingLifts: true, knownSquatKg: '60', knownBenchKg: '40', knownDeadliftKg: '70' } as Partial<OnboardingSlotValues>
  const lifter = assembleProfile(answers(lifts))
  // The case that binds: an intermediate lifter with numbers keeps them (so the check below is not vacuous).
  check('an intermediate lifter who gave his numbers keeps them', lifter.known_squat_kg === 60 && lifter.skip_calibration_week === true, { squat: lifter.known_squat_kg, skip: lifter.skip_calibration_week })
  const beginner = assembleProfile(answers({ ...lifts, trainingExperience: 'beginner' }))
  check('a beginner with numbers hidden behind the change saves none', beginner.known_squat_kg == null && beginner.known_bench_kg == null && beginner.known_deadlift_kg == null,
    { squat: beginner.known_squat_kg, bench: beginner.known_bench_kg, dead: beginner.known_deadlift_kg })
  check('...and keeps the calibration week', beginner.skip_calibration_week !== true, beginner.skip_calibration_week)
  const home = assembleProfile(answers({ ...lifts, equipment: 'minimalist' }))
  check('equipment changed away from a barbell saves none either', home.known_squat_kg == null && home.skip_calibration_week !== true, { squat: home.known_squat_kg, skip: home.skip_calibration_week })
}

console.log('\n5. "Band" only when a band is the only way to do it')
{
  const entry = (n: string) => EXERCISE_DATABASE.find(e => e.name === n)
  const clam = entry('Clamshell')
  check('harness: Clamshell lists a band as one way beside bodyweight', !!clam && !!clam.equipment_alternatives && clam.equipment.includes('bodyweight') && clam.equipment.includes('resistance band'), clam && clam.equipment)
  check('Clamshell reads "Bodyweight", the word true for someone with no band', !!clam && unloadedLoadLabel(clam) === 'Bodyweight', clam && unloadedLoadLabel(clam))
  const bandOnly = EXERCISE_DATABASE.filter(e => e.equipment.length > 0 && e.equipment.every(q => q === 'resistance band'))
  check('a band-only movement still reads "Band"', bandOnly.length > 0 && bandOnly.every(e => unloadedLoadLabel(e) === 'Band'), bandOnly.filter(e => unloadedLoadLabel(e) !== 'Band').map(e => e.name))
}

console.log('\n7. "2 meals" with breakfast skipped is lunch and dinner, and a day serves only the meals asked for')
{
  const T: MacroTargets = { calories: 2000, protein: 140, carbs: 220, fat: 65 }
  const slots = (mpd: number, snacks: boolean, skip: boolean) => Object.keys(computeSlotBudgets(T, mpd, snacks, skip)).sort().join(',')
  check('two meals, breakfast skipped: lunch and dinner', slots(2, false, true) === 'dinner,lunch', slots(2, false, true))
  check('two meals, breakfast eaten: breakfast and dinner (his ruling A)', slots(2, false, false) === 'breakfast,dinner', slots(2, false, false))
  check('two meals + snacks, skipped: lunch, dinner and a snack', slots(2, true, true) === 'dinner,lunch,snack', slots(2, true, true))
  check('three meals, skipped: still breakfast, lunch and dinner (he asked for three)', slots(3, false, true) === 'breakfast,dinner,lunch', slots(3, false, true))
  const lunchShare = computeSlotBudgets(T, 2, false, true).lunch?.calories ?? 0
  check('...and lunch takes the share breakfast had (45%)', lunchShare === 900, lunchShare)
  check('the answer is read from the profile: "skip" only', skipsBreakfast({ breakfast_style: 'skip' }) && !skipsBreakfast({ breakfast_style: 'quick_cold' }) && !skipsBreakfast({}))

  // Pools for every meal (an older plan, or one made for three meals). The day serves the profile's meals only.
  const budgets3 = computeSlotBudgets(T, 3, true, false)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const sl of ['breakfast', 'lunch', 'dinner', 'snack'] as MealSlotName[]) {
    const opts: PoolOption[] = []
    for (const d of MEAL_LIBRARY) {
      if (d.slot !== sl || opts.length >= 12) continue
      const o = verifyProposal(fitDishToBudget(d, budgets3[sl]!).dish, sl, budgets3[sl]!, [], [])
      if (o) opts.push(o)
    }
    pools[sl] = opts
  }
  check('harness: a pool for each of the four meals', (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlotName[]).every(s => (pools[s]?.length ?? 0) > 0), Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v?.length])))
  const week = datesFrom('2026-11-02', 7)
  const served = (shape: MealShape) => serveDates({ dates: week, pools, targets: T, shape }).map(d => Object.keys(d.day.chosen).sort().join(','))
  const margaret = served({ mealsPerDay: 2, includeSnacks: false, skipBreakfast: true })
  check('Margaret (2 meals, skips breakfast, no snacks): every day is lunch and dinner', margaret.every(d => d === 'dinner,lunch'), margaret)
  const twoMeals = served({ mealsPerDay: 2, includeSnacks: true, skipBreakfast: false })
  check('2 meals + snacks: never a fourth meal from a lunch pool left over', twoMeals.every(d => d === 'breakfast,dinner,snack'), twoMeals)
  check('a pool set that needs nothing dropped is handed back as the same object', poolsForShape(pools, T, { mealsPerDay: 4, includeSnacks: true, skipBreakfast: false }) === pools)
}

console.log('\n7b. One meal is never "None of your 1 breakfasts"')
{
  const one = moreMealFitOffer([{ slot: 'breakfast', fitting: 0, have: 1 }])
  check('one breakfast that does not fit reads as one', !/\b1 breakfasts\b/.test(one) && /one breakfast/.test(one), one)
  const two = moreMealFitOffer([{ slot: 'breakfast', fitting: 0, have: 2 }])
  check('...two still read as two', /None of your 2 breakfasts/.test(two), two)
}

console.log('\n7c. A meal he said he usually eats is his own meal (setup\'s "usual meals", his "My usual meals first")')
{
  check('"chicken and rice" is the dish "Chicken and Rice"', isHisUsualMeal('Chicken and Rice', ['chicken and rice']))
  check('...and "Salmon & rice" is "salmon and rice"', isHisUsualMeal('Salmon & rice', ['salmon and rice']))
  check('one food is never a whole meal: "salmon" does not make every salmon dish his', !isHisUsualMeal('Salmon and potatoes', ['salmon']))
  check('a meal missing one of his foods is not his', !isHisUsualMeal('Chicken salad', ['chicken and rice']))
}

async function writerRun() {
  // The real build, with a stand-in meal writer and database. The writer writes his usual meal as itself, as it is told to.
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {}
  const fakeFrom = (table: string) => {
    let op = 'select'; let payload: Row | Row[] | null = null
    const exec = () => { db[table] ??= []; if (op === 'insert') for (const r of Array.isArray(payload) ? payload : [payload!]) db[table].push({ id: String(Math.random()), created_at: new Date(0).toISOString(), ...r }); return { data: op === 'select' ? db[table] : null, error: null } }
    const api: Record<string, unknown> = {
      select: () => api, insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api }, update: () => { op = 'update'; return api },
      delete: () => { op = 'delete'; return api }, eq: () => api, in: () => api, order: () => api, maybeSingle: () => api, single: () => api,
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
    }
    return api
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const askedSlots: string[] = []
  const LUNCH = ['240g raw chicken breast', '100g dry white rice', '100g broccoli', '1 tbsp olive oil']
  const DINNER = ['160g raw chicken breast', '330g raw potato', '100g green beans', '1 tbsp olive oil']
  ;(globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: MealSlotName; count: number }[] }
    for (const sl of body.slots) if (sl.count > 0) askedSlots.push(sl.slot)
    const meals = body.slots.flatMap(({ slot, count }) => Array.from({ length: count }, (_, i) => ({
      slot, name: slot === 'lunch' && i === 0 ? 'Chicken and rice' : `${slot} ${i}`,
      ingredients: slot === 'dinner' ? DINNER : LUNCH, prep: 'Cook it.', cuisine: 'British / Classic',
    })))
    return { ok: true, status: 200, json: async () => ({ meals }) }
  }
  const T: MacroTargets = { calories: 2000, protein: 140, carbs: 220, fat: 65 }
  const r = await generateMealPools({ profileId: 'margaret', targets: T, dietaryPreferences: [], mealsPerDay: 2, includeSnacks: false, skipBreakfast: true, likedFoods: ['chicken and rice'], library: false })
  const asked = [...new Set(askedSlots)].sort().join(',')
  check('Margaret\'s first meals are asked for lunch and dinner, never breakfast', asked === 'dinner,lunch', asked)
  const hers = (r.accepted.lunch ?? []).find(o => o.name === 'Chicken and rice')
  check('...and her "chicken and rice" comes back as her own meal', !!hers && (hers.tags ?? []).includes(MY_MEAL_TAG), hers && hers.tags)
  const other = (r.accepted.lunch ?? []).find(o => o.name !== 'Chicken and rice')
  check('...while a dish she never named is not', !!other && !(other.tags ?? []).includes(MY_MEAL_TAG), other && other.tags)
}

await writerRun()

console.log('\n9. No days nobody chose for a beginner or low recovery; elsewhere, only as optional (his ruling "B")')
{
  // A fixed sequence, so the plan is the same plan every run.
  let seed = 7; setRandomSource(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 })
  const plan = (over: Partial<OnboardingSlotValues>) => ({ days: generateExercisePlan(assembleProfile(answers({ fitnessGoal: 'fat_loss', conditioningPreference: 'love', ...over }))).plan })
  const extras = (p: { days: ReturnType<typeof generateExercisePlan>['plan'] }) => p.days.filter(d => d.focus === OPTIONAL_CARDIO_FOCUS).map(d => d.day)
  const lifter = plan({ trainingExperience: 'intermediate', recoveryCapacity: 'high' })
  // The case that binds: without it, "none for a beginner" could pass because nobody ever gets one.
  check('a recovered intermediate on fat loss who loves cardio still gets optional rest-day cardio', extras(lifter).length >= 1, extras(lifter))
  check('...named as optional wherever the day is named', lifter.days.filter(d => d.recommendedCardio?.timing === 'rest_day').every(d => d.focus === OPTIONAL_CARDIO_FOCUS && /optional/i.test(d.focus)))
  const margaret = plan({ trainingExperience: 'beginner', recoveryCapacity: 'high' })
  check('a beginner gets no extra days', extras(margaret).length === 0, extras(margaret))
  check('...and keeps the goal\'s conditioning inside her chosen sessions', margaret.days.some(d => d.recommendedCardio && d.recommendedCardio.timing !== 'rest_day'), margaret.days.map(d => [d.day, d.recommendedCardio?.timing]))
  check('...on the days she chose only', margaret.days.every(d => ['Monday', 'Wednesday', 'Friday'].includes(d.day)), margaret.days.map(d => d.day))
  const tired = plan({ trainingExperience: 'intermediate', recoveryCapacity: 'low' })
  check('low recovery gets no extra days either', extras(tired).length === 0, extras(tired))
  resetRandomSource()
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('The Sal and Margaret fixes hold.')
