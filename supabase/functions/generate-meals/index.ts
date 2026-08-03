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

const GLOBAL_CUISINES = [
  "Mediterranean (Greek, Lebanese, Turkish)",
  "Thai",
  "Mexican",
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
  "British / Classic",
  "Italian",
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * Prompt-level dietary guidance. This is explicitly a NICETY — a good-faith
 * attempt to get the first proposal right and reduce wasted regeneration
 * rounds — not the guard. diet-rules.ts's validateMealAgainstDiet is the
 * guard, applied to every proposal after this function returns.
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
  if (has("low-fodmap")) rules.push("LOW-FODMAP: avoid garlic, onion, wheat, and high-fructose fruit where possible.");

  if (rules.length === 0) return "";

  return `\n\nDIETARY REQUIREMENTS (${preferences.join(", ")}):\n${rules.join("\n")}\nFind a compliant alternative for any ingredient that would violate these — never include a restricted ingredient "just this once".`;
}

function cookingTimeGuidance(pref: string | undefined): string {
  if (pref === "quick") return "Keep prep to 15 minutes or less: minimal steps, few ingredients, no long marinades or slow-cooked elements.";
  if (pref === "loves_cooking") return "Feel free to use real recipes with proper technique and a few more steps — this user enjoys cooking.";
  return "Keep prep to a realistic 20-30 minutes with straightforward steps.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { slots, dietary_preferences, cooking_time_preference } = await req.json();

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
    const selectedCuisines = pickRandom(GLOBAL_CUISINES, Math.min(6, GLOBAL_CUISINES.length));
    const dietaryBlock = buildDietarySafetyBlock(dietary_preferences || []);
    const cookingGuidance = cookingTimeGuidance(cooking_time_preference);

    const slotDescriptions = typedSlots.map(
      (s) => `- ${s.slot}: propose ${s.count} DIFFERENT dish variants, each targeting ~${s.calories} kcal, ${s.protein}g protein, ${s.carbs}g carbs, ${s.fat}g fat`
    ).join("\n");

    const prompt = `You are a chef and sports nutritionist proposing meal options for an app that will independently verify every number — your job is variety and plausibility, not precision; code will re-measure and scale every ingredient you list.

CUISINE VARIETY: draw inspiration from a mix of these cuisines across your proposals: ${selectedCuisines.join(", ")}. Vary the protein source and cooking style across variants within the same slot — do not propose near-duplicate dishes.

PREP TIME: ${cookingGuidance}
${dietaryBlock}

RULES:
1. Each dish needs a specific, appetizing name (not "Chicken and Rice" — something like "Sichuan Mapo Tofu with Charred Bok Choy").
2. Every ingredient MUST be ONE parseable line with an exact quantity and unit: "165g chicken breast", "2 tbsp olive oil", "1 medium egg", "200g cooked basmati rice". No ranges, no "to taste", no combined items.
3. Include all cooking fats with exact amounts.
4. Aim your ingredient quantities roughly at the stated macro targets — exact precision isn't required (the app rescales), but stay in the right neighborhood so rescaling doesn't need to be extreme.
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
