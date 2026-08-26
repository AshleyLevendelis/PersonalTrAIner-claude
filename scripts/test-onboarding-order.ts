// ---------------------------------------------------------------------------
// Gate for the ORDER of onboarding questions.
//
// ONBOARDING_SLOTS is an ordered array and nextSlot walks it, so the order is
// a one-literal edit — which is exactly what makes it dangerous. A slot whose
// requiredIf reads a LATER answer is not an error: isSlotApplicable simply
// returns false and the question never appears. Silent.
//
// THIS HAS ALREADY HAPPENED ONCE, and the file records it: activityLevel sat
// last "despite gating BOTH willBeLiftingBarbells above and the engine's own
// isStartingFromNothing check, so knowsWorkingLifts — declared 4th — could
// not actually be asked until the very last question was answered. An
// experienced lifter who volunteered their numbers early had them silently
// discarded."
//
// It nearly happened a second time. The reorder plan this gate ships with
// proposed moving body metrics ahead of nutrition and, in writing out the new
// sequence, dropped activityLevel from before the barbell chain — recreating
// the identical defect. The dependency below is DERIVED, not hand-listed,
// because a hand-listed one would have been written from the same wrong
// mental model that produced the mistake.
// ---------------------------------------------------------------------------

import {
  ONBOARDING_SLOTS, NEVER_BLOCKING_SLOTS, isSlotApplicable, type SlotDef,
} from '../src/lib/onboarding-slots'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const indexOf = (key: string) => ONBOARDING_SLOTS.findIndex(s => s.key === key)

/**
 * Which answers a slot's requiredIf actually reads.
 *
 * Recorded by handing the predicate a Proxy and watching which keys it
 * touches, rather than by reading the source and writing a list. A list would
 * be a second copy of the truth, drifting the moment a predicate gains a
 * condition — and this whole gate exists because the copy in someone's head
 * was already wrong once.
 */
function dependenciesOf(def: SlotDef): string[] {
  if (!def.requiredIf) return []
  const touched = new Set<string>()
  const spy = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string | symbol) {
      if (typeof prop === 'string') touched.add(prop)
      // Returning null rather than undefined matters: several predicates
      // short-circuit on `=== null`, and undefined would make them exit
      // before touching the keys further down.
      return null
    },
    has() { return true },
  })
  try { def.requiredIf(spy as never) } catch { /* a predicate that throws on a null still recorded its reads */ }
  return [...touched]
}

