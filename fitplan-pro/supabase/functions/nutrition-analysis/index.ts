import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function hashIngredients(ingredients: string[]): string {
  const sorted = [...ingredients].map((s) => s.trim().toLowerCase()).sort();
  const raw = sorted.join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36) + "_" + raw.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { ingredients } = await req.json();

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return new Response(
        JSON.stringify({ error: "ingredients array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ingredientHash = hashIngredients(ingredients);

    const { data: cached } = await supabase
      .from("nutrition_cache")
      .select("calories, protein, carbs, fat")
      .eq("ingredient_hash", ingredientHash)
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({
          calories: cached.calories,
          protein: cached.protein,
          carbs: cached.carbs,
          fat: cached.fat,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appId = Deno.env.get("EDAMAM_APP_ID");
    const appKey = Deno.env.get("EDAMAM_APP_KEY");

    if (!appId || !appKey) {
      console.error("[nutrition-analysis] EDAMAM_APP_ID or EDAMAM_APP_KEY not set in environment");
      return new Response(
        JSON.stringify({ error: "Edamam API credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[nutrition-analysis] Calling Edamam for ${ingredients.length} ingredients:`, JSON.stringify(ingredients));

    const edamamUrl = `https://api.edamam.com/api/nutrition-details?app_id=${appId}&app_key=${appKey}`;

    const edamamResponse = await fetch(edamamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Meal",
        ingr: ingredients,
      }),
    });

    if (!edamamResponse.ok) {
      const errorText = await edamamResponse.text();
      const statusCode = edamamResponse.status;
      if (statusCode === 429) {
        console.error("[nutrition-analysis] Edamam RATE LIMITED (429). Free tier quota likely exhausted.");
      } else if (statusCode === 422 || statusCode === 400) {
        console.error(`[nutrition-analysis] Edamam rejected ingredients (${statusCode}). Likely unparseable format:`, errorText);
      } else if (statusCode === 401 || statusCode === 403) {
        console.error(`[nutrition-analysis] Edamam auth failure (${statusCode}). Credentials may be invalid.`);
      } else {
        console.error(`[nutrition-analysis] Edamam unexpected error (${statusCode}):`, errorText);
      }
      return new Response(
        JSON.stringify({
          error: `Edamam API returned ${statusCode}`,
          details: errorText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const edamamData = await edamamResponse.json();
    const totalNutrients = edamamData.totalNutrients || {};

    const calories = Math.round(totalNutrients.ENERC_KCAL?.quantity || 0);
    const protein = Math.round(totalNutrients.PROCNT?.quantity || 0);
    const carbs = Math.round(totalNutrients.CHOCDF?.quantity || 0);
    const fat = Math.round(totalNutrients.FAT?.quantity || 0);

    console.log(`[nutrition-analysis] Edamam result: ${calories} kcal, P:${protein} C:${carbs} F:${fat}`);

    if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
      console.warn("[nutrition-analysis] Edamam returned all zeros — ingredients may not have been recognized");
    }

    await supabase.from("nutrition_cache").upsert(
      {
        ingredient_hash: ingredientHash,
        ingredients: ingredients,
        calories,
        protein,
        carbs,
        fat,
      },
      { onConflict: "ingredient_hash" }
    );

    return new Response(
      JSON.stringify({ calories, protein, carbs, fat, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Nutrition analysis error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
