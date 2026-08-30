import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GEMINI_MODEL } from "../_shared/gemini.ts";
import { checkSpendCap, CALIBRATION_CAP } from '../_shared/spend-cap.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ITERATIONS = 3;
const TOLERANCE = 0.05;

interface MacroTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface VerifiedNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface CalibrationResult {
  ingredients: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_verified: boolean;
  iterations: number;
  within_target: boolean;
}

function isWithinTolerance(actual: VerifiedNutrition, target: MacroTarget): boolean {
  if (target.calories === 0) return true;
  const calDelta = Math.abs(actual.calories - target.calories) / target.calories;
  const proDelta = target.protein > 0 ? Math.abs(actual.protein - target.protein) / target.protein : 0;
  const carbDelta = target.carbs > 0 ? Math.abs(actual.carbs - target.carbs) / target.carbs : 0;
  const fatDelta = target.fat > 0 ? Math.abs(actual.fat - target.fat) / target.fat : 0;
  return calDelta <= TOLERANCE && proDelta <= TOLERANCE && carbDelta <= TOLERANCE && fatDelta <= TOLERANCE;
}

function computeCalories(p: number, c: number, f: number): number {
  return (p * 4) + (c * 4) + (f * 9);
}

function applyProportionalScaler(
  ingredients: string[],
  actual: VerifiedNutrition,
  target: MacroTarget
): string[] {
  if (actual.calories <= 0) return ingredients;
  const scaleFactor = target.calories / actual.calories;
  if (Math.abs(scaleFactor - 1) < 0.03) return ingredients;

  return ingredients.map((ing) => {
    const gramMatch = ing.match(/^(\d+(?:\.\d+)?)\s*(g|ml)\s+(.+)$/);
    if (gramMatch) {
      const scaled = Math.round(parseFloat(gramMatch[1]) * scaleFactor);
      return `${scaled}${gramMatch[2]} ${gramMatch[3]}`;
    }
    const tbspMatch = ing.match(/^(\d+(?:\.\d+)?)\s*(tbsp|tsp)\s+(.+)$/);
    if (tbspMatch) {
      const scaled = Math.round(parseFloat(tbspMatch[1]) * scaleFactor * 10) / 10;
      return `${scaled} ${tbspMatch[2]} ${tbspMatch[3]}`;
    }
    const countMatch = ing.match(/^(\d+)\s+(.+)$/);
    if (countMatch) {
      const scaled = Math.max(1, Math.round(parseInt(countMatch[1]) * scaleFactor));
      return `${scaled} ${countMatch[2]}`;
    }
    return ing;
  });
}

async function verifyIngredients(ingredients: string[]): Promise<VerifiedNutrition | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log(`[macro-calibration] Verifying ${ingredients.length} ingredients:`, JSON.stringify(ingredients));
    const response = await fetch(`${supabaseUrl}/functions/v1/nutrition-analysis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ingredients }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[macro-calibration] nutrition-analysis returned ${response.status}:`, errorBody);
      if (response.status === 502) {
        console.error("[macro-calibration] Edamam API rejection — likely ingredient format issue or rate limit");
      } else if (response.status === 500) {
        console.error("[macro-calibration] Internal error in nutrition-analysis — check credentials or server state");
      }
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.error("[macro-calibration] nutrition-analysis returned error in body:", data.error);
      return null;
    }

    const protein = data.protein || 0;
    const carbs = data.carbs || 0;
    const fat = data.fat || 0;
    console.log(`[macro-calibration] Verified: ${computeCalories(protein, carbs, fat)} kcal, P:${protein} C:${carbs} F:${fat}${data.cached ? " (cached)" : ""}`);
    return {
      calories: computeCalories(protein, carbs, fat),
      protein,
      carbs,
      fat,
    };
  } catch (err) {
    console.error("[macro-calibration] Network/fetch error calling nutrition-analysis:", err);
    return null;
  }
}

