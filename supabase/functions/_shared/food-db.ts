// ---------------------------------------------------------------------------
// FOOD DATABASE (M1) — the deterministic macro truth source
// ---------------------------------------------------------------------------
// SYNCED COPY of src/lib/food-db.ts, verbatim, for the chat-gemini edge
// function (Deno deploy target — no shared import surface with src/lib, see
// generate-meals's FAMILIAR_CUISINES/EXOTIC_CUISINES for the established
// precedent of this pattern). Kept in sync by hand: this file has zero
// internal imports, so a straight file copy is the sync mechanism — if
// food-db.ts changes (a fixed macro value, a new/renamed entry), copy this
// file over again. Chat-realism round: added so the chat can compute real
// macros instead of the model estimating them from memory.
// ---------------------------------------------------------------------------
// Every macro value below is per 100g of the EDIBLE, as-prepared portion
// (cooked weight for grains/meat/rice, raw weight for veg/fruit unless the
// name says "cooked"), sourced from the USDA FoodData Central / UK McCance &
// Widdowson composition-table convention — the two references publicly
// available nutrition-tracking apps converge on, and close enough to branded
// packaging that generated meals land within the ±7% scaler tolerance M1
// targets. Values are rounded to the nearest whole kcal/gram, matching how
// both source tables publish.
//
// This is a CURATED set (~275 entries) covering the proteins, carbs, fats,
// vegetables, fruit and condiments a general UK/US omnivore-through-vegan diet
// draws from — not an exhaustive branded-product database. It is meant to be
// extended; `computeMealMacros`'s `coverage`/`unmatched` return values exist
// specifically so a low-coverage meal surfaces which ingredient strings this
// table is still missing, rather than silently guessing.
//
// Every entry is tagged with diet-relevant attributes (contains_meat,
// contains_dairy, is_high_carb, etc.) — diet-rules.ts's predicates read these
// tags directly. An ingredient absent from this table cannot be tagged, so
// diet-rules.ts fails closed (treats it as violating every restriction) on
// anything computeMealMacros reports as unmatched.
// ---------------------------------------------------------------------------

export interface FoodTags {
  contains_meat?: boolean
  contains_pork?: boolean
  contains_fish?: boolean
  contains_shellfish?: boolean
  contains_dairy?: boolean
  contains_egg?: boolean
  contains_gluten?: boolean
  contains_nuts?: boolean
  contains_soy?: boolean
  contains_honey?: boolean
  contains_alcohol?: boolean
  // THE FIVE THAT HAD NO TAG AT ALL. celery, sesame, mustard, lupin and
  // sulphites are legally-declarable allergens in the UK/EU alongside the
  // seven already here, and until now a disclosure of any of them could only
  // be REMEMBERED — meal generation had nothing to filter on, while celery,
  // mustard, sesame oil and sesame seeds sat in this very file as servable
  // ingredients with empty tag sets.
  //
  // contains_lupin is declared with NO entry currently carrying it, and that
  // is deliberate rather than the is_grain bug repeating: no lupin-containing
  // food exists in this database, so a lupin allergy is already safe by
  // absence. The tag exists so that the day lupin flour is added, the rule is
  // already waiting for it instead of being remembered later.
  contains_celery?: boolean
  contains_sesame?: boolean
  contains_mustard?: boolean
  contains_lupin?: boolean
  contains_sulphites?: boolean
  is_grain?: boolean
  is_legume?: boolean
  is_refined_sugar?: boolean
  is_high_carb?: boolean
  is_high_fodmap?: boolean
  // Referenced by NO dietary preference — nothing on the Deno side reads
  // FoodTags at all today, but kept in lockstep with src/lib/food-db.ts's
  // copy. See that file's comment for the full rationale.
  is_processed_meat?: boolean
}

export type FoodCategory = 'protein' | 'carb' | 'fat' | 'veg' | 'fruit' | 'dairy' | 'condiment' | 'other'

