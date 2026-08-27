// ---------------------------------------------------------------------------
// DIET RULES (M1) — code-level dietary enforcement, the "vegan-chicken test"
// ---------------------------------------------------------------------------
// No meal reaches a user's plan without passing validateMealAgainstDiet in
// code. The AI's tool-call instructions ("don't suggest meat to vegans") are
// a nicety for getting the FIRST proposal right — they are not the guard.
// Every one of the app's 16 onboarding dietary_preferences values (see
// DIETARY_OPTIONS in OnboardingFlow.tsx) maps to a predicate here over the
// food-db attribute tags food-db.ts already carries on every entry.
//
// FAIL CLOSED: an ingredient string that doesn't resolve to a food-db entry
// (lookupIngredient returns null) is treated as violating EVERY active
// restriction — meal-generation.ts must reject and regenerate rather than
// assume an unresolved ingredient is safe. This is the load-bearing design
// choice of this module: a false rejection (regenerate a fine meal because
// the parser missed an ingredient) is cheap; a false acceptance (serve meat
// to a vegan because an ingredient string didn't resolve) is not.
// ---------------------------------------------------------------------------

import { lookupIngredient, type FoodTags } from './food-db'
import type { MealIngredientLine } from './food-db'

export type DietaryPreference =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'keto'
  | 'low-carb'
  | 'halal'
  | 'kosher'
  | 'paleo'
  | 'mediterranean'
  | 'dairy-free'
  | 'gluten-free'
  | 'nut-free'
  | 'egg-free'
  | 'soy-free'
  | 'shellfish-free'
  | 'fish-free'
  | 'low-fodmap'
  | 'celery-free'
  | 'sesame-free'
  | 'mustard-free'
  | 'lupin-free'
  | 'sulphite-free'

type TagKey = keyof FoodTags

/**
 * Attributes forbidden for each preference. Most preferences are a simple
 * "reject if any of these tags is true" set. Two exceptions get special
 * handling below: 'kosher' additionally forbids meat+dairy combined in one
 * meal (not expressible as a single ingredient tag), and 'mediterranean' has
 * no hard exclusions — it's a style preference, not a restriction diet, so it
 * always passes (documented, not silently ignored).
 *
 * Exported (not just DIETARY_PREFERENCES, which is derived from its keys) so
 * a gate can introspect which food-db attributes are actually referenced and
 * assert none of them has zero true entries in FOOD_DB — that gap (is_grain
 * sitting at 0 while paleo referenced it) is exactly how a rule silently
 * enforced nothing. See test-diet-tag-sync.ts.
 */
