import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GEMINI_MODEL } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// M1 REWIRE: this function used to be a dead, never-actually-called "generate
// one day's meals with one substitution each" endpoint. It's now the variety
// ENGINE behind src/lib/meal-generation.ts's pool builder: it proposes named
// dishes with quantified ingredients for a batch of (slot, budget) requests;
// it does NOT verify anything. The AI's own claimed macros are not even
// asked for anymore — meal-generation.ts resolves every ingredient through
// food-db.ts, enforces diet-rules.ts, and scales portions with
// portion-scaler.ts. This function's only job is proposing plausible,
// varied, named dishes with parseable quantities; code owns every number and
// every dietary rule downstream.
// ---------------------------------------------------------------------------

interface SlotRequest {
  slot: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** How many distinct dish variants to propose for this slot. */
  count: number;
}

interface GeneratedMeal {
  slot: string;
  name: string;
  ingredients: string[];
  prep: string;
  cuisine: string;
}

// ---------------------------------------------------------------------------
// Cuisine coherence (meal-realism round): a real run produced Filipino
// breakfast, Peruvian lunch, Filipino dinner, Turkish snack in one day —
// macro-perfect but culturally scattershot. Split into FAMILIAR (default,
// everyday, majority of proposals) and EXOTIC (regional, capped) — see
// meal-generation.ts's EXOTIC_CUISINES, which must be kept in sync by hand
// (this is a separate Deno deploy target with no shared import surface with
// src/lib). Variety should come from ingredients/prep, not from touring a
// different continent every meal.
// ---------------------------------------------------------------------------
const FAMILIAR_CUISINES = [
  "British / Classic",
  "Italian",
  "American / Diner Classic",
  "Mexican",
  "Mediterranean (Greek, Lebanese, Turkish)",
];

const EXOTIC_CUISINES = [
  "Thai",
  "Middle Eastern (Persian, Moroccan)",
  "Korean",
  "Indian (North Indian, South Indian)",
  "Caribbean (Jamaican, Cuban)",
  "Japanese",
  "Vietnamese",
  "Ethiopian",
  "Spanish (Basque, Catalan)",
  "Brazilian",
  "West African (Nigerian, Ghanaian)",
  "Peruvian",
  "Filipino",
  "Georgian",
  "Cajun / Creole",
  "Scandinavian (Nordic)",
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * Prompt-level dietary guidance. This is explicitly a NICETY — a good-faith
 * attempt to get the first proposal right and reduce wasted regeneration
 * rounds — not the guard. diet-rules.ts's validateMealAgainstDiet is the
 * guard, applied to every proposal after this function returns. Already
 * correct/complete against diet-rules.ts's DIETARY_PREFERENCES (confirmed
 * during the dietary-safety audit — this file has no drift, chat-gemini's
 * copy did) — kept that way by scripts/test-diet-tag-sync.ts.
 */