export interface Macros100g {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface FoodEntry {
  name: string
  aliases: string[]
  per100g: Macros100g
  category: FoodCategory
  tags: FoodTags
  /** Named-unit -> gram weight, for quantities like "1 medium egg" or "2 tbsp". Water-density defaults (tbsp/tsp/cup) are applied automatically when not overridden here. */
  units?: Record<string, number>
}

function f(
  name: string,
  aliases: string[],
  per100g: Macros100g,
  category: FoodCategory,
  tags: FoodTags = {},
  units?: Record<string, number>,
): FoodEntry {
  return { name, aliases, per100g, category, tags, units }
}

export const FOOD_DB: FoodEntry[] = [
  // ===== PROTEIN: poultry & meat =====================================
  f('chicken breast', ['chicken breasts', 'grilled chicken', 'chicken breast (cooked)', 'skinless chicken breast'], { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, 'protein', { contains_meat: true }),
  f('chicken thigh', ['chicken thighs', 'boneless chicken thigh'], { kcal: 209, protein: 26, carbs: 0, fat: 10.9 }, 'protein', { contains_meat: true }),
  f('chicken drumstick', ['chicken drumsticks', 'chicken legs'], { kcal: 172, protein: 24, carbs: 0, fat: 8.1 }, 'protein', { contains_meat: true }),
  f('chicken mince', ['ground chicken', 'minced chicken'], { kcal: 143, protein: 21.7, carbs: 0, fat: 6 }, 'protein', { contains_meat: true }),
  f('turkey breast', ['turkey breasts', 'sliced turkey'], { kcal: 135, protein: 29, carbs: 0, fat: 1.7 }, 'protein', { contains_meat: true }),
  f('turkey mince', ['ground turkey', 'minced turkey'], { kcal: 148, protein: 27, carbs: 0, fat: 4 }, 'protein', { contains_meat: true }),
  f('beef mince 5% fat', ['lean beef mince', 'extra lean beef mince', '5% beef mince', 'lean ground beef', 'lean minced beef'], { kcal: 137, protein: 22, carbs: 0, fat: 5 }, 'protein', { contains_meat: true }),
  f('beef mince 20% fat', ['beef mince', 'ground beef', '20% beef mince', 'regular beef mince'], { kcal: 254, protein: 17.2, carbs: 0, fat: 20 }, 'protein', { contains_meat: true }),
  f('beef steak sirloin', ['sirloin steak', 'beef steak', 'steak', 'lean beef sirloin', 'beef sirloin strips', 'beef eye round', 'thin beef eye round slices'], { kcal: 183, protein: 27, carbs: 0, fat: 7.7 }, 'protein', { contains_meat: true }),
  f('beef rump steak', ['rump steak'], { kcal: 173, protein: 28, carbs: 0, fat: 6.5 }, 'protein', { contains_meat: true }),
  f('lamb mince', ['ground lamb', 'minced lamb'], { kcal: 218, protein: 25, carbs: 0, fat: 13 }, 'protein', { contains_meat: true }),
  f('lamb chop', ['lamb chops'], { kcal: 235, protein: 25, carbs: 0, fat: 15 }, 'protein', { contains_meat: true }),
  f('pork chop', ['pork chops', 'pork loin chop'], { kcal: 231, protein: 27, carbs: 0, fat: 13 }, 'protein', { contains_meat: true, contains_pork: true }),
  f('pork loin', ['pork tenderloin', 'pork fillet'], { kcal: 143, protein: 26, carbs: 0, fat: 3.5 }, 'protein', { contains_meat: true, contains_pork: true }),
  f('pork mince', ['ground pork', 'minced pork'], { kcal: 200, protein: 20, carbs: 0, fat: 13 }, 'protein', { contains_meat: true, contains_pork: true }),
  f('bacon', ['bacon rashers', 'streaky bacon', 'back bacon'], { kcal: 337, protein: 25, carbs: 0.5, fat: 26 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('gammon', ['gammon steak', 'ham steak'], { kcal: 145, protein: 24, carbs: 0.5, fat: 5 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('ham', ['sliced ham', 'deli ham'], { kcal: 107, protein: 18, carbs: 1.5, fat: 3 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('chorizo', ['chorizo sausage'], { kcal: 455, protein: 24, carbs: 1.9, fat: 38 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('pork sausage', ['sausages', 'pork sausages', 'breakfast sausage'], { kcal: 296, protein: 13, carbs: 8, fat: 24 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true, contains_gluten: true }),

  // ===== PROTEIN: fish & seafood ======================================
  f('salmon', ['salmon fillet', 'baked salmon', 'grilled salmon'], { kcal: 208, protein: 20, carbs: 0, fat: 13 }, 'protein', { contains_fish: true }),
  f('smoked salmon', [], { kcal: 142, protein: 18, carbs: 0, fat: 4.5 }, 'protein', { contains_fish: true, is_processed_meat: false }),
  f('tuna canned in water', ['canned tuna', 'tuna in water', 'tinned tuna'], { kcal: 116, protein: 26, carbs: 0, fat: 0.8 }, 'protein', { contains_fish: true }),
  f('tuna steak fresh', ['fresh tuna', 'tuna steak', 'seared tuna'], { kcal: 144, protein: 23.3, carbs: 0, fat: 5 }, 'protein', { contains_fish: true }),
  f('cod', ['cod fillet', 'baked cod'], { kcal: 105, protein: 23, carbs: 0, fat: 0.9 }, 'protein', { contains_fish: true }),
  f('haddock', ['haddock fillet'], { kcal: 99, protein: 22.8, carbs: 0, fat: 0.7 }, 'protein', { contains_fish: true }),
  f('tilapia', ['tilapia fillet'], { kcal: 129, protein: 26, carbs: 0, fat: 2.7 }, 'protein', { contains_fish: true }),
  f('sea bass', ['sea bass fillet'], { kcal: 124, protein: 23.5, carbs: 0, fat: 2.6 }, 'protein', { contains_fish: true }),
  f('mackerel', ['grilled mackerel'], { kcal: 205, protein: 19, carbs: 0, fat: 13.9 }, 'protein', { contains_fish: true }),
  f('sardines canned', ['sardines', 'canned sardines', 'tinned sardines'], { kcal: 208, protein: 24.6, carbs: 0, fat: 11.5 }, 'protein', { contains_fish: true }),
  f('prawns', ['shrimp', 'king prawns', 'cooked prawns'], { kcal: 99, protein: 24, carbs: 0.2, fat: 0.3 }, 'protein', { contains_shellfish: true }),
  f('crab meat', ['crab', 'white crab meat'], { kcal: 87, protein: 18, carbs: 0, fat: 1.1 }, 'protein', { contains_shellfish: true }),
  f('mussels', ['cooked mussels'], { kcal: 172, protein: 24, carbs: 7.4, fat: 4.5 }, 'protein', { contains_shellfish: true }),
  f('squid', ['calamari'], { kcal: 92, protein: 15.6, carbs: 3.1, fat: 1.4 }, 'protein', { contains_shellfish: true }),

  // ===== PROTEIN: eggs & dairy protein ================================
  f('egg', ['eggs', 'whole egg', 'boiled egg', 'fried egg', 'scrambled egg'], { kcal: 155, protein: 13, carbs: 1.1, fat: 11 }, 'protein', { contains_egg: true }, { medium: 50, large: 58, small: 44 }),
  f('egg white', ['egg whites'], { kcal: 52, protein: 11, carbs: 0.7, fat: 0.2 }, 'protein', { contains_egg: true }, { medium: 33, large: 38 }),
  f('egg yolk', ['egg yolks'], { kcal: 322, protein: 16, carbs: 3.6, fat: 27 }, 'protein', { contains_egg: true }, { medium: 17, large: 20 }),
  f('greek yoghurt 0%', ['fat free greek yogurt', 'greek yoghurt fat free', '0% greek yogurt'], { kcal: 57, protein: 10, carbs: 3.6, fat: 0.2 }, 'dairy', { contains_dairy: true }),
  f('greek yoghurt full fat', ['greek yogurt', 'full fat greek yoghurt', 'greek style yoghurt'], { kcal: 97, protein: 9, carbs: 4, fat: 5 }, 'dairy', { contains_dairy: true }),
  f('natural yoghurt', ['plain yoghurt', 'natural yogurt', 'low fat yogurt', 'low fat yoghurt'], { kcal: 61, protein: 4.3, carbs: 4.7, fat: 3.3 }, 'dairy', { contains_dairy: true }),
  f('cottage cheese', [], { kcal: 98, protein: 11, carbs: 3.4, fat: 4.3 }, 'dairy', { contains_dairy: true }),
  f('whey protein powder', ['protein powder', 'whey protein', 'whey isolate'], { kcal: 380, protein: 80, carbs: 8, fat: 5 }, 'protein', { contains_dairy: true }, { scoop: 30 }),
  f('milk whole', ['whole milk', 'full fat milk'], { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 }, 'dairy', { contains_dairy: true }),
  f('milk skimmed', ['skimmed milk', 'skim milk', 'fat free milk'], { kcal: 34, protein: 3.4, carbs: 5, fat: 0.1 }, 'dairy', { contains_dairy: true }),
  f('milk semi skimmed', ['semi skimmed milk', 'semi-skimmed milk', '2% milk'], { kcal: 46, protein: 3.4, carbs: 4.7, fat: 1.7 }, 'dairy', { contains_dairy: true }),
  f('cheddar cheese', ['cheddar', 'grated cheddar'], { kcal: 404, protein: 25, carbs: 0.1, fat: 34 }, 'dairy', { contains_dairy: true }),
  f('mozzarella', ['mozzarella cheese', 'shredded mozzarella'], { kcal: 280, protein: 28, carbs: 3.1, fat: 17 }, 'dairy', { contains_dairy: true }),
  f('feta cheese', ['feta'], { kcal: 264, protein: 14, carbs: 4, fat: 21 }, 'dairy', { contains_dairy: true }),
  f('halloumi', ['halloumi cheese', 'grilled halloumi'], { kcal: 321, protein: 21, carbs: 2, fat: 25 }, 'dairy', { contains_dairy: true }),
  f('cream cheese', [], { kcal: 342, protein: 5.9, carbs: 4.1, fat: 34 }, 'dairy', { contains_dairy: true }),
  f('parmesan', ['parmesan cheese', 'grated parmesan'], { kcal: 431, protein: 38, carbs: 4.1, fat: 29 }, 'dairy', { contains_dairy: true }),
  f('butter', ['salted butter', 'unsalted butter'], { kcal: 717, protein: 0.9, carbs: 0.1, fat: 81 }, 'fat', { contains_dairy: true }),
  f('double cream', ['heavy cream'], { kcal: 449, protein: 1.7, carbs: 2.7, fat: 48 }, 'dairy', { contains_dairy: true }),
  f('single cream', ['light cream'], { kcal: 198, protein: 2.7, carbs: 4.1, fat: 19 }, 'dairy', { contains_dairy: true }),
  f('quark', [], { kcal: 60, protein: 12, carbs: 4, fat: 0.2 }, 'dairy', { contains_dairy: true }),

  // ===== PROTEIN: plant-based =========================================
  f('tofu firm', ['tofu', 'firm tofu', 'extra firm tofu'], { kcal: 144, protein: 15.5, carbs: 3.9, fat: 8.7 }, 'protein', { contains_soy: true }),
  f('tofu silken', ['silken tofu'], { kcal: 55, protein: 5.5, carbs: 1.9, fat: 2.7 }, 'protein', { contains_soy: true }),
  f('tempeh', [], { kcal: 195, protein: 20, carbs: 7.6, fat: 11 }, 'protein', { contains_soy: true }),
  f('seitan', [], { kcal: 370, protein: 75, carbs: 14, fat: 1.9 }, 'protein', { is_grain: true, contains_gluten: true }),
  f('edamame', ['edamame beans', 'shelled edamame'], { kcal: 122, protein: 11, carbs: 8, fat: 5 }, 'protein', { contains_soy: true, is_legume: true }),
  f('chickpeas', ['garbanzo beans', 'cooked chickpeas', 'canned chickpeas'], { kcal: 164, protein: 8.9, carbs: 27, fat: 2.6 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('lentils red', ['red lentils', 'cooked red lentils'], { kcal: 116, protein: 9, carbs: 20, fat: 0.4 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('lentils green', ['green lentils', 'puy lentils', 'cooked green lentils'], { kcal: 114, protein: 9.4, carbs: 20, fat: 0.4 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('black beans', ['cooked black beans', 'canned black beans'], { kcal: 132, protein: 8.9, carbs: 24, fat: 0.5 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('kidney beans', ['red kidney beans', 'cooked kidney beans', 'canned kidney beans'], { kcal: 127, protein: 8.7, carbs: 23, fat: 0.5 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('pinto beans', ['cooked pinto beans'], { kcal: 143, protein: 9, carbs: 26, fat: 0.7 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('butter beans', ['lima beans', 'cooked butter beans'], { kcal: 113, protein: 7.6, carbs: 20, fat: 0.4 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('soy mince', ['tvp', 'textured vegetable protein', 'soy protein mince'], { kcal: 285, protein: 50, carbs: 30, fat: 1 }, 'protein', { contains_soy: true }),
  f('quorn mince', ['quorn'], { kcal: 92, protein: 12, carbs: 4.4, fat: 2.7 }, 'protein', { contains_egg: true }),
  f('quorn fillet', ['quorn fillets', 'quorn chicken pieces'], { kcal: 106, protein: 13, carbs: 6.7, fat: 2.9 }, 'protein', { contains_egg: true }),
  // PEANUTS COUNT AS NUTS HERE. Kept in lockstep with src/lib/food-db.ts's
  // copy of this entry — see the fuller rationale there. Short version:
  // 'nut-free' is a user-facing safety checkbox, not a botanical
  // classification, and peanuts are the most common severe nut allergen.
  // Over-restricting a tree-nut-only user fails safe; under-restricting a
  // peanut-allergic user does not. NOTE: nothing on the Deno side reads
  // FoodTags today (chat-gemini imports computeMealMacros only), so this is
  // currently inert here — it is fixed anyway so the two tables cannot drift
  // into disagreeing about a safety fact.
  f('peanut butter', [], { kcal: 588, protein: 25, carbs: 20, fat: 50 }, 'fat', { contains_nuts: true }, { tbsp: 16 }),
  f('almond butter', [], { kcal: 614, protein: 21, carbs: 19, fat: 56 }, 'fat', { contains_nuts: true }, { tbsp: 16 }),
  f('hummus', [], { kcal: 166, protein: 7.9, carbs: 11, fat: 9.6 }, 'other', { contains_sesame: true, is_legume: true }),

  // ===== CARB: grains, bread, potato ==================================
  f('white rice cooked', ['white rice', 'cooked rice', 'boiled rice', 'jasmine rice'], { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('brown rice cooked', ['brown rice', 'cooked brown rice'], { kcal: 123, protein: 2.7, carbs: 25, fat: 1 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('basmati rice cooked', ['basmati rice', 'cooked basmati'], { kcal: 121, protein: 2.9, carbs: 25, fat: 0.4 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('pasta cooked', ['pasta', 'penne', 'fusilli', 'spaghetti', 'cooked pasta'], { kcal: 158, protein: 5.8, carbs: 31, fat: 0.9 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('wholewheat pasta cooked', ['wholewheat pasta', 'whole wheat pasta', 'wholemeal pasta'], { kcal: 149, protein: 6.3, carbs: 30, fat: 1.1 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('white bread', ['bread', 'white bread slice', 'sliced white bread'], { kcal: 265, protein: 9, carbs: 49, fat: 3.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { slice: 36 }),
  f('wholemeal bread', ['whole wheat bread', 'brown bread'], { kcal: 247, protein: 13, carbs: 41, fat: 3.4 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { slice: 38 }),
  f('bagel', ['plain bagel'], { kcal: 257, protein: 10, carbs: 50, fat: 1.5 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 95 }),
  f('tortilla wrap', ['flour tortilla', 'wrap', 'tortilla'], { kcal: 310, protein: 8.4, carbs: 50, fat: 8 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 60 }),
  f('corn tortilla', [], { kcal: 218, protein: 5.7, carbs: 44, fat: 2.8 }, 'carb', { is_grain: true, is_high_carb: true }, { whole: 26 }),
  f('pitta bread', ['pita bread', 'pitta'], { kcal: 275, protein: 9.1, carbs: 56, fat: 1.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 60 }),
  f('couscous cooked', ['couscous'], { kcal: 112, protein: 3.8, carbs: 23, fat: 0.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('quinoa cooked', ['quinoa'], { kcal: 120, protein: 4.4, carbs: 21, fat: 1.9 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('oats', ['rolled oats', 'porridge oats', 'oatmeal'], { kcal: 379, protein: 13.5, carbs: 67.7, fat: 6.9 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('potato boiled', ['potato', 'boiled potato', 'new potatoes'], { kcal: 87, protein: 1.9, carbs: 20, fat: 0.1 }, 'carb', { is_high_carb: true }),
  f('potato baked', ['baked potato', 'jacket potato'], { kcal: 93, protein: 2.5, carbs: 21, fat: 0.1 }, 'carb', { is_high_carb: true }),
  f('mashed potato', [], { kcal: 105, protein: 1.9, carbs: 16, fat: 4 }, 'carb', { contains_dairy: true, is_high_carb: true }),
  f('sweet potato baked', ['sweet potato', 'baked sweet potato'], { kcal: 90, protein: 2, carbs: 21, fat: 0.2 }, 'carb', { is_high_carb: true }),
  f('egg noodles cooked', ['egg noodles', 'noodles'], { kcal: 138, protein: 4.5, carbs: 25, fat: 2.1 }, 'carb', { is_grain: true, contains_egg: true, contains_gluten: true, is_high_carb: true }),
  f('rice noodles cooked', ['rice noodles'], { kcal: 109, protein: 1.8, carbs: 25, fat: 0.2 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('bulgur wheat cooked', ['bulgur wheat', 'bulgur'], { kcal: 83, protein: 3.1, carbs: 18.6, fat: 0.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('polenta cooked', ['polenta'], { kcal: 85, protein: 2, carbs: 18, fat: 0.5 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('breadcrumbs', ['panko breadcrumbs'], { kcal: 395, protein: 13, carbs: 72, fat: 5.3 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('plain flour', ['flour', 'all purpose flour'], { kcal: 364, protein: 10, carbs: 76, fat: 1 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('rice cakes', [], { kcal: 387, protein: 8.2, carbs: 81, fat: 2.8 }, 'carb', { is_grain: true, is_high_carb: true }, { whole: 9 }),
  f('crackers', ['water crackers', 'wheat crackers'], { kcal: 421, protein: 9, carbs: 71, fat: 11 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('popcorn', ['air popped popcorn'], { kcal: 387, protein: 13, carbs: 78, fat: 4.5 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('tortilla chips', ['corn chips'], { kcal: 490, protein: 7, carbs: 63, fat: 24 }, 'carb', { is_grain: true, is_high_carb: true }),

  // ===== FAT: oils, nuts, seeds ========================================
  f('olive oil', ['extra virgin olive oil'], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 14, tsp: 4.5 }),
  f('vegetable oil', ['sunflower oil', 'cooking oil', 'rapeseed oil', 'canola oil'], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 14, tsp: 4.5 }),
  f('coconut oil', [], { kcal: 862, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 13, tsp: 4.5 }),
  f('avocado', [], { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7 }, 'fruit', {}, { whole: 150, half: 75 }),
  f('almonds', ['almond'], { kcal: 579, protein: 21.2, carbs: 22, fat: 49.9 }, 'fat', { contains_nuts: true }),
  f('walnuts', [], { kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2 }, 'fat', { contains_nuts: true }),
  f('cashews', ['cashew nuts'], { kcal: 553, protein: 18.2, carbs: 30.2, fat: 43.9 }, 'fat', { contains_nuts: true }),
  f('peanuts', [], { kcal: 567, protein: 25.8, carbs: 16.1, fat: 49.2 }, 'fat', { contains_nuts: true }), // see 'peanut butter' above for why this is true, not false
  f('mixed nuts', [], { kcal: 607, protein: 20, carbs: 19, fat: 54 }, 'fat', { contains_nuts: true }),
  f('pistachios', [], { kcal: 560, protein: 20.6, carbs: 27.2, fat: 45.3 }, 'fat', { contains_nuts: true }),
  f('chia seeds', [], { kcal: 486, protein: 17, carbs: 42, fat: 31 }, 'fat', {}, { tbsp: 12 }),
  f('flaxseed', ['ground flaxseed', 'linseed'], { kcal: 534, protein: 18.3, carbs: 29, fat: 42 }, 'fat', {}, { tbsp: 10 }),
  f('sunflower seeds', [], { kcal: 584, protein: 21, carbs: 20, fat: 51 }, 'fat', {}),
  f('pumpkin seeds', [], { kcal: 559, protein: 30.2, carbs: 10.7, fat: 49 }, 'fat', {}),
  f('coconut milk canned', ['coconut milk', 'canned coconut milk'], { kcal: 230, protein: 2.3, carbs: 5.5, fat: 24 }, 'fat', {}),
  f('lupin flour', ['lupin bean flour'], { kcal: 371, protein: 36.2, carbs: 10.4, fat: 9.7 }, 'carb', { contains_lupin: true }),
  f('tahini', [], { kcal: 595, protein: 17, carbs: 21, fat: 54 }, 'fat', { contains_sesame: true }, { tbsp: 15 }),

  // ===== VEG ===========================================================
  f('broccoli', ['steamed broccoli', 'broccoli florets'], { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4 }, 'veg', {}),
  f('spinach', ['baby spinach', 'fresh spinach'], { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 }, 'veg', {}),
  f('kale', [], { kcal: 49, protein: 4.3, carbs: 8.8, fat: 0.9 }, 'veg', {}),
  f('mixed salad leaves', ['salad leaves', 'lettuce', 'mixed greens'], { kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2 }, 'veg', {}),
  f('tomato', ['tomatoes', 'fresh tomato'], { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, 'veg', {}),
  f('cherry tomatoes', [], { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, 'veg', {}),
  f('cucumber', [], { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 }, 'veg', {}),
  f('bell pepper', ['pepper', 'red pepper', 'bell peppers', 'capsicum'], { kcal: 31, protein: 1, carbs: 6, fat: 0.3 }, 'veg', {}),
  f('onion', ['onions', 'red onion', 'white onion'], { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 }, 'veg', { is_high_fodmap: true }),
  f('garlic', ['garlic clove', 'garlic cloves'], { kcal: 149, protein: 6.4, carbs: 33, fat: 0.5 }, 'veg', { is_high_fodmap: true }, { clove: 3 }),
  f('carrot', ['carrots'], { kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2 }, 'veg', {}),
  f('courgette', ['zucchini'], { kcal: 17, protein: 1.2, carbs: 3.1, fat: 0.3 }, 'veg', {}),
  f('mushroom', ['mushrooms', 'button mushrooms', 'chestnut mushrooms'], { kcal: 22, protein: 3.1, carbs: 3.3, fat: 0.3 }, 'veg', {}),
  f('cauliflower', [], { kcal: 25, protein: 1.9, carbs: 5, fat: 0.3 }, 'veg', {}),
  f('green beans', ['french beans'], { kcal: 31, protein: 1.8, carbs: 7, fat: 0.2 }, 'veg', {}),
  f('peas', ['garden peas', 'frozen peas'], { kcal: 81, protein: 5.4, carbs: 14, fat: 0.4 }, 'veg', { is_legume: true }),
  f('sweetcorn', ['corn', 'corn on the cob'], { kcal: 96, protein: 3.4, carbs: 21, fat: 1.5 }, 'veg', { is_grain: true, is_high_carb: true }),
  f('asparagus', [], { kcal: 20, protein: 2.2, carbs: 3.9, fat: 0.1 }, 'veg', { is_high_fodmap: true }),
  f('brussels sprouts', [], { kcal: 43, protein: 3.4, carbs: 8.9, fat: 0.3 }, 'veg', {}),
  f('cabbage', ['white cabbage', 'red cabbage'], { kcal: 25, protein: 1.3, carbs: 5.8, fat: 0.1 }, 'veg', {}),
  f('aubergine', ['eggplant'], { kcal: 25, protein: 1, carbs: 5.9, fat: 0.2 }, 'veg', {}),
  f('leek', ['leeks'], { kcal: 61, protein: 1.5, carbs: 14, fat: 0.3 }, 'veg', { is_high_fodmap: true }),
  f('celery', [], { kcal: 16, protein: 0.7, carbs: 3, fat: 0.2 }, 'veg', { contains_celery: true }),
  f('beetroot', ['beets'], { kcal: 43, protein: 1.6, carbs: 10, fat: 0.2 }, 'veg', {}),
  f('butternut squash', ['squash'], { kcal: 45, protein: 1, carbs: 12, fat: 0.1 }, 'veg', {}),
  f('sweet potato raw', [], { kcal: 86, protein: 1.6, carbs: 20, fat: 0.1 }, 'carb', { is_high_carb: true }),
  f('rocket', ['arugula'], { kcal: 25, protein: 2.6, carbs: 3.7, fat: 0.7 }, 'veg', {}),

  // ===== FRUIT ==========================================================
  f('banana', ['bananas'], { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, 'fruit', {}, { medium: 118 }),
  f('apple', ['apples'], { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }, 'fruit', {}, { medium: 182 }),
  f('orange', ['oranges'], { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1 }, 'fruit', {}, { medium: 131 }),
  f('strawberries', ['strawberry'], { kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3 }, 'fruit', {}),
  f('blueberries', ['blueberry'], { kcal: 57, protein: 0.7, carbs: 14, fat: 0.3 }, 'fruit', {}),
  f('raspberries', ['raspberry'], { kcal: 52, protein: 1.2, carbs: 12, fat: 0.7 }, 'fruit', { is_high_fodmap: true }),
  f('grapes', ['grape'], { kcal: 69, protein: 0.7, carbs: 18, fat: 0.2 }, 'fruit', {}),
  f('mango', [], { kcal: 60, protein: 0.8, carbs: 15, fat: 0.4 }, 'fruit', { is_high_fodmap: true }),
  f('pineapple', [], { kcal: 50, protein: 0.5, carbs: 13, fat: 0.1 }, 'fruit', {}),
  f('dates', ['medjool dates'], { kcal: 277, protein: 1.8, carbs: 75, fat: 0.2 }, 'fruit', { is_high_carb: true, is_high_fodmap: true }),
  f('raisins', [], { kcal: 299, protein: 3.1, carbs: 79, fat: 0.5 }, 'fruit', { is_high_carb: true, is_high_fodmap: true }),
  f('dried apricots', [], { kcal: 241, protein: 3.4, carbs: 63, fat: 0.5 }, 'fruit', { contains_sulphites: true, is_high_carb: true, is_high_fodmap: true }),
  f('kiwi', ['kiwi fruit'], { kcal: 61, protein: 1.1, carbs: 15, fat: 0.5 }, 'fruit', {}),
  f('watermelon', [], { kcal: 30, protein: 0.6, carbs: 7.6, fat: 0.2 }, 'fruit', { is_high_fodmap: true }),
  f('pear', ['pears'], { kcal: 57, protein: 0.4, carbs: 15, fat: 0.1 }, 'fruit', { is_high_fodmap: true }, { medium: 178 }),
  f('lemon', ['lemon juice'], { kcal: 29, protein: 1.1, carbs: 9.3, fat: 0.3 }, 'fruit', {}),
  f('lime', ['lime juice'], { kcal: 30, protein: 0.7, carbs: 10.5, fat: 0.2 }, 'fruit', {}),

  // ===== CONDIMENTS / SAUCES / MISC ===================================
  f('soy sauce', [], { kcal: 53, protein: 8, carbs: 4.9, fat: 0.6 }, 'condiment', { contains_soy: true, contains_gluten: true }, { tbsp: 18 }),
  f('tamari', ['gluten free soy sauce'], { kcal: 60, protein: 10, carbs: 5.6, fat: 0 }, 'condiment', { contains_soy: true }, { tbsp: 18 }),
  f('mayonnaise', ['mayo'], { kcal: 680, protein: 1, carbs: 1.3, fat: 75 }, 'condiment', { contains_egg: true }, { tbsp: 14 }),
  f('ketchup', ['tomato ketchup'], { kcal: 101, protein: 1.2, carbs: 24, fat: 0.1 }, 'condiment', { is_refined_sugar: true }, { tbsp: 17 }),
  f('mustard', ['dijon mustard', 'english mustard'], { kcal: 66, protein: 4.4, carbs: 5, fat: 3.3 }, 'condiment', { contains_mustard: true }, { tbsp: 16 }),
  f('bbq sauce', ['barbecue sauce'], { kcal: 172, protein: 1, carbs: 40, fat: 0.5 }, 'condiment', { is_refined_sugar: true }, { tbsp: 17 }),
  f('sriracha', ['hot sauce'], { kcal: 93, protein: 1.9, carbs: 19, fat: 0.9 }, 'condiment', {}, { tbsp: 17 }),
  f('honey', [], { kcal: 304, protein: 0.3, carbs: 82, fat: 0 }, 'condiment', { contains_honey: true, is_refined_sugar: true }, { tbsp: 21, tsp: 7 }),
  f('maple syrup', [], { kcal: 260, protein: 0, carbs: 67, fat: 0.2 }, 'condiment', { is_refined_sugar: true }, { tbsp: 20 }),
  f('sugar white', ['sugar', 'white sugar', 'granulated sugar'], { kcal: 387, protein: 0, carbs: 100, fat: 0 }, 'condiment', { is_refined_sugar: true }, { tsp: 4, tbsp: 12 }),
  f('brown sugar', [], { kcal: 380, protein: 0, carbs: 98, fat: 0 }, 'condiment', { is_refined_sugar: true }, { tsp: 4, tbsp: 12 }),
  f('balsamic vinegar', [], { kcal: 88, protein: 0.5, carbs: 17, fat: 0 }, 'condiment', { contains_sulphites: true }, { tbsp: 15 }),
  f('salsa', [], { kcal: 36, protein: 1.3, carbs: 7, fat: 0.3 }, 'condiment', { is_high_fodmap: true }),
  f('pesto', ['basil pesto'], { kcal: 303, protein: 4, carbs: 4, fat: 30 }, 'condiment', { contains_dairy: true, contains_nuts: true }, { tbsp: 16 }),
  f('tomato passata', ['passata'], { kcal: 32, protein: 1.6, carbs: 5.5, fat: 0.3 }, 'condiment', {}),
  f('chopped tomatoes canned', ['tinned tomatoes', 'canned tomatoes'], { kcal: 32, protein: 1.6, carbs: 5.5, fat: 0.3 }, 'condiment', {}),
  f('curry paste', ['thai curry paste', 'tikka paste'], { kcal: 168, protein: 3, carbs: 12, fat: 12 }, 'condiment', { is_high_fodmap: true }, { tbsp: 20 }),
  f('coconut cream', [], { kcal: 330, protein: 3.6, carbs: 6.7, fat: 34 }, 'fat', {}),
  f('gravy granules made', ['gravy'], { kcal: 65, protein: 1.2, carbs: 9, fat: 2.6 }, 'condiment', { contains_gluten: true }),
  f('worcestershire sauce', [], { kcal: 78, protein: 0, carbs: 19.5, fat: 0 }, 'condiment', { contains_fish: true }, { tbsp: 17 }),
  f('teriyaki sauce', [], { kcal: 89, protein: 5.9, carbs: 16, fat: 0 }, 'condiment', { contains_soy: true, contains_gluten: true }, { tbsp: 18 }),
  f('vegetable stock cube', ['stock cube', 'vegetable stock'], { kcal: 233, protein: 8, carbs: 40, fat: 5 }, 'condiment', { contains_celery: true, is_high_fodmap: true }),
  // Soy lecithin is a near-ubiquitous emulsifier in commercial chocolate —
  // brand-dependent, not knowable from the name. Absent reads as safe, so
  // true is the only fail-safe state this schema can express. Kept in
  // lockstep with src/lib/food-db.ts.
  f('dark chocolate', ['70% dark chocolate'], { kcal: 546, protein: 7.8, carbs: 46, fat: 31 }, 'other', { is_refined_sugar: true, contains_soy: true }),
  f('milk chocolate', [], { kcal: 535, protein: 7.6, carbs: 59, fat: 30 }, 'other', { contains_dairy: true, is_refined_sugar: true, contains_soy: true }),
  // Brand-dependent, not knowable from the name — protein bars routinely
  // carry a nut or peanut base, whey/milk chocolate coating, soy protein
  // isolate, and an oat/wheat binder. Absent reads as safe, so true across
  // all four is the only fail-safe state this schema can express.
  f('protein bar generic', ['protein bar'], { kcal: 370, protein: 30, carbs: 35, fat: 12 }, 'other', { contains_nuts: true, contains_dairy: true, contains_soy: true, contains_gluten: true }, { whole: 60 }),

  // ===== PROTEIN: more meat & poultry ==================================
  f('duck breast', ['duck'], { kcal: 201, protein: 23.5, carbs: 0, fat: 11.2 }, 'protein', { contains_meat: true }),
  f('venison', ['venison steak'], { kcal: 158, protein: 30, carbs: 0, fat: 3.2 }, 'protein', { contains_meat: true }),
  f('beef brisket', [], { kcal: 221, protein: 25, carbs: 0, fat: 13 }, 'protein', { contains_meat: true }),
  f('pork belly', [], { kcal: 398, protein: 14, carbs: 0, fat: 37 }, 'protein', { contains_meat: true, contains_pork: true }),
  f('chicken liver', [], { kcal: 119, protein: 17.9, carbs: 0.9, fat: 4.8 }, 'protein', { contains_meat: true }),
  f('pepperoni', [], { kcal: 494, protein: 23, carbs: 2, fat: 44 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('salami', [], { kcal: 407, protein: 22, carbs: 1.5, fat: 34 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),

  // ===== PROTEIN: more fish & plant-based ===============================
  f('anchovies', ['anchovy'], { kcal: 210, protein: 29, carbs: 0, fat: 10 }, 'protein', { contains_fish: true }),
  f('trout', ['trout fillet'], { kcal: 141, protein: 20, carbs: 0, fat: 6.6 }, 'protein', { contains_fish: true }),
  f('scallops', [], { kcal: 88, protein: 16.8, carbs: 2.4, fat: 0.8 }, 'protein', { contains_shellfish: true }),
  f('oysters', [], { kcal: 68, protein: 7.1, carbs: 3.9, fat: 2.5 }, 'protein', { contains_shellfish: true }),
  f('lobster', [], { kcal: 89, protein: 19, carbs: 0.5, fat: 0.9 }, 'protein', { contains_shellfish: true }),
  f('haricot beans', ['navy beans', 'baked beans'], { kcal: 155, protein: 8.7, carbs: 27, fat: 0.6 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('split peas', ['yellow split peas', 'cooked split peas'], { kcal: 118, protein: 8.3, carbs: 21, fat: 0.4 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('falafel', [], { kcal: 333, protein: 13.3, carbs: 32, fat: 18 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('seitan strips', ['vegan chicken', 'meat free chicken pieces'], { kcal: 370, protein: 75, carbs: 14, fat: 1.9 }, 'protein', { is_grain: true, contains_gluten: true }),
  f('soy yoghurt', ['soya yoghurt', 'vegan yoghurt'], { kcal: 65, protein: 3.7, carbs: 6.5, fat: 2.8 }, 'dairy', { contains_soy: true }),
  f('soy milk', ['soya milk'], { kcal: 33, protein: 3.3, carbs: 1.8, fat: 1.8 }, 'dairy', { contains_soy: true }),
  f('almond milk', ['unsweetened almond milk'], { kcal: 15, protein: 0.5, carbs: 0.3, fat: 1.2 }, 'dairy', { contains_nuts: true }),
  f('oat milk', [], { kcal: 47, protein: 1, carbs: 6.7, fat: 1.5 }, 'dairy', {}),
  f('coconut yoghurt', ['coconut yogurt'], { kcal: 97, protein: 1, carbs: 7, fat: 7 }, 'dairy', {}),
  f('vegan mince', ['plant based mince', 'meat free mince'], { kcal: 152, protein: 16, carbs: 6, fat: 7 }, 'protein', { contains_soy: true }),
  f('vegan sausage', ['meat free sausage'], { kcal: 220, protein: 15, carbs: 12, fat: 13 }, 'protein', { contains_soy: true, contains_gluten: true }),
  f('nutritional yeast', [], { kcal: 325, protein: 45, carbs: 27, fat: 5 }, 'other', {}),

  // ===== CARB: more grains / breakfast ===================================
  // Nut content is brand-dependent and not knowable from the name. Kept in
  // lockstep with src/lib/food-db.ts's copy — see the fuller rationale there.
  f('granola', [], { kcal: 471, protein: 10, carbs: 64, fat: 20 }, 'carb', { is_grain: true, is_high_carb: true, contains_nuts: true }),
  // Same shape as granola — nut content is brand-dependent and not knowable
  // from the name. Absent reads as safe, so true is the only fail-safe state
  // this schema can express.
  f('muesli', [], { kcal: 362, protein: 9.7, carbs: 66, fat: 6 }, 'carb', { is_grain: true, is_high_carb: true, contains_nuts: true }),
  f('cornflakes', ['corn flakes'], { kcal: 357, protein: 7.5, carbs: 84, fat: 0.9 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('weetabix', ['bran cereal'], { kcal: 338, protein: 11, carbs: 69, fat: 2.5 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('brioche', [], { kcal: 375, protein: 8.5, carbs: 50, fat: 15 }, 'carb', { is_grain: true, contains_gluten: true, contains_egg: true, contains_dairy: true, is_high_carb: true }),
  f('croissant', [], { kcal: 406, protein: 8.2, carbs: 45, fat: 21 }, 'carb', { is_grain: true, contains_gluten: true, contains_dairy: true, is_high_carb: true }),
  f('naan bread', ['naan'], { kcal: 310, protein: 9, carbs: 50, fat: 8 }, 'carb', { is_grain: true, contains_gluten: true, contains_dairy: true, is_high_carb: true }, { whole: 90 }),
  f('chapati', ['roti', 'whole wheat roti', 'whole wheat rotis'], { kcal: 297, protein: 8.9, carbs: 52, fat: 6.9 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 40 }),
  f('gnocchi', [], { kcal: 150, protein: 3.3, carbs: 31, fat: 0.7 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('gluten free bread', [], { kcal: 250, protein: 3, carbs: 48, fat: 4 }, 'carb', { is_grain: true, is_high_carb: true }, { slice: 30 }),
  f('gluten free pasta', ['rice pasta', 'corn pasta'], { kcal: 160, protein: 3.5, carbs: 34, fat: 0.8 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('millet cooked', ['millet'], { kcal: 119, protein: 3.5, carbs: 23.7, fat: 1 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('buckwheat cooked', ['buckwheat', 'soba noodles'], { kcal: 92, protein: 3.4, carbs: 19.9, fat: 0.6 }, 'carb', { is_grain: true, is_high_carb: true }),

  // ===== FAT: more oils / dairy fats ======================================
  f('sesame oil', [], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', { contains_sesame: true }, { tbsp: 14, tsp: 4.5 }),
  f('ghee', ['clarified butter'], { kcal: 900, protein: 0, carbs: 0, fat: 100 }, 'fat', { contains_dairy: true }, { tbsp: 13 }),
  f('brazil nuts', [], { kcal: 659, protein: 14.3, carbs: 12, fat: 66 }, 'fat', { contains_nuts: true }),
  f('pecans', [], { kcal: 691, protein: 9.2, carbs: 14, fat: 72 }, 'fat', { contains_nuts: true }),
  f('hazelnuts', [], { kcal: 628, protein: 15, carbs: 17, fat: 61 }, 'fat', { contains_nuts: true }),
  f('coconut flakes', ['desiccated coconut'], { kcal: 660, protein: 6.9, carbs: 24, fat: 65 }, 'fat', {}),
  f('olives', ['black olives', 'green olives'], { kcal: 115, protein: 0.8, carbs: 6, fat: 11 }, 'fat', {}),

  // ===== VEG: more variety ================================================
  f('radish', ['radishes'], { kcal: 16, protein: 0.7, carbs: 3.4, fat: 0.1 }, 'veg', {}),
  f('spring onion', ['scallion', 'green onion'], { kcal: 32, protein: 1.8, carbs: 7.3, fat: 0.2 }, 'veg', {}),
  f('bok choy', ['pak choi'], { kcal: 13, protein: 1.5, carbs: 2.2, fat: 0.2 }, 'veg', {}),
  f('bean sprouts', [], { kcal: 30, protein: 3, carbs: 5.9, fat: 0.2 }, 'veg', {}),
  f('watercress', [], { kcal: 11, protein: 2.3, carbs: 1.3, fat: 0.1 }, 'veg', {}),
  f('parsnip', ['parsnips'], { kcal: 75, protein: 1.2, carbs: 18, fat: 0.3 }, 'veg', { is_high_fodmap: true }),
  f('turnip', ['turnips'], { kcal: 28, protein: 0.9, carbs: 6.4, fat: 0.1 }, 'veg', {}),
  f('fennel', [], { kcal: 31, protein: 1.2, carbs: 7.3, fat: 0.2 }, 'veg', {}),
  f('artichoke', [], { kcal: 47, protein: 3.3, carbs: 10.5, fat: 0.2 }, 'veg', { is_high_fodmap: true }),
  f('okra', [], { kcal: 33, protein: 1.9, carbs: 7.5, fat: 0.2 }, 'veg', {}),
  f('celeriac', [], { kcal: 42, protein: 1.5, carbs: 9.2, fat: 0.3 }, 'veg', {}),
  f('pumpkin', [], { kcal: 26, protein: 1, carbs: 6.5, fat: 0.1 }, 'veg', {}),

  // ===== FRUIT: more variety ===============================================
  f('cherries', ['cherry'], { kcal: 63, protein: 1.1, carbs: 16, fat: 0.2 }, 'fruit', { is_high_fodmap: true }),
  f('peach', ['peaches'], { kcal: 39, protein: 0.9, carbs: 9.5, fat: 0.3 }, 'fruit', { is_high_fodmap: true }),
  f('plum', ['plums'], { kcal: 46, protein: 0.7, carbs: 11, fat: 0.3 }, 'fruit', { is_high_fodmap: true }),
  f('grapefruit', [], { kcal: 42, protein: 0.8, carbs: 10.7, fat: 0.1 }, 'fruit', {}),
  f('passion fruit', [], { kcal: 97, protein: 2.2, carbs: 23, fat: 0.7 }, 'fruit', {}),
  f('papaya', [], { kcal: 43, protein: 0.5, carbs: 11, fat: 0.3 }, 'fruit', {}),
  f('pomegranate', ['pomegranate seeds'], { kcal: 83, protein: 1.7, carbs: 19, fat: 1.2 }, 'fruit', {}),
  f('figs', ['fig'], { kcal: 74, protein: 0.8, carbs: 19, fat: 0.3 }, 'fruit', { is_high_carb: true, is_high_fodmap: true }),
  f('blackberries', [], { kcal: 43, protein: 1.4, carbs: 10, fat: 0.5 }, 'fruit', {}),
  f('coconut flesh', ['fresh coconut'], { kcal: 354, protein: 3.3, carbs: 15, fat: 33 }, 'fruit', {}),

  // ===== CONDIMENTS: more variety ==========================================
  f('rice vinegar', [], { kcal: 18, protein: 0, carbs: 0.4, fat: 0 }, 'condiment', {}, { tbsp: 15 }),
  f('fish sauce', [], { kcal: 43, protein: 6, carbs: 3.6, fat: 0 }, 'condiment', { contains_fish: true }, { tbsp: 18 }),
  // Miso is often assumed gluten-free because it's "just soy" — wrong for
  // barley/rice-koji miso, which carries gluten. Brand-dependent, not
  // knowable from the name; absent reads as safe, so true is the only
  // fail-safe state this schema can express.
  f('miso paste', ['miso'], { kcal: 199, protein: 12.8, carbs: 26, fat: 6 }, 'condiment', { contains_soy: true, contains_gluten: true }, { tbsp: 17 }),
  // Traditionally made with wheat flour alongside the soybean base.
  // Brand-dependent, not knowable from the name; absent reads as safe, so
  // true is the only fail-safe state this schema can express.
  f('gochujang', ['korean chilli paste'], { kcal: 173, protein: 5.5, carbs: 34, fat: 2.4 }, 'condiment', { contains_soy: true, is_high_fodmap: true, contains_gluten: true }, { tbsp: 20 }),
  f('harissa', [], { kcal: 111, protein: 3, carbs: 12, fat: 6 }, 'condiment', { is_high_fodmap: true }, { tbsp: 15 }),
  f('tzatziki', [], { kcal: 88, protein: 3.8, carbs: 3.6, fat: 6.8 }, 'condiment', { contains_dairy: true, is_high_fodmap: true }),
  f('guacamole', [], { kcal: 155, protein: 2, carbs: 8.5, fat: 13 }, 'condiment', { is_high_fodmap: true }),
  f('sour cream', [], { kcal: 198, protein: 2.4, carbs: 4.6, fat: 19.7 }, 'dairy', { contains_dairy: true }),
  f('coleslaw', [], { kcal: 150, protein: 1.2, carbs: 8, fat: 13 }, 'condiment', { contains_egg: true, is_high_fodmap: true }),
  f('vinaigrette dressing', ['salad dressing', 'french dressing'], { kcal: 260, protein: 0.2, carbs: 8, fat: 25 }, 'condiment', {}, { tbsp: 15 }),
  f('ranch dressing', [], { kcal: 460, protein: 1, carbs: 6, fat: 48 }, 'condiment', { contains_dairy: true, contains_egg: true }, { tbsp: 15 }),
  f('apple cider vinegar', [], { kcal: 22, protein: 0, carbs: 0.9, fat: 0 }, 'condiment', {}, { tbsp: 15 }),
  f('cornflour', ['cornstarch'], { kcal: 381, protein: 0.3, carbs: 91, fat: 0.1 }, 'condiment', { is_high_carb: true }),
  f('curry powder', [], { kcal: 325, protein: 14, carbs: 55, fat: 14 }, 'condiment', {}),
  f('paprika', [], { kcal: 282, protein: 14, carbs: 54, fat: 13 }, 'condiment', {}),
  f('cinnamon', [], { kcal: 247, protein: 4, carbs: 81, fat: 1.2 }, 'condiment', {}),
  f('cumin', [], { kcal: 375, protein: 18, carbs: 44, fat: 22 }, 'condiment', {}),
  f('black pepper', [], { kcal: 251, protein: 10, carbs: 64, fat: 3.3 }, 'condiment', {}),
  f('vanilla extract', [], { kcal: 288, protein: 0.1, carbs: 12.7, fat: 0.1 }, 'condiment', { contains_alcohol: true }, { tsp: 4 }),

  // ===== OTHER: snacks / bars ==============================================
  f('greek yoghurt bar', ['yoghurt bar'], { kcal: 150, protein: 8, carbs: 18, fat: 5 }, 'other', { contains_dairy: true }, { whole: 40 }),
  f('trail mix', [], { kcal: 462, protein: 14, carbs: 45, fat: 27 }, 'other', { contains_nuts: true }),
  f('beef jerky', [], { kcal: 410, protein: 33, carbs: 11, fat: 26 }, 'protein', { contains_meat: true, is_processed_meat: true }),
  f('vegan protein powder', ['pea protein powder', 'plant protein powder'], { kcal: 375, protein: 75, carbs: 10, fat: 5 }, 'protein', {}, { scoop: 30 }),
  f('protein pasta', ['high protein pasta'], { kcal: 350, protein: 40, carbs: 38, fat: 3 }, 'carb', { is_grain: true, contains_soy: true, contains_egg: true, is_high_carb: true }),

  // ===== Added from a live test:meal-quality run — every entry below fixes
  // a specific unmatched-ingredient string a real Gemini generation produced
  // (see the M1 Part 6 quality-harness follow-up). =========================

  // --- herbs, spices & seasoning blends (near-zero macros at typical use) ---
  f('coriander', ['fresh cilantro', 'cilantro', 'fresh coriander', 'coriander leaves', 'cilantro chopped'], { kcal: 23, protein: 2.1, carbs: 3.7, fat: 0.5 }, 'condiment', {}),
  f('dill', ['fresh dill'], { kcal: 43, protein: 3.5, carbs: 7, fat: 1.1 }, 'condiment', {}),
  f('basil', ['fresh thai basil', 'thai basil', 'holy basil leaves', 'basil leaves'], { kcal: 23, protein: 3.2, carbs: 2.7, fat: 0.6 }, 'condiment', {}),
  f('lemongrass', ['minced lemongrass'], { kcal: 99, protein: 1.8, carbs: 25, fat: 0.5 }, 'condiment', { is_high_fodmap: true }),
  f('turmeric powder', ['turmeric'], { kcal: 312, protein: 9.7, carbs: 65, fat: 3.3 }, 'condiment', {}),
  f('bay leaves', ['bay leaf'], { kcal: 313, protein: 7.6, carbs: 75, fat: 8.4 }, 'condiment', {}),
  f('star anise', [], { kcal: 337, protein: 17.6, carbs: 50, fat: 15.9 }, 'condiment', {}),
  f('curry leaves', [], { kcal: 108, protein: 6.1, carbs: 18.7, fat: 1 }, 'condiment', {}),
  f('garam masala', [], { kcal: 379, protein: 13.5, carbs: 58, fat: 13.8 }, 'condiment', {}),
  f('chana masala spice mix', ['chana masala'], { kcal: 300, protein: 12, carbs: 55, fat: 6 }, 'condiment', { is_legume: false }),
  f('chaat masala', [], { kcal: 270, protein: 8, carbs: 55, fat: 4 }, 'condiment', {}),
  f('berbere spice mix', ['berbere'], { kcal: 320, protein: 12, carbs: 55, fat: 8 }, 'condiment', {}),
  f('cajun seasoning', ['cajun seasoning blend', 'cajun spices', 'cajun spice seasoning'], { kcal: 250, protein: 9, carbs: 50, fat: 5 }, 'condiment', {}),
  f('jerk seasoning paste', ['jerk seasoning'], { kcal: 150, protein: 4, carbs: 25, fat: 4 }, 'condiment', { is_high_fodmap: true }),
  f('suya spice rub', ['suya spice'], { kcal: 400, protein: 18, carbs: 20, fat: 28 }, 'condiment', { contains_nuts: true }),
  f('chili powder', [], { kcal: 282, protein: 13.5, carbs: 50, fat: 14.3 }, 'condiment', {}),
  f('cayenne pepper', ['ground cayenne'], { kcal: 318, protein: 12, carbs: 57, fat: 17 }, 'condiment', {}),
  f('tajin seasoning', ['tajin'], { kcal: 300, protein: 2, carbs: 70, fat: 1 }, 'condiment', {}),
  f('capers', [], { kcal: 23, protein: 2.4, carbs: 4.9, fat: 0.9 }, 'condiment', {}),

  // --- sauces & pastes -------------------------------------------------------
  f('oyster sauce', [], { kcal: 51, protein: 1.4, carbs: 11, fat: 0.3 }, 'condiment', { contains_shellfish: true }, { tbsp: 18 }),
  f('hoisin sauce', [], { kcal: 220, protein: 2.6, carbs: 44, fat: 3.4 }, 'condiment', { contains_soy: true, contains_gluten: true, is_refined_sugar: true }, { tbsp: 18 }),
  f('sweet chili sauce', [], { kcal: 197, protein: 0.6, carbs: 49, fat: 0.1 }, 'condiment', { is_refined_sugar: true }, { tbsp: 18 }),
  f('tamarind paste', ['tamarind soup base mix', 'tamarind soup base powder'], { kcal: 239, protein: 2.8, carbs: 62.5, fat: 0.6 }, 'condiment', { is_high_fodmap: true }, { tbsp: 15 }),
  f('white vinegar', [], { kcal: 18, protein: 0, carbs: 0.4, fat: 0 }, 'condiment', {}, { tbsp: 15 }),
  f('jam', ['lingonberry jam', 'fruit jam'], { kcal: 250, protein: 0.4, carbs: 62, fat: 0.1 }, 'condiment', { is_refined_sugar: true }, { tbsp: 20 }),

  // --- veg / aromatics ---------------------------------------------------------
  f('shallots', ['shallot'], { kcal: 72, protein: 2.5, carbs: 16.8, fat: 0.1 }, 'veg', { is_high_fodmap: true }),
  f('bamboo shoots', ['canned bamboo shoots'], { kcal: 27, protein: 2.6, carbs: 5.2, fat: 0.3 }, 'veg', {}),
  f('taro root', ['taro root cubed', 'taro'], { kcal: 112, protein: 1.5, carbs: 26.5, fat: 0.2 }, 'carb', { is_high_carb: true }),
  f('yellow yam', ['boiled yellow yam', 'yam'], { kcal: 118, protein: 1.5, carbs: 27.9, fat: 0.2 }, 'carb', { is_high_carb: true }),
  f('plantain', ['yellow plantain sliced thin', 'sweet plantain', 'baked plantain chips'], { kcal: 122, protein: 1.3, carbs: 32, fat: 0.4 }, 'carb', { is_high_carb: true }),
  f('cornmeal', [], { kcal: 370, protein: 8, carbs: 79, fat: 3.6 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('barley', ['whole barley grains', 'pearl barley'], { kcal: 123, protein: 2.3, carbs: 28.2, fat: 0.4 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),

  // --- protein / dairy variants ------------------------------------------------
  f('ackee', ['canned ackee', 'canned ackee drained'], { kcal: 151, protein: 2.9, carbs: 0.8, fat: 15.2 }, 'fruit', {}),
  f('paneer', ['low fat paneer'], { kcal: 265, protein: 18.3, carbs: 3.6, fat: 20.8 }, 'dairy', { contains_dairy: true }),
  f('skyr', ['icelandic skyr'], { kcal: 63, protein: 11, carbs: 4, fat: 0.2 }, 'dairy', { contains_dairy: true }),
  f('sulguni cheese', ['sulguni'], { kcal: 280, protein: 22, carbs: 2, fat: 21 }, 'dairy', { contains_dairy: true }),
  f('sesame seeds', ['roasted sesame seeds'], { kcal: 573, protein: 17.7, carbs: 23.4, fat: 49.7 }, 'fat', { contains_sesame: true }),
  f('hemp seeds', [], { kcal: 553, protein: 31.6, carbs: 8.7, fat: 48.8 }, 'fat', {}),
  // Untagged before this round (absent reads as safe). Tagged for the same
  // reason as 'peanut butter' above; kept in lockstep with src/lib/food-db.ts.
  f('peanut oil', [], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', { contains_nuts: true }, { tbsp: 14, tsp: 4.5 }),
  f('safflower oil', [], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 14, tsp: 4.5 }),
  f('red snapper', ['red snapper fillet'], { kcal: 100, protein: 20.5, carbs: 0, fat: 1.3 }, 'protein', { contains_fish: true }),
  f('beef broth', ['beef bone broth', 'beef stock'], { kcal: 15, protein: 2.5, carbs: 0.5, fat: 0.3 }, 'condiment', {}),
  f('chicken broth', ['chicken stock'], { kcal: 12, protein: 1.5, carbs: 0.9, fat: 0.3 }, 'condiment', {}),
  f('rice paper wrappers', ['rice paper'], { kcal: 333, protein: 0.7, carbs: 82, fat: 0.2 }, 'carb', { is_grain: true, is_high_carb: true }, { whole: 10 }),
  f('injera flatbread', ['injera'], { kcal: 220, protein: 7, carbs: 45, fat: 1.5 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('calamansi juice', ['calamansi'], { kcal: 29, protein: 0.5, carbs: 9.5, fat: 0.2 }, 'fruit', {}),
  f('water', ['warm water', 'cold water', 'boiling water'], { kcal: 0, protein: 0, carbs: 0, fat: 0 }, 'other', {}),
]

// ---------------------------------------------------------------------------
// Lookup index — built once at module load
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

const LOOKUP = new Map<string, FoodEntry>()
for (const entry of FOOD_DB) {
  LOOKUP.set(normalize(entry.name), entry)
  for (const alias of entry.aliases) LOOKUP.set(normalize(alias), entry)
}

/** Water-density defaults for common volume units, used when an entry doesn't override them. */
const DEFAULT_UNIT_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  ml: 1,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
  cup: 240,
}

/** True when `needle` (word tokens) appears as a contiguous run inside `haystack` (word tokens) — word-boundary-safe, unlike a raw character substring check (which would wrongly match "corn" inside "unicorn"). */
function containsWordSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true
  }
  return false
}

/** Strips a trailing 's' from tokens long enough that it's almost certainly a plural, not part of the word itself (avoids "hummus" -> "hummu", "asparagus" -> "asparagu"). Deliberately conservative: only used as a last-resort fallback below, never in the primary matching passes. */
function depluralizeToken(token: string): string {
  return token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token
}

/**
 * Alias- and fuzzy-tolerant lookup. Tries exact/alias match first, then a
 * word-sequence match against known entries (handles "grilled chicken breast
 * fillet" resolving to "chicken breast" — matched on whole words, so "corn"
 * cannot match inside "unicorn"), then a token-overlap match, then (only if
 * every other pass missed) a single retry with each query token
 * conservatively depluralized — catches "scallions" resolving to the
 * "scallion" alias without loosening the primary passes that guard against
 * false positives. Returns null on a genuine miss — callers must NOT guess a
 * nutritional profile for an unresolved ingredient (see diet-rules.ts's
 * fail-closed handling).
 */
export function lookupIngredient(name: string, _isPluralRetry = false): FoodEntry | null {
  const key = normalize(name)
  if (!key) return null

  const exact = LOOKUP.get(key)
  if (exact) return exact

  const keyTokens = key.split(' ').filter(Boolean)

  // Word-sequence match: does a known name/alias's exact word run appear
  // inside the query's words, or vice versa? Longest (by word count) wins so
  // "chicken breast" beats "chicken".
  let best: { entry: FoodEntry; len: number } | null = null
  for (const [known, entry] of LOOKUP) {
    const knownTokens = known.split(' ').filter(Boolean)
    if (knownTokens.length === 0) continue
    if (containsWordSequence(keyTokens, knownTokens) || containsWordSequence(knownTokens, keyTokens)) {
      if (!best || knownTokens.length > best.len) best = { entry, len: knownTokens.length }
    }
  }
  if (best) return best.entry

  // Token overlap: every significant word in the known name must appear in
  // the query (order-independent) — catches "cooked white rice" matching
  // "white rice cooked". Still whole-word (split on spaces), so no substring
  // false-positives.
  const keyTokenSet = new Set(keyTokens.filter(t => t.length > 2))
  let bestOverlap: { entry: FoodEntry; score: number } | null = null
  for (const [known, entry] of LOOKUP) {
    const knownTokens = known.split(' ').filter(t => t.length > 2)
    if (knownTokens.length === 0) continue
    const overlap = knownTokens.filter(t => keyTokenSet.has(t)).length
    if (overlap === knownTokens.length && overlap > 0) {
      if (!bestOverlap || overlap > bestOverlap.score) bestOverlap = { entry, score: overlap }
    }
  }
  if (bestOverlap) return bestOverlap.entry

  if (!_isPluralRetry) {
    const depluralized = keyTokens.map(depluralizeToken).join(' ')
    if (depluralized !== key) return lookupIngredient(depluralized, true)
  }
  return null
}

export interface MealIngredientLine {
  /** Free-text name as written in a meal, e.g. "chicken breast" or "grilled chicken". */
  name: string
  /** Quantity in the given unit. */
  quantity: number
  /** g, ml, tbsp, tsp, cup, or an ingredient-specific named unit (medium, whole, slice, clove, scoop...). */
  unit: string
}

export interface ComputedMealMacros extends Macros100g {
  /** Share (0-1) of the meal's total gram mass successfully resolved to a food-db entry. */
  coverage: number
  /** Ingredient name strings that could not be resolved. */
  unmatched: string[]
  /** Per-line resolution detail, for scaling/debugging. */
  lines: { input: MealIngredientLine; entry: FoodEntry | null; grams: number; macros: Macros100g | null }[]
}

/** Resolves a named unit to grams for a specific food entry (entry-specific override, else the water-density default, else 1:1 as grams). */
export function unitToGrams(entry: FoodEntry | null, unit: string, quantity: number): number {
  const u = unit.toLowerCase().trim()
  if (entry?.units && entry.units[u] != null) return entry.units[u] * quantity
  if (DEFAULT_UNIT_GRAMS[u] != null) return DEFAULT_UNIT_GRAMS[u] * quantity
  // Unknown unit name (e.g. a stray "1 handful") — treat the quantity as grams
  // rather than throwing away the line; coverage will still reflect the
  // uncertainty if the ingredient itself doesn't resolve.
  return quantity
}

/**
 * Computes total macros for a list of ingredient lines by resolving each to
 * food-db and scaling its per-100g values by the line's gram weight. Lines
 * that fail to resolve contribute their gram weight to the mass total (so
 * coverage reflects "how much of this meal is nutritionally known") but zero
 * macros — never an invented estimate.
 */
export function computeMealMacros(ingredients: MealIngredientLine[]): ComputedMealMacros {
  let totalGrams = 0
  let matchedGrams = 0
  const totals: Macros100g = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const unmatched: string[] = []
  const lines: ComputedMealMacros['lines'] = []

  for (const line of ingredients) {
    const entry = lookupIngredient(line.name)
    const grams = unitToGrams(entry, line.unit, line.quantity)
    totalGrams += grams

    if (entry) {
      matchedGrams += grams
      const factor = grams / 100
      const macros: Macros100g = {
        kcal: entry.per100g.kcal * factor,
        protein: entry.per100g.protein * factor,
        carbs: entry.per100g.carbs * factor,
        fat: entry.per100g.fat * factor,
      }
      totals.kcal += macros.kcal
      totals.protein += macros.protein
      totals.carbs += macros.carbs
      totals.fat += macros.fat
      lines.push({ input: line, entry, grams, macros })
    } else {
      unmatched.push(line.name)
      lines.push({ input: line, entry: null, grams, macros: null })
    }
  }

  return {
    kcal: Math.round(totals.kcal),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    coverage: totalGrams > 0 ? matchedGrams / totalGrams : 0,
    unmatched,
    lines,
  }
}