export const FORBIDDEN_TAGS: Record<DietaryPreference, TagKey[]> = {
  vegetarian: ['contains_meat', 'contains_fish', 'contains_shellfish'],
  vegan: ['contains_meat', 'contains_fish', 'contains_shellfish', 'contains_dairy', 'contains_egg', 'contains_honey'],
  pescatarian: ['contains_meat'],
  // Keto/low-carb are both enforced via the same is_high_carb tag (grains,
  // starchy carbs, sugary fruit, legumes) — keto is stricter in principle
  // (net-carb ceiling) but that requires a per-meal carb budget the ingredient
  // tag model doesn't carry; this is the ingredient-level approximation the
  // task calls for.
  keto: ['is_high_carb', 'is_refined_sugar'],
  'low-carb': ['is_high_carb', 'is_refined_sugar'],
  // Halal slaughter method can't be verified from an ingredient name — this
  // enforces what IS verifiable (no pork, no alcohol) and is documented as a
  // partial check, not a full halal certification.
  halal: ['contains_pork', 'contains_alcohol'],
  // Kosher: no pork, no shellfish, plus the meat+dairy combination rule below.
  // Kosher slaughter (like halal) can't be verified from an ingredient name.
  kosher: ['contains_pork', 'contains_shellfish'],
  // is_grain used to be true on ZERO food-db entries, so this rule enforced
  // nothing — a paleo profile was served bread and pasta with ok:true. Now
  // populated on every contains_gluten:true entry that IS a grain-based
  // staple food (bread/pasta/crackers/etc, following the is_X = "this food
  // IS X" convention is_legume/is_processed_meat already use, as opposed to
  // contains_X = "this food CONTAINS X as a component") plus the naturally
  // gluten-free grains contains_gluten never reached (rice, oats, corn,
  // quinoa, buckwheat, millet, popcorn, cornflakes...). Deliberately NOT
  // populated on foods where wheat is a minor filler/thickener rather than
  // the food's identity — pork sausage (rusk filler), soy/teriyaki/hoisin
  // sauce and gravy (fermentation/thickening agent), vegan sausage (protein
  // blend) — those stay contains_gluten:true (correctly enforced by
  // gluten-free) without also being is_grain (paleo wouldn't recognise "a
  // splash of soy sauce" as "eating a grain"). Pseudocereals (quinoa,
  // buckwheat) are included: strict paleo excludes them despite them not
  // being true cereal grasses.
  paleo: ['contains_dairy', 'is_grain', 'is_legume', 'is_refined_sugar'],
  mediterranean: [],
  'dairy-free': ['contains_dairy'],
  'gluten-free': ['contains_gluten'],
  'nut-free': ['contains_nuts'],
  'egg-free': ['contains_egg'],
  'soy-free': ['contains_soy'],
  'shellfish-free': ['contains_shellfish'],
  // Dietary-safety round 2: contains_fish was already carried on every fish
  // entry (and, importantly, on worcestershire sauce and fish sauce — the
  // hidden cases a name match would sail past) but no preference consumed it
  // on its own. vegetarian/vegan reach it too; this is the standalone lane.
  'fish-free': ['contains_fish'],
  // THE FIVE THAT COULD ONLY BE REMEMBERED. Legally-declarable allergens in
  // the UK/EU alongside the seven above; until now a disclosure could reach
  // memory and nothing else, while celery, mustard, sesame oil and sesame
  // seeds sat in food-db as servable ingredients with empty tag sets.
  'celery-free': ['contains_celery'],
  'sesame-free': ['contains_sesame'],
  'mustard-free': ['contains_mustard'],
  // NO food in the database carries contains_lupin, and that is not the
  // is_grain bug repeating. is_grain was a rule over data that should have
  // existed and did not, so it silently enforced nothing while bread was
  // served. Here the absence IS the safety: there is no lupin-containing food
  // to serve. The rule exists so the day one is added it is already covered,
  // rather than the gap being rediscovered later.
  'lupin-free': ['contains_lupin'],
  'sulphite-free': ['contains_sulphites'],
  'low-fodmap': ['is_high_fodmap'],
}

/**
 * Dietary-safety audit fix — the canonical list of valid preference values,
 * derived from FORBIDDEN_TAGS's own keys rather than hand-typed, so it's
 * structurally impossible for "the list of preferences that exist" and "the
 * list of preferences this module enforces" to diverge from each other.
 * OnboardingFlow.tsx's DIETARY_OPTIONS is built FROM this array (single
 * source of truth on the src/lib side). The two Deno-side edge functions
 * (generate-meals, chat-gemini) can't import across the src/lib boundary —
 * see imperative-classifier.ts's header comment for why — so their own
 * hand-duplicated tag lists are instead guarded by
 * scripts/test-diet-tag-sync.ts, which fails if either drifts from this
 * export.
 */
export const DIETARY_PREFERENCES: DietaryPreference[] = Object.keys(FORBIDDEN_TAGS) as DietaryPreference[]

export interface DietViolation {
  ingredient: string
  preference: DietaryPreference | 'kosher-meat-dairy-mix' | 'unrecognised-preference'
  reason: string
}

export interface DietValidationResult {
  ok: boolean
  violations: DietViolation[]
  /**
   * Values in `prefs` that this module does not recognise. Previously these
   * were silently dropped — and if EVERY value was unrecognised the function
   * returned ok:true, passing the meal completely unchecked. That fail-open
   * is gone: an unrecognised restriction is now a hard failure, surfaced
   * here so the caller can say "unrecognised dietary restriction 'x'"
   * instead of reporting a generic generation failure.
   */
  unrecognisedPreferences: string[]
}

