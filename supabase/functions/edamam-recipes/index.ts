import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MealPlanSection {
  accept?: {
    all?: Array<Record<string, string[]>>;
  };
  fit?: Record<string, { min?: number; max?: number }>;
}

interface MealPlanRequest {
  size: number;
  plan: {
    accept?: {
      all?: Array<Record<string, string[]>>;
    };
    fit?: Record<string, { min?: number; max?: number }>;
    sections: Record<string, MealPlanSection>;
  };
}

interface SingleSlotRequest {
  mode: "single";
  slot: string;
  health_labels?: string[];
  calories_min?: number;
  calories_max?: number;
  excluded?: string[];
}

interface FullPlanRequest {
  mode?: "full";
  size?: number;
  health_labels?: string[];
  calories_min?: number;
  calories_max?: number;
  sections?: Record<
    string,
    { calories_min?: number; calories_max?: number; dish_types?: string[] }
  >;
}

type RequestBody = SingleSlotRequest | FullPlanRequest;

function buildAuth(): { appId: string; appKey: string; userId: string } | null {
  const appId = Deno.env.get("EDAMAM_APP_ID");
  const appKey = Deno.env.get("EDAMAM_APP_KEY");
  const userId = Deno.env.get("EDAMAM_USER_ID") || "";
  if (!appId || !appKey) return null;
  return { appId, appKey, userId };
}

async function fetchRecipeByUri(
  uri: string,
  appId: string,
  appKey: string
): Promise<any | null> {
  const params = new URLSearchParams({
    type: "public",
    app_id: appId,
    app_key: appKey,
  });
  const encodedUri = encodeURIComponent(uri);
  const url = `https://api.edamam.com/api/recipes/v2/by-uri?${params.toString()}&uri=${encodedUri}`;

  const resp = await fetch(url);
  if (!resp.ok) return null;

  const data = await resp.json();
  if (data.hits && data.hits.length > 0) {
    return data.hits[0].recipe;
  }
  return null;
}

function mapRecipeToOutput(recipe: any) {
  return {
    name: recipe.label,
    image: recipe.image || "",
    source_url: recipe.url || "",
    yield: recipe.yield || 1,
    total_calories: Math.round(recipe.calories || 0),
    total_protein: Math.round(
      recipe.totalNutrients?.PROCNT?.quantity ?? 0
    ),
    total_carbs: Math.round(
      recipe.totalNutrients?.CHOCDF?.quantity ?? 0
    ),
    total_fat: Math.round(recipe.totalNutrients?.FAT?.quantity ?? 0),
    total_weight: Math.round(recipe.totalWeight || 0),
    ingredients: (recipe.ingredients || []).map((ing: any) => ({
      text: ing.text,
      weight: Math.round(ing.weight),
      food: ing.food,
    })),
    ingredient_lines: recipe.ingredientLines || [],
  };
}

async function generateMealPlan(
  body: FullPlanRequest,
  appId: string,
  appKey: string,
  userId: string
) {
  const size = body.size || 7;

  const planAccept: Array<Record<string, string[]>> = [];
  if (body.health_labels && body.health_labels.length > 0) {
    planAccept.push({ health: body.health_labels.map((l) => l.toUpperCase().replace(/-/g, "_")) });
  }

  const planFit: Record<string, { min?: number; max?: number }> = {};
  if (body.calories_min || body.calories_max) {
    planFit["ENERC_KCAL"] = {};
    if (body.calories_min) planFit["ENERC_KCAL"].min = body.calories_min;
    if (body.calories_max) planFit["ENERC_KCAL"].max = body.calories_max;
  }

  const defaultSections: Record<
    string,
    { dish_types: string[]; meal_type: string[] }
  > = {
    Breakfast: {
      dish_types: ["drinks", "egg", "biscuits and cookies", "bread", "pancake", "cereals"],
      meal_type: ["breakfast"],
    },
    Lunch: {
      dish_types: ["main course", "pasta", "egg", "salad", "soup", "sandwiches", "seafood"],
      meal_type: ["lunch/dinner"],
    },
    Dinner: {
      dish_types: ["main course", "pasta", "seafood", "egg", "soup"],
      meal_type: ["lunch/dinner"],
    },
    Snack: {
      dish_types: ["drinks", "biscuits and cookies", "bread", "cereals", "preps"],
      meal_type: ["snack"],
    },
  };

  const sections: Record<string, MealPlanSection> = {};

  for (const [sectionName, defaults] of Object.entries(defaultSections)) {
    const userSection = body.sections?.[sectionName];

    const sectionAccept: Array<Record<string, string[]>> = [];
    const dishTypes = userSection?.dish_types || defaults.dish_types;
    sectionAccept.push({ dish: dishTypes });
    sectionAccept.push({ meal: defaults.meal_type });

    const sectionFit: Record<string, { min?: number; max?: number }> = {};
    if (userSection?.calories_min || userSection?.calories_max) {
      sectionFit["ENERC_KCAL"] = {};
      if (userSection.calories_min)
        sectionFit["ENERC_KCAL"].min = userSection.calories_min;
      if (userSection.calories_max)
        sectionFit["ENERC_KCAL"].max = userSection.calories_max;
    }

    sections[sectionName] = {
      accept: { all: sectionAccept },
      ...(Object.keys(sectionFit).length > 0 ? { fit: sectionFit } : {}),
    };
  }

  const mealPlanBody: MealPlanRequest = {
    size,
    plan: {
      ...(planAccept.length > 0 ? { accept: { all: planAccept } } : {}),
      ...(Object.keys(planFit).length > 0 ? { fit: planFit } : {}),
      sections,
    },
  };

  const basicAuth = btoa(`${appId}:${appKey}`);
  const url = `https://api.edamam.com/api/meal-planner/v1/${appId}/select`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    Authorization: `Basic ${basicAuth}`,
  };
  if (userId) headers["Edamam-Account-User"] = userId;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(mealPlanBody),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    return {
      error: `Meal Planner API error: ${resp.status}`,
      details: errText,
    };
  }

  const data = await resp.json();

  // data.selection is an array of days, each day has sections with assigned recipe URIs
  const selection = data.selection || [];
  const result: Record<string, Record<string, any>> = {};

  for (let dayIdx = 0; dayIdx < selection.length; dayIdx++) {
    const day = selection[dayIdx];
    const daySections = day.sections || {};
    const dayKey = `day_${dayIdx}`;
    result[dayKey] = {};

    for (const [sectionName, sectionData] of Object.entries(daySections)) {
      const assigned = (sectionData as any).assigned;
      if (!assigned) {
        result[dayKey][sectionName] = null;
        continue;
      }

      const recipeUri =
        typeof assigned === "string" ? assigned : assigned._links?.self?.href;

      if (recipeUri) {
        const recipe = await fetchRecipeByUri(recipeUri, appId, appKey);
        if (recipe) {
          result[dayKey][sectionName] = mapRecipeToOutput(recipe);
        } else {
          result[dayKey][sectionName] = { uri: recipeUri, resolved: false };
        }
      } else {
        result[dayKey][sectionName] = null;
      }
    }
  }

  return { plan: result, days: selection.length };
}

