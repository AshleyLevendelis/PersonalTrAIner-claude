// ---------------------------------------------------------------------------
// test:reference-weight — per-kilo nutrition is worked out from a reference weight (18 Nov 2026, CSCS).
//
// Found by serving two weeks of meals to ten people: a 120 kg woman of 160 cm was set 240 g of protein inside 1,808
// kcal (2 g per kg of TOTAL weight), the carb floor engaged, no breakfast fitted and every day read ~500 kcal under.
// Protein needs follow lean mass, so above a BMI of 30 only a quarter of the extra weight counts
// (macro-calculator.ts nutritionReferenceWeightKg). This holds:
//   1. nobody at or under a BMI of 30 moves by a gram; above it the rule is the written one, continuous and rising
//   2. her targets are servable numbers, and energy still reads her real weight
//   3. the periodised (dynamic) day uses it too
//   4. her meal plan can actually be served from the library
//   5. the screens say why, in words about protein and never about her
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const mc = await import('../src/lib/macro-calculator')
  const { referenceWeightLine } = await import('../src/lib/coach-voice')
  const ref = mc.nutritionReferenceWeightKg
  const person = (o: Partial<UserProfile>): UserProfile => ({
    id: 'x', activity_level: 'sedentary', training_days: [], concurrent_activities: [], training_experience: 'intermediate',
    dietary_preferences: [], fitness_goal: 'fat_loss', gender: 'female', age: 45, ...o,
  } as unknown as UserProfile)
  const her = person({ weight_kg: 120, height_cm: 160 })
  const him = person({ weight_kg: 130, height_cm: 178, gender: 'male' })
  const lean = person({ weight_kg: 85, height_cm: 180, gender: 'male', age: 35, activity_level: 'light' })

  console.log('\n1. The rule')
  check('at a BMI of 26 the reference weight is the bodyweight (85 kg at 180 cm)', ref(85, 180) === 85, ref(85, 180))
  check('...and exactly at a BMI of 30 too (97.2 kg at 180 cm)', ref(97.2, 180) === 97.2, ref(97.2, 180))
  check('...and for a light person', ref(50, 150) === 50 && ref(62, 165) === 62)
  check('above it a quarter of the extra counts: 120 kg at 160 cm is 87.6 kg', ref(120, 160) === 87.6, ref(120, 160))
  check('...and 130 kg at 178 cm is 103.8 kg', ref(130, 178) === 103.8, ref(130, 178))
  check('it is continuous at the line: one kilo over a BMI of 30 moves the reference by a quarter of a kilo', Math.abs(ref(98.2, 180) - 97.45) < 0.06, ref(98.2, 180))
  let rising = true
  for (let w = 60; w < 200; w += 0.5) if (ref(w + 0.5, 170) < ref(w, 170)) rising = false
  check('a heavier person never gets a lower reference weight', rising)
  check('with no height there is nothing to work from, so the bodyweight stands', ref(100, null) === 100 && ref(100, 0) === 100)

  console.log('\n2. Her targets')
  const t = mc.getStaticDailyMacros(her)!
  check('her protein is 175 g (2.0 x 87.6), not 240', t.protein === 175, t)
  check('...the carb floor no longer engages (carbs well over 50 g)', t.carbs > 100, t)
  check('...fat is not pushed up by a floor read off 120 kg (0.6 x 87.6 = 53)', t.fat === 53, t)
  check('...protein is under 42% of her calories (it was 53%)', t.protein * 4 / t.calories < 0.42, t.protein * 4 / t.calories)
  const d = mc.getMacroDerivation(her)!
  check('her BMR still reads her real weight (10 x 120 + 6.25 x 160 - 5 x 45 - 161 = 1814)', d.bmr === 1814, d.bmr)
  check('...and the sheet is handed the reference weight', d.referenceWeightKg === 87.6, d.referenceWeightKg)
  check('a beginner her size gets 1.6 x 87.6 = 140 g', mc.getStaticDailyMacros(person({ weight_kg: 120, height_cm: 160, training_experience: 'beginner' }))!.protein === 140)
  check('his protein is 208 g (2.0 x 103.8), not 260', mc.getStaticDailyMacros(him)!.protein === 208, mc.getStaticDailyMacros(him))
  const tl = mc.getStaticDailyMacros(lean)!
  check('a man at a BMI of 26 is untouched: 170 g of protein from his 85 kg', tl.protein === 170 && mc.getMacroDerivation(lean)!.referenceWeightKg === 85, tl)

  console.log('\n3. The periodised day')
  const dyn = mc.calculateDailyMacros(person({ weight_kg: 120, height_cm: 160, macro_calculation_mode: 'DYNAMIC_CSCS' }), 'Monday', [])!
  check('a rest day\'s protein is 2.2 x 87.6 = 193 g, not 264', dyn.protein === 193, dyn)
  // Carbs per kilo bind only where the fat floor does not take them back: a maintenance goal (2.0 g/kg on a rest day).
  const dynMaint = mc.calculateDailyMacros(person({ weight_kg: 120, height_cm: 160, fitness_goal: 'functional', macro_calculation_mode: 'DYNAMIC_CSCS' }), 'Monday', [])!
  check('...and a maintenance rest day\'s carbs are 2.0 x 87.6 = 175 g, not 240', dynMaint.carbs === 175, dynMaint)
  check('...its fat floor is read off the reference weight too (never under 0.6 x 87.6 = 53)', dyn.fat === 53, dyn)
  const dynLean = mc.calculateDailyMacros(person({ weight_kg: 85, height_cm: 180, gender: 'male', macro_calculation_mode: 'DYNAMIC_CSCS' }), 'Monday', [])!
  check('a BMI-26 rest day is untouched (2.2 x 85 = 187 g)', dynLean.protein === 187, dynLean)

  console.log('\n4. Her plan can be served')
  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { fitDishToBudget } = await import('../src/lib/meal-library')
  const { computeSlotBudgets, verifyProposal } = await import('../src/lib/meal-generation')
  const budgets = computeSlotBudgets(t, 3, true)
  const fits = (slot: 'breakfast' | 'lunch' | 'dinner') => MEAL_LIBRARY.filter(dish => dish.slot === slot)
    .filter(dish => verifyProposal(fitDishToBudget(dish, budgets[slot]!).dish, slot, budgets[slot]!, [], []) != null).length
  const b = fits('breakfast'), l = fits('lunch'), dn = fits('dinner')
  check('at least 20 library breakfasts fit her breakfast (0 fitted at 240 g)', b >= 20, b)
  check('...and at least 40 lunches and 40 dinners', l >= 40 && dn >= 40, { l, dn })

  console.log('\n5. The screens say why')
  const line = referenceWeightLine(87.6)
  check('the line names the weight used, rounded', /\b88 kg\b/.test(line), line)
  check('...gives the reason as a fact about protein', /protein needs follow muscle/.test(line), line)
  check('...and never a label or a BMI', !/\b(bmi|obes|overweight|too heavy|excess)\b/i.test(line), line)
  const nd = strip(readFileSync('src/components/NutritionDisplay.tsx', 'utf8'))
  check('Nutrition draws it only when the reference is below his weight', /derivation\.referenceWeightKg < effectiveProfile\.weight_kg && \(\s*<p data-testid="reference-weight-note"[^>]*>\{referenceWeightLine\(derivation\.referenceWeightKg\)\}/.test(nd))
  check('...and the split preview is worked out from the same weight as the targets', /effectiveWeightKg=\{nutritionReferenceWeightKg\(effectiveProfile\.weight_kg!, effectiveProfile\.height_cm\)\}/.test(nd))

  console.log('\n6. The coach is told')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const coach = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the chat sends the reference weight only when it is lower than the weight the targets use, worked out from that same weight', /nutrition_reference_weight_kg: \(ref => \(targetBasisKg != null && ref < targetBasisKg \? ref : null\)\)\(nutritionReferenceWeightKg\(targetBasisKg \?\? 0, profile\.height_cm\)\)/.test(chat))
  const coachLine = coach.split('\n').find(l => l.startsWith('${context.nutrition_reference_weight_kg ?')) ?? ''
  check('the coach is told the weight, told never to work protein out per kilo of the full weight, and given no label for the body', /WORKED OUT FROM \$\{Math\.round\(context\.nutrition_reference_weight_kg\)\} kg/.test(coachLine) && /Never work protein or fat out per kilo of their full weight/.test(coachLine) && !/\b(bmi|obes|overweight)\b/i.test(coachLine) && /: ''\}$/.test(coachLine), coachLine.slice(0, 200))
  check('...right under the targets it explains', coach.indexOf("The user's daily targets are ${context.macros.calories} kcal") > 0 && coach.indexOf('${context.nutrition_reference_weight_kg ?') - coach.indexOf("The user's daily targets are ${context.macros.calories} kcal") < 400)

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exitCode = 1; return }
  console.log('Per-kilo nutrition follows a reference weight above a BMI of 30, energy follows the real one.')
}
main().catch(e => { console.error(e); process.exit(1) })