/**
 * Validates a meal's ingredient list against a set of active dietary
 * preferences. Every ingredient must resolve via food-db AND pass every
 * active preference's forbidden-tag check. An ingredient that fails to
 * resolve at all is recorded as a violation of EVERY active preference
 * (fail-closed) rather than silently passing.
 *
 * An UNRECOGNISED preference value is now also fail-closed. It used to be
 * dropped by the filter, which meant a junk value enforced nothing — and a
 * profile whose values were ALL junk got ok:true with the meal unchecked.
 * The `prefs` parameter stays deliberately wide (it reads a `string[]`
 * column, which no longer accepts free text from the UI but has no DB
 * constraint), so junk has to be caught here rather than assumed away.
 */
export function validateMealAgainstDiet(
  ingredients: MealIngredientLine[],
  prefs: (DietaryPreference | string)[],
): DietValidationResult {
  // Own-property check, NOT `in`: `in` also matches Object.prototype keys, so
  // a stored value of "constructor" would pass the filter and then blow up on
  // `for (const tag of FORBIDDEN_TAGS['constructor'])` (a function is not
  // iterable). Now it lands in unrecognised, like any other junk value.
  // hasOwnProperty.call rather than Object.hasOwn: identical semantics, but
  // Object.hasOwn needs an ES2022 lib and this project targets ES2020 —
  // not worth a project-wide compile-target bump for one predicate.
  const isKnown = (p: string): boolean => Object.prototype.hasOwnProperty.call(FORBIDDEN_TAGS, p)
  const activePrefs = prefs.filter((p): p is DietaryPreference => isKnown(p))
  const unrecognisedPreferences = prefs.filter(p => !isKnown(p)).map(String)
  const violations: DietViolation[] = []

  for (const unknown of unrecognisedPreferences) {
    violations.push({
      ingredient: '(whole meal)',
      preference: 'unrecognised-preference',
      reason: `"${unknown}" is not a dietary preference this app can enforce — rejected rather than ignored, since nothing here can prove the meal complies with it.`,
    })
  }

  // No recognised restrictions AND no junk: genuinely unrestricted, pass.
  // Note the asymmetry with the old code — that early return used to fire
  // whenever activePrefs was empty, INCLUDING when every value was junk.
  if (activePrefs.length === 0) {
    return { ok: violations.length === 0, violations, unrecognisedPreferences }
  }

  let sawMeatOrPork = false
  let sawDairy = false

  for (const line of ingredients) {
    const entry = lookupIngredient(line.name)

    if (!entry) {
      for (const pref of activePrefs) {
        violations.push({
          ingredient: line.name,
          preference: pref,
          reason: `"${line.name}" could not be resolved to a known ingredient — treated as unsafe for ${pref} rather than assumed compliant.`,
        })
      }
      continue
    }

    if (entry.tags.contains_meat || entry.tags.contains_pork) sawMeatOrPork = true
    if (entry.tags.contains_dairy) sawDairy = true

    for (const pref of activePrefs) {
      const forbidden = FORBIDDEN_TAGS[pref]
      for (const tag of forbidden) {
        if (entry.tags[tag]) {
          violations.push({
            ingredient: entry.name,
            preference: pref,
            reason: `"${entry.name}" is tagged ${tag}, which ${pref} forbids.`,
          })
        }
      }
    }
  }

  if (activePrefs.includes('kosher') && sawMeatOrPork && sawDairy) {
    violations.push({
      ingredient: '(whole meal)',
      preference: 'kosher-meat-dairy-mix',
      reason: 'Meal combines meat and dairy ingredients in the same dish, which kosher forbids regardless of individual ingredients.',
    })
  }

  return { ok: violations.length === 0, violations, unrecognisedPreferences }
}
