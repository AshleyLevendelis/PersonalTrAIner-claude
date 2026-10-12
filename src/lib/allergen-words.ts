// ---------------------------------------------------------------------------
// THE WORDS THAT NAME AN ALLERGEN OR A KIND OF FOOD A DIET RULES OUT.
//
// One list, read in two places that must agree:
//   - setup's allergy backstop (onboarding-slots.ts detectAllergenTags), which
//     turns "I'm allergic to tree nuts" into the nut-free filter;
//   - the check on a recipe's cooking steps (meal-method-check.ts), which hides
//     a method that tells someone on that filter to add the food ("finish with
//     crushed peanuts", 11 Oct 2026, tracer G's M19).
// It was a private constant inside onboarding-slots.ts until the second reader
// needed it; a copy in each would be how the two came to disagree.
//
// Leaf module: imports one type and nothing else, so the meal card can read it
// without pulling setup's slot catalogue into its chunk.
// ---------------------------------------------------------------------------

import type { DietaryPreference } from './diet-rules'

/** A food named, for each "-free" allergen restriction. Word-bounded: "nutmeg" and "coconut" are not nuts. */
export const ALLERGEN_FOOD_PATTERNS: Partial<Record<DietaryPreference, RegExp>> = {
  'nut-free': /\b(peanuts?|tree nuts?|almonds?|cashews?|walnuts?|pistachios?|hazelnuts?|pecans?|macadamia|nuts?)\b/i,
  'dairy-free': /\b(dairy|milk|lactose|cheese)\b/i,
  'gluten-free': /\b(gluten|wheat|celiac|coeliac)\b/i,
  'egg-free': /\beggs?\b/i,
  'soy-free': /\b(soy|soya|soybeans?)\b/i,
  'shellfish-free': /\b(shellfish|shrimp|prawns?|crab|lobster|crustaceans?|mollus[ck]s?|clams?|mussels?|oysters?|scallops?)\b/i,
  'fish-free': /\bfish\b/i,
  // The five that used to have no tag to become. Same conservative shape as
  // the seven above: naming the food is not enough on its own — ALLERGEN_SIGNAL
  // must also fire — so "I love sesame prawn toast" never tags anything.
  'celery-free': /\b(celery|celeriac)\b/i,
  'sesame-free': /\b(sesame|tahini|hummus|houmous)\b/i,
  'mustard-free': /\bmustard\b/i,
  'lupin-free': /\blupins?\b/i,
  'sulphite-free': /\b(sulphites?|sulfites?|sulphur dioxide|sulfur dioxide)\b/i,
}

/**
 * Words for the foods a DIET rules out, for the recipe-step check only (setup
 * records a diet from its own chips, not from these). A step that says "add the
 * bacon" to a vegetarian's dish is hidden even when the dish's ingredient list,
 * which passed the diet check, has no bacon in it.
 */
const MEAT = /\b(meat|beef|pork|lamb|mutton|veal|venison|bacon|ham|gammon|chicken|turkey|duck|sausages?|chorizo|salami|pepperoni|prosciutto|pancetta|mince|steak|lard)\b/i
const PORK = /\b(pork|bacon|ham|gammon|chorizo|salami|pepperoni|prosciutto|pancetta|lard)\b/i
const FISH = /\b(fish|salmon|tuna|cod|haddock|mackerel|sardines?|anchov(y|ies)|trout|tilapia|seabass|sea bass)\b/i
const SHELLFISH = ALLERGEN_FOOD_PATTERNS['shellfish-free']!
export const DIET_WORD_PATTERNS: Partial<Record<DietaryPreference, RegExp[]>> = {
  vegetarian: [MEAT, FISH, SHELLFISH],
  vegan: [MEAT, FISH, SHELLFISH, ALLERGEN_FOOD_PATTERNS['dairy-free']!, ALLERGEN_FOOD_PATTERNS['egg-free']!, /\bhoney\b/i],
  pescatarian: [MEAT],
  halal: [PORK],
  kosher: [PORK, SHELLFISH],
}
