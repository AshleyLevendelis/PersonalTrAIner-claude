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

  console.log(`\n[5] DIETARY_PREFERENCES itself has no duplicates and covers all 16 onboarding categories`)
  check('exactly 16 preferences', DIETARY_PREFERENCES.length === 16, DIETARY_PREFERENCES)
  check('no duplicate tags', new Set(DIETARY_PREFERENCES).size === DIETARY_PREFERENCES.length, DIETARY_PREFERENCES)

  if (failures > 0) {
    console.error(`\n${failures} diet-tag-sync check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll diet-tag-sync checks passed.')
}

main()
