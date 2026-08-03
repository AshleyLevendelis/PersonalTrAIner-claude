import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GEMINI_MODEL } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MealSlot {
  slot: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface GeneratedMeal {
  slot: string;
  name: string;
  ingredients: string[];
  prep: string;
  substitution: string;
  sub_ingredients: string[];
  sub_prep: string;
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
];

const UNCONVENTIONAL_PROTEINS = [
  "bison or venison",
  "duck breast",
  "lamb leg or shoulder",
  "pork tenderloin or pork loin",
  "turkey thigh",
  "tempeh or seitan",
  "shrimp or prawns",
  "white fish (cod, halibut, sea bass, barramundi)",
  "scallops",
  "elk or ostrich",
  "rabbit",
  "mahi-mahi or swordfish",
  "sardines or mackerel",
  "plant-based mince (soy, pea protein)",
  "cottage cheese or paneer",
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function buildDietarySafetyBlock(preferences: string[]): string {
  if (!preferences || preferences.length === 0) return "";

  const rules: string[] = [];

  if (preferences.includes("vegetarian")) {
    rules.push("VEGETARIAN: Use ZERO meat, poultry, or fish. Eggs and dairy are allowed.");
  }
  if (preferences.includes("vegan")) {
    rules.push("VEGAN: Use ZERO animal products - no meat, fish, dairy, eggs, honey, or gelatin.");
  }
  if (preferences.includes("pescatarian")) {
    rules.push("PESCATARIAN: No meat or poultry. Fish and seafood are allowed. Eggs and dairy are allowed.");
  }
  if (preferences.includes("halal")) {
    rules.push("HALAL: No pork, no alcohol-based ingredients, all meat must be halal-certified. No gelatin from non-halal sources.");
  }
  if (preferences.includes("kosher")) {
    rules.push("KOSHER: No pork, no shellfish, no mixing of meat and dairy in the same meal. Meat must be from kosher animals.");
  }
  if (preferences.includes("dairy-free")) {
    rules.push("DAIRY-FREE: No milk, cheese, yogurt, butter, cream, whey protein, or any dairy derivative. Use plant-based alternatives.");
  }
  if (preferences.includes("gluten-free")) {
    rules.push("GLUTEN-FREE: No wheat, barley, rye, spelt, or regular oats. No pasta, bread, wraps, or flour unless explicitly gluten-free. Use rice, quinoa, buckwheat, corn, or certified GF oats.");
  }
  if (preferences.includes("nut-free")) {
    rules.push("NUT-FREE: No tree nuts (almonds, walnuts, cashews, pistachios, pecans, etc.) and no peanuts. No nut butters, nut milks, or nut flours.");
  }
  if (preferences.includes("low-carb")) {
    rules.push("LOW-CARB: Minimize carbohydrate sources. No rice, pasta, bread, potatoes, or high-sugar fruits. Prioritize leafy greens, above-ground vegetables, and healthy fats.");
  }
  if (preferences.includes("keto")) {
    rules.push("KETO: Strictly cap total carbohydrates under 50g for the ENTIRE day. Prioritize fatty proteins (salmon, ribeye, thighs), healthy oils (olive, avocado, coconut), nuts, seeds, and above-ground vegetables. Do NOT use grains, tubers, legumes, or high-sugar fruits (banana, mango, grapes). Distribute the 50g carb cap proportionally across meal slots.");
  }
  if (preferences.includes("pork-free")) {
    rules.push("PORK-FREE: Exclude ALL pork products entirely — no bacon, ham, prosciutto, pancetta, pork tenderloin, pork loin, chorizo, or any pork-derived ingredient.");
  }
  if (preferences.includes("egg-free")) {
    rules.push("EGG-FREE: No whole eggs, egg whites, egg yolks, or any egg-derived ingredients (mayonnaise, meringue, egg wash). Zero matching allergens may pass into the ingredients array.");
  }
  if (preferences.includes("soy-free")) {
    rules.push("SOY-FREE: No tofu, tempeh, TVP (textured vegetable protein), soy sauce, tamari, edamame, miso, soy milk, or soy lecithin. Zero matching allergens may pass into the ingredients array.");
  }
  if (preferences.includes("seafood-free")) {
    rules.push("SEAFOOD-FREE: No fish of any kind (salmon, tuna, cod, halibut, sardines, mackerel, swordfish, sea bass, barramundi) and no shellfish (shrimp, prawns, crab, lobster, scallops, mussels). Zero matching allergens may pass into the ingredients array.");
  }

  return `\n\nCRITICAL DIETARY SAFETY RULES (HIGHEST PRIORITY - VIOLATION IS UNACCEPTABLE):
The user has the following dietary restrictions: [${preferences.join(", ")}]
You MUST strictly adhere to ALL of the following constraints. Breaking any of these rules could cause allergic reactions, religious violations, or health issues.

${rules.join("\n")}

Strictly enforce all allergy guardrails (Egg-Free, Soy-Free, Seafood-Free, Pork-Free). If any of these boundaries are active, zero matching allergens may pass into the ingredients array.
If any ingredient conflicts with these restrictions, you MUST find a suitable alternative that fits the macro targets. NEVER include a restricted ingredient "just this once" or suggest the user "could substitute" later.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { macros, fitness_goal, slots, dietary_preferences } = await req.json();

    if (!macros || !fitness_goal || !Array.isArray(slots)) {
      return new Response(
        JSON.stringify({ error: "macros, fitness_goal, and slots array are required" }),
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

    const selectedCuisines = pickRandom(GLOBAL_CUISINES, 4);
    const selectedProteins = pickRandom(UNCONVENTIONAL_PROTEINS, 3);

    const cuisineAssignments = (slots as MealSlot[]).map((s, i) => {
      const cuisine = selectedCuisines[i % selectedCuisines.length];
      return `- ${s.slot}: Draw inspiration from ${cuisine} cuisine`;
    }).join("\n");

    const slotDescriptions = (slots as MealSlot[]).map(
      (s) => `- ${s.slot}: ${s.calories} kcal, ${s.protein}g protein, ${s.carbs}g carbs, ${s.fat}g fat`
    ).join("\n");

    const dietaryBlock = buildDietarySafetyBlock(dietary_preferences || []);

    const prompt = `You are an award-winning international chef AND sports nutritionist. Generate a complete, novel meal plan for ONE day that is both nutritionally precise AND culinarily exciting.

CULINARY VARIETY MANDATE (NON-NEGOTIABLE):
You MUST design meals inspired by diverse global cuisines. Here are your cuisine assignments for today:
${cuisineAssignments}

PROTEIN DIVERSITY REQUIREMENT:
For today's plan, prioritize these protein sources (pick at least 2 different ones across the day): ${selectedProteins.join(", ")}.

BANNED MEALS (DO NOT GENERATE THESE):
- "Greek Yogurt Parfait" or any generic yogurt bowl
- "Chicken and Rice" or "Grilled Chicken Breast with Brown Rice"
- "Pan-Seared Salmon" with any default side
- "Overnight Oats" (plain/generic)
- "Protein Shake" as a standalone meal
- Any meal whose name is just "[Protein] with [Carb] and [Vegetable]"

You must invent specific, flavorful, culturally authentic dishes with proper dish names (e.g., "Sichuan Mapo Tofu with Charred Bok Choy over Forbidden Rice", "Tunisian Shakshuka with Merguez & Crusty Sourdough", "Korean Bibimbap with Gochujang Beef & Pickled Daikon").
${dietaryBlock}

CRITICAL RULES:
1. Each meal must be a specific named dish with cultural identity and personality.
2. Dynamic Quantity Scaling: Scale ingredient quantities so the physical weights add up to each slot's target macros. Do NOT use standard template portions. Calculate gram weights using known nutritional densities.
3. Macro Priority Matrix: First scale lean protein to hit the protein target, then scale carbs, then fats to fill remaining calories.
4. Every ingredient MUST include an exact gram weight or measurement (e.g., "165g pork tenderloin", "2 tbsp tahini", "130g cooked farro").
5. Include ALL cooking fats with exact amounts.
6. For each meal, also provide ONE substitution alternative (a different dish from a DIFFERENT cuisine that hits similar macros for the same slot).
7. Each ingredient string must be ONE single parseable item (e.g., "200g plain Greek yogurt" not "200g Greek yogurt with berries and almonds").

USER CONTEXT:
- Fitness Goal: ${fitness_goal}
- Daily Targets: ${macros.calories} kcal, ${macros.protein}g protein, ${macros.carbs}g carbs, ${macros.fat}g fat

MEAL SLOT BUDGETS:
${slotDescriptions}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "meals": [
    {
      "slot": "Breakfast",
      "name": "Specific Dish Name Here",
      "ingredients": ["Xg ingredient1", "Xg ingredient2"],
      "prep": "Brief cooking instructions.",
      "substitution": "Alternative Dish Name (Different Cuisine)",
      "sub_ingredients": ["Xg ingredient1", "Xg ingredient2"],
      "sub_prep": "Brief cooking instructions for alternative."
    }
  ]
}

Generate meals for these slots: ${slots.map((s: MealSlot) => s.slot).join(", ")}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    const geminiBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        // gemini-3.5-flash defaults to "thinking" mode, and thinking tokens
        // come out of maxOutputTokens — confirmed truncating the JSON output
        // mid-object (sometimes before the closing brace, sometimes
        // mid-string). Not needed for straight structured extraction.
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
        JSON.stringify({ error: "Failed to parse meal plan from AI response" }),
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
        JSON.stringify({ error: "Invalid meal plan structure from AI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validatedMeals: GeneratedMeal[] = parsed.meals.map((meal: GeneratedMeal) => ({
      slot: meal.slot || "Unknown",
      name: meal.name || "Unnamed Dish",
      ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
      prep: meal.prep || "",
      substitution: meal.substitution || "",
      sub_ingredients: Array.isArray(meal.sub_ingredients) ? meal.sub_ingredients : [],
      sub_prep: meal.sub_prep || "",
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
