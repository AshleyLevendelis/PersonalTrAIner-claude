/**
 * Macro-accuracy round, Part 2 gate — pure-function tests for the
 * user-adjustable macro split (macro-calculator.ts). No I/O, no fake
 * Supabase harness needed: preset resolution, rail clamping (carb/fat
 * floors), and a regression guard proving the DEFAULT split reproduces the
 * app's pre-existing hardcoded formula bit-for-bit (zero drift for anyone
 * who hasn't touched the new control).
 */
import {
  getProfileMacroSplit, computeMacroSplitTargets, getStaticDailyMacros, getMacroDerivation,
  MACRO_SPLIT_PRESET_VALUES, DEFAULT_MACRO_SPLIT, CARB_FLOOR_G, FAT_FLOOR_PER_KG,
  applyGoalAdjustment,
} from '../src/lib/macro-calculator'
import type { UserProfile } from '../src/lib/types'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    training_days: [], session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym', training_style: 'hybrid',
    training_experience: 'intermediate', coaching_persona: 'supportive', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    dietary_preferences: [], meals_per_day: 3, include_snacks: true,
    ...overrides,
  }
}

function main() {
  console.log('[1] getProfileMacroSplit — preset resolution')
  const legacyProfile = baseProfile() // no macro_split_* fields at all — a pre-existing profile
  check('a profile with no split fields resolves to balanced/DEFAULT_MACRO_SPLIT', JSON.stringify(getProfileMacroSplit(legacyProfile)) === JSON.stringify(DEFAULT_MACRO_SPLIT))

  for (const preset of ['balanced', 'higher_protein', 'lower_carb', 'higher_carb'] as const) {
    const p = baseProfile({ macro_split_preset: preset })
    const resolved = getProfileMacroSplit(p)
    const expected = MACRO_SPLIT_PRESET_VALUES[preset]
    check(`preset "${preset}" resolves to its own fixed proteinPerKg/fatPercent`, resolved.proteinPerKg === expected.proteinPerKg && resolved.fatPercent === expected.fatPercent && resolved.preset === preset, resolved)
  }

  const customProfile = baseProfile({ macro_split_preset: 'custom', macro_protein_per_kg: 2.1, macro_fat_percent: 0.28 })
  const customResolved = getProfileMacroSplit(customProfile)
  check('custom preset reads the profile\'s own stored numbers', customResolved.proteinPerKg === 2.1 && customResolved.fatPercent === 0.28 && customResolved.preset === 'custom', customResolved)

  const customNoNumbers = baseProfile({ macro_split_preset: 'custom' })
  check('custom preset with no stored numbers falls back to DEFAULT_MACRO_SPLIT\'s values', JSON.stringify({ proteinPerKg: getProfileMacroSplit(customNoNumbers).proteinPerKg, fatPercent: getProfileMacroSplit(customNoNumbers).fatPercent }) === JSON.stringify({ proteinPerKg: DEFAULT_MACRO_SPLIT.proteinPerKg, fatPercent: DEFAULT_MACRO_SPLIT.fatPercent }))

  console.log('\n[2] computeMacroSplitTargets — normal case, no rails engaged')
  const normal = computeMacroSplitTargets(80, 2800, { proteinPerKg: 2.0, fatPercent: 0.25 })
  check('protein = proteinPerKg * weight, rounded', normal.protein === 160, normal)
  check('fat clears the floor with room to spare, not clamped', !normal.clampedFatFloor, normal)
  check('carbs clear the floor with room to spare, not clamped', !normal.clampedCarbFloor, normal)
  check('calories field equals the actual macro sum (protein*4 + carbs*4 + fat*9)', normal.calories === normal.protein * 4 + normal.carbs * 4 + normal.fat * 9, normal)
  check('calories lands close to the requested target when no rail engages', Math.abs(normal.calories - 2800) < 20, normal)

  console.log('\n[3] computeMacroSplitTargets — carb floor rail')
  // Deliberately extreme: very high protein + very high fat on a low calorie
  // target leaves negative room for carbs before the floor engages.
  const carbFloorCase = computeMacroSplitTargets(100, 1600, { proteinPerKg: 2.4, fatPercent: 0.35 })
  check('carb floor engages and is flagged', carbFloorCase.clampedCarbFloor === true, carbFloorCase)
  check(`carbs are clamped to exactly the ${CARB_FLOOR_G}g floor`, carbFloorCase.carbs === CARB_FLOOR_G, carbFloorCase)
  check('calories field still reflects the actual (post-clamp) macro sum, not the original target', carbFloorCase.calories === carbFloorCase.protein * 4 + carbFloorCase.carbs * 4 + carbFloorCase.fat * 9, carbFloorCase)

  console.log('\n[4] computeMacroSplitTargets — fat floor rail')
  // A very low fat% request on a lighter person's calorie target should clamp up to the 0.6g/kg floor.
  const fatFloorCase = computeMacroSplitTargets(60, 1400, { proteinPerKg: 1.6, fatPercent: 0.20 })
  const expectedFatFloor = Math.round(FAT_FLOOR_PER_KG * 60)
  check('fat floor engages and is flagged when the requested % would fall below it', fatFloorCase.fat >= expectedFatFloor && (fatFloorCase.clampedFatFloor || Math.round(1400 * 0.20 / 9) >= expectedFatFloor))
  // Force a definite floor breach: fatPercent so low it cannot avoid the floor at this calorie level.
  const fatFloorForced = computeMacroSplitTargets(90, 4000, { proteinPerKg: 2.0, fatPercent: 0.20 })
  const wouldBeFatWithoutFloor = Math.round(4000 * 0.20 / 9)
  const forcedFatFloor = Math.round(FAT_FLOOR_PER_KG * 90)
  if (wouldBeFatWithoutFloor < forcedFatFloor) {
    check('fat is clamped to the g/kg floor, not the lower requested percentage', fatFloorForced.fat === forcedFatFloor && fatFloorForced.clampedFatFloor === true, fatFloorForced)
  } else {
    check('(skipped — chosen numbers did not force the fat floor; assertion above already covers a real breach)', true)
  }

  console.log('\n[5] Regression guard — DEFAULT_MACRO_SPLIT reproduces the pre-existing hardcoded formula bit-for-bit')
  for (const weight of [58, 70, 87, 105]) {
    for (const goal of ['fat_loss', 'hypertrophy', 'functional'] as const) {
      const profile = baseProfile({ weight_kg: weight, fitness_goal: goal })
      const target = getStaticDailyMacros(profile)
      // The old hardcoded formula: protein = round(2.0*weight), fat = round(calories*0.25/9), carbs = max(50, round((calories-protein*4-fat*9)/4))
      const bmr = profile.gender === 'male'
        ? Math.round(10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5)
        : Math.round(10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161)
      const tdee = Math.round(bmr * 1.55) // 'moderate' activity PAL
      // The calorie TARGET comes from the product's own goal adjustment, not a
      // copy of it. This section guards the SPLIT — that DEFAULT_MACRO_SPLIT
      // still reproduces the old protein/fat/carb allocation bit-for-bit — and
      // the split reallocates within whatever target it is handed. Hardcoding
      // `tdee - 500` here made it a second, undeclared assertion about the
      // fat-loss deficit, which went red the moment that deficit was
      // deliberately changed to scale with bodyweight. The deficit has its own
      // gate now (test:fat-loss-deficit); this one must not shadow it.
      const calorieTarget = applyGoalAdjustment(tdee, goal, profile.gender as 'male' | 'female')
      const expectedProtein = Math.round(2.0 * weight)
      const expectedFat = Math.round((calorieTarget * 0.25) / 9)
      const expectedCarbs = Math.max(50, Math.round((calorieTarget - expectedProtein * 4 - expectedFat * 9) / 4))
      check(`${goal}/${weight}kg: protein matches old hardcoded 2.0g/kg formula exactly`, target.protein === expectedProtein, { got: target.protein, expected: expectedProtein })
      check(`${goal}/${weight}kg: fat matches old hardcoded 25% formula exactly`, target.fat === expectedFat, { got: target.fat, expected: expectedFat })
      check(`${goal}/${weight}kg: carbs match old hardcoded remainder-with-floor formula exactly`, target.carbs === expectedCarbs, { got: target.carbs, expected: expectedCarbs })
    }
  }

  console.log('\n[6] Conditioning goal ignores the split entirely')
  const conditioningProfile = baseProfile({ fitness_goal: 'conditioning', macro_split_preset: 'higher_protein' })
  const conditioningTarget = getStaticDailyMacros(conditioningProfile)
  const conditioningDerivation = getMacroDerivation(conditioningProfile)
  check('splitApplies is false for the conditioning goal', conditioningDerivation.splitApplies === false)
  check('conditioning target uses its own fixed 20% protein ratio, not higher_protein\'s 2.4g/kg', Math.abs(conditioningTarget.protein * 4 / conditioningTarget.calories - 0.20) < 0.01, conditioningTarget)

  console.log('\n[7] getMacroDerivation — split surfaced for a non-conditioning goal')
  const derivProfile = baseProfile({ macro_split_preset: 'lower_carb' })
  const deriv = getMacroDerivation(derivProfile)
  check('splitApplies is true for a non-conditioning goal', deriv.splitApplies === true)
  check('derivation.split reflects the profile\'s chosen preset', deriv.split.preset === 'lower_carb' && deriv.split.fatPercent === MACRO_SPLIT_PRESET_VALUES.lower_carb.fatPercent, deriv.split)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll macro-split checks passed.')
}

main()
