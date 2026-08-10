/**
 * Dietary-safety audit gate — keeps the two Deno-side edge functions'
 * hand-duplicated dietary-tag lists in lockstep with diet-rules.ts's
 * DIETARY_PREFERENCES (the canonical, code-enforced list — see that file's
 * header comment). Deno edge functions can't import across the src/lib
 * boundary (same reason imperative-classifier.ts/slugifyExerciseName are
 * duplicated), so this is a static text check, not a shared import — the
 * next-best thing to "cannot drift," since TypeScript itself already
 * enforces the src-side half (OnboardingFlow.tsx's DIETARY_META is a
 * Record<DietaryPreference, ...>, so tsc fails to compile on any
 * missing/extra key there).
 *
 * This gate exists because of a real bug found during the audit:
 * chat-gemini/index.ts checked "pork-free"/"seafood-free" (neither is a
 * real onboarding value) and never checked "shellfish-free" (the real one)
 * at all — a shellfish-allergic user got zero enforcement text in chat.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

/** Extracts one top-level function's body — from its declaration to the first column-0 `}` after it. */
function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}(`)
  if (start === -1) throw new Error(`function ${functionName} not found`)
  const end = source.indexOf('\n}', start)
  if (end === -1) throw new Error(`closing brace for ${functionName} not found`)
  return source.slice(start, end)
}

async function main() {
  const { DIETARY_PREFERENCES } = await import('../src/lib/diet-rules')

  const generateMealsSrc = readFileSync(join(ROOT, 'supabase/functions/generate-meals/index.ts'), 'utf-8')
  const chatGeminiSrc = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf-8')

  const generateMealsBlock = extractFunctionBody(generateMealsSrc, 'buildDietarySafetyBlock')
  const chatGeminiBlock = extractFunctionBody(chatGeminiSrc, 'buildDietarySafetyBlock')

  console.log(`[1] Every DIETARY_PREFERENCES tag is checked by generate-meals's buildDietarySafetyBlock`)
  // 'mediterranean' is a documented no-op (diet-rules.ts: "no hard
  // exclusions — it's a style preference, not a restriction diet") — no
  // rule text is expected for it in either prompt-nicety function.
  for (const tag of DIETARY_PREFERENCES) {
    if (tag === 'mediterranean') continue
    check(`generate-meals checks "${tag}"`, generateMealsBlock.includes(`"${tag}"`))
  }

  console.log(`\n[2] Every DIETARY_PREFERENCES tag is checked by chat-gemini's buildDietarySafetyBlock`)
  for (const tag of DIETARY_PREFERENCES) {
    if (tag === 'mediterranean') continue
    check(`chat-gemini checks "${tag}"`, chatGeminiBlock.includes(`"${tag}"`))
  }

  // Scoped to the function bodies, not the whole file — the header comments
  // documenting this bug (deliberately) mention the phantom tag names.
  console.log(`\n[3] Regression guard: chat-gemini's buildDietarySafetyBlock never reintroduces the phantom "pork-free"/"seafood-free" checks`)
  check('chat-gemini buildDietarySafetyBlock has no "pork-free" literal', !chatGeminiBlock.includes('"pork-free"'))
  check('chat-gemini buildDietarySafetyBlock has no "seafood-free" literal', !chatGeminiBlock.includes('"seafood-free"'))

  console.log(`\n[4] Regression guard: generate-meals's buildDietarySafetyBlock never reintroduces the phantom checks either`)
  check('generate-meals buildDietarySafetyBlock has no "pork-free" literal', !generateMealsBlock.includes('"pork-free"'))
  check('generate-meals buildDietarySafetyBlock has no "seafood-free" literal', !generateMealsBlock.includes('"seafood-free"'))

  console.log(`\n[5] DIETARY_PREFERENCES itself has no duplicates and covers all 17 onboarding categories`)
  check('exactly 17 preferences', DIETARY_PREFERENCES.length === 17, DIETARY_PREFERENCES)
  check('no duplicate tags', new Set(DIETARY_PREFERENCES).size === DIETARY_PREFERENCES.length, DIETARY_PREFERENCES)
  check('fish-free is present (round 2 — contains_fish had no standalone lane)', DIETARY_PREFERENCES.includes('fish-free'))

  // -------------------------------------------------------------------------
  // Round 2: the fail-open fix. An unrecognised preference used to be dropped
  // silently, and an ALL-unrecognised set returned ok:true with the meal
  // completely unchecked. Both are now hard failures.
  // -------------------------------------------------------------------------
  const { validateMealAgainstDiet } = await import('../src/lib/diet-rules')
  const { lookupIngredient } = await import('../src/lib/food-db')
  const chickenMeal = [{ name: 'chicken breast', quantity: 150, unit: 'g' as const }]
  const salmonMeal = [{ name: 'salmon', quantity: 150, unit: 'g' as const }]
  const fishSauceMeal = [{ name: 'fish sauce', quantity: 15, unit: 'g' as const }]

  console.log(`\n[6] Unrecognised preferences fail closed`)
  const unknownOnly = validateMealAgainstDiet(chickenMeal, ['definitely-not-a-diet'])
  check('an all-unrecognised set is NOT ok (the old ok:true fail-open is gone)', unknownOnly.ok === false, unknownOnly)
  check('the unrecognised value is surfaced for the caller', unknownOnly.unrecognisedPreferences.includes('definitely-not-a-diet'), unknownOnly)

  const mixed = validateMealAgainstDiet(salmonMeal, ['fish-free', 'not-a-real-tag'])
  check('mixed known+unknown still enforces the known rule', mixed.ok === false && mixed.violations.some(v => v.preference === 'fish-free'), mixed)
  check('mixed known+unknown still surfaces the unknown', mixed.unrecognisedPreferences.includes('not-a-real-tag'), mixed)

  const clean = validateMealAgainstDiet(chickenMeal, ['fish-free'])
  check('a genuinely compliant meal still passes, with nothing unrecognised', clean.ok === true && clean.unrecognisedPreferences.length === 0, clean)

  const noPrefs = validateMealAgainstDiet(chickenMeal, [])
  check('no restrictions at all still passes (unrestricted is not the same as unrecognised)', noPrefs.ok === true, noPrefs)

  console.log(`\n[7] Object.prototype keys are treated as unrecognised, not as rules`)
  for (const proto of ['constructor', 'toString', 'hasOwnProperty']) {
    let threw = false
    let res: ReturnType<typeof validateMealAgainstDiet> | null = null
    try { res = validateMealAgainstDiet(chickenMeal, [proto]) } catch { threw = true }
    check(`"${proto}" does not throw`, !threw)
    check(`"${proto}" is classified unrecognised`, res != null && res.unrecognisedPreferences.includes(proto), res)
  }

  console.log(`\n[8] fish-free catches hidden fish, not just fillets`)
  check('fish-free rejects salmon', validateMealAgainstDiet(salmonMeal, ['fish-free']).ok === false)
  check('fish-free rejects fish sauce (the case a name match would miss)', validateMealAgainstDiet(fishSauceMeal, ['fish-free']).ok === false)
  check('fish-free does not reject chicken', validateMealAgainstDiet(chickenMeal, ['fish-free']).ok === true)

  // -------------------------------------------------------------------------
  // Allergen round: peanuts count as nuts. These three entries used to assert
  // contains_nuts: false (peanut butter, peanuts) or carry no tags at all
  // (peanut oil), so a nut-free profile was served peanut butter with ok:true
  // and zero violations. Botanically peanuts are legumes; 'nut-free' is a
  // safety checkbox, not a botanical classification. These assertions exist so
  // nobody "corrects" the tags back on botanical grounds.
  // -------------------------------------------------------------------------
  console.log(`\n[9] nut-free rejects peanuts, peanut butter and peanut oil`)
  const peanutSources: [string, number][] = [
    ['peanut butter', 30],
    ['peanuts', 40],
    ['peanut oil', 15],
  ]
  for (const [name, grams] of peanutSources) {
    const entry = lookupIngredient(name)
    check(`"${name}" resolves to a food-db entry`, entry !== null, name)
    check(`"${name}" is tagged contains_nuts`, entry?.tags.contains_nuts === true, entry?.tags)

    const meal = [{ name, quantity: grams, unit: 'g' as const }]
    const res = validateMealAgainstDiet(meal, ['nut-free'])
    check(`nut-free REJECTS a meal containing "${name}"`, res.ok === false, res)
    check(`the violation names nut-free and the ingredient`, res.violations.some(v => v.preference === 'nut-free' && v.ingredient.includes('peanut')), res.violations)
  }

  // Mixed meal: the peanut source is one ingredient among several compliant
  // ones — the whole meal must still be rejected, not diluted to a pass.
  const mixedPeanutMeal = [
    { name: 'chicken breast', quantity: 150, unit: 'g' as const },
    { name: 'white rice cooked', quantity: 180, unit: 'g' as const },
    { name: 'peanut oil', quantity: 10, unit: 'g' as const },
  ]
  check('nut-free rejects a mixed meal where only the oil is a peanut source',
    validateMealAgainstDiet(mixedPeanutMeal, ['nut-free']).ok === false)

  // Guard the tree-nut side didn't regress while flipping the peanut side.
  check('nut-free still rejects almonds (tree nut, unchanged)',
    validateMealAgainstDiet([{ name: 'almonds', quantity: 30, unit: 'g' }], ['nut-free']).ok === false)
  check('nut-free still passes a genuinely nut-free meal',
    validateMealAgainstDiet([{ name: 'chicken breast', quantity: 150, unit: 'g' }], ['nut-free']).ok === true)

  // The Deno-side table is a hand-maintained duplicate that nothing currently
  // reads for tags — guarded here so the two cannot drift on a SAFETY fact.
  console.log(`\n[10] the Deno-side _shared/food-db.ts agrees on the peanut tags`)
  const sharedSrc = readFileSync(join(ROOT, 'supabase/functions/_shared/food-db.ts'), 'utf-8')
  for (const name of ['peanut butter', 'peanuts', 'peanut oil']) {
    const line = sharedSrc.split('\n').find(l => l.includes(`f('${name}'`))
    check(`_shared food-db declares "${name}"`, line !== undefined)
    check(`_shared "${name}" is contains_nuts: true`, line?.includes('contains_nuts: true') === true, line?.trim())
  }

  if (failures > 0) {
    console.error(`\n${failures} diet-tag-sync check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll diet-tag-sync checks passed.')
}

main()