function buildDietarySafetyBlock(preferences: string[]): string {
  if (!preferences || preferences.length === 0) return "";

  const rules: string[] = [];
  const has = (p: string) => preferences.includes(p);

  if (has("vegetarian")) rules.push("VEGETARIAN: no meat, poultry, or fish. Eggs and dairy are fine.");
  if (has("vegan")) rules.push("VEGAN: zero animal products — no meat, fish, dairy, eggs, or honey.");
  if (has("pescatarian")) rules.push("PESCATARIAN: no meat or poultry; fish, shellfish, eggs, and dairy are fine.");
  if (has("keto") || has("low-carb")) rules.push("LOW-CARB/KETO: avoid grains, potatoes, sugary fruit, and legumes. Lean on protein, non-starchy veg, and fat.");
  if (has("halal")) rules.push("HALAL: no pork, no alcohol-based ingredients.");
  if (has("kosher")) rules.push("KOSHER: no pork, no shellfish, and never combine meat and dairy in the same dish.");
  if (has("paleo")) rules.push("PALEO: no grains, legumes, dairy, or refined sugar.");
  if (has("dairy-free")) rules.push("DAIRY-FREE: no milk, cheese, yoghurt, butter, cream, or whey.");
  if (has("gluten-free")) rules.push("GLUTEN-FREE: no wheat, barley, rye, or regular pasta/bread — use rice, quinoa, corn, or certified gluten-free alternatives.");
  if (has("nut-free")) rules.push("NUT-FREE: no tree nuts or peanuts, no nut butters or nut milks.");
  if (has("egg-free")) rules.push("EGG-FREE: no eggs or egg-derived ingredients.");
  if (has("soy-free")) rules.push("SOY-FREE: no tofu, tempeh, soy sauce, edamame, or soy milk.");
  if (has("shellfish-free")) rules.push("SHELLFISH-FREE: no prawns, crab, lobster, mussels, or scallops.");
  if (has("fish-free")) rules.push("FISH-FREE: no fish of any kind, and no fish sauce, worcestershire sauce, or anchovy paste.");
  // The five that previously had no rule here at all — a preference absent
  // from this list is one the model is never told about, however well it is
  // tagged in food-db.
  if (has("celery-free")) rules.push("CELERY-FREE: no celery, celeriac, celery salt, or stock/bouillon containing celery.");
  if (has("sesame-free")) rules.push("SESAME-FREE: no sesame seeds, sesame oil, tahini, or hummus (tahini-based).");
  if (has("mustard-free")) rules.push("MUSTARD-FREE: no mustard of any kind, including dijon, wholegrain, mustard powder, and dressings built on it.");
  if (has("lupin-free")) rules.push("LUPIN-FREE: no lupin flour or lupin-containing bread and baked goods.");
  if (has("sulphite-free")) rules.push("SULPHITE-FREE: no sulphite-preserved dried fruit, wine or wine vinegars, or products declaring sulphur dioxide.");
  if (has("low-fodmap")) rules.push("LOW-FODMAP: avoid garlic, onion, wheat, and high-fructose fruit where possible.");
  // Mediterranean is a STYLE, not a restriction — diet-rules.ts gives it no
  // hard exclusions on purpose. But it was also absent from this block, so
  // selecting it did nothing whatsoever: an option the app offers and then
  // silently ignores. A positive steer, phrased so it cannot read as a ban.
  if (has("mediterranean")) rules.push("MEDITERRANEAN (a style, NOT an exclusion — nothing is forbidden): lean toward olive oil, fish, legumes, wholegrains, vegetables, nuts and yoghurt; keep red and processed meat occasional.");

  if (rules.length === 0) return "";

  return `\n\nDIETARY REQUIREMENTS (${preferences.join(", ")}):\n${rules.join("\n")}\nFind a compliant alternative for any ingredient that would violate these — never include a restricted ingredient "just this once".`;
}

function cookingTimeGuidance(pref: string | undefined): string {
  if (pref === "quick") return "Keep prep to 15 minutes or less: minimal steps, few ingredients, no long marinades or slow-cooked elements.";
  if (pref === "loves_cooking") return "Feel free to use real recipes with proper technique and a few more steps — this user enjoys cooking.";
  return "Keep prep to a realistic 20-30 minutes with straightforward steps.";
}

// ---------------------------------------------------------------------------
// Slot-appropriate food (meal-realism round): the prior prompt gave every
// slot the same generic guidance, so the model was just as likely to propose
// a Peruvian stew for breakfast as for dinner. This is prompt-level steering
// only — meal-generation.ts's checkSlotAppropriate is the actual reject gate,
// same nicety-vs-guard split as buildDietarySafetyBlock/diet-rules.ts above.
// ---------------------------------------------------------------------------
const SLOT_GUIDANCE: Record<string, string> = {
  breakfast: "BREAKFAST FOOD ONLY: eggs, oats/porridge, yoghurt, toast, smoothies, breakfast meats (bacon, sausage), pancakes/waffles, cereal-style bowls, breakfast burritos. Never propose a curry, stew, roast dinner, casserole, or other dinner-style dish just wearing a breakfast label.",
  lunch: "LUNCH FOOD: sandwiches, wraps, salads, grain bowls, quick hot meals, leftovers-style dishes — lighter and faster than a big dinner.",
  dinner: "DINNER FOOD: a full cooked meal — this is where the heavier, more involved dishes belong.",
  snack: "GENUINELY SNACK-SIZED: yoghurt, a protein shake, a handful of nuts, fruit with a protein source, a bar-style combo. 2-4 ingredients, no real 'cooking' — NOT a miniature version of a restaurant dish.",
};