async function requestAdjustment(
  ingredients: string[],
  currentNutrition: VerifiedNutrition,
  target: MacroTarget,
  mealName: string,
  geminiKey: string
): Promise<string[] | null> {
  const calorieDelta = target.calories - currentNutrition.calories;
  const proteinDelta = target.protein - currentNutrition.protein;
  const carbsDelta = target.carbs - currentNutrition.carbs;
  const fatDelta = target.fat - currentNutrition.fat;

  const adjustmentPrompt = `You are a precision nutrition calculator. Your ONLY job is to adjust ingredient quantities to hit exact macro targets.

CURRENT INGREDIENTS:
${ingredients.map((ing, i) => `${i + 1}. ${ing}`).join("\n")}

CURRENT VERIFIED MACROS (from Edamam API):
- Calories: ${currentNutrition.calories} kcal
- Protein: ${currentNutrition.protein}g
- Carbs: ${currentNutrition.carbs}g
- Fat: ${currentNutrition.fat}g

TARGET MACROS:
- Calories: ${target.calories} kcal
- Protein: ${target.protein}g
- Carbs: ${target.carbs}g
- Fat: ${target.fat}g

DELTA (what needs to change):
- Calories: ${calorieDelta > 0 ? "+" : ""}${calorieDelta} kcal
- Protein: ${proteinDelta > 0 ? "+" : ""}${proteinDelta}g
- Carbs: ${carbsDelta > 0 ? "+" : ""}${carbsDelta}g
- Fat: ${fatDelta > 0 ? "+" : ""}${fatDelta}g

INSTRUCTIONS:
1. Adjust the gram weights of the existing ingredients to close the gap. Be AGGRESSIVE with scaling — the target must be hit.
2. Use the Macro Priority Matrix: first scale lean protein sources to hit protein target, then scale carb sources, then fat sources.
3. If a deficit is large (>15%), you MUST increase gram weights significantly or add an additional ingredient. Do not be conservative.
4. If a surplus is large, reduce the weight of the over-contributing ingredient.
5. There are NO upper limits on portion sizes — scale as needed to hit the target. A 250g chicken breast or 200g rice is perfectly fine if needed.
6. Return ONLY a JSON array of adjusted ingredient strings. No explanation, no markdown.

Example output format:
["250g chicken breast", "2 tbsp olive oil", "200g cooked brown rice", "120g broccoli"]

Return the adjusted ingredients array for "${mealName}":`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: adjustmentPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            // See generate-meals/index.ts — gemini-3.5-flash's default
            // "thinking" mode eats into maxOutputTokens and was confirmed to
            // truncate structured JSON output there; this call has an even
            // smaller budget (1024) so is at least as exposed.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini adjustment call failed:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((item: unknown) => typeof item === "string")) return null;

    return parsed;
  } catch (err) {
    console.error("Adjustment parsing error:", err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { ingredients, target, meal_name, profile_id } = await req.json();

    // Audit §1.3.
    const cap = await checkSpendCap(req, CALIBRATION_CAP, corsHeaders, profile_id);
    if (cap.response) return cap.response;

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return new Response(
        JSON.stringify({ error: "ingredients array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!target || !target.calories || !target.protein) {
      return new Response(
        JSON.stringify({ error: "target macros object is required (calories, protein, carbs, fat)" }),
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

    let currentIngredients: string[] = ingredients;
    let currentNutrition: VerifiedNutrition | null = null;
    let iterations = 0;
    let withinTarget = false;

    for (let i = 0; i <= MAX_ITERATIONS; i++) {
      iterations = i;

      currentNutrition = await verifyIngredients(currentIngredients);
      if (!currentNutrition) {
        break;
      }

      if (isWithinTolerance(currentNutrition, target)) {
        withinTarget = true;
        break;
      }

      if (i === MAX_ITERATIONS) {
        break;
      }

      const adjusted = await requestAdjustment(
        currentIngredients,
        currentNutrition,
        target,
        meal_name || "Meal",
        geminiKey
      );

      if (!adjusted) {
        break;
      }

      currentIngredients = adjusted;
    }

    // Programmatic fallback scaler: if AI loop didn't achieve tolerance,
    // apply a proportional scale to guarantee target is approximately hit
    if (!withinTarget && currentNutrition && currentNutrition.calories > 0) {
      const scaled = applyProportionalScaler(currentIngredients, currentNutrition, target);
      const scaledNutrition = await verifyIngredients(scaled);
      if (scaledNutrition) {
        currentIngredients = scaled;
        currentNutrition = scaledNutrition;
        iterations += 1;
        if (isWithinTolerance(scaledNutrition, target)) {
          withinTarget = true;
        }
      }
    }

    const result: CalibrationResult = {
      ingredients: currentIngredients,
      calories: currentNutrition ? currentNutrition.calories : 0,
      protein: currentNutrition ? currentNutrition.protein : 0,
      carbs: currentNutrition ? currentNutrition.carbs : 0,
      fat: currentNutrition ? currentNutrition.fat : 0,
      is_verified: currentNutrition !== null,
      iterations,
      within_target: withinTarget,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Macro calibration error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
