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
  NEVER_BLOCKING_SLOTS,
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
  isStuckMessage,
  detectAllergenTags,
  type OnboardingSlotValues,
  type SlotKey,
} from '../src/lib/onboarding-slots'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { getFlaggedJoints } from '../src/lib/exercise-plan'
import { isStartingOut } from '../src/lib/starting-out'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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
// Ashley, 30 Aug 2026: "a beginner shouldn't be asked their numbers." This
// check asserted the OPPOSITE until then — an active beginner with a gym was
// asked, because the gate only excluded beginner-AND-sedentary. Her reasoning
// is that a beginner's stated number is the one the engine has already
// decided it won't prescribe off (generateMesocycle forces their calibration
// week regardless), so asking for it and then verifying it anyway is a
// question whose answer we half-distrust.
check('gym beginner who is already active → never asked either', !isSlotApplicable(liftsDef, activeBeginner))
for (const exp of ['novice', 'intermediate', 'advanced'] as const) {
  // The guard must close the question for beginners, not for everyone — the
  // cheapest way for this ruling to go wrong is a gate that silently stops
  // asking anybody, which nothing else here would catch.
  check(`gym ${exp} → still asked`, isSlotApplicable(liftsDef, { ...gymLifter, trainingExperience: exp } as OnboardingSlotValues))
}
// Every combination, so the rule can't hold for the one activity level that
// happens to be fixtured and fail for the rest.
{
  const activities = ['sedentary', 'light', 'moderate', 'active'] as const
  const equipments = ['full_gym', 'home_gym', 'bodyweight', 'minimalist'] as const
  const beginnerAsked: string[] = []
  const nonBeginnerMissed: string[] = []
  for (const equipment of equipments) {
    for (const activityLevel of activities) {
      const base = { ...gymLifter, equipment, activityLevel } as OnboardingSlotValues
      if (isSlotApplicable(liftsDef, { ...base, trainingExperience: 'beginner' } as OnboardingSlotValues)) {
        beginnerAsked.push(`${equipment}/${activityLevel}`)
      }
      const hasBarbell = equipment === 'full_gym' || equipment === 'home_gym'
      if (hasBarbell && !isSlotApplicable(liftsDef, { ...base, trainingExperience: 'advanced' } as OnboardingSlotValues)) {
        nonBeginnerMissed.push(`${equipment}/${activityLevel}`)
      }
    }
  }
  check('no beginner is asked, on any equipment × activity', beginnerAsked.length === 0, beginnerAsked)
  check('...while every barbell-owning non-beginner still is', nonBeginnerMissed.length === 0, nonBeginnerMissed)

  // The chip is only half of "asked". The model gets buildSlotCatalog and
  // writes its own prose from it, so a question absent from the card but
  // present in the catalog still gets asked — just conversationally, where
  // no chip guard applies. Ashley's ruling has to hold on both surfaces.
  const beginnerGym = { ...gymLifter, trainingExperience: 'beginner', activityLevel: 'moderate' } as OnboardingSlotValues
  const keysFor = (v: OnboardingSlotValues) => buildSlotCatalog(v).map(e => e.key)
  check(
    "the model isn't even told the question exists for a beginner",
    !keysFor(beginnerGym).includes('knowsWorkingLifts'),
  )
  check('...nor the three lift-weight questions behind it',
    !keysFor(beginnerGym).some(k => k === 'knownSquatKg' || k === 'knownBenchKg' || k === 'knownDeadliftKg'))
  check('...and is still told about it for an intermediate', keysFor(gymLifter).includes('knowsWorkingLifts'))
}

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
// This USED TO assert a biconditional — asked about lifts ⟺ engine prescribes
// lifting — because willBeLiftingBarbells and isStartingOut read the same two
// questions the same way. Ashley's 30 Aug 2026 ruling deliberately breaks the
// ⟸ half: an active beginner gets a lifting plan and is still not asked. So
// the direction worth keeping is the one that was ever about safety, and it
// is asserted on its own rather than quietly weakened inside the old ===:
//
//   engine prescribes walks ⟹ never asked about barbell weights
//
// isStartingFromNothing still has to track isStartingOut (different input
// shapes, same two questions) — it is what the doctor-note gate reads — so
// that pairing is still asserted directly, just no longer via this gate.
const asProfile = (v: OnboardingSlotValues): UserProfile =>
  ({ ...assembleProfile(fullValues()), training_experience: v.trainingExperience, activity_level: v.activityLevel } as UserProfile)