function slotGuidance(slot: string, breakfastStyle: string | undefined): string {
  const base = SLOT_GUIDANCE[slot] ?? "";
  return slot === "breakfast" ? base + breakfastStyleGuidance(breakfastStyle) : base;
}

// ---------------------------------------------------------------------------
// Onboarding food preferences (meal-realism round, part 3) — favorite
// cuisines and breakfast style are steering only, same nicety-vs-guard split
// as everything else here; disliked_foods is enforced in code
// (meal-generation.ts's verifyProposal), this AVOID block is just a
// good-faith first attempt to not waste a generation round on it.
// ---------------------------------------------------------------------------
function breakfastStyleGuidance(style: string | undefined): string {
  if (style === "quick_cold") return " This user's breakfast style is quick and cold — favour no-cook or minimal-cook options (yoghurt bowls, overnight oats, smoothies, cold cereal) over anything needing a pan.";
  if (style === "cooked") return " This user likes a cooked breakfast — eggs, pancakes, hot oats, and similar stovetop dishes are all welcome here.";
  if (style === "skip") return " This user doesn't usually eat much at breakfast — keep it extremely light and fast: a shake, yoghurt, or a piece of fruit with protein, nothing that reads as a full sit-down meal.";
  return "";
}

function dislikedFoodsBlock(disliked: string[]): string {
  if (!disliked || disliked.length === 0) return "";
  return `\n\nAVOID (this user dislikes these — never include them): ${disliked.join(", ")}.`;
}

/**
 * Favorite cuisines lead the selection when the user named any (matched
 * case-insensitively / by substring against the two lists, since onboarding's
 * option labels are short — "Indian" — and the internal list entries carry
 * parenthetical detail — "Indian (North Indian, South Indian)"). Falls back
 * to the plain familiar-majority-plus-one-exotic pick from part 2 when the
 * user has no preference.
 */
function selectCuisines(favoriteCuisines: string[]): string[] {
  const matches = (list: string[]) => list.filter(entry =>
    favoriteCuisines.some(fav => {
      const a = entry.toLowerCase();
      const b = fav.toLowerCase().trim();
      return b.length > 0 && (a.includes(b) || b.includes(a));
    })
  );
  const favorites = [...matches(FAMILIAR_CUISINES), ...matches(EXOTIC_CUISINES)];
  if (favorites.length === 0) {
    return [...pickRandom(FAMILIAR_CUISINES, Math.min(4, FAMILIAR_CUISINES.length)), ...pickRandom(EXOTIC_CUISINES, 1)];
  }
  const remainingFamiliar = FAMILIAR_CUISINES.filter(c => !favorites.includes(c));
  const familiarFill = pickRandom(remainingFamiliar, Math.max(0, Math.min(4, FAMILIAR_CUISINES.length) - favorites.length));
  const remainingExotic = EXOTIC_CUISINES.filter(c => !favorites.includes(c));
  return [...favorites, ...familiarFill, ...pickRandom(remainingExotic, 1)];
}

