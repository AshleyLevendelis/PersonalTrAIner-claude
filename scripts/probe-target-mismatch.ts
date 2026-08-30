// ---------------------------------------------------------------------------
// TWO CALORIE NUMBERS ON ONE SCREEN — which, if either, is wrong?
//
// Ashley's Nutrition tab showed a ring reading "2887 KCAL · OF 1801" above a
// card headed "How your targets are set" whose TARGET column read 1983.
//
// I DIAGNOSED THIS WRONG FIRST, and this file is why the second attempt was
// right. Working backwards from 1801 with textbook BMR arithmetic in my head,
// I inferred the app must be holding a stale ~70kg weight somewhere, and told
// her she was being under-fed by ~180 kcal a day. Running the real functions:
// NO weight between 60 and 90 kg produces 1801. The macro split had been
// saying so the whole time — a different WEIGHT scales every macro together,
// but her carbs differed by 67g while fat differed by 2g. That is the
// signature of a different CALCULATION, not a different body.
//
// What it actually is: 1801 is the DYNAMIC_CSCS per-day target (exact match on
// all four values), and 1983 is the STATIC baseline the derivation card
// always explains, by deliberate design (see NutritionDisplay's "Turn 10"
// comment). Both numbers are correct. Neither is labelled well enough to tell
// them apart, which is the actual defect and a much smaller one.
//
// Kept because the arithmetic-in-my-head version was persuasive and wrong,
// and the only thing that settled it was calling the app's own code.
// ---------------------------------------------------------------------------
import { computeTargets } from '../src/lib/nutrition-targets'
import { getMacroDerivation } from '../src/lib/macro-calculator'
import type { UserProfile } from '../src/lib/types'

const base = (o: Partial<UserProfile> = {}): UserProfile => ({
  age: 37, gender: 'male', height_cm: 178, weight_kg: 87,
  activity_level: 'light', fitness_goal: 'fat_loss',
  macro_calculation_mode: 'STANDARD_STATIC',
  training_days: [], dietary_preferences: [], injuries: [],
  ...o,
} as unknown as UserProfile)

console.log('=== the card: getMacroDerivation(profile at 87kg) ===')
for (const act of ['sedentary', 'light', 'moderate', 'active', 'very_active']) {
  const d = getMacroDerivation(base({ activity_level: act as never }))
  if (!d) { console.log(`${act}: null`); continue }
  const hit = d.bmr === 1803 && d.tdee === 2479 ? '   <-- MATCHES THE SCREENSHOT' : ''
  console.log(`${act.padEnd(12)} BMR ${d.bmr}  TDEE ${d.tdee}  target ${d.target.calories}${hit}`)
}

console.log('\n=== the ring: computeTargets with an anchor weight, which weight yields 1801? ===')
for (let kg = 60; kg <= 90; kg += 1) {
  const t = computeTargets(base({ activity_level: 'light' }), { latestWeightKg: kg })
  if (!t) continue
  if (Math.abs(t.calories - 1801) <= 2) console.log(`  anchor ${kg}kg -> ${t.calories} kcal   <-- this is the ring's number`)
}

console.log('\n=== and at her real weight ===')
const at87 = computeTargets(base({ activity_level: 'light' }), { latestWeightKg: 87 })
console.log('  anchor 87kg ->', at87?.calories, 'kcal, protein', at87?.protein, 'carbs', at87?.carbs, 'fat', at87?.fat)
console.log('  screenshot ring targets: 1801 kcal, protein 191, carbs 131, fat 57')

console.log('\n=== is 1801 the DYNAMIC (per-day) target for Sunday? ===')
for (const day of ['Sunday', 'Monday', 'Saturday']) {
  const t = computeTargets(base({ activity_level: 'light', macro_calculation_mode: 'DYNAMIC_CSCS' }), { latestWeightKg: 87, dayName: day, exercisePlan: [] })
  const hit = t && Math.abs(t.calories - 1801) <= 3 ? '   <-- MATCHES THE RING' : ''
  console.log(`  ${day.padEnd(9)} ${t ? `${t.calories} kcal, P${t.protein} C${t.carbs} F${t.fat}` : 'null'}${hit}`)
}
console.log('  screenshot ring:  1801 kcal, P191 C131 F57')
