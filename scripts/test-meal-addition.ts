/**
 * Gate: a meal the USER asked for is no less checked than one the app generated.
 *
 * "Add this to my plan" is a new route into what someone eats, and the dish
 * name and ingredient list are text a language model wrote. If that reached
 * meal_plan_slots without passing the checks a generated meal passes, the app
 * would have a second, unguarded door — the "constraint asserted at N paths,
 * missed at N+1" shape this codebase keeps producing, this time on the
 * allergen path.
 *
 * So section 1 comes first and is the one that must never go red: for EVERY
 * enforced dietary preference, a dish built around a food carrying that
 * preference's forbidden tag is refused, and refused FOR THAT REASON — not
 * incidentally, because it happened to fail some earlier check.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildMealAdditionProposal } from '../src/lib/meal-addition'
import { FORBIDDEN_TAGS, DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { FOOD_DB } from '../src/lib/food-db'
import { computeSlotBudgets } from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const TARGETS: MacroTargets = { calories: 2200, protein: 165, carbs: 220, fat: 70 }
const PROFILE_ID = 'test-profile'
const TODAY = '2026-08-27'

const build = (rawArgs: Record<string, unknown>, dietaryPreferences: string[] = [], dislikedFoods: string[] = []) =>
  buildMealAdditionProposal({
    rawArgs, profileId: PROFILE_ID, targets: TARGETS,
    mealsPerDay: 3, includeSnacks: false,
    dietaryPreferences, dislikedFoods, todayDate: TODAY,
  })

/** A dish that resolves cleanly and lands near a dinner budget, used as the neutral base every fixture is built on. */
const CLEAN_DINNER = {
  meal_slot: 'dinner',
  meal_name: 'Chicken and rice',
  ingredients: ['200g chicken breast', '150g white rice', '100g broccoli', '1 tbsp olive oil'],
  prep: 'Grill the chicken and serve, 25 minutes',
  cuisine: 'British',
}

// The DIET branch of explainRejection, and only that branch. Asserting on the
// generic "I couldn't add that" would pass for a dish rejected on coverage,
// which is exactly the false green this section exists to avoid.
const DIET_REFUSAL = /clashes with what you've told me you avoid/

console.log('\n1. THE SAFETY SECTION: every dietary preference is enforced on a user-requested dish')
{
  check('there are preferences to check, so this has teeth', DIETARY_PREFERENCES.length >= 20, DIETARY_PREFERENCES.length)

  const uncovered: string[] = []
  const styleOnly: string[] = []
  for (const pref of DIETARY_PREFERENCES) {
    const tags = FORBIDDEN_TAGS[pref]
    // 'mediterranean' is a style preference with no hard exclusions — stated
    // outright at diet-rules.ts:53 and always passing by design. It is
    // exempted here by its EMPTY TAG SET, never by its name: an exemption
    // keyed on a name is how a gate ends up asserting a real gap as correct,
    // which is exactly what the five untagged allergens had going for them
    // before this session. Give mediterranean a forbidden tag tomorrow and
    // this loop starts demanding a fixture for it.
    if (tags.length === 0) { styleOnly.push(pref); continue }

    // A food carrying one of this preference's forbidden tags, that the food
    // DB can actually resolve — so the dish reaches the diet check rather
    // than dying on coverage first.
    const offender = FOOD_DB.find(f => tags.some(t => (f.tags as Record<string, unknown>)[t] === true))
    if (!offender) { uncovered.push(pref); continue }

    const result = build({
      ...CLEAN_DINNER,
      meal_name: `Dinner with ${offender.name}`,
      ingredients: [...CLEAN_DINNER.ingredients, `50g ${offender.name}`],
    }, [pref])

    if (result.ok) {
      check(`${pref}: a dish containing ${offender.name} is refused`, false, 'ACCEPTED')
      continue
    }
    check(`${pref}: ${offender.name} refused, and refused as a diet clash`, DIET_REFUSAL.test(result.reason), result.reason)
  }
  check('every preference with forbidden tags had a food to test with', uncovered.length === 0, uncovered)
  // Named out loud rather than silently skipped: a preference that enforces
  // nothing is worth seeing in the output every run.
  check('the only preferences enforcing nothing are the documented style ones',
    styleOnly.length === 1 && styleOnly[0] === 'mediterranean', styleOnly)
  console.log(`  (${styleOnly.join(', ')} enforces no tags by design — a style preference, not a restriction)`)
}