// ---------------------------------------------------------------------------
// Macro-target steering (macro-accuracy round): the verification pipeline
// (meal-generation.ts) scales every proposal to the slot's CALORIE target and
// then requires the scaled result to still clear the PROTEIN floor — so a
// proposal whose unscaled protein:calorie ratio was already too low is a
// guaranteed rejection, not a near-miss, and naming concrete protein-dense
// bases per diet type measurably raised pool fill rates in practice. But an
// earlier round of this guidance pushed the model to MAXIMIZE protein rather
// than hit the stated target — that's the direct cause of the QA-sweep
// finding that assembled days landed up to ~1.7x over target protein while
// calories looked fine. Protein is now framed the same way calories, carbs and
// fat are: a number to land ON. The day-assembly layer (assembleDay in
// meal-generation.ts) is the actual backstop against overshoot — this prompt
// change reduces how often it has to correct for one.
// ---------------------------------------------------------------------------
function macroTargetGuidance(preferences: string[]): string {
  const isVegan = preferences.includes("vegan");
  const isVegetarian = preferences.includes("vegetarian") || isVegan;
  const isPescatarian = preferences.includes("pescatarian");

  const proteinBases = isVegan
    ? "tofu, tempeh, seitan, edamame, lentils, chickpeas, black beans, soy mince/TVP, high-protein pasta, vegan protein powder"
    : isVegetarian
    ? "tofu, tempeh, seitan, lentils, chickpeas, edamame, high-protein pasta, Greek yoghurt, cottage cheese, eggs, whey protein"
    : isPescatarian
    ? "salmon, tuna, cod, prawns, white fish, eggs, Greek yoghurt, cottage cheese, whey protein, tofu, lentils"
    : "chicken breast, turkey, lean beef mince, pork tenderloin, salmon, tuna, cod, prawns, eggs, Greek yoghurt, cottage cheese, whey protein";

  return `\n\nHIT ALL THREE MACROS (CRITICAL — this is the #1 cause of proposals being rejected or, worse, quietly accepted with a skewed ratio):
Every dish needs a clear protein source (build around: ${proteinBases}) sized to the stated protein grams — but protein is a TARGET TO LAND ON, not one to maximise. A dish that way overshoots its protein gram target at the expense of carbs/fat is just as wrong as one that falls short of it: it throws off the day's overall macro ratio even when calories look fine.
Size your carb source (rice, potatoes, oats, bread, pasta, fruit) and fat source (oil, butter, nuts, cheese, fatty cuts) to their stated gram targets too — don't treat them as whatever calories are left over after protein. All three macros matter; get as close to all three stated numbers as you can, not just calories.
If you must trade off to fit the calorie budget, make a small even trim across carbs/fat rather than skipping the protein source — but don't overcorrect into a protein-heavy, carb/fat-thin dish either.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { slots, dietary_preferences, cooking_time_preference, favorite_cuisines, disliked_foods, breakfast_style } = await req.json();

    if (!Array.isArray(slots) || slots.length === 0) {
      return new Response(
        JSON.stringify({ error: "slots array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiKey = Deno.env.get("GEMINI_KEY") || Deno.env.get("VITE_GEMINI_KEY");
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedSlots = slots as SlotRequest[];
    const favoriteCuisines: string[] = Array.isArray(favorite_cuisines) ? favorite_cuisines : [];
    const dislikedFoods: string[] = Array.isArray(disliked_foods) ? disliked_foods : [];
    // Majority familiar, at most one exotic option offered per batch — the
    // AI can still propose something outside this list, but the menu it's
    // shown skews everyday (or, when the user named favorites, skews toward
    // those). meal-generation.ts's per-slot-pool exotic cap is the actual
    // enforcement; this just stops the prompt from suggesting six different
    // continents in one breath.
    const selectedCuisines = selectCuisines(favoriteCuisines);
    const dietaryBlock = buildDietarySafetyBlock(dietary_preferences || []);
    const cookingGuidance = cookingTimeGuidance(cooking_time_preference);

    const macroGuidance = macroTargetGuidance(dietary_preferences || []);
    const avoidBlock = dislikedFoodsBlock(dislikedFoods);

    const slotDescriptions = typedSlots.map(
      (s) => `- ${s.slot} — ${slotGuidance(s.slot, breakfast_style)}\n  Propose ${s.count} DIFFERENT dish variants, each targeting ~${s.calories} kcal, ~${s.protein}g protein, ~${s.carbs}g carbs, ~${s.fat}g fat — hit all four as closely as you can; protein must not fall meaningfully short, but don't overshoot it at the expense of carbs/fat either`
    ).join("\n");

    const prompt = `You are a chef and sports nutritionist proposing meal options for an app that will independently verify every number — your job is variety and plausibility, not precision; code will re-measure and scale every ingredient you list.

CUISINE: default to familiar, everyday food — most of your proposals across a slot should be recognisably ordinary (British/Western/simple international staples), with at most ONE dish per slot drawing from something more regional. Draw from this mix: ${selectedCuisines.join(", ")}. Variety should come from ingredients, protein source, and cooking style — not from touring a different continent every dish. Do not propose near-duplicate dishes within the same slot.
${avoidBlock}

PREP TIME: ${cookingGuidance}
${dietaryBlock}
${macroGuidance}

RULES:
1. Each dish needs a specific, appetizing name (not "Chicken and Rice" — something like "Sichuan Mapo Tofu with Charred Bok Choy").
2. Every ingredient MUST be ONE parseable line with an exact quantity and unit: "165g chicken breast", "2 tbsp olive oil", "1 medium egg", "200g cooked basmati rice". No ranges, no "to taste", no combined items.
3. Include all cooking fats with exact amounts.
4. Aim your ingredient quantities at ALL FOUR stated macro targets, not just calories — exact precision isn't required (the app rescales), but stay in the right neighborhood on protein, carbs AND fat so rescaling doesn't need to be extreme in any one direction. Undershooting protein is a rejection; so is padding it out so far that carbs/fat are starved (see HIT ALL THREE MACROS above).
5. Report which single cuisine (from the list above, or "Other") each dish draws from as the "cuisine" field.

SLOTS TO GENERATE:
${slotDescriptions}

Return ONLY valid JSON, no markdown:
{
  "meals": [
    { "slot": "breakfast", "name": "Dish Name", "ingredients": ["165g ingredient", "1 tbsp ingredient"], "prep": "Brief steps.", "cuisine": "Thai" }
  ]
}

Generate exactly the requested count of variants for each slot listed above, all in the "meals" array.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    const geminiBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 6144,
        responseMimeType: "application/json",
        // gemini-3.5-flash defaults to "thinking" mode, and thinking tokens
        // come out of maxOutputTokens — confirmed truncating structured JSON
        // output mid-object. Not needed for straight structured extraction.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let geminiText: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: geminiBody,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`Gemini API attempt ${attempt + 1} error:`, response.status, errorBody);
          if (response.status >= 500 && attempt === 0) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          return new Response(
            JSON.stringify({ error: `Gemini API returned ${response.status}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        geminiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (geminiText) break;

        console.error(`Gemini attempt ${attempt + 1}: empty response`);
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
      } catch (fetchErr) {
        console.error(`Gemini fetch attempt ${attempt + 1}:`, fetchErr);
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
    }

    if (!geminiText) {
      return new Response(
        JSON.stringify({ error: "No response from Gemini after retries" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleaned = geminiText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not parse JSON from Gemini response:", cleaned.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse meal proposals from AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: { meals?: GeneratedMeal[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Raw:", jsonMatch[0].slice(0, 300));
      return new Response(
        JSON.stringify({ error: "Malformed JSON in AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!parsed.meals || !Array.isArray(parsed.meals)) {
      return new Response(
        JSON.stringify({ error: "Invalid meal proposal structure from AI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validatedMeals: GeneratedMeal[] = parsed.meals.map((meal: GeneratedMeal) => ({
      slot: meal.slot || "unknown",
      name: meal.name || "Unnamed Dish",
      ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
      prep: meal.prep || "",
      cuisine: meal.cuisine || "Other",
    }));

    return new Response(
      JSON.stringify({ meals: validatedMeals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Generate meals error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
