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

  if (failures > 0) {
    console.error(`\n${failures} diet-tag-sync check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll diet-tag-sync checks passed.')
}

main()