console.log('\n2. The refusal is not just "no" — it says why, and it is the real reason')
{
  const unmeasurable = build({ ...CLEAN_DINNER, meal_name: 'Space curry', ingredients: ['200g zorblax paste', '150g quibbleroot'] })
  check('a dish the food DB cannot measure is refused, not guessed at', !unmeasurable.ok)
  check("...and says so, rather than inventing a macro", !unmeasurable.ok && /can't measure/i.test(unmeasurable.reason), (unmeasurable as { reason?: string }).reason)

  const noIngredients = build({ meal_slot: 'dinner', meal_name: 'Something nice', ingredients: [] })
  check('a dish with no ingredients is refused', !noIngredients.ok)

  const noSlot = build({ ...CLEAN_DINNER, meal_slot: 'elevenses' })
  check('an unknown slot asks which one rather than guessing', !noSlot.ok && /breakfast, lunch, dinner or a snack/.test(noSlot.reason))

  const disliked = build({ ...CLEAN_DINNER }, [], ['broccoli'])
  check('a disliked food is refused', !disliked.ok)
  check('...and names the food', !disliked.ok && /broccoli/i.test(disliked.reason), (disliked as { reason?: string }).reason)
}

console.log('\n3. An accepted dish is re-portioned and re-measured, not taken on trust')
{
  const result = build(CLEAN_DINNER)
  check('the clean fixture is accepted, so the sections above are not passing vacuously', result.ok,
    result.ok ? undefined : result.reason)
  if (result.ok) {
    const budget = computeSlotBudgets(TARGETS, 3, false).dinner!
    const m = result.payload.option.macros
    // The same two rails verifyProposal enforces on every generated meal.
    check('lands within 7% of the slot calorie budget', Math.abs(m.calories - budget.calories) / budget.calories <= 0.07,
      { got: m.calories, budget: Math.round(budget.calories) })
    check('meets the slot protein floor', m.protein >= budget.protein * 0.9, { got: m.protein, budget: Math.round(budget.protein) })

    // The model said 200g chicken. If that number survived into the payload
    // unchanged for every ingredient, nothing rescaled and the "verified"
    // claim is decoration.
    const asked = [200, 150, 100]
    const got = result.payload.option.ingredients.slice(0, 3).map(i => Math.round(i.quantity))
    check('quantities are the app\'s, not the model\'s', JSON.stringify(got) !== JSON.stringify(asked), { asked, got })

    // The stored ingredients must be PARSED, measurable objects. If a future
    // edit ever put the model's raw "200g chicken breast" strings into the
    // payload, the card would still look right and the pool row would hold
    // text nothing can re-measure — so this checks the shape, not just that
    // the numbers moved.
    check('every stored ingredient has a real quantity and unit',
      result.payload.option.ingredients.length > 0 &&
      result.payload.option.ingredients.every(i => typeof i.name === 'string' && i.name.length > 0 && Number.isFinite(i.quantity) && i.quantity > 0 && typeof i.unit === 'string' && i.unit.length > 0),
      result.payload.option.ingredients)

    check('the diff shows the verified calories', result.diff.rows.some(r => r.field === 'Calories' && r.after === `${Math.round(m.calories)} kcal`))
    check('the card says the portions were adjusted', (result.diff.implications ?? []).some(i => /Portions adjusted/.test(i.text)))
    check('the card says it becomes that day\'s meal', (result.diff.implications ?? []).some(i => /becomes your dinner/.test(i.text)))
    check('the date defaults to today when none is given', result.payload.date === TODAY)
    check('an explicit date is honoured', (() => { const r = build({ ...CLEAN_DINNER, date: '2026-09-01' }); return r.ok && r.payload.date === '2026-09-01' })())
    check('a malformed date falls back to today rather than corrupting the pick',
      (() => { const r = build({ ...CLEAN_DINNER, date: 'next friday' }); return r.ok && r.payload.date === TODAY })())
  }
}

console.log('\n4. The tool exists end to end')
{
  // test-coach-promises §1's invariant, applied to this tool specifically:
  // declared but not executed is a promise with no delivery.
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('propose_meal_addition is declared', /name:\s*"propose_meal_addition"/.test(chat))
  check('...and has an executor branch', /name === "propose_meal_addition"/.test(chat))
  check('...which writes nothing server-side (the client is the only writer)',
    !/propose_meal_addition[\s\S]{0,900}method:\s*"(POST|PATCH)"/.test(chat.slice(chat.indexOf('name === "propose_meal_addition"'))))
  check('the prompt tells the model not to state the macros itself',
    /never state its calories or macros/i.test(chat))

  const ui = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('ChatAssistant builds the proposal through the verifier',
    /propose_meal_addition'[\s\S]{0,900}buildMealAdditionProposal\(/.test(ui))
  check('...and a refusal reaches the user instead of the generic fallback',
    /return \{ text: refusal \?\?/.test(ui))
  check('there is a confirm arm', /row\.kind === 'propose_meal_addition'/.test(ui))
  check('...and an undo arm', /undoMealAddition\(/.test(ui))

  const exec = readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8')
  const addBody = exec.slice(exec.indexOf('export async function executeMealAddition'), exec.indexOf('export async function undoMealAddition'))
  // THE POOL-WIPE TRAP. persistPools deletes a slot's whole pool before
  // inserting — right for a regenerate, catastrophic for an add. Asking for
  // one curry must not silently delete the other four dinners.
  check('adding a meal never deletes the slot\'s existing options', !/\.delete\(/.test(addBody))
  check('...and appends at the next pool index', /pool_index: nextIndex/.test(addBody))
}

console.log('\n5. The verification is not optional')
{
  // The mutation this gate is built to survive: if buildMealAdditionProposal
  // stopped calling verifyProposal, section 1 would go red. Asserted
  // statically as well, because a future refactor could route around it while
  // leaving a function of the same name in place.
  const mod = readFileSync(join(ROOT, 'src/lib/meal-addition.ts'), 'utf8')
  check('buildMealAdditionProposal calls verifyProposal', /verifyProposal\(proposal, slot, budget/.test(mod))
  check('...and returns null-checks it rather than falling through', /if \(!option\) return \{ ok: false/.test(mod))
  check('the payload carries the VERIFIED option, not the raw args',
    /payload: \{ slot, date, option \}/.test(mod) && !/payload: \{[^}]*rawArgs/.test(mod))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll meal-addition checks passed.\n')
