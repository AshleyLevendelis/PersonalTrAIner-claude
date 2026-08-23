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
  canDeclineSlot,
  isSlotRequired,
  isSlotApplicable,
  offeredOptionsFor,
  toggleValue,
  buildSlotCatalog,
  PROFILE_CONSTANTS,
  INJURY_OPTIONS,
  DIETARY_OPTIONS,
  isStartingFromNothing,
  detectAllergenTags,
  type OnboardingSlotValues,
  type SlotKey,
} from '../src/lib/onboarding-slots'
import { DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { getFlaggedJoints } from '../src/lib/exercise-plan'
import { isStartingOut } from '../src/lib/starting-out'
import type { UserProfile } from '../src/lib/types'

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
// The time-of-day question is gone (it produced byte-identical plans), so
// preferred_time is now a fixed default rather than a collapse. Both of its
// consumers already fall back to the same value on their own.
check('preferred_time defaults to morning now the question is gone', p.preferred_time === 'morning')
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
// Counted through isSlotRequired, not the raw `required` flag: a
// conditionally-required slot (the working-lift question, which only applies
// once we know they'll be lifting barbells) is correctly NOT missing on fresh
// values, because it does not yet apply to anyone.
check(
  'fresh values: every applicable required slot missing',
  missingFresh.length === ONBOARDING_SLOTS.filter(s => isSlotRequired(s, fresh)).length,
  `got ${missingFresh.length}`,
)
check('the working-lift question is not among them', !missingFresh.includes('knowsWorkingLifts'))
check('full values: nothing missing', missingRequiredSlots(fullValues()).length === 0, JSON.stringify(missingRequiredSlots(fullValues())))
const unasked = unconfirmedOptionalSlots(new Set())
check('injuries must be explicitly asked', unasked.includes('injuries'))
check('dietaryPreferences must be explicitly asked', unasked.includes('dietaryPreferences'))
check('known-lift numbers never block', !unasked.includes('knownSquatKg') && !unasked.includes('knownBenchKg') && !unasked.includes('knownDeadliftKg'))
check('all-confirmed clears the list', unconfirmedOptionalSlots(new Set(ONBOARDING_SLOTS.map(s => s.key))).length === 0)

console.log('\n5b. Refusal: what a user is allowed to decline')
// THE TRAP: age/height/weight/gender are required:false but were held by
// unconfirmedOptionalSlots until confirmed, and confirmed only came from a
// value that validated — so declining meant never reaching Generate. These
// assert the escape hatch exists AND that it stops exactly where it should.
const BODY_METRICS: SlotKey[] = ['age', 'heightCm', 'weightKg', 'gender']
for (const key of BODY_METRICS) {
  check(`${key} can be declined`, canDeclineSlot(getSlotDef(key)!, fresh))
}
const SAFETY_AND_ESSENTIAL: SlotKey[] = [
  'fitnessGoal', 'trainingDays', 'equipment', 'trainingExperience',
  'sessionDuration', 'trainingStyle', 'recoveryCapacity',
]
for (const key of SAFETY_AND_ESSENTIAL) {
  check(`${key} can NOT be declined`, !canDeclineSlot(getSlotDef(key)!, fresh))
}
// Declining is recorded as "asked and answered" with no value — the same
// shape the client produces — so the completion gate must clear.
const declinedAll = new Set(ONBOARDING_SLOTS.map(s => s.key))
check(
  'a profile that declined every optional slot still completes',
  unconfirmedOptionalSlots(declinedAll, fullValues()).length === 0,
)
// ...and a declined body metric must not fabricate a number downstream.
const declinedProfile = assembleProfile({ ...fullValues(), age: null, heightCm: null, weightKg: null, gender: null })
check('declined age stays absent', declinedProfile.age === undefined)
check('declined height stays absent', declinedProfile.height_cm === undefined)
check('declined weight stays absent', declinedProfile.weight_kg === undefined)
check('declined sex stays absent', declinedProfile.gender === undefined)

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
check('catalog covers every applicable slot', catalog.length === ONBOARDING_SLOTS.filter(s => isSlotApplicable(s, initialSlotValues())).length)
check('catalog serializes closed sets', catalog.find(c => c.key === 'fitnessGoal')?.values?.length === 4)

console.log('\n9. requiredIf — genuinely conditional questions')
// A plan is a plan; there is no plan-format fork. requiredIf exists for
// questions that only mean something given another answer: the known-lift
// numbers matter only once someone says they know their lifts.
check('no planFormat slot exists (the fork was removed)', !getSlotDef('planFormat'))
const knowsLifts = { ...initialSlotValues(), knowsWorkingLifts: true }
const doesntKnow = { ...initialSlotValues(), knowsWorkingLifts: false }
for (const key of ['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg'] as SlotKey[]) {
  const def = getSlotDef(key)!
  check(`${key}: applies once they say they know their numbers`, isSlotApplicable(def, knowsLifts))
  check(`${key}: does NOT apply when they said they don't`, !isSlotApplicable(def, doesntKnow))
  check(`${key}: never blocks completion either way`, !isSlotRequired(def, knowsLifts) && !isSlotRequired(def, doesntKnow))
}
check(
  "a don't-know-my-lifts profile is never asked for a squat number, even as a skip",
  !unconfirmedOptionalSlots(new Set(), doesntKnow).some(k => k.startsWith('known')),
)

console.log('\n10. Everyone answers the same questions')
// The removed fork made six questions conditional on a category the user
// picked. They are unconditional again: the coach decides what to prescribe
// from the answers; the user never classifies themselves.
// knowsWorkingLifts is deliberately NOT in this list — see section 12. It is
// the one question that depends on what the plan will contain, rather than
// being part of finding that out.
for (const key of ['trainingExperience', 'conditioningPreference', 'equipment', 'trainingStyle', 'fitnessGoal'] as SlotKey[]) {
  check(`${key}: required for everyone`, isSlotRequired(getSlotDef(key)!, initialSlotValues()))
}
check('offeredOptionsFor hides nothing today', ONBOARDING_SLOTS.every(d => !d.options || offeredOptionsFor(d)!.length === d.options.length))

console.log('\n11. assembleProfile produces one shape of profile')
const gymProfile = assembleProfile(fullValues())
check('equipment_access present', gymProfile.equipment_access === 'home_gym')
check('training_style present', gymProfile.training_style === 'hybrid')
check('training_experience present', gymProfile.training_experience === 'novice')
check('known lifts flow when known', gymProfile.known_squat_kg === 80)
check('training_days is a 7-entry array (unguarded readers depend on it)', Array.isArray(gymProfile.training_days) && gymProfile.training_days.length === 7)
check('no plan_format field written', !('plan_format' in gymProfile))

console.log('\n12. The working-lifts question only reaches people who will lift barbells')
// Ashley: "it doesn't make sense that we ask the user their working lifts
// before even determining if weight training is right for them."
const liftsDef = getSlotDef('knowsWorkingLifts')!
const gymLifter = { ...initialSlotValues(), equipment: 'full_gym', trainingExperience: 'intermediate', activityLevel: 'light' } as OnboardingSlotValues
const homeGymLifter = { ...gymLifter, equipment: 'home_gym' } as OnboardingSlotValues
const bodyweight = { ...gymLifter, equipment: 'bodyweight' } as OnboardingSlotValues
const bands = { ...gymLifter, equipment: 'minimalist' } as OnboardingSlotValues
const startingFromNothing = { ...gymLifter, trainingExperience: 'beginner', activityLevel: 'sedentary' } as OnboardingSlotValues
const activeBeginner = { ...gymLifter, trainingExperience: 'beginner', activityLevel: 'moderate' } as OnboardingSlotValues

check('full gym + real training history → asked', isSlotApplicable(liftsDef, gymLifter))
check('home gym → asked', isSlotApplicable(liftsDef, homeGymLifter))
check('bodyweight only → never asked (no barbell in the plan)', !isSlotApplicable(liftsDef, bodyweight))
check('bands/kettlebells only → never asked', !isSlotApplicable(liftsDef, bands))
check('gym but starting from nothing → never asked (plan starts with walks)', !isSlotApplicable(liftsDef, startingFromNothing))
check('gym beginner who is already active → asked', isSlotApplicable(liftsDef, activeBeginner))

// An unanswered slot means "we don't know yet", never "assume yes" — this is
// what stops the question arriving before the coach has learned enough.
check('not asked before equipment is known', !isSlotApplicable(liftsDef, initialSlotValues()))
check(
  'not asked when equipment is known but experience/activity are not',
  !isSlotApplicable(liftsDef, { ...initialSlotValues(), equipment: 'full_gym' } as OnboardingSlotValues),
)

// Skipping it must not strand anyone at the review screen.
const bodyweightComplete = { ...fullValues(), equipment: 'bodyweight', knowsWorkingLifts: null, knownSquatKg: '', knownBenchKg: '', knownDeadliftKg: '' } as OnboardingSlotValues
check(
  'a bodyweight profile completes without ever answering it',
  missingRequiredSlots(bodyweightComplete).length === 0,
  JSON.stringify(missingRequiredSlots(bodyweightComplete)),
)
check(
  'and it is not left owing an explicit skip either',
  !unconfirmedOptionalSlots(new Set(), bodyweightComplete).includes('knowsWorkingLifts'),
)
const bwProfile = assembleProfile(bodyweightComplete)
check('unasked → calibration week, never a bogus known weight', bwProfile.skip_calibration_week === false && bwProfile.known_squat_kg === undefined)

console.log('\n13. That gate stays in step with what the engine actually prescribes')
// willBeLiftingBarbells calls the shared isStartingFromNothing helper, which
// is the values-based twin of isStartingOut's own profile-based check
// (different input shape, same two questions, same answer). If one moves
// without the other, people get asked about barbell weights for a plan made
// of walks — so assert they agree.
const asProfile = (v: OnboardingSlotValues): UserProfile =>
  ({ ...assembleProfile(fullValues()), training_experience: v.trainingExperience, activity_level: v.activityLevel } as UserProfile)
for (const [label, v] of [
  ['starting from nothing', startingFromNothing],
  ['active beginner', activeBeginner],
  ['intermediate', gymLifter],
] as const) {
  const engineSaysWalks = isStartingOut(asProfile(v))
  const weAsk = isSlotApplicable(liftsDef, v)
  check(`${label}: asked about lifts ⟺ engine prescribes lifting`, weAsk === !engineSaysWalks, `ask=${weAsk} walks=${engineSaysWalks}`)
  check(`${label}: isStartingFromNothing matches isStartingOut`, isStartingFromNothing(v) === engineSaysWalks)
}

console.log('\n14. Order — the structural fix, not just the reading order')
// A live audit found the old order broken, not just suboptimal: activityLevel
// sat LAST (position 27) despite gating both willBeLiftingBarbells here and
// the engine's own isStartingFromNothing check, so knowsWorkingLifts —
// declared 4th — could not actually be asked until the final question
// answered. Someone who volunteered their lift numbers early had them
// silently discarded, then got the barbell questions sprung on them as a
// surprise appendix. These assertions protect the fix, not just the taste.
const indexOf = (key: SlotKey) => ONBOARDING_SLOTS.findIndex(s => s.key === key)
check(
  'activityLevel resolves BEFORE knowsWorkingLifts is even reachable',
  indexOf('activityLevel') < indexOf('knowsWorkingLifts'),
  `activityLevel=${indexOf('activityLevel')} knowsWorkingLifts=${indexOf('knowsWorkingLifts')}`,
)
check(
  'equipment resolves BEFORE knowsWorkingLifts',
  indexOf('equipment') < indexOf('knowsWorkingLifts'),
  `equipment=${indexOf('equipment')} knowsWorkingLifts=${indexOf('knowsWorkingLifts')}`,
)
check(
  'trainingExperience resolves before activityLevel needs it (both routing facts land early)',
  indexOf('trainingExperience') < indexOf('activityLevel'),
)
check(
  'safety/enforcement asks (injuries, dietaryPreferences) precede the food-taste asks (cuisines, cooking time) they used to follow',
  indexOf('injuries') < indexOf('favoriteCuisines') && indexOf('dietaryPreferences') < indexOf('cookingTime'),
)
check(
  'the three body-metric numerics are adjacent and sit near the end',
  indexOf('heightCm') === indexOf('age') + 1 && indexOf('weightKg') === indexOf('heightCm') + 1,
)
check('gender — most sensitive, least gating — is declared last', indexOf('gender') === ONBOARDING_SLOTS.length - 1)

console.log('\n15. The trimmed ask set — what is allowed to block a plan')
// Each of these steers one sentence of a meal prompt or a chat greeting. They
// are still asked when the conversation goes there, and all are editable in
// the Profile screen afterwards — they just must never hold the door shut.
const NON_BLOCKING: SlotKey[] = ['displayName', 'cookingTime', 'favoriteCuisines', 'breakfastStyle']
for (const key of NON_BLOCKING) {
  check(`${key} never blocks completion`, !unconfirmedOptionalSlots(new Set()).includes(key))
  check(`${key} is not required`, !isSlotRequired(getSlotDef(key)!, fresh))
}
check('the time-of-day question is gone entirely', getSlotDef('trainingTime') === undefined)
// The safety path and the answers that genuinely reshape the plan stay put.
for (const key of ['injuries', 'dietaryPreferences'] as SlotKey[]) {
  check(`${key} still must be explicitly asked`, unconfirmedOptionalSlots(new Set()).includes(key))
}
// The headline number this trim claims, measured rather than asserted.
// Counts every slot that COULD hold a plan up — required-and-applicable
// plus ask-anyway-and-applicable — NOT how many are still unanswered, which
// is a different (and flattering) number.
const blockingFor = (v: OnboardingSlotValues) =>
  ONBOARDING_SLOTS.filter(sd => isSlotRequired(sd, v)).length + unconfirmedOptionalSlots(new Set(), v).length
// knowsWorkingLifts only applies once we know they have barbells and aren't
// starting from nothing, so the barbell profile is the worst case.
const barbell: OnboardingSlotValues = { ...initialSlotValues(), equipment: 'full_gym', trainingExperience: 'intermediate', activityLevel: 'moderate' }
console.log(`  → questions that can block a plan: ${blockingFor(fresh)} fresh, ${blockingFor(barbell)} for a barbell lifter (was 22 / 23)`)
check('fresh blocking count is down to 17 or fewer (was 22)', blockingFor(fresh) <= 17, `got ${blockingFor(fresh)}`)
check('barbell blocking count is down to 18 or fewer (was 23)', blockingFor(barbell) <= 18, `got ${blockingFor(barbell)}`)

console.log('\n16. detectAllergenTags — deterministic safety backstop, model-independent')
// A live onboarding transcript disclosed a "severe peanut allergy" and got a
// reassuring reply and a memory note — no set_slot, so meal generation never
// saw it (record_context_fact writes to a table generate-meals never reads).
// This backstop exists so a tagged allergy lands in dietaryPreferences no
// matter what the model does with it.
const trueCases: [string, string][] = [
  ['I have a severe peanut allergy', 'nut-free'],
  ['allergic to tree nuts, mostly walnuts', 'nut-free'],
  ["I'm lactose intolerant", 'dairy-free'],
  ['I have a dairy allergy', 'dairy-free'],
  ['gluten allergy, celiac actually', 'gluten-free'],
  ['allergic to eggs', 'egg-free'],
  ['I have a soy allergy', 'soy-free'],
  ['shellfish allergy, shrimp especially', 'shellfish-free'],
  ['allergic to fish', 'fish-free'],
]
for (const [text, tag] of trueCases) {
  check(`"${text}" detects ${tag}`, detectAllergenTags(text).includes(tag as any), JSON.stringify(detectAllergenTags(text)))
}
check(
  'a combined disclosure detects multiple tags in one pass',
  (() => {
    const tags = detectAllergenTags('allergic to peanuts and shellfish')
    return tags.includes('nut-free') && tags.includes('shellfish-free') && tags.length === 2
  })(),
)
const falseCases = [
  'I love fish and chips',
  'I eat a lot of nuts and seeds',
  'my go-to breakfast is eggs and toast',
  'I drink milk with my shakes',
  "let's talk about my training days",
  'I want to build more muscle',
]
for (const text of falseCases) {
  check(`"${text}" does NOT falsely detect an allergen`, detectAllergenTags(text).length === 0, JSON.stringify(detectAllergenTags(text)))
}
check(
  'the five untagged allergens (no enforcement mechanism exists) are correctly never returned',
  detectAllergenTags('allergic to celery, sesame, mustard, lupin, and sulphites').length === 0,
)

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll onboarding-slot checks passed.')
