// ---------------------------------------------------------------------------
// FOOD DATABASE (M1) — the deterministic macro truth source
// ---------------------------------------------------------------------------
// KEPT BYTE-FOR-BYTE IDENTICAL with supabase/functions/_shared/food-db.ts: the
// coach's edge function cannot import across src/lib, so it carries a copy.
// Edit THIS file, then `cp` it over; test:ingredient-units fails on any
// difference. It used to be "kept in sync by hand" and was not (measured 1 Oct
// 2026): nine foods missing, no piece weights, no whole-count rule, so the same
// "3 eggs" was 233 kcal in the app and 5 kcal in the coach's food diary.
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
  // contains_lupin was declared before any entry carried it, on the reasoning
  // that the rule should be waiting when lupin flour was added rather than
  // remembered afterwards. Lupin flour HAS since been added and does carry
  // the tag — this comment said otherwise for a while, which is the small
  // rot that makes the next reader trust a stale claim over the data.
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
  // Populated on 8 entries (bacon, ham, chorizo, pepperoni, salami, gammon...)
  // but intentionally referenced by NO dietary preference in diet-rules.ts's
  // FORBIDDEN_TAGS — the mirror image of the is_grain bug (data with no
  // rule, rather than a rule with no data). Not a gap to silently "fix" by
  // wiring it into a preference; if this app ever adds an "avoid processed
  // meat" restriction, the data is already here and correct.
  is_processed_meat?: boolean
}

export type FoodCategory = 'protein' | 'carb' | 'fat' | 'veg' | 'fruit' | 'dairy' | 'condiment' | 'other'

