// ---------------------------------------------------------------------------
// Gate for the shared onboarding slot definition (src/lib/onboarding-slots.ts)
// — the single source both intake surfaces (questionnaire + conversational)
// read. Checks the properties the conversational path's safety depends on:
// closed-set validation actually rejects out-of-set values, numeric bounds
// hold, the values→UserProfile transform preserves the questionnaire's exact
// historical behavior (time-of-day collapse, day expansion, known-lift
// gating, never-asked constants), completion gating counts the right slots,
// and the injury chip codes stay coupled to the engine's joint filter.
// ---------------------------------------------------------------------------

import {
  ONBOARDING_SLOTS,
  getSlotDef,
  initialSlotValues,
  assembleProfile,
  missingRequiredSlots,
  unconfirmedOptionalSlots,
  isSlotRequired,
  isSlotApplicable,
  offeredOptionsFor,
  toggleValue,
  buildSlotCatalog,
  PROFILE_CONSTANTS,
  INJURY_OPTIONS,
  DIETARY_OPTIONS,
  type OnboardingSlotValues,
  type SlotKey,
} from '../src/lib/onboarding-slots'
import { DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { getFlaggedJoints } from '../src/lib/exercise-plan'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const fullValues = (): OnboardingSlotValues => ({
  ...initialSlotValues(),
  planFormat: 'gym',
  displayName: 'Ash',
  fitnessGoal: 'fat_loss',
  trainingExperience: 'novice',
  knowsWorkingLifts: true,
  knownSquatKg: '80',
  knownBenchKg: '',
  knownDeadliftKg: '100',
  trainingDays: ['Mon', 'Wed', 'Fri'],
  recoveryCapacity: 'moderate',
  conditioningPreference: 'tolerate',
  sessionDuration: '45-60',
  trainingTime: 'midday',
  equipment: 'home_gym',
  trainingStyle: 'hybrid',
  injuries: ['knees'],
  dietaryPreferences: ['vegetarian'],
  mealsPerDay: 3,
  includeSnacks: false,
  cookingTime: 'quick',
  favoriteCuisines: ['Italian'],
  dislikedFoods: 'mushrooms, olives',
  breakfastStyle: 'cooked',
  age: '31',
  gender: 'female',
  heightCm: '168',
  weightKg: '64',
  activityLevel: 'light',
})

console.log('\n1. Structure: every single/multi slot carries its closed set')
for (const def of ONBOARDING_SLOTS) {
  if (def.control === 'single' || def.control === 'multi') {
    check(`${def.key} has options`, Array.isArray(def.options) && def.options.length >= 2)
  }
  if (def.control === 'numeric') {
    check(`${def.key} has bounds`, def.min != null && def.max != null && def.min! < def.max!)
  }
}

console.log('\n2. Closed-set validation accepts every declared value, rejects garbage')
for (const def of ONBOARDING_SLOTS) {
  if (!def.options) continue
  if (def.control === 'single') {
    const good = def.options.every(o => {
      const coerced =
        def.key === 'knowsWorkingLifts' || def.key === 'includeSnacks'
          ? String(o.value) === 'true'
          : def.key === 'mealsPerDay'
            ? Number(o.value)
            : String(o.value)
      return def.validate(coerced)
    })
    check(`${def.key} accepts all its own values`, good)
    check(`${def.key} rejects out-of-set`, !def.validate('definitely_not_a_value'))
  } else if (def.control === 'multi') {
    const first = String(def.options[0].value)
    check(`${def.key} accepts [${first}]`, def.validate([first]))
    check(`${def.key} rejects unknown member`, !def.validate([first, 'definitely_not_a_value']))
  }
}

console.log('\n3. Numeric bounds (intake now enforces what only ProfileScreen used to)')
check('age 12 rejected', !getSlotDef('age')!.validate('12'))
check('age 13 accepted', getSlotDef('age')!.validate('13'))
check('age 101 rejected', !getSlotDef('age')!.validate('101'))
check('height 99 rejected', !getSlotDef('heightCm')!.validate('99'))
check('height 175 accepted', getSlotDef('heightCm')!.validate('175'))
check('weight 24 rejected', !getSlotDef('weightKg')!.validate('24'))
check('weight 351 rejected', !getSlotDef('weightKg')!.validate('351'))
check('empty numeric rejected', !getSlotDef('age')!.validate(''))

console.log('\n4. assembleProfile preserves the questionnaire\'s exact historical transform')
const p = assembleProfile(fullValues())
check('midday collapses to morning', p.preferred_time === 'morning')
check('night collapses to evening', assembleProfile({ ...fullValues(), trainingTime: 'night' }).preferred_time === 'evening')
check('varies collapses to evening', assembleProfile({ ...fullValues(), trainingTime: 'varies' }).preferred_time === 'evening')
check('7 training-day entries', p.training_days.length === 7)
check('Mon expands available', p.training_days.find(d => d.day === 'Monday')?.available === true)
check('Tue expands unavailable', p.training_days.find(d => d.day === 'Tuesday')?.available === false)
check('constants: split', p.workout_split_preference === PROFILE_CONSTANTS.workout_split_preference)
check('constants: macro mode', p.macro_calculation_mode === 'STANDARD_STATIC')
check('constants: persona', p.coaching_persona === 'supportive')
check('known lifts flow when known', p.skip_calibration_week === true && p.known_squat_kg === 80 && p.known_bench_kg === undefined && p.known_deadlift_kg === 100)
const noLifts = assembleProfile({ ...fullValues(), knowsWorkingLifts: false, knownSquatKg: '80' })
check('known lifts gated off when not known', noLifts.skip_calibration_week === false && noLifts.known_squat_kg === undefined)
check('disliked foods split + trimmed', JSON.stringify(p.disliked_foods) === JSON.stringify(['mushrooms', 'olives']))
check('injuries pass through verbatim', JSON.stringify(p.injuries) === JSON.stringify(['knees']))
check('numerics converted', p.age === 31 && p.height_cm === 168 && p.weight_kg === 64)

console.log('\n5. Completion gating')
const fresh = initialSlotValues()
const missingFresh = missingRequiredSlots(fresh)
check('fresh values: every required slot missing', missingFresh.length === ONBOARDING_SLOTS.filter(s => s.required).length, `got ${missingFresh.length}`)
check('full values: nothing missing', missingRequiredSlots(fullValues()).length === 0, JSON.stringify(missingRequiredSlots(fullValues())))
const unasked = unconfirmedOptionalSlots(new Set())
check('injuries must be explicitly asked', unasked.includes('injuries'))
check('dietaryPreferences must be explicitly asked', unasked.includes('dietaryPreferences'))
check('known-lift numbers never block', !unasked.includes('knownSquatKg') && !unasked.includes('knownBenchKg') && !unasked.includes('knownDeadliftKg'))
check('all-confirmed clears the list', unconfirmedOptionalSlots(new Set(ONBOARDING_SLOTS.map(s => s.key))).length === 0)

console.log('\n6. Safety coupling: injury chips vs the engine\'s joint filter')
const FILTERING_CODES = ['lower_back', 'knees', 'shoulders', 'neck', 'wrists']
for (const code of FILTERING_CODES) {
  check(`'${code}' maps to a flagged joint`, getFlaggedJoints([code]).size > 0)
  check(`'${code}' is an offered chip`, INJURY_OPTIONS.some(o => o.value === code))
}
check('chip set is exactly the 8 known codes', INJURY_OPTIONS.length === 8)
check('unknown injury string flags nothing (documented inert path)', getFlaggedJoints(['it_band']).size === 0)

console.log('\n7. Dietary options stay derived from diet-rules')
check('dietary option count matches DIETARY_PREFERENCES', DIETARY_OPTIONS.length === DIETARY_PREFERENCES.length)

console.log('\n8. Helpers')
check('toggleValue adds', JSON.stringify(toggleValue(['a'], 'b')) === JSON.stringify(['a', 'b']))
check('toggleValue removes', JSON.stringify(toggleValue(['a', 'b'], 'a')) === JSON.stringify(['b']))
const catalog = buildSlotCatalog()
check('catalog covers every slot', catalog.length === ONBOARDING_SLOTS.length)
check('catalog serializes closed sets', catalog.find(c => c.key === 'fitnessGoal')?.values?.length === 4)

console.log('\n9. planFormat gate + requiredIf (activity-format profiles)')
const planFormatDef = getSlotDef('planFormat')!
check('planFormat is the FIRST slot (conversational surface asks in array order)', ONBOARDING_SLOTS[0].key === 'planFormat')
check('planFormat is required', planFormatDef.required)
check("planFormat accepts 'gym'", planFormatDef.validate('gym'))
check("planFormat accepts 'activity' (valid even while flag-hidden)", planFormatDef.validate('activity'))
check('planFormat rejects nonsense', !planFormatDef.validate('yoga_retreat'))

// The six gym-only slots identified in the trace.
const GYM_ONLY: SlotKey[] = ['trainingExperience', 'knowsWorkingLifts', 'conditioningPreference', 'equipment', 'trainingStyle']
const gymValues = { ...initialSlotValues(), planFormat: 'gym' as const }
const activityValues = { ...initialSlotValues(), planFormat: 'activity' as const }
for (const key of GYM_ONLY) {
  const def = getSlotDef(key)!
  check(`${key}: required for a gym profile`, isSlotRequired(def, gymValues))
  check(`${key}: NOT required for an activity profile`, !isSlotRequired(def, activityValues))
  check(`${key}: not applicable (never asked) for an activity profile`, !isSlotApplicable(def, activityValues))
}
// Format-agnostic slots must stay required for BOTH.
for (const key of ['displayName', 'fitnessGoal', 'trainingDays', 'age', 'weightKg'] as SlotKey[]) {
  const def = getSlotDef(key)!
  check(`${key}: still required for an activity profile`, isSlotRequired(def, activityValues))
}
check(
  'activity profile has strictly fewer required slots than gym',
  ONBOARDING_SLOTS.filter(s => isSlotRequired(s, activityValues)).length <
    ONBOARDING_SLOTS.filter(s => isSlotRequired(s, gymValues)).length,
)
check('gym-only slots never surface as unanswered optionals for activity', !unconfirmedOptionalSlots(new Set(), activityValues).some(k => GYM_ONLY.includes(k)))
check('injuries STILL must be explicitly asked on an activity profile (safety)', unconfirmedOptionalSlots(new Set(), activityValues).includes('injuries'))
check('slot catalog drops gym-only slots for an activity profile', !buildSlotCatalog(activityValues).some(c => GYM_ONLY.includes(c.key as SlotKey)))

console.log('\n10. Feature flag: activity is not OFFERED unless enabled')
// Node has no localStorage — isActivityFormatEnabled catches and fails CLOSED,
// which is exactly the state a real user is in.
check("offeredOptionsFor hides 'activity' when the flag is unavailable/off", !offeredOptionsFor(planFormatDef)!.some(o => o.value === 'activity'))
check("offeredOptionsFor still offers 'gym'", offeredOptionsFor(planFormatDef)!.some(o => o.value === 'gym'))
check('catalog sent to the model also hides it', !buildSlotCatalog(gymValues).find(c => c.key === 'planFormat')?.values?.some(v => v.value === 'activity'))

console.log('\n11. assembleProfile: activity profiles omit gym-only columns, keep training_days')
const activityProfile = assembleProfile({
  ...fullValues(),
  planFormat: 'activity',
  equipment: null,
  trainingStyle: null,
  trainingExperience: null,
  knowsWorkingLifts: null,
  conditioningPreference: null,
})
check('plan_format written', activityProfile.plan_format === 'activity')
check('equipment_access omitted (not defaulted to a claim the user never made)', activityProfile.equipment_access === undefined)
check('training_style omitted', activityProfile.training_style === undefined)
check('training_experience omitted', activityProfile.training_experience === undefined)
check('skip_calibration_week omitted', activityProfile.skip_calibration_week === undefined)
check('known lifts omitted', activityProfile.known_squat_kg === undefined)
check('conditioning_preference still populated (non-optional on UserProfile)', !!activityProfile.conditioning_preference)
check('training_days STILL a 7-entry array (unguarded readers depend on it)', Array.isArray(activityProfile.training_days) && activityProfile.training_days.length === 7)
const gymProfile = assembleProfile(fullValues())
check('gym profile unchanged: equipment_access present', gymProfile.equipment_access === 'home_gym')
check('gym profile unchanged: training_style present', gymProfile.training_style === 'hybrid')
check('gym profile unchanged: known lifts still flow', gymProfile.known_squat_kg === 80)
check('gym profile plan_format defaults correctly', gymProfile.plan_format === 'gym')

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll onboarding-slot checks passed.')
