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
import { assembleDay, SOFT_FOOD_MISS_PENALTY, type PoolOption } from '../src/lib/meal-generation'
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
  for (const rel of ['src/components/exercise/ExerciseTab.tsx', 'src/components/ExercisePlan.tsx', 'src/components/exercise/SwapDialog.tsx']) {
    check(`${rel.split('/').pop()} carries them through`, /softExercisePreferences/.test(readFileSync(join(ROOT, rel), 'utf8')))
  }
  check('the swap list is actually asked with them',
    /getReplacementCandidates\([^)]*softExercisePreferences\)/.test(readFileSync(join(ROOT, 'src/components/ExercisePlan.tsx'), 'utf8')))
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

  const worseButLiked = {
    breakfast: pools.breakfast,
    dinner: [
      opt('dinner', 'Chicken and rice', ['chicken breast', 'white rice'], [700, 55, 70, 20]),
      // 200 kcal out — a 16% miss on the day, far beyond what the tiebreak can buy.
      opt('dinner', 'Salmon and rice', ['salmon', 'white rice'], [900, 55, 70, 20]),
    ],
  }
  const fitWins = assembleDay(worseButLiked, targets, {}, ['salmon'])
  check('a liked meal does NOT win when it fits the macros worse',
    fitWins.chosen.dinner?.name === 'Chicken and rice', fitWins.chosen.dinner?.name)
  check('the penalty is small enough that it cannot outweigh macro fit',
    SOFT_FOOD_MISS_PENALTY <= 0.01, SOFT_FOOD_MISS_PENALTY)

  // WHERE EXACTLY IT STOPS MATTERING. 200 kcal out is an easy bar; the real
  // boundary is arithmetic. Calories carry weight 1.0 in macroDistanceScore,
  // so a relative miss of SOFT_FOOD_MISS_PENALTY costs exactly as much as the
  // preference is worth — on a 1200 kcal day that is 12 kcal. Anything worse
  // than that and macro fit wins outright, which is the property that makes
  // this safe to ship on a nutrition path.
  const boundaryKcal = Math.round(targets.calories * SOFT_FOOD_MISS_PENALTY)
  const justOver = {
    breakfast: pools.breakfast,
    dinner: [
      opt('dinner', 'Chicken and rice', ['chicken breast', 'white rice'], [700, 55, 70, 20]),
      opt('dinner', 'Salmon and rice', ['salmon', 'white rice'], [700 + boundaryKcal + 4, 55, 70, 20]),
    ],
  }
  const overResult = assembleDay(justOver, targets, {}, ['salmon'])
  check(`a liked meal ${boundaryKcal + 4} kcal worse already loses (boundary is ~${boundaryKcal})`,
    overResult.chosen.dinner?.name === 'Chicken and rice', overResult.chosen.dinner?.name)

  const justUnder = {
    breakfast: pools.breakfast,
    dinner: [
      opt('dinner', 'Chicken and rice', ['chicken breast', 'white rice'], [700, 55, 70, 20]),
      opt('dinner', 'Salmon and rice', ['salmon', 'white rice'], [700 + Math.max(1, boundaryKcal - 4), 55, 70, 20]),
    ],
  }
  const underResult = assembleDay(justUnder, targets, {}, ['salmon'])
  check(`...and one ${Math.max(1, boundaryKcal - 4)} kcal worse still wins, so the bias is real`,
    underResult.chosen.dinner?.name === 'Salmon and rice', underResult.chosen.dinner?.name)

  // Only SOFT LIKES. A hard dislike is a generation-time filter and must
  // never arrive here as a ranking hint.
  const facts = [
    { kind: 'food_preference', polarity: 'like', hardness: 'soft', resolved_refs: ['salmon'], retired_at: null },
    { kind: 'food_preference', polarity: 'dislike', hardness: 'hard', resolved_refs: ['mushroom'], retired_at: null },
    { kind: 'food_preference', polarity: 'dislike', hardness: 'soft', resolved_refs: ['tofu'], retired_at: null },
  ] as unknown as UserFactRow[]
  const compiled = compileSoftFoodPreferences(facts)
  check('a soft food like is picked up', compiled.includes('salmon'))
  check('a hard dislike does not leak into ranking', !compiled.includes('mushroom'), compiled)
  check('a dislike of any hardness does not leak in either', !compiled.includes('tofu'), compiled)

  // Wired, not merely accepted — the failure this whole file exists for.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('App compiles food likes from memory', /compileSoftFoodPreferences\(memoryFacts\)/.test(app))
  check('...and the assembled day is built with them', /assembleDay\(mealPools, macros, \{\}, compiledSoftFoodPreferences\)/.test(app))

  // The shopping list assembles the SAME days the Nutrition tab shows.
  // Withhold the preferences from one and the two diverge — a list for meals
  // the app never serves.
  const grocery = readFileSync(join(ROOT, 'src/lib/grocery-store.ts'), 'utf8')
  check('the grocery horizon passes them to assembleDay', /assembleDay\(pools, targets, recentNames, softLikedFoods\)/.test(grocery))
  check('...and they reach it from the caller', /assembleHorizon\(input\.mealPools, input\.targets, days, input\.softLikedFoods/.test(grocery))
  check('App gives the grocery tab the same value it gave assembleDay',
    /softLikedFoods=\{compiledSoftFoodPreferences\}/.test(app))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll soft-preference checks passed.\n')
