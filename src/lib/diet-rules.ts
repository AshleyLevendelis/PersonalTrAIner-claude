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
  | 'low-fodmap'

type TagKey = keyof FoodTags

/**
 * Attributes forbidden for each preference. Most preferences are a simple
 * "reject if any of these tags is true" set. Two exceptions get special
 * handling below: 'kosher' additionally forbids meat+dairy combined in one
 * meal (not expressible as a single ingredient tag), and 'mediterranean' has
 * no hard exclusions — it's a style preference, not a restriction diet, so it
 * always passes (documented, not silently ignored).
 */
const FORBIDDEN_TAGS: Record<DietaryPreference, TagKey[]> = {
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
  paleo: ['contains_dairy', 'is_grain', 'is_legume', 'is_refined_sugar'],
  mediterranean: [],
  'dairy-free': ['contains_dairy'],
  'gluten-free': ['contains_gluten'],
  'nut-free': ['contains_nuts'],
  'egg-free': ['contains_egg'],
  'soy-free': ['contains_soy'],
  'shellfish-free': ['contains_shellfish'],
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
  preference: DietaryPreference | 'kosher-meat-dairy-mix'
  reason: string
}

export interface DietValidationResult {
  ok: boolean
  violations: DietViolation[]
}

/**
 * Validates a meal's ingredient list against a set of active dietary
 * preferences. Every ingredient must resolve via food-db AND pass every
 * active preference's forbidden-tag check. An ingredient that fails to
 * resolve at all is recorded as a violation of EVERY active preference
 * (fail-closed) rather than silently passing.
 */
export function validateMealAgainstDiet(
  ingredients: MealIngredientLine[],
  prefs: (DietaryPreference | string)[],
): DietValidationResult {
  const activePrefs = prefs.filter((p): p is DietaryPreference => p in FORBIDDEN_TAGS)
  const violations: DietViolation[] = []

  if (activePrefs.length === 0) return { ok: true, violations: [] }

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

  return { ok: violations.length === 0, violations }
}