for (const [label, v] of [
  ['starting from nothing', startingFromNothing],
  ['active beginner', activeBeginner],
  ['intermediate', gymLifter],
] as const) {
  const engineSaysWalks = isStartingOut(asProfile(v))
  const weAsk = isSlotApplicable(liftsDef, v)
  check(`${label}: a walks plan is never asked about barbell weights`, !(engineSaysWalks && weAsk), `ask=${weAsk} walks=${engineSaysWalks}`)
  check(`${label}: isStartingFromNothing matches isStartingOut`, isStartingFromNothing(v) === engineSaysWalks)
}
// The half the ruling replaced, stated as its own rule so it can't rot back:
// being asked is now exactly "has a barbell, and isn't a beginner".
for (const [label, v, expected] of [
  ['sedentary beginner', startingFromNothing, false],
  ['active beginner', activeBeginner, false],
  ['intermediate', gymLifter, true],
] as const) {
  check(`${label}: asked ⟺ barbell access and not a beginner`, isSlotApplicable(liftsDef, v) === expected)
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
  'safety/enforcement asks (injuries, dietaryPreferences) precede the food-taste asks they used to follow',
  // Checked against cookingTime rather than favoriteCuisines: the cuisine and
  // breakfast questions now sit LAST in the array on purpose (they are in
  // NEVER_BLOCKING_SLOTS and are never proactively asked, so their position
  // is about catalogue tidiness, not conversation order). cookingTime is the
  // food-taste ask that is still genuinely in the sequence, so it is the one
  // that can carry this property.
  indexOf('injuries') < indexOf('cookingTime') && indexOf('dietaryPreferences') < indexOf('cookingTime'),
)
check(
  'the body-metric numerics are adjacent',
  indexOf('heightCm') === indexOf('age') + 1 && indexOf('weightKg') === indexOf('heightCm') + 1,
)
// ### REVERSED, DELIBERATELY. This used to assert 'gender — most sensitive,
// least gating — is declared last'.
//
// That reasoning was sound and is now outweighed. Sex is the most
// load-bearing of the four body values, not the least: female strength
// standards run roughly 0.53-0.67x male, so a missing or late-abandoned
// answer skews every prescribed weight further than age or height do. Asking
// the highest-impact question at the point of lowest attention was the
// original order's central fault, and gender sat at the very bottom of it.
//
// Two things make the move safe rather than merely convenient. The question
// is already framed as a calculation input — "Which should I use for your
// calorie and starting-weight maths?" — which does most of the work the
// last-position rule was doing. And it remains required: false, so anyone can
// decline and still finish, falling back to the conservative assumed body.
//
// Ashley's call, taken against the alternative of moving only age/height/
// weight and leaving sex where it was.
check(
  'sex sits WITH the other body metrics, not last',
  indexOf('gender') === indexOf('weightKg') + 1,
  `gender=${indexOf('gender')} weightKg=${indexOf('weightKg')}`,
)
check(
  '...and body metrics come before the food block',
  indexOf('gender') < indexOf('dietaryPreferences'),
  `gender=${indexOf('gender')} dietaryPreferences=${indexOf('dietaryPreferences')}`,
)

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
// A never-blocking slot must STAY in the catalog the model receives, or a
// name (or cuisine, or breakfast style) offered later in the conversation
// could never be recorded — the whole point of demoting rather than deleting.
const catalogKeys = buildSlotCatalog(fresh).map(c => c.key)
for (const key of NON_BLOCKING) {
  check(`${key} is still offered to the model`, catalogKeys.includes(key))
}
check('displayName is offered as not-required', buildSlotCatalog(fresh).find(c => c.key === 'displayName')?.required === false)
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
// The progress bar's denominator is defined independently in the component
// as "applicable AND not never-blocking". It MUST equal the blocking count
// above, or the bar goes back to promising an end that isn't there — which
// is exactly how it came to read 100% with the whole ask-anyway set left.
const barDenominator = (v: OnboardingSlotValues) =>
  ONBOARDING_SLOTS.filter(sd => isSlotApplicable(sd, v) && !NEVER_BLOCKING_SLOTS.includes(sd.key)).length
for (const [label, v] of [['fresh', fresh], ['barbell', barbell]] as [string, OnboardingSlotValues][]) {
  check(`${label}: bar denominator matches what can actually block`, barDenominator(v) === blockingFor(v), `${barDenominator(v)} vs ${blockingFor(v)}`)
}
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
// THIS CHECK USED TO ASSERT THE OPPOSITE, and that is worth recording: it
// read "the five untagged allergens (no enforcement mechanism exists) are
// correctly never returned" and passed, because at the time there was genuinely
// nothing for them to become. A gate describing a gap as correct is how a gap
// survives — it makes the missing thing look deliberate and defended. Now that
// all five have tags, the same disclosure must return all five.
check(
  'a five-allergen disclosure now returns all five, where it used to return none',
  detectAllergenTags('allergic to celery, sesame, mustard, lupin, and sulphites').length === 5,
  JSON.stringify(detectAllergenTags('allergic to celery, sesame, mustard, lupin, and sulphites')),
)