async function generateSingleSlot(
  body: SingleSlotRequest,
  appId: string,
  appKey: string,
  userId: string
) {
  const defaultDishes: Record<string, string[]> = {
    Breakfast: ["drinks", "egg", "biscuits and cookies", "bread", "pancake", "cereals"],
    Lunch: ["main course", "pasta", "egg", "salad", "soup", "sandwiches", "seafood"],
    Dinner: ["main course", "pasta", "seafood", "egg", "soup"],
    Snack: ["drinks", "biscuits and cookies", "bread", "cereals", "preps"],
  };

  const mealTypes: Record<string, string[]> = {
    Breakfast: ["breakfast"],
    Lunch: ["lunch/dinner"],
    Dinner: ["lunch/dinner"],
    Snack: ["snack"],
  };

  const slot = body.slot;
  const sectionAccept: Array<Record<string, string[]>> = [];
  sectionAccept.push({ dish: defaultDishes[slot] || defaultDishes["Lunch"] });
  sectionAccept.push({ meal: mealTypes[slot] || ["lunch/dinner"] });

  const planAccept: Array<Record<string, string[]>> = [];
  if (body.health_labels && body.health_labels.length > 0) {
    planAccept.push({ health: body.health_labels.map((l) => l.toUpperCase().replace(/-/g, "_")) });
  }

  const sectionFit: Record<string, { min?: number; max?: number }> = {};
  if (body.calories_min || body.calories_max) {
    sectionFit["ENERC_KCAL"] = {};
    if (body.calories_min) sectionFit["ENERC_KCAL"].min = body.calories_min;
    if (body.calories_max) sectionFit["ENERC_KCAL"].max = body.calories_max;
  }

  const sections: Record<string, MealPlanSection> = {
    [slot]: {
      accept: { all: sectionAccept },
      ...(Object.keys(sectionFit).length > 0 ? { fit: sectionFit } : {}),
    },
  };

  const mealPlanBody: MealPlanRequest = {
    size: 1,
    plan: {
      ...(planAccept.length > 0 ? { accept: { all: planAccept } } : {}),
      sections,
    },
  };

  // Add excluded recipes if provided
  if (body.excluded && body.excluded.length > 0) {
    (mealPlanBody.plan as any).exclude = body.excluded;
  }

  const basicAuth = btoa(`${appId}:${appKey}`);
  const url = `https://api.edamam.com/api/meal-planner/v1/${appId}/select`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    Authorization: `Basic ${basicAuth}`,
  };
  if (userId) headers["Edamam-Account-User"] = userId;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(mealPlanBody),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    return {
      error: `Meal Planner API error: ${resp.status}`,
      details: errText,
    };
  }

  const data = await resp.json();
  const selection = data.selection || [];

  if (selection.length === 0) return { recipe: null };

  const day = selection[0];
  const daySections = day.sections || {};
  const sectionData = daySections[slot];

  if (!sectionData?.assigned) return { recipe: null };

  const assigned = sectionData.assigned;
  const recipeUri =
    typeof assigned === "string" ? assigned : assigned._links?.self?.href;

  if (!recipeUri) return { recipe: null };

  const recipe = await fetchRecipeByUri(recipeUri, appId, appKey);
  if (!recipe) return { recipe: null, uri: recipeUri };

  return { recipe: mapRecipeToOutput(recipe) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = buildAuth();
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Edamam credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: RequestBody = await req.json();

    let result;
    if ("mode" in body && body.mode === "single") {
      result = await generateSingleSlot(body, auth.appId, auth.appKey, auth.userId);
    } else {
      result = await generateMealPlan(
        body as FullPlanRequest,
        auth.appId,
        auth.appKey,
        auth.userId
      );
    }

    if ("error" in result) {
      return new Response(JSON.stringify(result), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