export interface Macros100g {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface PurchaseUnit {
  /** Average grams for one purchase unit — one whole item, one head, one egg, etc. */
  avgGrams: number
  /** Singular label, e.g. 'egg', 'head', 'bagel' — pluralized with a trailing 's' at display time. */
  label: string
}

export interface FoodEntry {
  name: string
  aliases: string[]
  per100g: Macros100g
  category: FoodCategory
  tags: FoodTags
  /** Named-unit -> gram weight, for quantities like "1 medium egg" or "2 tbsp". Water-density defaults (tbsp/tsp/cup) are applied automatically when not overridden here. */
  units?: Record<string, number>
  /**
   * Shopping-list purchase unit — GroceryList.tsx's display layer converts
   * stored grams into a rounded count of these when present (e.g. "2 heads"
   * broccoli, "12 eggs"). Independent of `units` above (cooking portions);
   * only set where a whole/discrete purchase form is unambiguous. Stored
   * quantities/aggregation are unaffected — this is display-only.
   */
  purchaseUnit?: PurchaseUnit
}

function f(
  name: string,
  aliases: string[],
  per100g: Macros100g,
  category: FoodCategory,
  tags: FoodTags = {},
  units?: Record<string, number>,
  purchaseUnit?: PurchaseUnit,
): FoodEntry {
  return { name, aliases, per100g, category, tags, units, purchaseUnit }
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
  f('bacon', ['bacon rashers', 'streaky bacon', 'back bacon', 'bacon medallions'], { kcal: 337, protein: 25, carbs: 0.5, fat: 26 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('gammon', ['gammon steak', 'ham steak'], { kcal: 145, protein: 24, carbs: 0.5, fat: 5 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('ham', ['sliced ham', 'deli ham'], { kcal: 107, protein: 18, carbs: 1.5, fat: 3 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('chorizo', ['chorizo sausage'], { kcal: 455, protein: 24, carbs: 1.9, fat: 38 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true }),
  f('pork sausage', ['pork sausages', 'breakfast sausage'], { kcal: 296, protein: 13, carbs: 8, fat: 24 }, 'protein', { contains_meat: true, contains_pork: true, is_processed_meat: true, contains_gluten: true }),

  // ===== PROTEIN: fish & seafood ======================================
  f('salmon', ['salmon fillet', 'baked salmon', 'grilled salmon'], { kcal: 208, protein: 20, carbs: 0, fat: 13 }, 'protein', { contains_fish: true }),
  f('smoked salmon', [], { kcal: 142, protein: 18, carbs: 0, fat: 4.5 }, 'protein', { contains_fish: true, is_processed_meat: false }),
  f('tuna canned in water', ['canned tuna', 'tuna in water', 'tinned tuna', 'tuna in spring water'], { kcal: 116, protein: 26, carbs: 0, fat: 0.8 }, 'protein', { contains_fish: true }),
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
  f('egg', ['eggs', 'whole egg', 'boiled egg', 'fried egg', 'scrambled egg', 'hard boiled egg', 'soft boiled egg', 'poached egg'], { kcal: 155, protein: 13, carbs: 1.1, fat: 11 }, 'protein', { contains_egg: true }, { medium: 50, large: 58, small: 44 }, { avgGrams: 58, label: 'egg' }),
  f('egg white', ['egg whites', 'liquid egg whites', 'liquid egg white'], { kcal: 52, protein: 11, carbs: 0.7, fat: 0.2 }, 'protein', { contains_egg: true }, { medium: 33, large: 38 }),
  f('egg yolk', ['egg yolks'], { kcal: 322, protein: 16, carbs: 3.6, fat: 27 }, 'protein', { contains_egg: true }, { medium: 17, large: 20 }),
  f('greek yoghurt 0%', ['fat free greek yogurt', 'greek yoghurt fat free', '0% greek yogurt', 'greek yoghurt', 'fat free greek yoghurt', '0% greek yoghurt'], { kcal: 57, protein: 10, carbs: 3.6, fat: 0.2 }, 'dairy', { contains_dairy: true }),
  f('greek yoghurt full fat', ['greek yogurt', 'full fat greek yoghurt', 'greek style yoghurt'], { kcal: 97, protein: 9, carbs: 4, fat: 5 }, 'dairy', { contains_dairy: true }),
  f('natural yoghurt', ['plain yoghurt', 'natural yogurt', 'low fat yogurt', 'low fat yoghurt'], { kcal: 61, protein: 4.3, carbs: 4.7, fat: 3.3 }, 'dairy', { contains_dairy: true }),
  f('cottage cheese', [], { kcal: 98, protein: 11, carbs: 3.4, fat: 4.3 }, 'dairy', { contains_dairy: true }),
  f('ricotta cheese', ['ricotta', 'light ricotta cheese', 'light ricotta'], { kcal: 174, protein: 11, carbs: 3, fat: 13 }, 'dairy', { contains_dairy: true }),
  f('whey protein powder', ['protein powder', 'whey protein', 'whey isolate', 'vanilla whey protein', 'chocolate whey protein'], { kcal: 380, protein: 80, carbs: 8, fat: 5 }, 'protein', { contains_dairy: true }, { scoop: 30 }),
  f('milk whole', ['whole milk', 'full fat milk'], { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 }, 'dairy', { contains_dairy: true }),
  // 11 Oct 2026: a latte was read as whole milk by the old lookup, which threw "latte" away; the stricter
  // one refuses the word, so "a large latte" in chat became "I don't know it". DERIVED from the row above,
  // not looked up: about 85% whole milk by weight, the rest espresso (near 0 kcal). No size of its own, so
  // "a large latte" is asked about. "oat milk latte" is NOT this (oat is not a harmless word) and stays a miss.
  f('latte whole milk', ['latte', 'cafe latte', 'caffe latte'], { kcal: 52, protein: 2.7, carbs: 4.1, fat: 2.8 }, 'dairy', { contains_dairy: true }),
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
  f('cannellini beans', ['canned cannellini beans', 'cooked cannellini beans', 'white kidney beans'], { kcal: 118, protein: 8.1, carbs: 20, fat: 0.5 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('brown lentils', ['canned brown lentils', 'cooked brown lentils'], { kcal: 116, protein: 9, carbs: 20, fat: 0.4 }, 'protein', { is_legume: true, is_high_carb: true }),
  f('soy mince', ['tvp', 'textured vegetable protein', 'soy protein mince'], { kcal: 285, protein: 50, carbs: 30, fat: 1 }, 'protein', { contains_soy: true }),
  f('quorn mince', ['quorn'], { kcal: 92, protein: 12, carbs: 4.4, fat: 2.7 }, 'protein', { contains_egg: true }),
  f('quorn fillet', ['quorn fillets', 'quorn chicken pieces'], { kcal: 106, protein: 13, carbs: 6.7, fat: 2.9 }, 'protein', { contains_egg: true }),
  // PEANUTS COUNT AS NUTS HERE. Botanically peanuts are legumes, and this
  // entry (plus 'peanuts' and 'peanut oil' below) used to assert
  // contains_nuts: false on that basis. That is the wrong frame: 'nut-free'
  // is a user-facing safety checkbox, not a botanical classification, and
  // peanuts are the most common severe nut allergen. Over-restricting a
  // tree-nut-only user fails safe; under-restricting a peanut-allergic user
  // does not. Do not "correct" these back to false.
  f('peanut butter', [], { kcal: 588, protein: 25, carbs: 20, fat: 50 }, 'fat', { contains_nuts: true }, { tbsp: 16 }),
  f('almond butter', [], { kcal: 614, protein: 21, carbs: 19, fat: 56 }, 'fat', { contains_nuts: true }, { tbsp: 16 }),
  f('hummus', [], { kcal: 166, protein: 7.9, carbs: 11, fat: 9.6 }, 'other', { contains_sesame: true, is_legume: true }),

  // ===== CARB: grains, bread, potato ==================================
  f('white rice cooked', ['white rice', 'cooked rice', 'boiled rice', 'jasmine rice'], { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('brown rice cooked', ['brown rice', 'cooked brown rice'], { kcal: 123, protein: 2.7, carbs: 25, fat: 1 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('basmati rice cooked', ['basmati rice', 'cooked basmati'], { kcal: 121, protein: 2.9, carbs: 25, fat: 0.4 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('pasta cooked', ['pasta', 'penne', 'fusilli', 'spaghetti', 'cooked pasta'], { kcal: 158, protein: 5.8, carbs: 31, fat: 0.9 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('wholewheat pasta cooked', ['wholewheat pasta', 'whole wheat pasta', 'wholemeal pasta'], { kcal: 149, protein: 6.3, carbs: 30, fat: 1.1 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  // TOAST IS BREAD (Ashley, 10 Oct 2026: "make toast count as bread now rather
  // than refusing it"). Toasting drives off a little water and changes nothing
  // a slice is counted by. Held back on 9 Oct because "french toast" would have
  // matched plain bread and lost its egg and milk; its own entry below wins on
  // the longer name, so it keeps both allergen tags.
  f('white bread', ['bread', 'white bread slice', 'sliced white bread', 'toast', 'white toast'], { kcal: 265, protein: 9, carbs: 49, fat: 3.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { slice: 36 }),
  f('wholemeal bread', ['whole wheat bread', 'brown bread', 'wholemeal toast', 'whole wheat toast', 'brown toast', 'wholegrain toast'], { kcal: 247, protein: 13, carbs: 41, fat: 3.4 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { slice: 38 }),
  // Bread soaked in egg and milk and fried (USDA, French toast prepared from
  // recipe). Here so "french toast" never resolves to plain bread above.
  f('french toast', ['eggy bread'], { kcal: 229, protein: 7.7, carbs: 25, fat: 10.8 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true, contains_egg: true, contains_dairy: true }, { slice: 65 }),
  f('bagel', ['plain bagel'], { kcal: 257, protein: 10, carbs: 50, fat: 1.5 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 95 }, { avgGrams: 95, label: 'bagel' }),
  f('tortilla wrap', ['flour tortilla', 'wrap', 'tortilla', 'wholemeal wrap', 'wholemeal tortilla', 'whole wheat tortilla'], { kcal: 310, protein: 8.4, carbs: 50, fat: 8 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 60 }),
  f('corn tortilla', [], { kcal: 218, protein: 5.7, carbs: 44, fat: 2.8 }, 'carb', { is_grain: true, is_high_carb: true }, { whole: 26 }),
  f('pitta bread', ['pita bread', 'pitta'], { kcal: 275, protein: 9.1, carbs: 56, fat: 1.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }, { whole: 60 }),
  f('couscous cooked', ['couscous'], { kcal: 112, protein: 3.8, carbs: 23, fat: 0.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('quinoa cooked', ['quinoa'], { kcal: 120, protein: 4.4, carbs: 21, fat: 1.9 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('oats', ['rolled oats', 'porridge oats', 'oatmeal'], { kcal: 379, protein: 13.5, carbs: 67.7, fat: 6.9 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('potato boiled', ['potato', 'boiled potato', 'new potatoes'], { kcal: 87, protein: 1.9, carbs: 20, fat: 0.1 }, 'carb', { is_high_carb: true }),
  f('potato baked', ['baked potato', 'jacket potato'], { kcal: 93, protein: 2.5, carbs: 21, fat: 0.1 }, 'carb', { is_high_carb: true }),
  f('mashed potato', ['instant mashed potato', 'instant mashed potatoes', 'prepared instant mashed potatoes'], { kcal: 105, protein: 1.9, carbs: 16, fat: 4 }, 'carb', { contains_dairy: true, is_high_carb: true }),
  f('sweet potato baked', ['sweet potato', 'baked sweet potato'], { kcal: 90, protein: 2, carbs: 21, fat: 0.2 }, 'carb', { is_high_carb: true }),
  f('egg noodles cooked', ['egg noodles', 'noodles'], { kcal: 138, protein: 4.5, carbs: 25, fat: 2.1 }, 'carb', { is_grain: true, contains_egg: true, contains_gluten: true, is_high_carb: true }),
  f('rice noodles cooked', ['rice noodles'], { kcal: 109, protein: 1.8, carbs: 25, fat: 0.2 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('bulgur wheat cooked', ['bulgur wheat', 'bulgur'], { kcal: 83, protein: 3.1, carbs: 18.6, fat: 0.2 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('polenta cooked', ['polenta'], { kcal: 85, protein: 2, carbs: 18, fat: 0.5 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('breadcrumbs', ['panko breadcrumbs'], { kcal: 395, protein: 13, carbs: 72, fat: 5.3 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('plain flour', ['flour', 'all purpose flour', 'wholemeal flour', 'whole wheat flour', 'self raising flour'], { kcal: 364, protein: 10, carbs: 76, fat: 1 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('rice cakes', [], { kcal: 387, protein: 8.2, carbs: 81, fat: 2.8 }, 'carb', { is_grain: true, is_high_carb: true }, { whole: 9 }),
  f('crackers', ['water crackers', 'wheat crackers'], { kcal: 421, protein: 9, carbs: 71, fat: 11 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('rye crispbread', ['rye crispbreads', 'crispbread', 'crispbreads'], { kcal: 321, protein: 9.9, carbs: 71, fat: 1.5 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('pancake mix', ['pancake batter mix', 'dry pancake mix'], { kcal: 356, protein: 8, carbs: 76, fat: 3 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }),
  f('popcorn', ['air popped popcorn'], { kcal: 387, protein: 13, carbs: 78, fat: 4.5 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('tortilla chips', ['corn chips'], { kcal: 490, protein: 7, carbs: 63, fat: 24 }, 'carb', { is_grain: true, is_high_carb: true }),

  // ===== FAT: oils, nuts, seeds ========================================
  f('olive oil', ['extra virgin olive oil'], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 14, tsp: 4.5 }),
  f('vegetable oil', ['sunflower oil', 'cooking oil', 'rapeseed oil', 'canola oil'], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 14, tsp: 4.5 }),
  f('coconut oil', [], { kcal: 862, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 13, tsp: 4.5 }),
  f('avocado', [], { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7 }, 'fruit', {}, { whole: 150, half: 75 }, { avgGrams: 150, label: 'avocado' }),
  f('almonds', ['almond'], { kcal: 579, protein: 21.2, carbs: 22, fat: 49.9 }, 'fat', { contains_nuts: true }),
  f('walnuts', ['walnut', 'walnut halves'], { kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2 }, 'fat', { contains_nuts: true }),
  f('cashews', ['cashew nuts', 'cashew nut'], { kcal: 553, protein: 18.2, carbs: 30.2, fat: 43.9 }, 'fat', { contains_nuts: true }),
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
  f('broccoli', ['steamed broccoli', 'broccoli florets'], { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4 }, 'veg', {}, undefined, { avgGrams: 300, label: 'head' }), // avgGrams is a standard-head estimate, not a curated unit value like the others
  f('spinach', ['baby spinach', 'fresh spinach'], { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 }, 'veg', {}),
  f('kale', [], { kcal: 49, protein: 4.3, carbs: 8.8, fat: 0.9 }, 'veg', {}),
  f('mixed salad leaves', ['salad leaves', 'lettuce', 'mixed greens'], { kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2 }, 'veg', {}),
  f('tomato', ['tomatoes', 'fresh tomato'], { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, 'veg', {}),
  f('cherry tomatoes', [], { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, 'veg', {}),
  f('cucumber', [], { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 }, 'veg', {}),
  f('bell pepper', ['pepper', 'red pepper', 'bell peppers', 'capsicum', 'green pepper', 'yellow pepper', 'orange pepper'], { kcal: 31, protein: 1, carbs: 6, fat: 0.3 }, 'veg', {}),
  f('onion', ['onions', 'red onion', 'white onion', 'brown onion', 'yellow onion'], { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 }, 'veg', { is_high_fodmap: true }),
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
  f('banana', ['bananas'], { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, 'fruit', {}, { medium: 118 }, { avgGrams: 118, label: 'banana' }),
  f('apple', ['apples'], { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }, 'fruit', {}, { medium: 182 }, { avgGrams: 182, label: 'apple' }),
  f('orange', ['oranges'], { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1 }, 'fruit', {}, { medium: 131 }, { avgGrams: 131, label: 'orange' }),
  f('strawberries', ['strawberry'], { kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3 }, 'fruit', {}),
  f('blueberries', ['blueberry'], { kcal: 57, protein: 0.7, carbs: 14, fat: 0.3 }, 'fruit', {}),
  f('raspberries', ['raspberry'], { kcal: 52, protein: 1.2, carbs: 12, fat: 0.7 }, 'fruit', { is_high_fodmap: true }),
  f('mixed berries', ['frozen mixed berries', 'berries'], { kcal: 46, protein: 1, carbs: 11, fat: 0.5 }, 'fruit', {}),
  f('grapes', ['grape'], { kcal: 69, protein: 0.7, carbs: 18, fat: 0.2 }, 'fruit', {}),
  f('mango', [], { kcal: 60, protein: 0.8, carbs: 15, fat: 0.4 }, 'fruit', { is_high_fodmap: true }),
  f('pineapple', [], { kcal: 50, protein: 0.5, carbs: 13, fat: 0.1 }, 'fruit', {}),
  f('dates', ['medjool dates'], { kcal: 277, protein: 1.8, carbs: 75, fat: 0.2 }, 'fruit', { is_high_carb: true, is_high_fodmap: true }),
  f('raisins', [], { kcal: 299, protein: 3.1, carbs: 79, fat: 0.5 }, 'fruit', { is_high_carb: true, is_high_fodmap: true }),
  f('dried apricots', [], { kcal: 241, protein: 3.4, carbs: 63, fat: 0.5 }, 'fruit', { contains_sulphites: true, is_high_carb: true, is_high_fodmap: true }),
  f('kiwi', ['kiwi fruit'], { kcal: 61, protein: 1.1, carbs: 15, fat: 0.5 }, 'fruit', {}),
  f('watermelon', [], { kcal: 30, protein: 0.6, carbs: 7.6, fat: 0.2 }, 'fruit', { is_high_fodmap: true }),
  f('pear', ['pears'], { kcal: 57, protein: 0.4, carbs: 15, fat: 0.1 }, 'fruit', { is_high_fodmap: true }, { medium: 178 }, { avgGrams: 178, label: 'pear' }),
  f('lemon', ['lemon juice'], { kcal: 29, protein: 1.1, carbs: 9.3, fat: 0.3 }, 'fruit', {}),
  f('lime', ['lime juice'], { kcal: 30, protein: 0.7, carbs: 10.5, fat: 0.2 }, 'fruit', {}),

  // ===== CONDIMENTS / SAUCES / MISC ===================================
  f('soy sauce', ['light soy sauce', 'dark soy sauce', 'reduced salt soy sauce', 'low sodium soy sauce'], { kcal: 53, protein: 8, carbs: 4.9, fat: 0.6 }, 'condiment', { contains_soy: true, contains_gluten: true }, { tbsp: 18 }),
  f('tamari', ['gluten free soy sauce'], { kcal: 60, protein: 10, carbs: 5.6, fat: 0 }, 'condiment', { contains_soy: true }, { tbsp: 18 }),
  f('mayonnaise', ['mayo'], { kcal: 680, protein: 1, carbs: 1.3, fat: 75 }, 'condiment', { contains_egg: true }, { tbsp: 14 }),
  f('ketchup', ['tomato ketchup'], { kcal: 101, protein: 1.2, carbs: 24, fat: 0.1 }, 'condiment', { is_refined_sugar: true }, { tbsp: 17 }),
  f('mustard', ['dijon mustard', 'english mustard', 'wholegrain mustard'], { kcal: 66, protein: 4.4, carbs: 5, fat: 3.3 }, 'condiment', { contains_mustard: true }, { tbsp: 16 }),
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
  f('chopped tomatoes canned', ['tinned tomatoes', 'canned tomatoes', 'chopped tomatoes', 'tinned chopped tomatoes'], { kcal: 32, protein: 1.6, carbs: 5.5, fat: 0.3 }, 'condiment', {}),
  f('marinara sauce', ['marinara'], { kcal: 42, protein: 1.5, carbs: 7, fat: 1 }, 'condiment', {}),
  f('curry paste', ['thai curry paste', 'tikka paste'], { kcal: 168, protein: 3, carbs: 12, fat: 12 }, 'condiment', { is_high_fodmap: true }, { tbsp: 20 }),
  f('coconut cream', [], { kcal: 330, protein: 3.6, carbs: 6.7, fat: 34 }, 'fat', {}),
  f('gravy granules made', ['gravy'], { kcal: 65, protein: 1.2, carbs: 9, fat: 2.6 }, 'condiment', { contains_gluten: true }),
  f('worcestershire sauce', [], { kcal: 78, protein: 0, carbs: 19.5, fat: 0 }, 'condiment', { contains_fish: true }, { tbsp: 17 }),
  f('teriyaki sauce', [], { kcal: 89, protein: 5.9, carbs: 16, fat: 0 }, 'condiment', { contains_soy: true, contains_gluten: true }, { tbsp: 18 }),
  f('vegetable stock cube', ['stock cube', 'vegetable stock'], { kcal: 233, protein: 8, carbs: 40, fat: 5 }, 'condiment', { contains_celery: true, is_high_fodmap: true }),
  // Soy lecithin is a near-ubiquitous emulsifier in commercial chocolate —
  // brand-dependent, not knowable from the name. Absent reads as safe, so
  // true is the only fail-safe state this schema can express.
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
  // Nut content is brand-dependent and not knowable from the name (most UK
  // supermarket "original" granolas do carry almonds/pecans/walnuts). Absent
  // reads as safe in this schema, so removing the assertion would be a false
  // safe just as surely as `false` was — true is the only fail-safe state
  // this schema can express for a food whose allergen content varies by brand.
  f('granola', [], { kcal: 471, protein: 10, carbs: 64, fat: 20 }, 'carb', { is_grain: true, is_high_carb: true, contains_nuts: true }),
  // Same shape as granola — nut content is brand-dependent and not knowable
  // from the name (almonds/hazelnuts are common). Absent reads as safe, so
  // true is the only fail-safe state this schema can express.
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
  f('sour cream', ['soured cream'], { kcal: 198, protein: 2.4, carbs: 4.6, fat: 19.7 }, 'dairy', { contains_dairy: true }),
  f('creme fraiche', ['crème fraîche', 'half-fat creme fraiche', 'half-fat crème fraîche'], { kcal: 292, protein: 2.4, carbs: 3.4, fat: 30 }, 'dairy', { contains_dairy: true }),
  f('coleslaw', [], { kcal: 150, protein: 1.2, carbs: 8, fat: 13 }, 'condiment', { contains_egg: true, is_high_fodmap: true }),
  f('vinaigrette dressing', ['salad dressing', 'french dressing'], { kcal: 260, protein: 0.2, carbs: 8, fat: 25 }, 'condiment', {}, { tbsp: 15 }),
  f('ranch dressing', [], { kcal: 460, protein: 1, carbs: 6, fat: 48 }, 'condiment', { contains_dairy: true, contains_egg: true }, { tbsp: 15 }),
  f('apple cider vinegar', [], { kcal: 22, protein: 0, carbs: 0.9, fat: 0 }, 'condiment', {}, { tbsp: 15 }),
  f('cornflour', ['cornstarch'], { kcal: 381, protein: 0.3, carbs: 91, fat: 0.1 }, 'condiment', { is_high_carb: true }),
  f('curry powder', [], { kcal: 325, protein: 14, carbs: 55, fat: 14 }, 'condiment', {}),
  f('paprika', ['smoked paprika', 'sweet paprika'], { kcal: 282, protein: 14, carbs: 54, fat: 13 }, 'condiment', {}),
  f('cinnamon', ['ground cinnamon'], { kcal: 247, protein: 4, carbs: 81, fat: 1.2 }, 'condiment', {}),
  f('cumin', ['ground cumin'], { kcal: 375, protein: 18, carbs: 44, fat: 22 }, 'condiment', {}),
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
  // Untagged before this round (absent reads as safe), so nut-free never saw
  // it. Tagged for the same reason as 'peanut butter' above. Refined peanut
  // oil is often tolerated clinically, but that is a per-person medical call
  // this app cannot make from an ingredient string.
  f('peanut oil', [], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', { contains_nuts: true }, { tbsp: 14, tsp: 4.5 }),
  f('safflower oil', [], { kcal: 884, protein: 0, carbs: 0, fat: 100 }, 'fat', {}, { tbsp: 14, tsp: 4.5 }),
  f('red snapper', ['red snapper fillet'], { kcal: 100, protein: 20.5, carbs: 0, fat: 1.3 }, 'protein', { contains_fish: true }),
  f('beef broth', ['beef bone broth', 'beef stock'], { kcal: 15, protein: 2.5, carbs: 0.5, fat: 0.3 }, 'condiment', { contains_meat: true }),
  // MEAT STOCK IS MEAT (11 Oct 2026). Both broths carried no tag at all, so a
  // vegetarian or vegan meal with chicken stock in it passed the diet check.
  // Found by the lookup change's own measurement (the plan's section 10d).
  f('chicken broth', ['chicken stock'], { kcal: 12, protein: 1.5, carbs: 0.9, fat: 0.3 }, 'condiment', { contains_meat: true }),
  f('rice paper wrappers', ['rice paper'], { kcal: 333, protein: 0.7, carbs: 82, fat: 0.2 }, 'carb', { is_grain: true, is_high_carb: true }, { whole: 10 }),
  f('injera flatbread', ['injera'], { kcal: 220, protein: 7, carbs: 45, fat: 1.5 }, 'carb', { is_grain: true, is_high_carb: true }),
  f('calamansi juice', ['calamansi'], { kcal: 29, protein: 0.5, carbs: 9.5, fat: 0.2 }, 'fruit', {}),
  f('water', ['warm water', 'cold water', 'boiling water'], { kcal: 0, protein: 0, carbs: 0, fat: 0 }, 'other', {}),
  f('black coffee', ['coffee', 'cold brew coffee', 'brewed coffee', 'filter coffee'], { kcal: 1, protein: 0.1, carbs: 0, fat: 0 }, 'other', {}),

  // ===== THE SAME FOOD IN ANOTHER STATE (11 Oct 2026) =====================
  // docs/plans/ingredient-lookup-truth.md, rule 6. "37g dry penne pasta" was
  // costed as 37 g of COOKED pasta (11.5 g of carbs where dry pasta has about
  // 28), and "raw chicken breast" as cooked breast (31 g protein per 100 g
  // where raw has 22.5), because the lookup threw the word "dry" or "raw" away.
  // A line that names a state now reaches that state's own entry or nothing
  // (STATE_TWINS below). Figures per 100 g as recalled from USDA FoodData
  // Central (SR Legacy), cited by food so a wrong one is a one-line change;
  // the dry grain kcal are the same ones AS_BOUGHT (grocery-store.ts) already
  // uses to turn cooked grams into bag grams, so the two cannot disagree.
  f('pasta dry', ['dry pasta', 'dried pasta', 'uncooked pasta'], { kcal: 371, protein: 13, carbs: 74.7, fat: 1.5 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }), // USDA 20120 pasta, dry, unenriched
  f('wholewheat pasta dry', ['dry wholewheat pasta', 'dry whole wheat pasta'], { kcal: 348, protein: 14.6, carbs: 75, fat: 1.4 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }), // USDA 20124 spaghetti, whole-wheat, uncooked
  f('white rice dry', ['dry white rice', 'uncooked white rice', 'uncooked rice', 'dry rice'], { kcal: 365, protein: 7.1, carbs: 80, fat: 0.7 }, 'carb', { is_grain: true, is_high_carb: true }), // USDA 20444 rice, white, long-grain, raw
  f('brown rice dry', ['dry brown rice', 'uncooked brown rice'], { kcal: 367, protein: 7.5, carbs: 76.2, fat: 3.2 }, 'carb', { is_grain: true, is_high_carb: true }), // USDA 20036 rice, brown, long-grain, raw
  f('basmati rice dry', ['dry basmati rice', 'uncooked basmati rice'], { kcal: 356, protein: 8.1, carbs: 78, fat: 0.6 }, 'carb', { is_grain: true, is_high_carb: true }), // UK pack, basmati, dry (Tilda) as recalled
  f('couscous dry', ['dry couscous', 'uncooked couscous'], { kcal: 376, protein: 12.8, carbs: 77.4, fat: 0.6 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }), // USDA 20028 couscous, dry
  f('quinoa dry', ['dry quinoa', 'uncooked quinoa'], { kcal: 368, protein: 14.1, carbs: 64.2, fat: 6.1 }, 'carb', { is_grain: true, is_high_carb: true }), // USDA 20035 quinoa, uncooked
  f('egg noodles dry', ['dry egg noodles', 'dried egg noodles'], { kcal: 384, protein: 14.2, carbs: 71.3, fat: 4.4 }, 'carb', { is_grain: true, contains_egg: true, contains_gluten: true, is_high_carb: true }), // USDA 20109 noodles, egg, dry
  f('rice noodles dry', ['dry rice noodles', 'dried rice noodles'], { kcal: 364, protein: 6, carbs: 80.2, fat: 0.6 }, 'carb', { is_grain: true, is_high_carb: true }), // USDA 20133 rice noodles, dry
  f('red lentils dry', ['dry red lentils', 'dried red lentils'], { kcal: 352, protein: 24.6, carbs: 63.4, fat: 1.1 }, 'protein', { is_legume: true, is_high_carb: true }), // USDA 16069 lentils, raw
  f('green lentils dry', ['dry green lentils', 'dried green lentils'], { kcal: 352, protein: 24.6, carbs: 63.4, fat: 1.1 }, 'protein', { is_legume: true, is_high_carb: true }), // USDA 16069 lentils, raw
  f('chicken breast raw', ['raw chicken breast'], { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 }, 'protein', { contains_meat: true }), // USDA 05062 chicken breast, meat only, raw
  f('chicken thigh raw', ['raw chicken thigh'], { kcal: 121, protein: 19.7, carbs: 0, fat: 4.1 }, 'protein', { contains_meat: true }), // USDA 05096 chicken thigh, meat only, raw
  f('cod raw', ['raw cod'], { kcal: 82, protein: 17.8, carbs: 0, fat: 0.7 }, 'protein', { contains_fish: true }), // USDA 15015 cod, Atlantic, raw
  f('prawns raw', ['raw prawns', 'raw king prawns', 'raw shrimp'], { kcal: 85, protein: 20.1, carbs: 0, fat: 0.5 }, 'protein', { contains_shellfish: true }), // USDA 15270 shrimp, raw
  f('turkey breast raw', ['raw turkey breast'], { kcal: 114, protein: 23.7, carbs: 0, fat: 1.5 }, 'protein', { contains_meat: true }), // USDA turkey, breast, meat only, raw
  f('pork loin raw', ['raw pork loin', 'raw pork tenderloin'], { kcal: 120, protein: 21, carbs: 0, fat: 3.5 }, 'protein', { contains_meat: true, contains_pork: true }), // USDA 10060 pork tenderloin, raw
  f('haddock raw', ['raw haddock'], { kcal: 74, protein: 16.3, carbs: 0, fat: 0.5 }, 'protein', { contains_fish: true }), // USDA 15033 haddock, raw
  // ===== A LIGHTER VERSION IS ANOTHER FOOD (11 Oct 2026) ====================
  // "light mayonnaise" was costed as full mayonnaise (680 kcal per 100 g where
  // light is about 240) because "light" was thrown away. A fat level now has to
  // be named by an entry or the line is a miss; these are the ones a meal
  // writer uses most.
  f('mayonnaise light', ['light mayonnaise', 'reduced fat mayonnaise', 'low fat mayonnaise', 'light mayo'], { kcal: 238, protein: 0.4, carbs: 9.2, fat: 22.2 }, 'condiment', { contains_egg: true }, { tbsp: 15 }), // USDA salad dressing, mayonnaise, light
  f('cottage cheese low fat', ['low fat cottage cheese', 'reduced fat cottage cheese', 'light cottage cheese'], { kcal: 72, protein: 12.4, carbs: 2.7, fat: 1 }, 'dairy', { contains_dairy: true }), // USDA cheese, cottage, lowfat, 1% milkfat
  f('cream cheese light', ['light cream cheese', 'low fat cream cheese', 'reduced fat cream cheese'], { kcal: 201, protein: 7.9, carbs: 8.1, fat: 15.3 }, 'dairy', { contains_dairy: true }), // USDA cheese, cream, low fat
  f('mozzarella light', ['light mozzarella', 'reduced fat mozzarella', 'part skim mozzarella'], { kcal: 254, protein: 24.3, carbs: 2.8, fat: 15.9 }, 'dairy', { contains_dairy: true }), // USDA cheese, mozzarella, part skim milk
  f('coconut milk light', ['light coconut milk', 'reduced fat coconut milk'], { kcal: 73, protein: 0.7, carbs: 1.7, fat: 7 }, 'fat', {}), // pack: typical light coconut milk label, as recalled
  // "chocolate rice cake" is the snack the 8 Sep plural fix was written for; it
  // used to be costed as a PLAIN rice cake. Milk chocolate is assumed (dairy,
  // fail-safe) since the line rarely says which.
  f('chocolate rice cakes', ['milk chocolate rice cakes', 'dark chocolate rice cakes'], { kcal: 480, protein: 7, carbs: 63, fat: 22 }, 'carb', { is_grain: true, is_high_carb: true, is_refined_sugar: true, contains_dairy: true, contains_soy: true }, { whole: 16 }), // pack: typical chocolate-topped rice cake label, as recalled
  // ===== THE QUALIFIER IS THE FOOD (11 Oct 2026) ============================
  // "oat flour" used to resolve to plain (wheat) flour and "coconut water" to
  // water, because the first word was thrown away (M23; the plan's section D).
  // Oat flour is tagged gluten ON PURPOSE (fail-safe): oats are milled beside
  // wheat unless certified, and "oat flour" was refused for gluten-free before
  // (as plain flour), so no verdict moves. Whether OATS pass gluten-free is
  // Ashley's open question and is not touched here.
  f('oat flour', [], { kcal: 404, protein: 14.7, carbs: 65.7, fat: 9.1 }, 'carb', { is_grain: true, contains_gluten: true, is_high_carb: true }), // USDA 20033 oat flour, partially debranned
  f('almond flour', ['ground almonds', 'almond meal'], { kcal: 571, protein: 21.4, carbs: 21.4, fat: 50 }, 'fat', { contains_nuts: true }), // USDA 12061 (blanched almond flour, label figures)
  f('coconut flour', [], { kcal: 400, protein: 19, carbs: 60, fat: 13 }, 'carb', {}), // pack: typical coconut flour label, as recalled
  f('rice flour', ['white rice flour'], { kcal: 366, protein: 6, carbs: 80.1, fat: 1.4 }, 'carb', { is_grain: true, is_high_carb: true }), // USDA 20061 rice flour, white
  f('coconut water', [], { kcal: 19, protein: 0.7, carbs: 3.7, fat: 0.2 }, 'other', {}), // USDA 12119 coconut water
  f('water chestnuts', ['canned water chestnuts'], { kcal: 50, protein: 1.1, carbs: 12.3, fat: 0.1 }, 'veg', {}), // USDA 11591 water chestnuts, canned, solids
  // A seasoning a method names had no entry at all, so the check on recipe
  // steps could not see it (M19: the prawn salad's "chilli flakes").
  f('chilli flakes', ['chili flakes', 'red pepper flakes', 'crushed chillies', 'crushed red pepper', 'dried chilli flakes'], { kcal: 314, protein: 12, carbs: 50, fat: 17 }, 'condiment', {}, { tsp: 1.5 }), // USDA 02031 pepper, red or cayenne
]

// ---------------------------------------------------------------------------
// Lookup index — built once at module load
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  // Decompose accented Latin characters to their base letter + a combining
  // mark (NFD), then drop the combining marks — "crème" -> "creme", "café"
  // -> "cafe" — BEFORE the punctuation pass below. Without this, the
  // [^a-z0-9\s] regex treated every accented character as punctuation and
  // replaced it with a space ("crème" -> "cr me"), silently breaking
  // tokenization for every accented ingredient name (confirmed: "crème
  // fraîche" was an unresolved-ingredient failure from the very first
  // meal-quality baseline, long before this fix).
  //
  // Replace (not strip) punctuation with a space — stripping it fused
  // adjacent words into unmatchable tokens ("seitan-based" -> "seitanbased",
  // "boiled/instant" -> "boiledinstant"), which made every hyphenated or
  // slash-separated ingredient name an automatic lookup miss.
  //
  // ONE SPELLING PER WORD (11 Oct 2026): "chilli" and "chili" are one word
  // (chilli flakes, chili powder, sweet chili sauce). Both sides of every
  // comparison go through here, so folding the word once is enough.
  // "yogurt"/"yoghurt" is deliberately NOT folded: in this table "greek
  // yogurt" is the FULL-FAT entry and "greek yoghurt" has always reached the
  // 0% one, so folding them would re-cost every Greek yoghurt in every meal.
  // That disagreement is recorded in BACKLOG (11 Oct) rather than settled here.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map(w => SPELLINGS[w] ?? w).join(' ')
}

/** British and American spellings of one word -> the one this table uses. */
const SPELLINGS: Record<string, string> = {
  chili: 'chilli', chilis: 'chillies', chilies: 'chillies', chiles: 'chillies',
}

// ---------------------------------------------------------------------------
// HOUSEHOLD MEASURES (1 Oct 2026; docs/plans/ingredient-units.md).
// What one "whole" carrot, a cup of oats, a tin of tuna or a handful of rocket
// weighs. Measured the same day: 39 of 40 vegetables, 73 of 76 proteins and
// every dairy food had no piece or cup weight, so "2 carrots" was costed as 2 g
// and a cup was 240 g of everything (a cup of oats is about 85 g: 910 kcal where
// 340 is right). A line whose measure is not here is UNREAD and asked about,
// never guessed, so a gap in this table costs a question, not a wrong number.
//
// Values are the household measures in the USDA FoodData Central and typical UK
// shop sizes, each good to about +/-15%. Cups are the dry/cooked/chopped state the
// food's own entry describes (cooked rice, rolled oats, chopped raw spinach); tins
// are the DRAINED weight where a tin is drained (pulses, tuna, sweetcorn). A key
// here never replaces a unit the entry already names, and every name must exist
// (test:ingredient-units holds both).
// ---------------------------------------------------------------------------
const HOUSEHOLD_UNITS: Record<string, Record<string, number>> = {
  // vegetables: a whole one
  'tomato': { whole: 123 }, 'cherry tomatoes': { whole: 17, handful: 80, cup: 149 }, 'cucumber': { whole: 300, cup: 104 },
  'bell pepper': { whole: 150, cup: 149 }, 'onion': { whole: 110, cup: 160 }, 'carrot': { whole: 61, cup: 128 },
  'courgette': { whole: 200, cup: 113 }, 'mushroom': { whole: 18, cup: 70 }, 'cauliflower': { head: 600, whole: 600, cup: 100 },
  'aubergine': { whole: 350, cup: 82 }, 'leek': { whole: 90, cup: 89 }, 'beetroot': { whole: 82, cup: 136 },
  'butternut squash': { whole: 900, cup: 140 }, 'radish': { whole: 5 }, 'spring onion': { whole: 15, bunch: 90 },
  'parsnip': { whole: 130 }, 'turnip': { whole: 120 }, 'fennel': { whole: 230 }, 'artichoke': { whole: 120 },
  'okra': { whole: 12 }, 'shallots': { whole: 40 }, 'celery': { stick: 40, stalk: 40, cup: 101 },
  'cabbage': { head: 900, cup: 90 }, 'bok choy': { head: 100, cup: 70 }, 'garlic': { head: 50 },
  // leaves and small veg: cups and handfuls
  'spinach': { cup: 30, handful: 30 }, 'kale': { cup: 67, handful: 25 }, 'mixed salad leaves': { cup: 35, handful: 30 },
  'rocket': { cup: 20, handful: 20 }, 'watercress': { cup: 34, handful: 30 }, 'bean sprouts': { cup: 104, handful: 40 },
  'broccoli': { cup: 91 }, 'green beans': { cup: 110 }, 'peas': { cup: 145 }, 'sweetcorn': { cup: 154, can: 160 },
  'asparagus': { cup: 134 }, 'brussels sprouts': { cup: 88 }, 'pumpkin': { cup: 116 },
  'bamboo shoots': { can: 225 },
  // fruit
  'lemon': { whole: 58 }, 'lime': { whole: 67 }, 'kiwi': { whole: 69, cup: 180 }, 'peach': { whole: 150, cup: 154 },
  'plum': { whole: 66, cup: 165 }, 'grapefruit': { whole: 230 }, 'mango': { whole: 336, cup: 165 },
  'dates': { whole: 24, cup: 147 }, 'figs': { whole: 50 }, 'pomegranate': { whole: 280, cup: 174 }, 'passion fruit': { whole: 18 },
  'strawberries': { whole: 12, cup: 152, handful: 75 }, 'blueberries': { cup: 148, handful: 75 }, 'raspberries': { cup: 123, handful: 60 },
  'blackberries': { cup: 144, handful: 75 }, 'mixed berries': { cup: 140, handful: 75 }, 'grapes': { cup: 151, handful: 80 },
  'pineapple': { cup: 165, can: 230 }, 'watermelon': { cup: 152 }, 'cherries': { cup: 138 }, 'raisins': { cup: 145, handful: 30 },
  'dried apricots': { whole: 8, cup: 130 }, 'coconut flesh': { cup: 80 },
  // protein foods: a piece (cooked weight, as the entry's figures are), pulses by the cup and the tin
  'chicken breast': { whole: 140 }, 'chicken thigh': { whole: 110 }, 'chicken drumstick': { whole: 80 },
  'pork sausage': { whole: 60 }, 'bacon': { whole: 12, slice: 12 }, 'ham': { slice: 25 }, 'chorizo': { slice: 6 },
  'salmon': { whole: 150 }, 'cod': { whole: 150 }, 'haddock': { whole: 150 }, 'sea bass': { whole: 130 }, 'tilapia': { whole: 120 },
  'trout': { whole: 150 }, 'mackerel': { whole: 130 }, 'beef steak sirloin': { whole: 225 }, 'beef rump steak': { whole: 225 },
  'lamb chop': { whole: 90 }, 'pork chop': { whole: 150 }, 'prawns': { whole: 12 }, 'scallops': { whole: 25 }, 'anchovies': { whole: 4 },
  'falafel': { whole: 17 }, 'smoked salmon': { slice: 30 },
  'tuna canned in water': { can: 120 }, 'sardines canned': { can: 90 }, 'crab meat': { can: 145 },
  'chickpeas': { cup: 164, can: 240 }, 'black beans': { cup: 172, can: 240 }, 'kidney beans': { cup: 177, can: 240 },
  'pinto beans': { cup: 171, can: 240 }, 'butter beans': { cup: 177, can: 240 }, 'cannellini beans': { cup: 179, can: 240 },
  'haricot beans': { cup: 179, can: 240 }, 'lentils red': { cup: 198, can: 240 }, 'lentils green': { cup: 198, can: 240 },
  'brown lentils': { cup: 198, can: 240 }, 'split peas': { cup: 196 }, 'edamame': { cup: 155, handful: 60 },
  'tofu firm': { cup: 248 }, 'tofu silken': { cup: 248 }, 'tempeh': { cup: 166 },
  // grains, starches and bakery
  'white rice cooked': { cup: 160 }, 'brown rice cooked': { cup: 160 }, 'basmati rice cooked': { cup: 160 },
  'pasta cooked': { cup: 140 }, 'wholewheat pasta cooked': { cup: 140 }, 'couscous cooked': { cup: 157 }, 'quinoa cooked': { cup: 185 },
  'oats': { cup: 85 }, 'bulgur wheat cooked': { cup: 182 }, 'polenta cooked': { cup: 240 }, 'millet cooked': { cup: 174 },
  'buckwheat cooked': { cup: 168 }, 'barley': { cup: 157 }, 'egg noodles cooked': { cup: 160 }, 'rice noodles cooked': { cup: 176 },
  'potato boiled': { whole: 170, cup: 156 }, 'potato baked': { whole: 200 }, 'mashed potato': { cup: 210 },
  'sweet potato baked': { whole: 130, cup: 200 }, 'sweet potato raw': { whole: 130 }, 'plantain': { whole: 150 },
  'breadcrumbs': { cup: 108 }, 'plain flour': { cup: 125 }, 'cornmeal': { cup: 157 }, 'granola': { cup: 110, handful: 40 },
  'muesli': { cup: 85, handful: 40 }, 'cornflakes': { cup: 28 }, 'popcorn': { cup: 8, handful: 15 }, 'tortilla chips': { handful: 30 },
  'weetabix': { whole: 19 }, 'crackers': { whole: 5 }, 'rye crispbread': { whole: 10 }, 'croissant': { whole: 57 },
  // dairy and fats by the cup
  'milk whole': { cup: 244 }, 'milk skimmed': { cup: 245 }, 'milk semi skimmed': { cup: 244 }, 'soy milk': { cup: 243 },
  'almond milk': { cup: 240 }, 'oat milk': { cup: 240 }, 'greek yoghurt 0%': { cup: 245 }, 'greek yoghurt full fat': { cup: 245 },
  'natural yoghurt': { cup: 245 }, 'soy yoghurt': { cup: 245 }, 'coconut yoghurt': { cup: 245 }, 'cottage cheese': { cup: 226 },
  'ricotta cheese': { cup: 246 }, 'cheddar cheese': { cup: 113 }, 'mozzarella': { cup: 112 }, 'feta cheese': { cup: 150 },
  'parmesan': { cup: 100 }, 'cream cheese': { cup: 232 }, 'double cream': { cup: 238 }, 'single cream': { cup: 240 },
  'sour cream': { cup: 230 }, 'creme fraiche': { cup: 240 }, 'quark': { cup: 240 }, 'skyr': { cup: 245 },
  'almonds': { cup: 143, handful: 28 }, 'walnuts': { cup: 100, handful: 30 }, 'cashews': { cup: 137, handful: 30 },
  'peanuts': { cup: 146, handful: 30 }, 'mixed nuts': { cup: 137, handful: 30 }, 'pistachios': { cup: 123, handful: 30 },
  'pecans': { cup: 99, handful: 30 }, 'hazelnuts': { cup: 135, handful: 30 }, 'brazil nuts': { cup: 133, handful: 30 },
  'sunflower seeds': { cup: 140, handful: 30 }, 'pumpkin seeds': { cup: 129, handful: 30 }, 'chia seeds': { cup: 160 },
  'sesame seeds': { cup: 144 }, 'olives': { cup: 134, handful: 30 }, 'butter': { cup: 227 }, 'peanut butter': { cup: 258 },
  'coconut milk canned': { cup: 240, can: 400 }, 'coconut cream': { cup: 240, can: 400 }, 'coconut flakes': { cup: 80 },
  // sauces, sweeteners and tins
  'hummus': { cup: 246 }, 'salsa': { cup: 259 }, 'tomato passata': { cup: 245 }, 'chopped tomatoes canned': { cup: 240, can: 400 },
  'marinara sauce': { cup: 250 }, 'honey': { cup: 340 }, 'maple syrup': { cup: 315 }, 'sugar white': { cup: 200 },
  'brown sugar': { cup: 220 }, 'jam': { cup: 320 }, 'ketchup': { cup: 240 }, 'mayonnaise': { cup: 220 }, 'chicken broth': { cup: 240 },
  'beef broth': { cup: 240 }, 'guacamole': { cup: 230 }, 'tzatziki': { cup: 240 }, 'trail mix': { cup: 150, handful: 40 },
  'dark chocolate': { cup: 170 }, 'nutritional yeast': { cup: 60 }, 'water': { cup: 237 }, 'black coffee': { cup: 237 },
  'star anise': { whole: 0.5 }, 'bay leaves': { whole: 0.2 }, 'lemongrass': { whole: 30, stalk: 30 }, 'curry leaves': { whole: 0.1, sprig: 1 },
  'oysters': { whole: 15 },
  'coriander': { handful: 20, bunch: 30 }, 'dill': { handful: 20, bunch: 30 }, 'basil': { handful: 15, bunch: 30 },
}
for (const [name, extra] of Object.entries(HOUSEHOLD_UNITS)) {
  const entry = FOOD_DB.find(f => f.name === name)
  // A name that matches nothing is a typo that would silently do nothing; the gate fails on it, and the loop skips it so the app still loads.
  if (entry) entry.units = { ...extra, ...(entry.units ?? {}) }
}

const LOOKUP = new Map<string, FoodEntry>()
for (const entry of FOOD_DB) {
  LOOKUP.set(normalize(entry.name), entry)
  for (const alias of entry.aliases) LOOKUP.set(normalize(alias), entry)
}
// PLURALS ON THE STORED SIDE TOO. lookupIngredient de-pluralises the QUERY as
// a last resort, so "scallions" reaches "scallion" — but "rice cakes" is
// stored plural, and "chocolate rice cake" never reached it: 8 Sep 2026,
// every ingredient in a real snack came back unmatched and the reply printed
// "roughly 0 kcal … 0% of the meal by weight". Each key is also indexed under
// its de-pluralised form when that form is free, so the token-overlap pass
// can see it. Same conservative rule as the query side (depluralizeToken).
//
// This lived ONLY in the coach's hand-copied database from 9 Sep to 9 Oct
// 2026, while the count fix and nine foods lived only in this one. The two
// are now one file (see the header), so a fix cannot land on one side again.
//
// THE DIET CHECK READS THIS TOO, SINCE 11 OCT 2026. From 9 Oct it read the
// names exactly as stored (a separate "as stored" lookup), because with these
// extra keys "prawn cocktail" became plain prawns and "sausage roll" pork
// sausage — a dish judged as one ingredient, which is weaker than "cannot be
// resolved, refused". The lookup below no longer lets a dish stand for one of
// its ingredients (every word must be accounted for), so that reason is gone
// and there is one lookup again (docs/plans/ingredient-lookup-truth.md, 10b).
// (This block appeared twice after the 11 Oct merge; the second copy did
// nothing and is gone.)
for (const [key, entry] of [...LOOKUP]) {
  const folded = key.split(' ').map(depluralizeToken).join(' ')
  if (folded !== key && !LOOKUP.has(folded)) LOOKUP.set(folded, entry)
}

// ---------------------------------------------------------------------------
// ONE WORD THAT NAMES A KIND OF FOOD (11 Oct 2026; plan rule 5)
// ---------------------------------------------------------------------------
// Until today a bare "chicken", "rice" or "milk" was matched to whichever
// LONGER name happened to contain it — luck, by insertion order, and once
// dangerous: "chicken" was seitan ("meat free chicken pieces"), so a line
// saying "chicken" passed the vegetarian and vegan checks. That pass is gone.
//
// A bare word now means a food only if it is listed here, and only where every
// food it could plausibly mean carries the same allergen and diet tags, so
// the guess can move the numbers a little and never a verdict. The target is
// what the app already assumed before today, except "chicken" (seitan was the
// unsafe answer; every chicken entry is meat). Deliberately NOT here, because
// the foods a word covers differ on a tag: cheese and yoghurt (vegan versions
// exist), sausage (pork or vegan), fish (fish sauce was the old answer),
// cream, nuts, beans, burger, turkey/beef/pork/lamb on their own. Those are a
// miss, which the coach asks about. Whether the app should assume the
// commonest kind and SAY so, or ask, is Ashley's open question (plan, 10c).
const GENERIC_NAMES: Record<string, string> = {
  chicken: 'chicken breast', rice: 'white rice cooked', milk: 'milk whole', tuna: 'tuna canned in water',
  mince: 'beef mince 5% fat', oil: 'olive oil', whey: 'whey protein powder',
}
for (const [word, target] of Object.entries(GENERIC_NAMES)) {
  const entry = FOOD_DB.find(f => f.name === target)
  if (entry && !LOOKUP.has(word)) LOOKUP.set(word, entry)
}

// ---------------------------------------------------------------------------
// EVERY WORD MUST BE ACCOUNTED FOR (11 Oct 2026)
// ---------------------------------------------------------------------------
// The lookup used to keep the words it knew and throw the rest away, so a
// DISH was costed and tagged as one of its ingredients ("chicken caesar wrap"
// was an empty tortilla, 186 kcal; "almond-crusted cod" was cod, no nut tag),
// a DRY food as its cooked form (M20), and a SHORT name as whichever longer
// name contained it — bare "chicken" was seitan, so an ingredient line saying
// "chicken" passed the vegetarian and vegan checks. Ashley's ruling, 9 Oct
// 2026: "Build all four" (item 3). Plan: docs/plans/ingredient-lookup-truth.md.
//
// Now a known name found inside a longer phrase only counts when every word
// left over is one of these: words that say how a food was prepared, cut or
// sized, never which food it is. Anything else is a MISS, and a miss is the
// safe answer: not counted in a meal's numbers, refused by the diet check for
// every restriction, asked about by the coach. Kept short on purpose ("crusted"
// must never be here, nor "with", "in" or "on", which join two foods); the
// gate reads this list from the source, so nothing is added unseen.
export const HARMLESS_WORDS: ReadonlySet<string> = new Set([
  // how it was cooked or prepared
  'grilled', 'baked', 'roasted', 'roast', 'steamed', 'boiled', 'poached', 'fried', 'pan', 'stir', 'seared', 'toasted',
  'chopped', 'finely', 'roughly', 'diced', 'sliced', 'thinly', 'grated', 'shredded', 'crushed', 'cubed', 'halved',
  'quartered', 'peeled', 'trimmed', 'drained', 'rinsed', 'beaten', 'melted', 'softened', 'chilled', 'cold', 'warm',
  'shelled', 'deseeded', 'pitted', 'torn', 'flaked', 'heaped', 'level',
  // which one, never what it is
  'fresh', 'frozen', 'lean', 'extra', 'skinless', 'boneless', 'plain', 'ripe', 'large', 'medium', 'small', 'baby',
  'whole', 'organic', 'free', 'range', 'unsalted', 'salted', 'unsweetened', 'smooth', 'crunchy', 'thick', 'thin', 'mini',
  'minced', 'tinned', 'canned', 'mature', 'mild', 'tenderstem', 'sourdough', 'wholemeal', 'wholegrain',
  // a cut or a piece of the same food
  'fillet', 'strip', 'piece', 'chunk', 'floret', 'leaf', 'leaves', 'half', 'halves', 'slice', 'rasher', 'cube', 'wedge',
  'segment', 'clove', 'sprig', 'stick', 'stalk', 'spear', 'ring', 'loin',
  // glue and serving words
  'of', 'the', 'a', 'an', 'some', 'into', 'to', 'for', 'garnish', 'serve', 'serving', 'optional', 'based',
])

/** "and" is harmless only BETWEEN two harmless words ("chopped and drained"); between two foods it means two foods. */
const JOINING_WORD = 'and'

export type FoodState = 'cooked' | 'dry' | 'raw'

/**
 * The state each entry's figures describe, where it matters. Only foods whose
 * numbers change a lot between states are listed: a cooked grain, pasta or
 * pulse against its dry weight (2.5-3x) and a cooked lean meat or fish against
 * its raw weight (about 1.35x). Read off this table's own figures, `salmon`
 * and both beef mince entries are RAW figures already, so they are not here
 * and "raw salmon" was right all along. An entry with no state takes any state
 * word ("cooked spinach", "raw honey") — except that DRIED fruit or veg is a
 * different food (dried mango is five times the calories of fresh), so "dried"
 * against fresh produce is a miss.
 */
const ENTRY_STATE: Record<string, FoodState> = {
  'chicken breast': 'cooked', 'chicken thigh': 'cooked', 'chicken drumstick': 'cooked', 'turkey breast': 'cooked',
  'beef steak sirloin': 'cooked', 'beef rump steak': 'cooked', 'lamb chop': 'cooked', 'pork chop': 'cooked', 'pork loin': 'cooked',
  'cod': 'cooked', 'haddock': 'cooked', 'tilapia': 'cooked', 'sea bass': 'cooked', 'mackerel': 'cooked', 'prawns': 'cooked', 'mussels': 'cooked',
  'chickpeas': 'cooked', 'lentils red': 'cooked', 'lentils green': 'cooked', 'brown lentils': 'cooked', 'black beans': 'cooked',
  'kidney beans': 'cooked', 'pinto beans': 'cooked', 'butter beans': 'cooked', 'cannellini beans': 'cooked', 'haricot beans': 'cooked',
  'gluten free pasta': 'cooked', 'oats': 'dry',
}

/** cooked entry -> its dry and raw twins. The twins' own state is set from this table when the module loads. */
const STATE_TWINS: Record<string, { dry?: string; raw?: string }> = {
  'pasta cooked': { dry: 'pasta dry' }, 'wholewheat pasta cooked': { dry: 'wholewheat pasta dry' },
  'white rice cooked': { dry: 'white rice dry' }, 'brown rice cooked': { dry: 'brown rice dry' }, 'basmati rice cooked': { dry: 'basmati rice dry' },
  'couscous cooked': { dry: 'couscous dry' }, 'quinoa cooked': { dry: 'quinoa dry' },
  'egg noodles cooked': { dry: 'egg noodles dry' }, 'rice noodles cooked': { dry: 'rice noodles dry' },
  'lentils red': { dry: 'red lentils dry' }, 'lentils green': { dry: 'green lentils dry' },
  'chicken breast': { raw: 'chicken breast raw' }, 'chicken thigh': { raw: 'chicken thigh raw' }, 'turkey breast': { raw: 'turkey breast raw' },
  'pork loin': { raw: 'pork loin raw' }, 'cod': { raw: 'cod raw' }, 'haddock': { raw: 'haddock raw' }, 'prawns': { raw: 'prawns raw' },
}
const COOKED_TWIN_OF: Record<string, string> = {}
for (const [cooked, twins] of Object.entries(STATE_TWINS)) {
  if (twins.dry) { ENTRY_STATE[twins.dry] = 'dry'; COOKED_TWIN_OF[twins.dry] = cooked }
  if (twins.raw) { ENTRY_STATE[twins.raw] = 'raw'; COOKED_TWIN_OF[twins.raw] = cooked }
}
for (const entry of FOOD_DB) if (/\bcooked\b/.test(entry.name) && !ENTRY_STATE[entry.name]) ENTRY_STATE[entry.name] = 'cooked'

/** The state an entry's figures describe, or undefined when the state word does not change its numbers much. */
export function stateOf(entry: FoodEntry): FoodState | undefined {
  return ENTRY_STATE[entry.name]
}

/** A state word in a line, and what it asks for. "uncooked" is dry for a grain and raw for a meat. */
const STATE_WORDS: Record<string, 'dry' | 'raw' | 'uncooked' | 'cooked'> = { dry: 'dry', dried: 'dry', uncooked: 'uncooked', raw: 'raw', cooked: 'cooked' }

/** Every word an entry's own name and aliases use: "penne pasta" is pasta, because "penne" is one of pasta's own names. */
const OWN_WORDS = new Map<FoodEntry, Set<string>>()
for (const entry of FOOD_DB) {
  const words = new Set<string>()
  for (const n of [entry.name, ...entry.aliases]) for (const w of normalize(n).split(' ')) if (w) { words.add(w); words.add(depluralizeToken(w)) }
  OWN_WORDS.set(entry, words)
}

// ---------------------------------------------------------------------------
// PIECE WEIGHTS — what ONE of them weighs
// ---------------------------------------------------------------------------
// "2 eggs", "1 can of tuna", "5 rye crispbreads" are how people say what they
// ate, and until 9 Oct 2026 only ten foods here knew what one of them weighed.
// Everything else fell through to "treat the number as grams": two eggs were
// two grams of egg, five crispbreads were five grams (H6 and M23 in that
// day's test log). A food with no row here and no unit of its own is now
// "amount unknown" (see unitToGrams) — never a guess.
//
// EVERY FIGURE NAMES WHERE IT CAME FROM. Three references, abbreviated:
//   USDA = USDA FoodData Central, the "portion" (household measure) weights
//          published with each Standard Reference food.
//   FPS  = UK Food Standards Agency, "Food Portion Sizes" (3rd edition).
//   BNF  = British Nutrition Foundation, "Find your balance" portion guide.
//   pack = the weight printed on the ordinary UK supermarket pack, named.
// Checked against the live source on 9 Oct 2026: the BNF rows and the tuna
// can. The USDA and FPS rows are as recalled from those tables and are cited
// so they can be checked; a wrong one is a one-line change.
// This table is cooked-basis for meat and fish (see the file header), so a
// fillet or a breast is its COOKED weight. Keys are the unit words a line may
// use; `medium` or `whole` is what a bare count ("2 bananas") means.
// A weight already written on the entry itself wins over a row here.
const PIECE_WEIGHTS: Record<string, Record<string, number>> = {
  // --- bread, crackers, cereal ---------------------------------------------
  'rye crispbread': { whole: 10, slice: 10 },          // pack: Ryvita Original, 10 g a slice
  'crackers': { whole: 7 },                            // FPS: one cream cracker 7 g
  'weetabix': { whole: 19, biscuit: 19 },              // pack: Weetabix, 2 biscuits = 37.5 g
  'croissant': { whole: 57 },                          // USDA: croissant, butter, 1 medium 57 g
  'falafel': { whole: 17 },                            // USDA: falafel, 1 patty 17 g
  // --- meat and fish, cooked weight ------------------------------------------
  'chicken breast': { breast: 120, fillet: 120 },      // BNF: a grilled chicken breast, 120 g
  'bacon': { rasher: 25, slice: 25 },                  // FPS: back bacon, one grilled rasher 25 g
  'ham': { slice: 23 },                                // FPS: ham, one average slice 23 g
  'pork sausage': { whole: 40 },                       // FPS: one large sausage, grilled 40 g
  'salmon': { fillet: 100 },                           // BNF: a cooked fish fillet (salmon or cod), 100-140 g · UK packs sell at about 120 g raw
  'cod': { fillet: 120 },                              // BNF: a cooked fish fillet (salmon or cod), 100-140 g
  'haddock': { fillet: 120 },                          // FPS: as cod
  'tilapia': { fillet: 87 },                           // USDA: tilapia, cooked, 1 fillet 87 g
  'sea bass': { fillet: 101 },                         // USDA: sea bass, cooked, 1 fillet 101 g
  'trout': { fillet: 71 },                             // USDA: rainbow trout, farmed, cooked, 1 fillet 71 g
  'mackerel': { fillet: 88 },                          // USDA: Atlantic mackerel, cooked, 1 fillet 88 g
  'tuna canned in water': { can: 102 },                // pack: John West tuna chunks, 102 g drained
  'sardines canned': { can: 90 },                      // pack: 120 g can, about 90 g drained
  // --- cans of pulses and tomatoes -------------------------------------------
  'chickpeas': { can: 240 },                           // pack: 400 g can, 240 g drained
  'black beans': { can: 240 },                         // pack: as chickpeas
  'kidney beans': { can: 240 },                        // pack: as chickpeas
  'cannellini beans': { can: 240 },                    // pack: as chickpeas
  'butter beans': { can: 240 },                        // pack: as chickpeas
  'chopped tomatoes canned': { can: 400 },             // pack: 400 g can, used whole
  // --- dairy -----------------------------------------------------------------
  'milk whole': { glass: 200 },                        // BNF: one medium glass, 200 ml
  'milk semi skimmed': { glass: 200 },                 // as whole milk
  'milk skimmed': { glass: 200 },                      // as whole milk
  'natural yoghurt': { pot: 120 },                     // BNF: one individual pot, 120 g
  'cheddar cheese': { slice: 25 },                     // pack: pre-sliced cheddar, 25 g a slice
  'mozzarella': { ball: 125 },                         // pack: one ball, 125 g drained
  'butter': { pat: 5 },                                // USDA: butter, 1 pat 5 g
  // --- fruit -----------------------------------------------------------------
  'kiwi': { medium: 69 },                              // USDA: kiwifruit, 1 fruit 69 g
  'peach': { medium: 150 },                            // USDA: peach, 1 medium 150 g
  'plum': { medium: 66 },                              // USDA: plum, 1 fruit 66 g
  'figs': { medium: 50 },                              // USDA: fig, raw, 1 medium 50 g
  'grapefruit': { medium: 246, half: 123 },            // USDA: grapefruit, half a medium fruit 123 g
  'passion fruit': { medium: 18 },                     // USDA: passion fruit, 1 fruit 18 g
  'strawberries': { medium: 12, large: 18 },           // USDA: strawberry, 1 medium 12 g, 1 large 18 g
  'cherries': { whole: 8 },                            // USDA: sweet cherry, 1 cherry 8 g
  'grapes': { whole: 5 },                              // USDA: grape, 1 grape 4.9 g
  'lemon': { medium: 58 },                             // USDA: lemon without peel, 1 fruit 58 g
  'lime': { medium: 67 },                              // USDA: lime, 1 fruit 67 g
  // --- vegetables ------------------------------------------------------------
  'tomato': { medium: 123 },                           // USDA: tomato, 1 medium whole 123 g
  'cherry tomatoes': { whole: 17 },                    // USDA: tomato, 1 cherry 17 g
  'cucumber': { whole: 300 },                          // USDA: cucumber with peel, 1 cucumber 301 g
  'bell pepper': { medium: 119, large: 164 },          // USDA: sweet pepper, 1 medium 119 g, 1 large 164 g
  'onion': { medium: 110, small: 70, large: 150 },     // USDA: onion, small 70 g, medium 110 g, large 150 g
  'carrot': { medium: 61 },                            // USDA: carrot, 1 medium 61 g
  'courgette': { medium: 196 },                        // USDA: zucchini, 1 medium 196 g
  'mushroom': { medium: 18 },                          // USDA: white mushroom, 1 medium 18 g
  'spring onion': { medium: 15 },                      // USDA: spring onion, 1 medium 15 g
  'celery': { stalk: 40, stick: 40 },                  // USDA: celery, 1 medium stalk 40 g
  'leek': { medium: 89 },                              // USDA: leek, 1 leek 89 g
  'radish': { medium: 4.5 },                           // USDA: radish, 1 medium 4.5 g
  'sweetcorn': { cob: 90, ear: 90 },                   // USDA: sweet corn, 1 medium ear yields 90 g
  'potato baked': { medium: 173 },                     // USDA: baked potato, flesh and skin, 1 medium 173 g
  'sweet potato baked': { medium: 114 },               // USDA: sweet potato, baked in skin, 1 medium 114 g
  'spinach': { handful: 30 },                          // USDA: raw spinach, 1 cup (a generous handful) 30 g
  'mixed salad leaves': { handful: 36 },               // USDA: lettuce, shredded, 1 cup 36 g
  'rocket': { handful: 20 },                           // USDA: arugula, raw, 1 cup 20 g
  // --- nuts, olives ------------------------------------------------------------
  'almonds': { whole: 1.2, handful: 20 },              // USDA: 1 almond 1.2 g · BNF: nuts, the amount that fits in your palm, 20 g
  'walnuts': { whole: 4, half: 2, handful: 20 },       // USDA: 1 oz is 14 halves, 2 g each · BNF handful as almonds
  'cashews': { whole: 1.6, handful: 20 },              // USDA: 1 oz is 18 kernels, 1.6 g each · BNF handful as almonds
  'brazil nuts': { whole: 5, handful: 20 },            // USDA: 1 kernel 5 g · BNF handful as almonds
  'peanuts': { handful: 20 },                          // BNF: nuts, the amount that fits in your palm, 20 g
  'mixed nuts': { handful: 20 },                       // as peanuts
  'olives': { whole: 4 },                              // USDA: ripe olive, 1 large 4.4 g
  // --- things a recipe counts that weigh almost nothing -----------------------
  'bay leaves': { whole: 0.6 },                        // USDA: bay leaf, 1 tsp crumbled 0.6 g (about one leaf)
  'star anise': { whole: 2 },                          // kitchen scale, not a table: one pod is about 2 g
  'vegetable stock cube': { cube: 10 },                // pack: Knorr stock cube 10 g
}
for (const entry of FOOD_DB) {
  const pieces = PIECE_WEIGHTS[entry.name]
  if (pieces) entry.units = { ...pieces, ...entry.units }
}

// ---------------------------------------------------------------------------
// AMOUNTS — "2 eggs", "1 large banana", "2 slices" -> grams, or "unknown"
// ---------------------------------------------------------------------------

/**
 * Mass and volume units, which mean the same for every food. Volumes are at
 * water density unless the entry gives its own. A pinch is a sixteenth of a
 * teaspoon by kitchen convention (about 0.3 g of salt or spice) and a dash an
 * eighth (about 0.6 g): trace amounts, weighed as such rather than refused.
 * A splash is a teaspoon, a drop a twentieth of a millilitre.
 */
const MEASURE_GRAMS: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, oz: 28.35, lb: 453.6, tbsp: 15, tsp: 5, cup: 240, pinch: 0.3, dash: 0.6, splash: 5, drop: 0.05 }

/** Other spellings of a unit -> the one word it is looked up under. Plurals are folded before this is read. */
const UNIT_SPELLINGS: Record<string, string> = {
  gram: 'g', gm: 'g', gr: 'g', kilo: 'kg', kilogram: 'kg',
  millilitre: 'ml', milliliter: 'ml', litre: 'l', liter: 'l', ounce: 'oz', pound: 'lb',
  tablespoon: 'tbsp', tbs: 'tbsp', teaspoon: 'tsp',
  med: 'medium', regular: 'medium', standard: 'medium', average: 'medium',
  lg: 'large', big: 'large', sm: 'small', 'extra large': 'xl', 'x large': 'xl', xlarge: 'xl',
  tin: 'can', leaves: 'leaf', halves: 'half', loaves: 'loaf',
}

/** Words that mean "this many of them" and nothing more. */
const COUNT_UNITS = new Set(['', 'whole', 'piece', 'each', 'item', 'unit', 'count', 'x', 'pc', 'ea', 'single'])

/**
 * A size the entry does not list, as a share of its medium. The spread is
 * the USDA's own for whole fruit and eggs: banana 101 / 118 / 136 g, egg
 * 44 / 50 / 58 g, apple 149 / 182 / 223 g — small is about 0.85 of a medium
 * and large about 1.15. Extra large is the banana's 152 g. `half` and
 * `quarter` are arithmetic, not estimates.
 */
const SIZE_OF_MEDIUM: Record<string, number> = { small: 0.85, medium: 1, large: 1.15, xl: 1.3, half: 0.5, quarter: 0.25 }

/** "Slices of", "Eggs", "tbsp." -> "slice", "egg", "tbsp". */
function normaliseUnit(raw: string): string {
  let u = String(raw ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  u = u.replace(/ of$/, '')
  if (UNIT_SPELLINGS[u]) return UNIT_SPELLINGS[u]
  if (/(ch|sh|ss|x)es$/.test(u)) u = u.slice(0, -2)
  else if (u.length > 2 && u.endsWith('s') && !u.endsWith('ss')) u = u.slice(0, -1)
  return UNIT_SPELLINGS[u] ?? u
}

/** A unit word carried in the ingredient's own name: "garlic cloves" -> the clove, "salmon fillets" -> the fillet, "large egg" -> the large one. */
function pieceNamedIn(entry: FoodEntry, name: string): number | null {
  if (!entry.units || !name) return null
  for (const word of normalize(name).split(' ')) {
    const unit = normaliseUnit(word)
    if (MEASURE_GRAMS[unit] == null && entry.units[unit] != null) return entry.units[unit]
  }
  return null
}

/** How an amount was read: on a scale or spoon ('measured'), as a number of pieces ('counted'), or not at all. */
type AmountBasis = 'measured' | 'counted' | 'unknown'

function resolveAmount(entry: FoodEntry | null, unit: string, quantity: number, name: string): { grams: number | null; basis: AmountBasis } {
  const unknown = { grams: null, basis: 'unknown' as const }
  if (!Number.isFinite(quantity) || quantity < 0) return unknown
  const u = normaliseUnit(unit)
  const own = entry?.units
  const measured = MEASURE_GRAMS[u] != null
  // A bare count — "2 eggs" arrives as unit whole, egg, eggs, piece, each… —
  // including the food's own name as the unit: { name: 'egg', unit: 'eggs' }.
  const counted = !!entry && (COUNT_UNITS.has(u) || LOOKUP.get(normalize(unit)) === entry || LOOKUP.get(u) === entry)
  // The line's own words may say WHICH piece: "2 garlic cloves", "1 salmon
  // fillet", "half avocado". That beats the food's default piece.
  const named = entry ? pieceNamedIn(entry, name) : null
  // 1. A count of a piece the name itself names.
  if (counted && named != null) return { grams: named * quantity, basis: 'counted' }
  // 2. The entry's own word for the unit — "1 medium egg", "2 slices", "1 tbsp honey".
  if (own && own[u] != null) return { grams: own[u] * quantity, basis: measured ? 'measured' : 'counted' }
  // 3. A measure that means the same for every food.
  if (measured) return { grams: MEASURE_GRAMS[u] * quantity, basis: 'measured' }
  // "1 head broccoli", "2 bagels": the shopping unit's own label.
  if (entry?.purchaseUnit && (u === entry.purchaseUnit.label || u === normaliseUnit(entry.purchaseUnit.label))) {
    return { grams: entry.purchaseUnit.avgGrams * quantity, basis: 'counted' }
  }
  // Past here the answer depends on what ONE of this food weighs, so a food
  // the table does not know has no amount either.
  if (!entry) return unknown
  const piece = named ?? own?.medium ?? own?.whole ?? entry.purchaseUnit?.avgGrams ?? null
  // 4. A count of a food that knows its piece weight.
  if (counted) return piece != null ? { grams: piece * quantity, basis: 'counted' } : unknown
  // 5. A size the entry does not list, scaled from its medium.
  const share = SIZE_OF_MEDIUM[u]
  if (share != null && piece != null) return { grams: piece * share * quantity, basis: 'counted' }
  // 6. Anything else — a bowl, a serving, a glass of something with no glass
  //    weight — is UNKNOWN. It is never the bare number.
  return unknown
}

/** Strips a trailing plural suffix from tokens long enough that it's almost certainly a plural, not part of the word itself (avoids "hummus" -> "hummu", "asparagus" -> "asparagu"). Handles "-oes"/"-ies" specially ("potatoes" -> "potato", not the naive slice(-1) result "potatoe"; "berries" -> "berry") since a naive trailing-'s' strip never converges on the singular DB entry for these. Deliberately conservative: only used as a last-resort fallback below, never in the primary matching passes. */
function depluralizeToken(token: string): string {
  if (token.length > 5 && token.endsWith('ies')) return token.slice(0, -3) + 'y'
  if (token.length > 5 && token.endsWith('oes')) return token.slice(0, -2)
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
/**
 * REMEMBERED, because the day search asks the same few names thousands of
 * times (28 Sep 2026: 1.2 of 2.8 seconds of a week's search was this scan).
 * LOOKUP is filled once at load and never changes, so the answer for a name
 * never changes either. Capped so a long session cannot grow it without end.
 */
const LOOKUP_MEMO = new Map<string, FoodEntry | null>()
const LOOKUP_MEMO_CAP = 5000

export function lookupIngredient(name: string): FoodEntry | null {
  const known = LOOKUP_MEMO.get(name)
  if (known !== undefined) return known
  const found = lookupIngredientUncached(name)
  if (LOOKUP_MEMO.size >= LOOKUP_MEMO_CAP) LOOKUP_MEMO.clear()
  LOOKUP_MEMO.set(name, found)
  return found
}

/** The index keys as word lists, built once: the scan below runs over every one of them per uncached name. */
const INDEX_TOKENS: { tokens: string[]; entry: FoodEntry }[] = [...LOOKUP].map(([known, entry]) => ({ tokens: known.split(' ').filter(Boolean), entry }))

/**
 * A word that says HOW MUCH, not which food: "a pot of natural yoghurt", "a
 * glass of whole milk", "1 pint milk". The name is resolved here; whether the
 * amount can be read is resolveAmount's question, and it still asks it ("a
 * bowl of pasta" is pasta, of an amount nobody can read).
 */
const AMOUNT_WORDS = new Set(['bowl', 'glass', 'pot', 'pint', 'knob', 'handful', 'bunch', 'head', 'jar', 'packet', 'pack', 'bag', 'punnet', 'portion', 'serving', 'scoop', 'sachet', 'carton', 'bottle', 'dollop', 'drizzle', 'squeeze', 'can'])
function isAmountWord(w: string, entry: FoodEntry): boolean {
  const u = normaliseUnit(w)
  return AMOUNT_WORDS.has(u) || MEASURE_GRAMS[u] != null || (COUNT_UNITS.has(u) && u !== '') || SIZE_OF_MEDIUM[u] != null || entry.units?.[u] != null
}

/** True when every leftover word is harmless — "and" only between two harmless words. */
function residueIsHarmless(query: string[], used: boolean[], entry: FoodEntry): boolean {
  const own = OWN_WORDS.get(entry)
  const ok = (w: string | undefined) => !!w && (HARMLESS_WORDS.has(w) || HARMLESS_WORDS.has(depluralizeToken(w)) || !!own?.has(w) || isAmountWord(w, entry))
  for (let i = 0; i < query.length; i++) {
    if (used[i]) continue
    const w = query[i]
    if (w === JOINING_WORD) {
      if (!(ok(query[i - 1]) && !used[i - 1] && ok(query[i + 1]) && !used[i + 1])) return false
      continue
    }
    if (!ok(w)) return false
  }
  return true
}

type Candidate = { entry: FoodEntry; len: number; folded: boolean }

/** Better first: a longer known name, then the words as written over their folded plurals, then the name (never insertion order). */
function better(a: Candidate, b: Candidate | null): boolean {
  if (!b) return true
  if (a.len !== b.len) return a.len > b.len
  if (a.folded !== b.folded) return !a.folded
  return a.entry.name < b.entry.name
}

/** A known name inside the query (as a run, then in any order), with nothing left over that could be another food. */
function findAccountedFor(query: string[], folded: boolean): FoodEntry | null {
  let best: Candidate | null = null
  // In order: "grilled chicken breast fillet" -> chicken breast.
  for (const { tokens, entry } of INDEX_TOKENS) {
    if (tokens.length > query.length) continue
    for (let i = 0; i <= query.length - tokens.length; i++) {
      if (!tokens.every((w, j) => query[i + j] === w)) continue
      const used = query.map((_, k) => k >= i && k < i + tokens.length)
      if (residueIsHarmless(query, used, entry)) {
        const cand = { entry, len: tokens.length, folded }
        if (better(cand, best)) best = cand
      }
    }
  }
  // Any order: "cooked white rice" -> white rice cooked. Pooled with the runs
  // above, so the longer name wins either way ("seitan-based strips" is seitan
  // strips, not seitan with "strips" left over).
  for (const { tokens, entry } of INDEX_TOKENS) {
    if (tokens.length < 2 || tokens.length > query.length) continue
    const used = query.map(() => false)
    let all = true
    for (const w of tokens) {
      const k = query.findIndex((q, idx) => q === w && !used[idx])
      if (k < 0) { all = false; break }
      used[k] = true
    }
    if (all && residueIsHarmless(query, used, entry)) {
      const cand = { entry, len: tokens.length, folded }
      if (better(cand, best)) best = cand
    }
  }
  return best?.entry ?? null
}

/** The entry for a set of words with no state word in them: exact, exact once plurals are folded, then accounted-for. */
function resolveWords(tokens: string[]): FoodEntry | null {
  if (tokens.length === 0) return null
  const key = tokens.join(' ')
  const exact = LOOKUP.get(key)
  if (exact) return exact
  const foldedTokens = tokens.map(depluralizeToken)
  const foldedKey = foldedTokens.join(' ')
  const exactFolded = LOOKUP.get(foldedKey)
  if (exactFolded) return exactFolded
  return findAccountedFor(tokens, false) ?? (foldedKey !== key ? findAccountedFor(foldedTokens, true) : null)
}

/** Apply a state word to the food it was said of: its twin in that state, the food itself, or nothing. */
function inState(entry: FoodEntry, asked: 'dry' | 'raw' | 'uncooked' | 'cooked'): FoodEntry | null {
  const state = ENTRY_STATE[entry.name]
  const byName = (n: string | undefined) => (n ? FOOD_DB.find(f => f.name === n) ?? null : null)
  if (asked === 'cooked') return state === 'dry' || state === 'raw' ? byName(COOKED_TWIN_OF[entry.name]) : entry
  if (state === 'cooked') {
    const twins = STATE_TWINS[entry.name] ?? {}
    if (asked === 'dry') return byName(twins.dry)
    if (asked === 'raw') return byName(twins.raw)
    return byName(twins.dry ?? twins.raw)
  }
  if (state) return asked === 'dry' && state === 'raw' ? null : entry
  // No state on the entry: any state word is fine, except dried produce, which is a different food.
  if (asked === 'dry' && (entry.category === 'fruit' || entry.category === 'veg')) return null
  return entry
}

/**
 * Alias-tolerant lookup that never throws a word away. In order:
 *   1. the name or an alias, exactly (also with plurals folded on both sides);
 *   2. a known name inside the line, when every other word is harmless
 *      ("grilled chicken breast fillet" is chicken breast; "chicken caesar
 *      wrap" is NOT a tortilla wrap: "chicken" and "caesar" are left over);
 *   3. with a state word ("dry", "raw", "cooked") set aside, the same two
 *      steps, then the food in that state (STATE_TWINS) or nothing.
 * A line that is SHORTER than a known name is no longer matched to it: bare
 * "chicken" is not "meat free chicken pieces", it is a miss. Returns null on a
 * miss — callers must NOT guess a profile for an unresolved ingredient (see
 * diet-rules.ts's fail-closed handling).
 */
function lookupIngredientUncached(name: string): FoodEntry | null {
  const key = normalize(name)
  if (!key) return null
  const tokens = key.split(' ').filter(Boolean)
  const whole = resolveWords(tokens)
  if (whole) return whole
  const states = [...new Set(tokens.map(t => STATE_WORDS[t]).filter(Boolean))]
  if (states.length !== 1) return null // none, or two that disagree ("cooked dry pasta")
  const core = tokens.filter(t => !STATE_WORDS[t])
  const food = resolveWords(core)
  return food ? inState(food, states[0]) : null
}

/**
 * The foods a piece of PROSE names — a recipe's cooking method, not an
 * ingredient line. Whole words only, the longest name first, never two foods
 * from the same words; plurals and spellings fold the way the lookup's do.
 * Each hit carries the words as written so a caller can ask whether those
 * words are on the ingredient list. (11 Oct 2026, for the check on recipe
 * steps: docs/plans/recipe-steps-checked-against-restrictions.md.)
 *
 * "toast" is skipped: in a method it is nearly always the verb ("toast the
 * seeds"), and reading it as bread would hide good steps.
 */
const PROSE_VERBS = new Set(['toast'])
export function findFoodsNamedIn(text: string): { entry: FoodEntry; words: string[]; from: number; to: number }[] {
  const tokens = normalize(text).split(' ').filter(Boolean)
  const folded = tokens.map(depluralizeToken)
  const taken = tokens.map(() => false)
  const hits: { entry: FoodEntry; words: string[]; from: number; to: number }[] = []
  const longest = Math.min(6, tokens.length)
  for (let len = longest; len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      if (taken.slice(i, i + len).some(Boolean)) continue
      const words = tokens.slice(i, i + len)
      if (len === 1 && PROSE_VERBS.has(words[0])) continue
      const entry = LOOKUP.get(words.join(' ')) ?? LOOKUP.get(folded.slice(i, i + len).join(' '))
      if (!entry) continue
      for (let k = i; k < i + len; k++) taken[k] = true
      hits.push({ entry, words, from: i, to: i + len })
    }
  }
  return hits.sort((a, b) => a.from - b.from)
}

/** The same words the scanner reads, for a caller that needs the parts it did NOT match. `folded`: plurals folded the lookup's way ("tomatoes" -> "tomato", "berries" -> "berry"). */
export function foodTextWords(text: string, folded = false): string[] {
  const words = normalize(text).split(' ').filter(Boolean)
  return folded ? words.map(depluralizeToken) : words
}

export interface MealIngredientLine {
  /** Free-text name as written in a meal, e.g. "chicken breast" or "grilled chicken". */
  name: string
  /** Quantity in the given unit. */
  quantity: number
  /** g, ml, tbsp, tsp, cup, or an ingredient-specific named unit (medium, whole, slice, clove, scoop, can, handful...). */
  unit: string
  /**
   * Set by the amount reader (ingredient-units.ts) when it could not understand
   * how much this line is. Never stored: a meal with an unread line is not built.
   */
  unread?: string
  /** The line as it was written, kept only on an unread line so the question can quote it. */
  source?: string
}

export interface ComputedMealMacros extends Macros100g {
  /**
   * Share (0-1) of the meal that was actually costed. By WEIGHT among the
   * lines whose amount is known, times the share of LINES whose amount is
   * known at all — an amount nobody could read has no weight to be a share of.
   */
  coverage: number
  /** Every line left out of the numbers: a food this table does not know, OR a known food whose amount could not be read. */
  unmatched: string[]
  /** The subset of `unmatched` that is a KNOWN food with an unreadable amount ("1 large latte", "1 bowl pasta") — the ones to ask "how big?" about. */
  amountUnknown: string[]
  /** Per-line resolution detail, for scaling/debugging. `grams` is null when the amount could not be read; `understood` is false then, and on a line the reader could not read. */
  lines: { input: MealIngredientLine; entry: FoodEntry | null; grams: number | null; basis: AmountBasis; macros: Macros100g | null; understood: boolean }[]
  /**
   * The lines whose AMOUNT was not understood (as written, or "name unit" when the reader gave no source): a line
   * the reader marked unread, and a known food whose amount could not be weighed.
   * `coverage` alone cannot be trusted to say this (measured 1 Oct 2026: a misread line read 99% covered).
   */
  unreadAmounts: string[]
  /** True only when every line's amount was understood. The coverage rule alone cannot say this; verifyProposal needs both. */
  amountsUnderstood: boolean
}

/**
 * Grams for a quantity of a food, or NULL WHEN THE AMOUNT CANNOT BE READ.
 *
 * It used to end `return quantity` — "unknown unit, treat the number as
 * grams". That one line logged two scrambled eggs as two grams of egg, a
 * large latte as one gram of milk and five crispbreads as five grams, each
 * with coverage 100% and nothing flagged (9 Oct 2026, H6 and M23). A wrong
 * number that looks measured is the worst thing this file can produce, so
 * there is no fall-through any more: every caller has to say what it does
 * with "unknown", and the type makes it.
 *
 * `name` is the line's own words, which may carry the unit ("garlic cloves").
 */
export function unitToGrams(entry: FoodEntry | null, unit: string, quantity: number, name = ''): number | null {
  return resolveAmount(entry, unit, quantity, name).grams
}

/** The food a line names. A tin or a jar can name a canned food by its shorter name ("1 tin tuna"): tried as written first, then as "canned ..." (trying "canned" first sent "1 can chopped tomatoes" to a fresh tomato). */
function lookupForLine(line: MealIngredientLine): FoodEntry | null {
  const found = lookupIngredient(line.name)
  if (found) return found
  const u = normaliseUnit(line.unit)
  return u === 'can' || u === 'jar' ? lookupIngredient(`canned ${line.name}`) : null
}

/**
 * Computes total macros for a list of ingredient lines by resolving each to
 * food-db and scaling its per-100g values by the line's gram weight. A line
 * that fails to resolve — the food, or how much of it — contributes zero
 * macros and is listed in `unmatched`; never an invented estimate.
 */
export function computeMealMacros(ingredients: MealIngredientLine[]): ComputedMealMacros {
  let totalGrams = 0
  let matchedGrams = 0
  let linesWithAmount = 0
  const totals: Macros100g = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const unmatched: string[] = []
  const amountUnknown: string[] = []
  const unreadAmounts: string[] = []
  const lines: ComputedMealMacros['lines'] = []

  for (const line of ingredients) {
    const entry = lookupForLine(line)
    const { grams, basis } = resolveAmount(entry, line.unit, line.quantity, line.name)
    // The reader's own verdict first ("to taste", no amount). Then, for a food that RESOLVED, whether this
    // file can weigh its unit. A food that did not resolve is unmatched either way, so its unit is not asked about.
    const understood = !line.unread && (entry ? grams != null : true)
    if (!understood) unreadAmounts.push(line.source ?? `${line.quantity} ${line.unit} ${line.name}`)
    if (grams == null || line.unread) {
      unmatched.push(line.name)
      if (entry) amountUnknown.push(line.name)
      lines.push({ input: line, entry, grams: null, basis: grams == null ? basis : 'unknown', macros: null, understood })
      continue
    }
    linesWithAmount++
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
      lines.push({ input: line, entry, grams, basis, macros, understood })
    } else {
      unmatched.push(line.name)
      lines.push({ input: line, entry: null, grams, basis, macros: null, understood })
    }
  }

  const byWeight = totalGrams > 0 ? matchedGrams / totalGrams : 0
  const byLine = ingredients.length > 0 ? linesWithAmount / ingredients.length : 0
  return {
    kcal: Math.round(totals.kcal),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    coverage: byWeight * byLine,
    unmatched,
    amountUnknown,
    lines,
    unreadAmounts,
    amountsUnderstood: unreadAmounts.length === 0,
  }
}

// ---------------------------------------------------------------------------
// LOGGED MEALS — is this a number to put in somebody's day, and what the card says
// ---------------------------------------------------------------------------
// The coach's log_meal turns "I had 2 scrambled eggs on toast" into a card she
// taps to record it. Twice in one test log (9 Oct 2026) that card carried a
// number a quarter of the real one, stated as fact. The amounts are fixed
// above; this is the second lock, read by the coach's handler BEFORE it hands
// the app a card and by the card's own verifier after: when the numbers do not
// look like a meal, the app asks a short question instead of logging them.

/** A breakfast, lunch or dinner under this is not a meal anyone logs — one boiled egg is 78 kcal. */
export const MAIN_MEAL_MIN_KCAL = 100
/** A counted food that came to less than this is a misread amount, unless one of them really is that small (a clove, a bay leaf, an almond). */
const COUNTED_LINE_MIN_GRAMS = 5
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']

/** True when `kcal` is too little to be the whole of a main meal. Snacks have no floor: a coffee is a snack. */
export function tooSmallForMainMeal(kcal: number, slot: unknown): boolean {
  return MAIN_MEALS.includes(String(slot ?? '').trim().toLowerCase()) && kcal < MAIN_MEAL_MIN_KCAL
}

/**
 * "assumed large eggs" -> "large eggs", so the card can say "Assumed:" once.
 *
 * The coach is told to write each note as 'assumed 0% fat greek yoghurt', and
 * the card used to prefix the list with "Assuming" — so every card with a
 * guess on it read "Assuming assumed large eggs" (test log, 9 Oct 2026, L32).
 * The word is the card's to say, not each note's.
 */
export function assumedLine(assumptions: readonly string[]): string | null {
  const items = assumptions
    .map(a => a.trim().replace(/^(?:i\s+|i've\s+|we\s+)?assum(?:ed|ing|e|es)\b[\s:,-]*(?:that\s+)?/i, '').replace(/[.;,\s]+$/, '').trim())
    .filter(Boolean)
  return items.length > 0 ? `Assumed: ${items.join('; ')}.` : null
}

const listOf = (names: string[]) => names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/**
 * The question to ask INSTEAD of logging, or null when the numbers stand.
 * Only ever about food the table knows: a food it does not know at all is the
 * coverage floor's job (the card's verifier names it), not a "how big" one.
 */
export function doubtAboutLoggedMeal(computed: Pick<ComputedMealMacros, 'kcal' | 'lines' | 'unmatched'>, slot: unknown): string | null {
  const unsure = computed.lines.filter(l => {
    if (!l.entry) return false
    if (l.grams == null) return true
    if (l.basis !== 'counted' || l.grams >= COUNTED_LINE_MIN_GRAMS) return false
    const pieces = Object.entries(l.entry.units ?? {}).filter(([unit]) => MEASURE_GRAMS[unit] == null).map(([, g]) => g)
    const smallest = Math.min(...pieces, l.entry.purchaseUnit?.avgGrams ?? Infinity)
    return !(smallest < COUNTED_LINE_MIN_GRAMS)
  }).map(l => l.input.name)
  if (unsure.length > 0) {
    return `How big ${unsure.length === 1 ? 'was' : 'were'} the ${listOf(unsure)}? A rough weight in grams, or ml for a drink, is enough.`
  }
  if (computed.unmatched.length === 0 && tooSmallForMainMeal(computed.kcal, slot)) {
    return `That only comes to ${computed.kcal} kcal, which is small for a ${String(slot).trim().toLowerCase()}. How big was it, and was there anything else with it?`
  }
  return null
}