console.log('\n16b. The five that used to have nowhere to go')
{
  // Until this landed, disclosing any of these got a warm reply and a memory
  // note, and meal generation never saw it — while celery, mustard, sesame
  // oil and sesame seeds sat in food-db as servable ingredients with empty
  // tag sets. They are not theoretical.
  for (const [text, tag] of [
    ['I am allergic to sesame', 'sesame-free'],
    ['celery makes me sick', 'celery-free'],
    ['allergic to mustard', 'mustard-free'],
    ['I have a lupin allergy', 'lupin-free'],
    ['sulphites give me a reaction', 'sulphite-free'],
    ['tahini makes me ill', 'sesame-free'],
  ] as [string, string][]) {
    check(`"${text}" detects ${tag}`, detectAllergenTags(text).includes(tag as never), JSON.stringify(detectAllergenTags(text)))
  }
  // The conservative half. Naming the food is not a disclosure — over-tagging
  // strips safe food out of someone's plan, which is its own harm.
  for (const text of ['I love sesame prawn toast', 'celery is my favourite snack', 'extra mustard please']) {
    check(`"${text}" does NOT falsely detect`, detectAllergenTags(text).length === 0, JSON.stringify(detectAllergenTags(text)))
  }
}

console.log('\n16c. Every dietary preference the app offers is enforced in BOTH places')
{
  // Two independent lists have to agree with DIETARY_PREFERENCES: the
  // structural filter (FORBIDDEN_TAGS, which DIETARY_PREFERENCES is derived
  // from, so that one is safe by construction) and the generate-meals PROMPT,
  // which is a hand-written if/else chain. A preference missing from the
  // prompt is one the model is never told about, however well it is tagged.
  const gen = readFileSync(join(ROOT, 'supabase/functions/generate-meals/index.ts'), 'utf8')
  const told = new Set([...gen.matchAll(/has\("([a-z-]+)"\)/g)].map(m => m[1]))
  const missing = DIETARY_PREFERENCES.filter(p => !told.has(p))
  // "Told about" deliberately, not "filters on": mediterranean has no hard
  // exclusions by design (diet-rules.ts says so), but it was absent from the
  // block entirely, so choosing it did NOTHING — an option offered and then
  // silently ignored. It now gets a positive style steer. The invariant is
  // that no preference is silently dropped, whether it bans or leans.
  check('no preference is silently ignored by the meal generator', missing.length === 0, missing)
  check('...and there are enough to matter', DIETARY_PREFERENCES.length >= 12, DIETARY_PREFERENCES.length)
}

console.log('\n17. A chip label may share words with "I\'m stuck" — and must still answer')
// Renaming the working-lifts option to "Not sure" (Ashley, 30 Aug 2026) made
// a chip label EXACTLY match STUCK_SIGNAL's /^not sure$/. That matters
// because handleResolveSingle sends the tapped option's LABEL as the message
// text, so a tap on it read as "I don't know" and drew the rescue reply
// "No problem — here are the options." — offered to someone who had just
// answered plainly. Typing the same two words hit it via the exact-label
// backstop.
//
// The label is not the bug and is NOT what this gate protects. Ashley chose
// those words; the requirement is that the app handle the overlap. So this
// section asserts the handling, and merely REPORTS the overlap.
{
  const colliding = ONBOARDING_SLOTS.flatMap(s =>
    (s.options ?? []).filter(o => isStuckMessage(o.label)).map(o => `${s.key}:"${o.label}"`),
  )
  console.log(`  (chip labels that read as "I'm stuck": ${colliding.length ? colliding.join(', ') : 'none'})`)

  // Comments stripped before matching. This gate family has been broken and
  // silently satisfied by its own explanatory prose more than once this
  // session; a rule about code should not be provable by a sentence about it.
  const source = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  check(
    'the stuck rescue stands down when this message already answered something',
    /const userWasStuck = isStuckMessage\(trimmed\) && !answeredThisTurn/.test(source),
  )
  check(
    '...seeded from the control paths (a tap, a card, a decline)',
    /let answeredThisTurn = !!preRecorded/.test(source),
  )
  // Two: the typed-exact-label backstop and volunteered capture. Without
  // these, typing a colliding label is still rescued instead of answered.
  check(
    '...and set by both typed-capture paths, not just taps',
    (source.match(/answeredThisTurn = true/g) ?? []).length >= 2,
    (source.match(/answeredThisTurn = true/g) ?? []).length,
  )
  // The allergen backstop sets immediateCommit for an unrelated reason
  // (a receipt it just pushed). If answeredThisTurn were the same variable,
  // disclosing an allergy would suppress a genuine "I don't know".
  check(
    '...but is NOT the same flag as immediateCommit',
    /let immediateCommit = !!preRecorded/.test(source) && /answeredThisTurn/.test(source),
  )
}

console.log('\nAll onboarding-slot checks passed.')

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