// ---------------------------------------------------------------------------
console.log('\n1. Every conditional question follows the answers it depends on')
// ---------------------------------------------------------------------------
{
  const violations: string[] = []
  let conditional = 0
  ONBOARDING_SLOTS.forEach((def, i) => {
    const deps = dependenciesOf(def)
    if (deps.length === 0) return
    conditional++
    for (const dep of deps) {
      const at = indexOf(dep)
      if (at === -1) { violations.push(`${def.key} reads "${dep}", which is not a slot`); continue }
      if (at >= i) violations.push(`${def.key} (#${i}) reads ${dep} (#${at}) — asked too late, so it silently never appears`)
    }
  })
  check(`no question depends on a later answer (${violations.length})`, violations.length === 0, violations.join(' | '))
  check(`...and there are conditional questions to check (${conditional})`, conditional >= 4, String(conditional))

  // The specific regression, named. willBeLiftingBarbells reads all three.
  for (const dep of ['equipment', 'trainingExperience', 'activityLevel']) {
    check(`${dep} is asked before the working-lifts question`,
      indexOf(dep) < indexOf('knowsWorkingLifts'), `${dep} #${indexOf(dep)} vs #${indexOf('knowsWorkingLifts')}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. Body metrics come before nutrition')
// ---------------------------------------------------------------------------
{
  // THE POINT OF THE REORDER. Age, height, weight and sex drive every
  // prescribed weight in the app — they are why it was once caught
  // fabricating a 50kg woman's loads for everybody. Asking them last, after
  // nine food questions, collects the most load-bearing information when
  // attention is lowest and abandonment most likely.
  const BODY = ['age', 'heightCm', 'weightKg', 'gender']
  const NUTRITION = ['dietaryPreferences', 'dislikedFoods', 'mealsPerDay', 'cookingTime', 'includeSnacks']
  const lastBody = Math.max(...BODY.map(indexOf))
  const firstNutrition = Math.min(...NUTRITION.filter(k => indexOf(k) !== -1).map(indexOf))
  check(`the last body question (#${lastBody}) precedes the first food question (#${firstNutrition})`,
    lastBody < firstNutrition, `${lastBody} vs ${firstNutrition}`)
  for (const k of BODY) check(`${k} is present`, indexOf(k) !== -1)
}

// ---------------------------------------------------------------------------
console.log('\n3. A plan can be built before the food questions begin')
// ---------------------------------------------------------------------------
{
  // The reorder's real claim: everything the TRAINING half needs comes first.
  // If a plan-shaping question still sat after the food block, moving body
  // metrics up would have solved half the problem and hidden the other half.
  const PLAN_SHAPING = [
    'fitnessGoal', 'trainingExperience', 'equipment', 'trainingDays',
    'sessionDuration', 'trainingStyle', 'conditioningPreference', 'recoveryCapacity',
    'injuries', 'age', 'heightCm', 'weightKg', 'gender',
  ]
  const firstNutrition = Math.min(...['dietaryPreferences', 'dislikedFoods', 'mealsPerDay'].map(indexOf).filter(i => i !== -1))
  const late = PLAN_SHAPING.filter(k => indexOf(k) > firstNutrition)
  check(`no plan-shaping question sits after the food block (${late.length})`, late.length === 0, late.join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n4. The order change did not lose or duplicate a question')
// ---------------------------------------------------------------------------
{
  const keys = ONBOARDING_SLOTS.map(s => s.key)
  check(`no duplicate keys (${keys.length} slots)`, new Set(keys).size === keys.length,
    keys.filter((k, i) => keys.indexOf(k) !== i).join(', '))
  // Required-ness is a property of the question, not its position — a reorder
  // that quietly made something optional would change who can finish.
  const required = ONBOARDING_SLOTS.filter(s => s.required).map(s => s.key).sort()
  check(`the required set is unchanged (${required.length})`,
    required.length >= 8, required.join(', '))
  check('every slot still has a question and a validator',
    ONBOARDING_SLOTS.every(s => s.question.length > 0 && typeof s.validate === 'function'))

  // DEMOTED IS NOT DELETED, and this check exists because that was confused
  // once. A round of the reorder deleted favoriteCuisines and breakfastStyle
  // outright, on the belief they were still being asked — they were already
  // in NEVER_BLOCKING_SLOTS and already filtered out of trackedSlots, so the
  // deletion removed nothing from the conversation and removed the only path
  // by which a volunteered cuisine could be RECORDED.
  //
  // It surfaced as `Cannot read properties of undefined (reading 'required')`
  // three files away. Named here so the next one says what it is.
  const orphans = NEVER_BLOCKING_SLOTS.filter(k => !ONBOARDING_SLOTS.some(s => s.key === k))
  check(`every never-blocking slot still exists in the catalogue (${NEVER_BLOCKING_SLOTS.length})`,
    orphans.length === 0,
    orphans.length ? `${orphans.join(', ')} — demoted, then deleted; the model can no longer record them` : '')
}

// ---------------------------------------------------------------------------
console.log('\n5. The conditional chain still actually fires')
// ---------------------------------------------------------------------------
{
  // Order alone is not enough: the gate above proves nothing depends on a
  // later answer, which is also trivially true if a predicate never returns
  // true at all. So drive the real predicate with real answers.
  const gymLifter = {
    equipment: 'full_gym', trainingExperience: 'intermediate', activityLevel: 'moderate',
    fitnessGoal: 'hypertrophy',
  } as never
  const bodyweightBeginner = {
    equipment: 'bodyweight', trainingExperience: 'beginner', activityLevel: 'sedentary',
    fitnessGoal: 'fat_loss',
  } as never
  const lifts = ONBOARDING_SLOTS.find(s => s.key === 'knowsWorkingLifts')!
  check('a full-gym intermediate IS asked about working lifts', isSlotApplicable(lifts, gymLifter))
  check('a bodyweight beginner is NOT', !isSlotApplicable(lifts, bodyweightBeginner))

  const squat = ONBOARDING_SLOTS.find(s => s.key === 'knownSquatKg')!
  check('the squat number is asked only after saying you know your lifts',
    isSlotApplicable(squat, { ...gymLifter, knowsWorkingLifts: true } as never) &&
    !isSlotApplicable(squat, { ...gymLifter, knowsWorkingLifts: false } as never))
}

console.log(failures === 0 ? '\nAll onboarding-order checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
