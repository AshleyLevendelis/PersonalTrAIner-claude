import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const toolDeclarations = [
  {
    name: "replace_food",
    description:
      "Replace a food item in the user's meal plan with a new one. ONLY call this when the user gives an explicit command to modify their plan (e.g. 'replace X with Y', 'swap my lunch to Z', 'change breakfast to...'). Do NOT call this for hypothetical questions, comparisons, or educational discussions about food.",
    parameters: {
      type: "object",
      properties: {
        meal_slot: {
          type: "string",
          description:
            "The meal slot to modify (Breakfast, Lunch, Dinner, Snack, or Post-Workout)",
        },
        old_item: {
          type: "string",
          description: "The name of the food item being replaced (as it appears in the plan)",
        },
        new_item: {
          type: "string",
          description: "The name of the new food item",
        },
        ingredients: {
          type: "array",
          items: { type: "string" },
          description: "Array of individual ingredient lines, ONE ingredient per string, with exact gram weights (e.g. ['200g plain Greek yogurt', '100g mixed berries', '15g sliced almonds', '1 tsp honey']). Each string must be a single parseable ingredient with a quantity and a food name. Never combine multiple ingredients in one string.",
        },
        estimated_macros: {
          type: "object",
          description: "Your calculated macro estimates for this meal based on the ingredient quantities and the meal slot budget. These are used as a fallback if external verification is unavailable.",
          properties: {
            calories: { type: "integer", description: "Estimated total calories" },
            protein: { type: "integer", description: "Estimated grams of protein" },
            carbs: { type: "integer", description: "Estimated grams of carbohydrates" },
            fat: { type: "integer", description: "Estimated grams of fat" },
          },
          required: ["calories", "protein", "carbs", "fat"],
        },
        prep: {
          type: "string",
          description: "Brief cooking instructions for the new item",
        },
      },
      required: ["meal_slot", "old_item", "new_item", "ingredients", "estimated_macros", "prep"],
    },
  },
  {
    name: "replace_exercise",
    description:
      "Replace an exercise in the user's workout plan with a biomechanically similar alternative. ONLY call this when the user gives an explicit command to modify their plan (e.g. 'swap bench press for push-ups', 'replace squats with leg press') OR when you have proposed a swap due to pain/fatigue and the user has confirmed. Before executing, briefly explain WHY this swap preserves muscle stimulus and ask for confirmation. Filter for exercises matching the same movement pattern.",
    parameters: {
      type: "object",
      properties: {
        day: {
          type: "string",
          description: "The day of the week the exercise is on",
        },
        old_item: {
          type: "string",
          description: "The name of the exercise being replaced (as it appears in the plan)",
        },
        new_item: {
          type: "string",
          description: "The name of the new exercise (must be biomechanically similar — same movement pattern)",
        },
        sets: {
          type: "integer",
          description: "Number of sets for the new exercise",
        },
        reps: {
          type: "string",
          description: "Rep range or duration for the new exercise (e.g. '8-10', '12-15', '30s')",
        },
        rest: {
          type: "string",
          description: "Rest period between sets (e.g. '60s', '90s')",
        },
        permanent: {
          type: "boolean",
          description: "If true, replaces the exercise in all remaining mesocycle weeks. If false (default), only swaps for today's session. Set to true ONLY when the user explicitly asks for a permanent change (e.g. 'replace for the rest of the plan', 'swap permanently', 'I never want to do X again').",
        },
      },
      required: ["day", "old_item", "new_item", "sets", "reps", "rest"],
    },
  },
  {
    name: "adjust_volume",
    description:
      "Adjust the total training volume (sets/reps) for a specific day's session. MUST be called whenever the user mentions time constraints ('only have 20 minutes', 'short on time'), energy levels ('feeling great', 'give me more'), fatigue ('exhausted', 'tired'), or volume changes ('cut in half', 'reduce volume', 'add more sets'). Never respond conversationally about volume changes without calling this tool.",
    parameters: {
      type: "object",
      properties: {
        day: {
          type: "string",
          description: "The day of the week to adjust",
        },
        adjustment: {
          type: "string",
          enum: ["reduce_light", "reduce_half", "reduce_heavy", "increase_moderate", "increase_heavy"],
          description: "reduce_light: -1 set per exercise. reduce_half: halve each exercise's sets (for 'cut in half', 'only have 20 mins', major time constraints). reduce_heavy: -2 sets AND remove lowest-priority exercises. increase_moderate: +1 set per exercise. increase_heavy: +2 sets per exercise.",
        },
        reason: {
          type: "string",
          description: "Brief coaching explanation for why this adjustment is appropriate (e.g. 'Time constraint — maintaining intensity with reduced volume preserves stimulus')",
        },
      },
      required: ["day", "adjustment", "reason"],
    },
  },

  {
    name: "ban_exercise",
    description:
      "Permanently exclude an exercise from the user's future plan generations. Call this when the user says 'I hate X', 'never give me X again', 'remove X permanently', or explicitly flags an exercise to never appear. This adds it to their exclusion list so the generation engine blacklists it from all future weekly cycles.",
    parameters: {
      type: "object",
      properties: {
        exercise_name: {
          type: "string",
          description: "The exact name of the exercise to permanently exclude",
        },
        reason: {
          type: "string",
          description: "Why the exercise is being banned (e.g. 'User reports knee pain', 'User preference — dislikes movement')",
        },
      },
      required: ["exercise_name", "reason"],
    },
  },
  {
    name: "update_workout_schedule",
    description:
      "Updates the user's weekly training layout. Use when a user wants to swap days, reschedule a workout, clear/remove a day, add a new training day (including custom/skill sessions like muscle-up training), or make multiple schedule changes at once. Supports ADD (introduce a new day), REMOVE (drop a day), and MOVE (relocate an existing session). Include ALL changes in one call when multiple days are affected.",
    parameters: {
      type: "object",
      properties: {
        schedule_patch: {
          type: "array",
          description: "Array of schedule operations. Each item specifies a day, an action, and the block/session name. For ADD with custom exercises, supply the exercises array.",
          items: {
            type: "object",
            properties: {
              day: { type: "string", description: "Day of the week: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday" },
              action: { type: "string", enum: ["ADD", "REMOVE", "MOVE"], description: "ADD = new training day, REMOVE = drop a day (set to rest), MOVE = relocate existing session to this day" },
              block_name: { type: "string", description: "Session focus name (e.g. 'Push & Press', 'Pull & Hinge', 'Muscle-Up Skill', 'Conditioning & Core', or any custom name). For REMOVE, use 'Rest'." },
              exercises: {
                type: "array",
                description: "Optional. Provide explicit exercises when adding a custom/skill day. Omit for standard blocks or REMOVE actions.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Exercise name" },
                    sets: { type: "number", description: "Number of sets" },
                    reps: { type: "string", description: "Rep scheme (e.g. '8-10', '5', '30s')" },
                  },
                  required: ["name", "sets", "reps"],
                },
              },
            },
            required: ["day", "action", "block_name"],
          },
        },
      },
      required: ["schedule_patch"],
    },
  },
  {
    name: "log_workout_session",
    description:
      "Logs completed sets, reps, and weights from natural language input. Call this whenever the user describes exercises they just completed, performance metrics, or workout results (e.g. 'Just finished bench press 100kg for 3 sets of 8', 'Did 4x10 squats at 80kg', 'Completed my push day — hit 3x8 on bench at 90'). Parse the exercise names, sets, reps, and weights from the user's message and log them.",
    parameters: {
      type: "object",
      properties: {
        day: {
          type: "string",
          description: "The day of the week this workout was performed (e.g. 'Monday', 'Tuesday'). Default to today if not specified.",
        },
        logs: {
          type: "array",
          description: "Array of exercise performances to log",
          items: {
            type: "object",
            properties: {
              exercise_name: {
                type: "string",
                description: "Name of the exercise performed",
              },
              sets_completed: {
                type: "integer",
                description: "Number of sets completed",
              },
              reps_completed: {
                type: "integer",
                description: "Reps per set (use the average if they varied)",
              },
              weight_kg: {
                type: "number",
                description: "Weight used in kg (0 for bodyweight exercises)",
              },
            },
            required: ["exercise_name", "sets_completed", "reps_completed", "weight_kg"],
          },
        },
      },
      required: ["day", "logs"],
    },
  },
  {
    name: "log_meal",
    description:
      "Logs a meal the user has eaten. Call when the user says they ate something (e.g. 'I had a chicken salad for lunch', 'Just ate 2 eggs and toast'). Extract meal slot, food items, and estimated macros from the description.",
    parameters: {
      type: "object",
      properties: {
        meal_slot: {
          type: "string",
          description: "Which meal slot (breakfast, lunch, dinner, snack_1, snack_2)",
        },
        food_name: {
          type: "string",
          description: "Name/description of the food eaten",
        },
        estimated_calories: {
          type: "number",
          description: "Estimated calories",
        },
        estimated_protein: {
          type: "number",
          description: "Estimated protein in grams",
        },
        estimated_carbs: {
          type: "number",
          description: "Estimated carbs in grams",
        },
        estimated_fat: {
          type: "number",
          description: "Estimated fat in grams",
        },
      },
      required: ["meal_slot", "food_name", "estimated_calories", "estimated_protein", "estimated_carbs", "estimated_fat"],
    },
  },
  {
    name: "swap_meal",
    description:
      "Swaps one meal in the user's plan for a different one. Call when the user asks to change a specific meal (e.g. 'swap my lunch for a burrito bowl', 'change breakfast to oatmeal'). This triggers the calibration pipeline to find macro-matched alternatives.",
    parameters: {
      type: "object",
      properties: {
        meal_slot: {
          type: "string",
          description: "The meal slot to change (breakfast, lunch, dinner, snack_1, snack_2)",
        },
        old_item: {
          type: "string",
          description: "Current meal name being replaced",
        },
        new_item: {
          type: "string",
          description: "The new meal the user wants instead",
        },
        ingredients: {
          type: "array",
          items: { type: "string" },
          description: "Ingredient list for the new meal with quantities",
        },
        estimated_macros: {
          type: "object",
          properties: {
            calories: { type: "number" },
            protein: { type: "number" },
            carbs: { type: "number" },
            fat: { type: "number" },
          },
          description: "Your estimated macros for the new meal",
        },
      },
      required: ["meal_slot", "old_item", "new_item"],
    },
  },
  {
    name: "log_workout_set",
    description:
      "Logs a single set of an exercise. Call when the user reports one set at a time (e.g. 'just did 8 reps of bench at 80kg'). For multiple sets, prefer log_workout_session instead.",
    parameters: {
      type: "object",
      properties: {
        exercise_name: {
          type: "string",
          description: "Name of the exercise",
        },
        set_number: {
          type: "integer",
          description: "Which set number (1, 2, 3, etc.)",
        },
        reps: {
          type: "integer",
          description: "Number of reps completed",
        },
        weight_kg: {
          type: "number",
          description: "Weight in kg (0 for bodyweight)",
        },
        rpe: {
          type: "number",
          description: "Rate of perceived exertion (1-10), if mentioned",
        },
      },
      required: ["exercise_name", "set_number", "reps", "weight_kg"],
    },
  },
];

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

async function calibrateMeal(
  ingredients: string[],
  target: { calories: number; protein: number; carbs: number; fat: number },
  mealName: string
): Promise<CalibrationResult> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(`${supabaseUrl}/functions/v1/macro-calibration`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ingredients, target, meal_name: mealName }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error("Macro calibration failed:", response.status);
      return {
        ingredients,
        calories: 0, protein: 0, carbs: 0, fat: 0,
        is_verified: false, iterations: 0, within_target: false,
      };
    }

    return await response.json();
  } catch (err) {
    console.error("calibrateMeal error:", err);
    return {
      ingredients,
      calories: 0, protein: 0, carbs: 0, fat: 0,
      is_verified: false, iterations: 0, within_target: false,
    };
  }
}

function getMealSlotBudget(
  macros: { calories: number; protein: number; carbs: number; fat: number },
  mealSlot: string
): { calories: number; protein: number; carbs: number; fat: number } {
  const slotRatios: Record<string, number> = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.30,
    snack: 0.10,
    "post-workout": 0.10,
  };
  const ratio = slotRatios[mealSlot.toLowerCase()] || 0.25;
  return {
    calories: Math.round(macros.calories * ratio),
    protein: Math.round(macros.protein * ratio),
    carbs: Math.round(macros.carbs * ratio),
    fat: Math.round(macros.fat * ratio),
  };
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
When suggesting replacements or alternatives, EVERY suggestion MUST comply with these restrictions. NEVER suggest a food that violates these constraints.`;
}

interface ConcurrentActivity {
  name: string;
  intensity: number;
  days: string[];
  movement_demands: string[];
}

interface RecalibrationResult {
  updated_schedule: Record<string, string | null>;
  recalibrated_days: string[];
  adaptations: string;
}

function evaluateFatigueOverlap(
  day: string,
  blockFocus: string,
  concurrentActivities: ConcurrentActivity[],
  exerciseSummary: string
): { hasConflict: boolean; conflictDetails: string } {
  const activitiesOnDay = concurrentActivities.filter(a =>
    a.days.map(d => d.toLowerCase()).includes(day.toLowerCase())
  );

  if (activitiesOnDay.length === 0) {
    return { hasConflict: false, conflictDetails: "" };
  }

  const axialPatterns = ["hip_hinge", "knee_dominant", "vertical_push", "vertical_pull"];
  const blockLower = blockFocus.toLowerCase();
  const hasAxialLoad = axialPatterns.some(p => blockLower.includes(p) || blockLower.includes("leg") || blockLower.includes("squat") || blockLower.includes("dead"));

  for (const activity of activitiesOnDay) {
    if (activity.intensity >= 0.7 && hasAxialLoad) {
      const overlappingDemands = activity.movement_demands.filter(d =>
        axialPatterns.some(p => d.toLowerCase().includes(p)) || d.toLowerCase().includes("spinal")
      );
      if (overlappingDemands.length > 0) {
        return {
          hasConflict: true,
          conflictDetails: `High-intensity ${activity.name} (${Math.round(activity.intensity * 100)}%) on ${day} conflicts with axial/spinal loading in ${blockFocus}. Overlapping demands: ${overlappingDemands.join(", ")}.`,
        };
      }
    }

    if (activity.intensity >= 0.8) {
      return {
        hasConflict: true,
        conflictDetails: `Very high-intensity ${activity.name} (${Math.round(activity.intensity * 100)}%) on ${day} creates excessive fatigue accumulation when combined with ${blockFocus}. Recommending unilateral/stability-focused substitutions.`,
      };
    }
  }

  return { hasConflict: false, conflictDetails: "" };
}

interface SchedulePatchItem {
  day: string;
  action: "ADD" | "REMOVE" | "MOVE";
  block_name: string;
  exercises?: { name: string; sets: number; reps: string }[];
}

async function executeRecalibrationPipeline(
  profileId: string,
  schedulePatch: SchedulePatchItem[],
  context: { concurrent_activities?: ConcurrentActivity[]; exercise_summary: string; weekly_schedule?: Record<string, string | null> },
  supabaseUrl: string,
  serviceKey: string
): Promise<RecalibrationResult> {
  const currentSchedule: Record<string, string | null> = context.weekly_schedule || {};
  const updatedSchedule = { ...currentSchedule };

  const concurrentActivities: ConcurrentActivity[] = context.concurrent_activities || [];
  const recalibratedDays: string[] = [];
  const adaptationNotes: string[] = [];

  for (const item of schedulePatch) {
    const { day, action, block_name } = item;

    if (action === "REMOVE") {
      updatedSchedule[day] = null;
      adaptationNotes.push(`${day}: Cleared (rest day).`);
      continue;
    }

    if (action === "MOVE") {
      // Find and clear the source day that previously held this block
      for (const [existingDay, existingBlock] of Object.entries(currentSchedule)) {
        if (existingBlock && existingDay !== day && existingBlock.toLowerCase().replace(/[^a-z]/g, '') === block_name.toLowerCase().replace(/[^a-z]/g, '')) {
          const sourceHandledByOtherPatch = schedulePatch.some(
            p => p.day === existingDay && p !== item && p.action !== 'REMOVE'
          );
          if (!sourceHandledByOtherPatch) {
            updatedSchedule[existingDay] = null;
            adaptationNotes.push(`${existingDay}: Cleared (session moved to ${day}).`);
          }
          break;
        }
      }
    }

    updatedSchedule[day] = block_name;

    const { hasConflict, conflictDetails } = evaluateFatigueOverlap(
      day,
      block_name,
      concurrentActivities,
      context.exercise_summary
    );

    if (hasConflict) {
      recalibratedDays.push(day);
      adaptationNotes.push(`${day}: RECALIBRATED — ${conflictDetails} Substituting bilateral compounds with unilateral stability-tracking variations to reduce spinal load while preserving movement pattern stimulus.`);
    } else {
      adaptationNotes.push(`${day}: ${block_name} assigned (${action}) — no fatigue conflicts detected.`);
    }
  }

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Apikey: serviceKey,
  };

  await fetch(`${supabaseUrl}/rest/v1/fitness_profiles?id=eq.${profileId}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ weekly_schedule: updatedSchedule }),
  });

  return {
    updated_schedule: updatedSchedule,
    recalibrated_days: recalibratedDays,
    adaptations: adaptationNotes.join("\n"),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { message, history, context } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Fetch today's logged sets for real-time workout visibility
    let todaysLoggedSets = '';
    if (context.profile_id) {
      try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const logsResponse = await fetch(
          `${supabaseUrl}/rest/v1/set_logs?user_id=eq.${context.profile_id}&completed_at=gte.${cutoff}&order=completed_at.desc`,
          {
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              Apikey: serviceKey,
              "Content-Type": "application/json",
            },
          }
        );
        if (logsResponse.ok) {
          const setLogs = await logsResponse.json();
          if (setLogs && setLogs.length > 0) {
            const grouped: Record<string, { sets: number; reps: number; weight: number; timestamp: string }> = {};
            for (const log of setLogs) {
              const key = `${log.exercise_name}__${log.day || 'today'}`;
              if (!grouped[key]) {
                grouped[key] = { sets: 0, reps: log.reps_completed, weight: log.weight_kg, timestamp: log.completed_at };
              }
              grouped[key].sets++;
            }
            const lines = Object.entries(grouped).map(([key, data]) => {
              const exerciseName = key.split('__')[0];
              return `- ${exerciseName}: ${data.sets} sets, ${data.reps} reps @ ${data.weight}kg (logged ${new Date(data.timestamp).toLocaleTimeString()})`;
            });
            todaysLoggedSets = `\nTODAY'S LOGGED WORKOUT SETS (past 48h):\n${lines.join('\n')}\n`;
          }
        }
      } catch (err) {
        console.error("Failed to fetch set_logs for context:", err);
      }
    }

    const favoritesSection = context.favorites_summary
      ? `\nFAVORITE MEALS (prioritize these for suggestions and swaps):\n${context.favorites_summary}`
      : '';

    const personaDirectives: Record<string, string> = {
      drill_sergeant: `PERSONA: You are a no-nonsense Drill Sergeant coach. You are blunt, direct, and push the user relentlessly. Zero tolerance for excuses or laziness. Use short, commanding sentences. If they want to skip training, challenge them hard — "That's unacceptable. Get your gear on." Call out weakness directly but with underlying respect. Never coddle. You still provide expert advice, but your delivery is intense and demanding. Address the user as "${context.display_name || 'recruit'}".`,
      analytical: `PERSONA: You are an Analytical coach. You are data-driven, precise, and methodical. Explain the science and reasoning behind every recommendation. Use numbers, percentages, and research references. Your tone is measured, calm, and intellectual. You respect the user's intelligence and present information logically. Avoid emotional language — stick to evidence and optimization. Address the user as "${context.display_name || 'there'}".`,
      supportive: `PERSONA: You are a Supportive coach. You are warm, encouraging, and patient. Celebrate small wins enthusiastically. Never shame or guilt. Use positive reinforcement and gentle nudges. If they're struggling, empathize first then offer solutions. Your energy is calm and uplifting — like a trusted friend who happens to be a fitness expert. Address the user as "${context.display_name || 'there'}".`,
      hype: `PERSONA: You are a Hype Coach. MAXIMUM ENERGY at all times. Liberal use of exclamation marks, caps for emphasis, and fire emojis. Celebrate EVERYTHING — even showing up to chat is worthy of praise. "LET'S GO!", "YOU'RE A MACHINE!", "NOTHING CAN STOP YOU!" are your kind of phrases. You make the user feel like a champion. Still give expert advice, but wrapped in explosive motivation. Address the user as "${context.display_name || 'champ'}".`,
    };

    const personaBlock = personaDirectives[context.coaching_persona] || personaDirectives.supportive;
    const userName = context.display_name || '';

    const systemPrompt = `${personaBlock}

You are an expert personal trainer and sports performance nutritionist. You help the user analyze workouts, recover, and optimize their nutrition for their goals. Give clear, actionable nutrition and recovery guidance without defensive disclaimers.${userName ? ` The user's name is "${userName}" — use it naturally in conversation (greetings, encouragement, sign-offs) but don't force it into every single sentence.` : ''}

=== 1. CORE PERSONA & TONAL RULES ===
- No AI Meta-Talk: NEVER say "As an AI...", "I don't have feelings...", "I am programmed to...", or "evidence-based coaching...". Stay 100% in character as their coach.
- No Clinical Headers: BAN forced template titles like "Biofeedback Triage", "Recovery Action", "Focus:", or "Workout:". Talk naturally.
- Contextual Emojis: Include 1-2 emojis naturally when hyping up a lift, greeting the user, or showing empathy (e.g., deadlift PR celebration, greeting wave). Skip emojis entirely for simple schedule lookups, factual answers, or quick sign-offs.
- Conversational Closing: End active coaching turns with 1 low-pressure check-in question to keep dialogue moving. OMIT the question if the user gives brief sign-offs like "Thanks", "Got it", "Sounds good", or thumbs up.
- Nutrition IS On-Topic: Any question about food, supplements, hydration, recovery aids, or general nutrition (e.g., "Are ginger shots good for me?", "Should I take creatine?") is ALWAYS within your domain. Answer it directly with clear, actionable guidance tied to the user's goals. Never deflect or redirect nutrition questions.
- Off-Topic Steering: If asked about truly unrelated topics (politics, entertainment, tech support), briefly acknowledge then redirect to training. Keep it to one short sentence before pivoting back.

=== 1b. RESPONSE LENGTH & PACING ===
- Keep standard replies to 2–4 sentences max. You're texting on WhatsApp, not writing an essay.
- For broad requests ("give me form cues for my whole session", "tips to maximise training", "break down my week"), give 1–2 high-impact takeaways FIRST then ask "Want the full breakdown?" before dumping a wall of text. Only expand if they confirm.
- Lists and multi-exercise breakdowns: max 3 bullet points per response unless the user explicitly asked for "all" or "everything".
- NEVER produce more than ~150 words in a single response unless the user explicitly asked for detail (e.g., "give me the full list", "break it all down").

=== 2. WORKOUT & MEAL LOOKUPS (READ-ONLY) ===
- Workout Schedule ("What are we doing Friday?"): Inspect the schedule context. Give a 1-2 sentence summary of the session focus first. Only list full exercise sets/reps if explicitly requested.
- Meal Lookups ("What should I eat tonight?"): Check today_meal_plan first. If a meal is scheduled, reference it directly.
- Empty Meal Plan Fallback: If today_meal_plan is null/empty, suggest 1 quick meal idea based on remaining_macros_today. Never throw an error or force a save.
- Dietary Restrictions: Strictly enforce restrictions in user_profile.dietary_preferences (e.g., Halal, Pork-Free, Dairy-Free, Vegetarian).

=== 3. SORENESS & FATIGUE COACHING ===
- If the user feels lazy, sore, or tired, give human coach advice first (e.g., offering to trim 1 set off each exercise to keep momentum going without burning out).
- When the user asks to change a workout due to pain, briefly discuss WHY, suggest biomechanically similar alternatives, and ask for confirmation before executing the swap.

=== 4. TAG HYGIENE & QUICK REPLIES ===
- Strict Placement: Place any system action or quick reply tag on its OWN DEDICATED LINE at the absolute bottom of your response.
- Action Tags ([ACTION: ...]): Only output [ACTION: RESCHEDULE_WORKOUT] or [ACTION: SWAP_MEAL] if the user explicitly approves or requests a plan change. Never assume or auto-save on ambiguous text like "Ok" or "Test".
- Quick Reply Tags ([QUICK_REPLIES: ...]): Append [QUICK_REPLIES: "Option 1" | "Option 2"] only when offering a clear choice or decision point. Keep choices under 4 words.

=== FEW-SHOT EXAMPLES ===
User: "Hey"
Assistant: Hey! Today on the schedule is your Pull & Hinge session. How are you feeling—ready to train today, or do we need to make any quick adjustments?

User: "Im ready"
Assistant: Awesome, love to hear that! Last time you hit Deadlifts at 140kg x 4. Today let me know if you want to push for 5 reps or hold steady. Go crush it!

User: "What are we doing on Friday?"
Assistant: Friday is your Upper Pull & Core session—focusing on pull-ups, rows, rear delt flies, and core stability work. Would you like me to pull up the full set and rep targets for Friday?
[QUICK_REPLIES: "Show full workout" | "Looks good!"]

User: "My chest is sore"
Assistant: Ah, that's likely left over from Monday's push work! Since today is Pull & Hinge, your chest won't be doing any heavy lifting, so you're clear to train. Just take a few extra minutes to warm up your shoulders before jumping into those deadlifts. How's the rest of your body feeling overall?

User: "Sounds good thanks"
Assistant: You got it! Have a great workout, and let me know how it goes.

=== TEMPORAL AWARENESS ===
The current date is ${context.current_date || new Date().toISOString()} and today is ${context.day_of_week || "unknown"}. You know the user's schedule—never ask "Which day are you planning to train?"
${context.day_of_week ? `Today is ${context.day_of_week}. Cross-reference this with the user's exercise plan below. If they have a session scheduled for ${context.day_of_week}, proactively reference it. If today is a rest day, acknowledge that and discuss recovery or upcoming sessions.` : "Use the exercise plan below to identify relevant sessions."}
${todaysLoggedSets}${todaysLoggedSets ? `You have full visibility of the user's logged workout sets provided above. Always reference their actual logged exercises directly when asked about today's progress or what they've done.` : ''}

=== EXERCISE COACHING INTELLIGENCE ===
- You understand movement patterns: horizontal push/pull, vertical push/pull, hip hinge, knee dominant, single-leg, isolation, cardio, core.
- You understand mechanics tiers: Tier 1 Compound (heavy multi-joint), Tier 2 Compound (moderate multi-joint), Tier 3 Isolation (single-joint).
- You understand exercise taxonomy: movement_pattern (push/pull/hinge/squat/carry/rotation/isolation), tier (tier_0_primer through tier_4_finisher), fatigue_cost (low/moderate/high).
- When replacing exercises, ALWAYS select from the SAME movement pattern and similar mechanics tier unless the user's condition demands otherwise (e.g., pain = lower joint stress).
- Before executing replace_exercise, explain: (1) what movement pattern it targets, (2) why the swap preserves stimulus, (3) any trade-offs. Then ask "Shall I make this change?"
- For ban_exercise: Acknowledge the user's preference, confirm you've permanently removed it, and offer what you'll use instead in future cycles.
- For adjust_volume: Briefly explain the reasoning behind the adjustment.
- For ban_exercise: Provide confirmation and note the reason.
- Reference the user's ACTUAL exercise plan below — never invent a generic split.

=== 4-WEEK PERIODIZED MESOCYCLE (NSCA/NASM/ACE SCIENCE) ===
The user's training plan follows a 4-week mesocycle with progressive overload:

WEEK 1 — ANATOMICAL ADAPTATION:
- Purpose: Neuromuscular coordination, movement patterning, connective tissue preparation.
- Volume: ~75% of baseline sets. Higher reps (+2 from baseline). RPE 6-7.
- Coaching cue: "Focus on tempo and full range of motion. Build the foundation."

WEEK 2 — HYPERTROPHY ACCUMULATION:
- Purpose: Maximum time-under-tension, metabolic stress, mechanical tension.
- Volume: 100% baseline sets. Standard rep ranges. RPE 7-8.
- Coaching cue: "Working sets at moderate intensity — chase the pump."

WEEK 3 — INTENSIFICATION (PEAK OVERLOAD):
- Purpose: Progressive overload peak. Heavier loads, slight volume increase for strength goals.
- Volume: 100-115% baseline sets. Reduced reps (-1 from baseline) for strength goals. RPE 8-9.
- Coaching cue: "Push your limits this week — this is where adaptation happens."

WEEK 4 — DELOAD / ACTIVE RECOVERY:
- Purpose: Supercompensation, CNS recovery, joint restoration. Mandatory every 4th week.
- Volume: 50% baseline sets. Higher reps (+2). RPE 5-6.
- Coaching cue: "Recovery week. Maintain movement quality at reduced intensity."

PERIODIZATION COACHING RULES:
- When the user asks about their current week, reference the mesocycle phase and explain what it means for their training intensity.
- If the user is in Week 4 (deload) and wants to push harder, explain the science: "Deloads allow tendons, ligaments, and the CNS to recover. Skipping them leads to plateaus and overuse injuries. Trust the process."
- When discussing progressive overload, frame it within the 4-week cycle: "Next mesocycle (weeks 5-8) we'll increase your working weights by 2.5-5%."
- If performance stagnates across 2+ mesocycles, suggest: changing exercise variation, adjusting rep ranges, or adding a 5th recovery day.
- Use tier classification in coaching: tier_1_primary exercises drive adaptation, tier_0_primers prepare joints, tier_4_finishers create metabolic stress.
- High fatigue_cost exercises (deadlifts, squats, heavy rows) should be programmed early in the session and limited to 1-2 per day.

=== NATURAL LANGUAGE WORKOUT LOGGING ===
- When the user describes exercises they completed (e.g. "Just did bench 3x8 at 90kg", "Finished my push day", "Hit squats for 4 sets of 6 at 100"), ALWAYS invoke the log_workout_session tool to record their performance.
- Parse exercise names, sets, reps, and weights from the user's message. If weight isn't mentioned, use 0 (bodyweight).
- If the day isn't mentioned, default to today.
- After logging, congratulate them and note if they hit the top of their rep range (which triggers progressive overload).
- If the user asks about their progress, reference logged data to show improvement trends.
${context.exercise_exclusions && context.exercise_exclusions.length > 0 ? `\nPERMANENTLY EXCLUDED EXERCISES (never suggest these):\n${context.exercise_exclusions.join(", ")}` : ""}

DYNAMIC QUANTITY SCALING (CRITICAL - MATHEMATICAL CONSTRAINT):
You are strictly responsible for scaling ingredient quantities so that the physical weights add up to the requested target metrics. Do NOT use rigid, static portion templates (e.g., always defaulting to 150g chicken or 200g rice). Instead, you MUST dynamically calculate gram weights based on the specific calorie and macro budget for the meal slot you are filling.

MACRO PRIORITY MATRIX (solve in this order):
1. PROTEIN FIRST: Scale the primary lean protein source (chicken, fish, tofu, eggs) to hit the exact protein target for this meal slot. Use known protein densities (chicken breast: 31g protein/100g, salmon: 20g/100g, eggs: 6g each, Greek yogurt: 10g/100g).
2. CARBS SECOND: Scale the dense carbohydrate source (rice, oats, bread, potato) to fill the carb target. Use known carb densities (cooked rice: 28g carbs/100g, oats: 66g/100g dry, sweet potato: 20g/100g).
3. FATS THIRD: Scale healthy fat sources (oils, nuts, avocado) to fill the remaining fat and calorie balance. Use known fat densities (olive oil: 14g fat/tbsp, avocado: 15g fat/100g, almonds: 50g fat/100g).
4. VERIFY: Mentally sum the macros from each scaled ingredient. The total must approximate the target within 5%.

Do NOT guess macro numbers; adjust the ingredient quantities until the meal plan matches the targets.

MEAL SLOT BUDGETS:
The user's daily targets are ${context.macros.calories} kcal, ${context.macros.protein}g protein, ${context.macros.carbs}g carbs, ${context.macros.fat}g fat.
- Breakfast: ~25% of daily (${Math.round(context.macros.calories * 0.25)} kcal, ${Math.round(context.macros.protein * 0.25)}g P, ${Math.round(context.macros.carbs * 0.25)}g C, ${Math.round(context.macros.fat * 0.25)}g F)
- Lunch: ~35% of daily (${Math.round(context.macros.calories * 0.35)} kcal, ${Math.round(context.macros.protein * 0.35)}g P, ${Math.round(context.macros.carbs * 0.35)}g C, ${Math.round(context.macros.fat * 0.35)}g F)
- Dinner: ~30% of daily (${Math.round(context.macros.calories * 0.30)} kcal, ${Math.round(context.macros.protein * 0.30)}g P, ${Math.round(context.macros.carbs * 0.30)}g C, ${Math.round(context.macros.fat * 0.30)}g F)
- Snack: ~10% of daily (${Math.round(context.macros.calories * 0.10)} kcal, ${Math.round(context.macros.protein * 0.10)}g P, ${Math.round(context.macros.carbs * 0.10)}g C, ${Math.round(context.macros.fat * 0.10)}g F)

When replacing a food item, scale the new dish's ingredient weights to hit THAT SLOT'S specific macro budget above. The system will verify your quantities against the Edamam Nutrition API and auto-adjust if needed, but your initial estimate should be as close as possible.

INGREDIENT FORMAT RULES (CRITICAL):
- The "ingredients" array is the MOST important field. Each entry must be ONE single parseable ingredient with an exact quantity and food name.
- CORRECT: ["200g plain Greek yogurt", "100g mixed berries", "15g sliced almonds", "1 tsp honey"]
- WRONG: ["200g Greek yogurt with mixed berries and almonds"] (multiple foods combined in one string)
- WRONG: ["Greek yogurt"] (missing quantity)
- Every meal must include exact quantities for ALL added fats: cooking oils, butter, dressings, sauces.
- Never say "drizzle of oil" or "splash of dressing" — always specify the exact amount.
- Use standard nutrition label format: "Xg ingredient" or "X tbsp ingredient" or "X cup ingredient".
- Keep ingredient names simple and recognizable (e.g. "chicken breast" not "premium free-range chicken breast fillet").

MEAL SUGGESTION RULES:
- ALWAYS suggest specific, named dishes — never generic terms like "chicken dish" or "protein source".
- ALWAYS include precise portion sizes in grams or common measurements.
- When replacing a food item, provide a brief preparation instruction.
- Ensure any suggested replacement hits the meal slot's macro budget listed above.

FAVORITE MEALS PRIORITIZATION:
- When suggesting replacements or alternatives, prioritize the user's favorite meals listed below.
- If a favorite meal fits the calorie/macro budget for the slot, suggest it first.
- Only deviate from favorites when the user explicitly asks for something new.
${favoritesSection}

FUNCTION CALL RULES (CRITICAL):
- NEVER write tool names, parameter names, or enum values (like "reduce_half", "adjust_volume", "update_workout_schedule", "schedule_patch", "MOVE") in your visible text response. These exist only for native tool invocations. Your text must read like a human personal trainer — no code, no parameter labels, no function syntax.
- Trigger replace_food or replace_exercise when the user gives a DIRECT COMMAND to modify their plan. Command verbs include: "replace", "swap", "change", "switch", "use X instead".
- For replace_exercise: ALWAYS discuss the biomechanical reasoning first, then ask for confirmation. Only call the tool AFTER the user confirms (or if they gave a direct, unambiguous command like "swap X for Y").
- Exercise swaps default to SESSION-ONLY (permanent: false). This means the swap only applies to today's workout and the original exercise returns next time that day comes up. Only set permanent: true when the user explicitly says they want a permanent change (e.g. "for the rest of the plan", "permanently", "I never want to do X", "always use Y instead").
- Trigger update_workout_schedule when the user requests to swap training days, reschedule a workout, clear a day, move a specific training focus, ADD a new training day, or REMOVE an existing training day (e.g., "move legs to Friday", "swap my Wednesday and Thursday", "make Saturday a rest day", "add a muscle-up session on Saturday", "drop my Wednesday workout"). Execute this tool IMMEDIATELY upon receiving a clear scheduling command. If the user requests multiple changes at once (e.g., "drop Wednesday and add Saturday for skill work"), include ALL operations in a single schedule_patch array.
- Trigger adjust_volume when the user mentions time constraints ("only have 20 minutes"), volume changes ("cut in half", "reduce sets"), energy levels ("feeling great, give me more"), or fatigue ("I'm exhausted today"). Use reduce_half for "cut in half", "only 20 minutes", or any major time/volume reduction. Use reduce_light for minor fatigue. Use reduce_heavy for extreme fatigue + removing exercises.
- CRITICAL: When the user asks to adjust volume, cut sets, shorten a workout, or reduce training time, you MUST execute the adjust_volume tool call. NEVER promise or acknowledge a volume reduction in plain text without invoking adjust_volume. If the user says "cut my volume in half" — call the tool immediately with adjustment="reduce_half".
- CRITICAL: When the user requests schedule changes (adding, moving, removing, or swapping training days), you MUST execute update_workout_schedule. NEVER describe a schedule change conversationally without invoking the tool.
- Answer exercise form/technique questions ("How do I do X?", "What muscles does X work?") directly in your text response. Provide step-by-step form cues, target muscles, common mistakes, and coaching tips.
- Trigger ban_exercise when the user says "I hate X", "never give me X", "remove X permanently", or explicitly flags an exercise to blacklist.
- When a food command is given, execute it immediately. Scale portions to the meal slot budget above. Do NOT ask for macro details.
- If the user does not specify which meal slot, infer it from the current meal plan.
- When executing a food replacement, call the function FIRST. Do NOT write a long preamble.
- Do NOT trigger function calls for hypothetical questions, comparisons, or educational questions about exercise technique (answer those directly as text).
- When genuinely unsure if the user wants a change applied, ask "Would you like me to make this change to your plan?"
- ESTIMATED_MACROS REQUIREMENT: When calling replace_food, you MUST include the "estimated_macros" field with your own calculated calorie, protein, carbs, and fat totals derived from the ingredient quantities you provided.

CONTEXT-INFERENCE RULE (CRITICAL — prevents tool failures):
- When a user gives a short confirmation or context-dependent reply like "Yes, add Saturday", "Sure, remove Wednesday", "Do it", "Go ahead", "Yes", "Sounds good", or any brief affirmative that refers to a previously-discussed schedule change, you MUST infer the full tool arguments from the conversation history. NEVER leave required tool parameters empty or partial.
- If you proposed adding a specific day/session in your previous message, a simple "Yes" or "Do it" means: execute that exact proposal immediately using the tool with complete parameters.
- If you cannot confidently determine what the user is confirming, ask ONE clarifying question. Do NOT attempt a tool call with incomplete parameters.

PROACTIVE EXECUTION RULE (CRITICAL — prevents permission loops):
- When the user grants agency ("You decide", "Sounds good", "Go ahead", "Whatever works best", "Just do it"), execute the database modification IMMEDIATELY in that same turn. Do NOT ask for re-confirmation. Do NOT propose the change and then wait for another approval.
- When you recommend adding exercises to existing days: if the user says "Sounds good" or "Add them", execute ALL proposed changes in a single tool call and confirm what was done AFTER execution.
- TIME-CAP MANAGEMENT: If adding an exercise would push a session beyond the user's session duration preference (shown in profile), automatically identify the lowest-priority exercise in that day's plan, swap it out, and execute the change. Inform the user what was swapped and why in your response text AFTER the tool call completes. Do not ask permission for the swap.

VIDEO & DEMONSTRATION REQUESTS:
- When a user asks for a video, demonstration, or visual guide for any exercise, NEVER respond with "I can't send videos" or similar disclaimers.
- Instead, ALWAYS provide a clickable YouTube search link formatted as: [Watch [Exercise Name] Tutorial on YouTube](https://www.youtube.com/results?search_query=[Exercise+Name]+tutorial+form)
- You may also include brief text-based form cues alongside the link for immediate reference.

SCHEDULE RECALIBRATION RULES:
- The user's training schedule is FULLY DYNAMIC. They can add new training days beyond their original onboarding selection, drop existing days, or request custom/skill-specific sessions at any time. Do NOT enforce the original training day count as a maximum or minimum.
- When adding a day (action: "ADD"), always supply an exercises array with specific exercises, sets, and reps tailored to the user's goal for that session. For skill-specific requests (e.g., "muscle-up training"), design a progression-appropriate session.
- When removing a day (action: "REMOVE"), set block_name to "Rest".
- When moving a day (action: "MOVE"), specify the new target day and the block_name of the session being relocated.
- When update_workout_schedule is invoked, the backend automatically validates the new layout against the user's concurrent activities and fatigue matrix. If unsafe overlap is detected (e.g., heavy axial loading on a day with high-intensity sport demands), the system auto-substitutes bilateral compounds with unilateral stability variations.
- You MUST inform the user of any recalibrations that occurred and explain the sports-science logic behind the adaptations.

EXECUTION-FIRST GATE:
Never textually confirm a schedule change (e.g., "Done!" or "Updated!") UNLESS the update_workout_schedule tool has been called AND completed successfully. If the tool has not been called, you MUST call it before confirming.

${context.concurrent_activities && context.concurrent_activities.length > 0 ? `CONCURRENT ACTIVITIES (external training demands):\n${context.concurrent_activities.map((a: { name: string; intensity: number; days: string[]; movement_demands: string[] }) => `- ${a.name}: intensity ${Math.round(a.intensity * 100)}%, days: ${a.days.join(", ")}, demands: ${a.movement_demands.join(", ")}`).join("\n")}` : ""}
${context.weekly_schedule ? `CURRENT WEEKLY SCHEDULE:\n${Object.entries(context.weekly_schedule as Record<string, string | null>).map(([day, block]) => `- ${day}: ${block || "Rest"}`).join("\n")}` : ""}

USER PROFILE:
- Age: ${context.profile.age} years | Gender: ${context.profile.gender}
- Height: ${context.profile.height_cm} cm | Weight: ${context.profile.weight_kg} kg
- Activity Level: ${context.profile.activity_level}
- Fitness Goal: ${context.profile.fitness_goal}
- Training Days: Originally ${context.training_days_count} days/week (user can add or remove days at any time via chat — this is NOT a ceiling)
- Preferred Time: ${context.profile.preferred_time}
- Session Duration: ${context.session_duration_preference || '45-60'} minutes
- Training Time: ${context.training_time_preference || 'morning'}
- Workout Split: ${context.workout_split_preference || 'ai_recommendation'}
${context.dietary_preferences && context.dietary_preferences.length > 0 ? `- Dietary Restrictions: ${context.dietary_preferences.join(", ")}` : ""}

SESSION DURATION SCALING (MANDATORY):
The user has ${context.session_duration_preference || '45-60'} minutes per session. Scale your exercise recommendations accordingly:
- 30-45 min: 4-5 exercises max per session. Use supersets to compress time. Skip isolation work.
- 45-60 min: 5-6 exercises. Standard compound + accessory structure.
- 60-90 min: 6-7 exercises. Full compound, accessory, and isolation.
- 90+ min: 7-8 exercises. Maximum volume with extra accessory and isolation work.
When adjusting volume or suggesting modifications, ALWAYS respect this time constraint.

WORKOUT SPLIT ENFORCEMENT:
${context.workout_split_preference === 'ai_recommendation' ? 'The user chose AI-optimized split selection. You may freely restructure days based on their goals.' : `The user explicitly chose "${context.workout_split_preference}" split. You MUST strictly adhere to this architecture. Do NOT suggest or apply changes that violate this split structure unless the user explicitly asks to change it.`}

NUTRITION TARGETS:
- BMR: ${context.profile.bmr} kcal/day | TDEE: ${context.profile.tdee} kcal/day
- Daily Calories: ${context.macros.calories} kcal
- Protein: ${context.macros.protein}g | Carbs: ${context.macros.carbs}g | Fat: ${context.macros.fat}g

CURRENT EXERCISE PLAN:
${context.exercise_summary}

CURRENT MEAL PLAN:
${context.meal_summary}
${buildDietarySafetyBlock(context.dietary_preferences || [])}

${context.workout_log_history ? `WORKOUT PERFORMANCE HISTORY (last 14 days):
The following is the user's actual logged workout performance data. Each line shows a date and exercises performed with weight x reps for each set.
${context.workout_log_history}

PERFORMANCE COACHING DIRECTIVES:
- Use this data to track progressive overload. If the user's logged weight or reps have increased over sessions, congratulate them on their progress.
- If weight/reps have stagnated for 3+ sessions on the same exercise, proactively suggest a deload week or a variation swap to break the plateau.
- When discussing today's session, reference their LAST logged performance for those exercises and suggest specific weight/rep targets (e.g. "Last session you hit 70kg x 8 on bench. Try 72.5kg x 8 today or push for 70kg x 10.").
- Flag if RPE is chronically high (consistently maxing reps with no progression) — suggest backing off 10% and building back up.
- Celebrate personal records (new max weight or rep count for an exercise).
- Use the data to validate or adjust volume recommendations — if a user logs fewer reps than prescribed, their fatigue may be accumulating.` : ''}

${context.cardio_log_history ? `CARDIO & CONDITIONING HISTORY (last 14 days):
The following shows the user's cardio/conditioning activities with activity name, duration, and RPE intensity.
${context.cardio_log_history}

CARDIO COACHING DIRECTIVES:
- Adapt recovery recommendations based on the type and intensity of cardio performed. High-RPE sessions (8+) warrant lighter training the following day.
- Adjust hydration advice proportionally to cardio volume and intensity. Extended sessions (>45min) or high-RPE work require extra electrolyte and fluid intake.
- Adapt nutritional strategy: high-RPE or long-duration cardio increases carbohydrate needs; suggest carb timing around these sessions.
- Recognize unconventional activities (martial arts, sports, rucking) and provide sport-specific recovery tips.
- If cardio frequency is high (5+ sessions/week), proactively suggest a recovery day or deload.
- Track trends in RPE over time — if the same activity at the same duration shows decreasing RPE, congratulate improved conditioning.` : ''}

SESSION PLANNING RULES:
1. The user's session duration is "${context.session_duration_preference || '45-60'} minutes". Never exceed this window. If time is tight (30-45 min), prioritize compounds and drop accessories.
2. For fat loss or endurance goals, include strategic cardio (LISS or HIIT). For muscle building, limit cardio to 2-3 short recovery sessions.
3. Never place high-intensity cardio before heavy compounds on the same day.
4. Cross-reference workout and cardio logs above. If the user logged high-RPE work (7+) back-to-back, suggest active recovery or volume reduction.

Always use the user's specific data when answering. Nutrition, supplements, and recovery questions are always within your scope — answer them directly. For truly unrelated topics (politics, entertainment, tech), redirect with a brief pivot back to training.

CONTEXT: Current Time: ${context.current_time_formatted || new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true })} | Preferred Training Time: ${context.profile?.preferred_time || context.training_time_preference || 'morning'} | Workout Logged Today: ${context.workout_logged_today ? 'Yes' : (todaysLoggedSets ? 'Yes' : 'No')}.
Keep this context in mind to ensure your greetings and questions naturally align with the time of day and their workout status.`;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(history) && history.length > 0) {
      const trimmedHistory = history.slice(-20);
      for (const turn of trimmedHistory) {
        const role = turn.role === "assistant" ? "model" : "user";
        if (turn.content && typeof turn.content === "string") {
          contents.push({ role, parts: [{ text: turn.content }] });
        }
      }
    }

    contents.push({ role: "user", parts: [{ text: message }] });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          tools: [{ functionDeclarations: toolDeclarations }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Gemini API error:", response.status, errorBody);
      return new Response(
        JSON.stringify({
          error: `Gemini API returned ${response.status}`,
          error_type: "ai_upstream",
          user_message: message,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const parts = candidate?.content?.parts ?? [];

    const functionCallPart = parts.find((p: { functionCall?: unknown }) => p.functionCall);

    if (functionCallPart) {
      const { name, args } = functionCallPart.functionCall;
      const textPart = parts.find((p: { text?: string }) => p.text);

      if (name === "replace_food" && Array.isArray(args.ingredients) && args.ingredients.length > 0) {
        const slotBudget = getMealSlotBudget(context.macros, args.meal_slot);

        const calibration = await calibrateMeal(
          args.ingredients,
          slotBudget,
          args.new_item
        );

        const calibrationFailed = !calibration.is_verified || (calibration.protein === 0 && calibration.carbs === 0 && calibration.fat === 0);

        if (calibrationFailed) {
          const estimated = args.estimated_macros;
          const fallbackProtein = estimated?.protein || slotBudget.protein;
          const fallbackCarbs = estimated?.carbs || slotBudget.carbs;
          const fallbackFat = estimated?.fat || slotBudget.fat;
          const fallbackCalories = estimated?.calories || ((fallbackProtein * 4) + (fallbackCarbs * 4) + (fallbackFat * 9));

          console.warn(`Calibration failed for "${args.new_item}" in ${args.meal_slot}. Using Gemini estimated_macros fallback: ${fallbackCalories} kcal, P:${fallbackProtein} C:${fallbackCarbs} F:${fallbackFat}`);

          const actionPayload = {
            type: name,
            meal_slot: args.meal_slot,
            old_item: args.old_item,
            new_item: args.new_item,
            protein: fallbackProtein,
            carbs: fallbackCarbs,
            fat: fallbackFat,
            portion_size: args.ingredients.join(", "),
            prep: args.prep,
            ingredients: args.ingredients,
            is_verified: false,
          };
          const confirmationText = textPart?.text || `Done! I've replaced **${args.old_item}** with **${args.new_item}** in your ${args.meal_slot} (${args.ingredients.join(", ")}). Estimated: ${fallbackCalories} kcal, ${fallbackProtein}g protein, ${fallbackCarbs}g carbs, ${fallbackFat}g fat.`;

          return new Response(
            JSON.stringify({ reply: confirmationText, action: actionPayload }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const actionPayload = {
          type: name,
          meal_slot: args.meal_slot,
          old_item: args.old_item,
          new_item: args.new_item,
          protein: calibration.protein,
          carbs: calibration.carbs,
          fat: calibration.fat,
          portion_size: calibration.ingredients.join(", "),
          prep: args.prep,
          ingredients: calibration.ingredients,
          is_verified: true,
        };
        const confirmationText = textPart?.text || `Done! I've replaced **${args.old_item}** with **${args.new_item}** in your ${args.meal_slot} (${calibration.ingredients.join(", ")}). Verified: ${calibration.calories} kcal, ${calibration.protein}g protein, ${calibration.carbs}g carbs, ${calibration.fat}g fat.${calibration.within_target ? " (Within 3% of target)" : ` (Calibrated over ${calibration.iterations} iteration${calibration.iterations !== 1 ? "s" : ""})`}`;

        return new Response(
          JSON.stringify({ reply: confirmationText, action: actionPayload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "update_workout_schedule") {
        // Soft-validate: attempt to normalize any shape into a valid SchedulePatchItem[]
        let normalizedPatch: SchedulePatchItem[] = [];

        try {
          // Gemini may use alternative key names for the schedule data
          const patchData = args.schedule_patch || args.changes || args.updates || args.schedule || args.patch;

          if (patchData) {
            if (Array.isArray(patchData)) {
              // Already an array - validate each item has at minimum a day field
              normalizedPatch = patchData
                .filter((item: Record<string, unknown>) => item && item.day)
                .map((item: Record<string, unknown>) => ({
                  day: String(item.day),
                  action: (item.action as string || "ADD").toUpperCase() as "ADD" | "REMOVE" | "MOVE",
                  block_name: String(item.block_name || item.session || item.name || "Rest"),
                  exercises: item.exercises as { name: string; sets: number; reps: string }[] | undefined,
                }));
            } else if (typeof patchData === "object") {
              // Old Record<string, string|null> format - backward compat
              normalizedPatch = Object.entries(patchData as Record<string, string | null>)
                .filter(([day]) => day)
                .map(([day, block]: [string, string | null]) => ({
                  day,
                  action: block ? "MOVE" as const : "REMOVE" as const,
                  block_name: block || "Rest",
                }));
            }
          } else if (args.day) {
            // Gemini passed a flat single-item (day + action) instead of wrapping in schedule_patch
            normalizedPatch = [{
              day: String(args.day),
              action: (args.action as string || "ADD").toUpperCase() as "ADD" | "REMOVE" | "MOVE",
              block_name: String(args.block_name || args.session || args.name || "Custom"),
              exercises: args.exercises as { name: string; sets: number; reps: string }[] | undefined,
            }];
          }
        } catch (parseErr) {
          console.error("Schedule patch normalization failed. Raw args:", JSON.stringify(args), "Error:", parseErr);
        }

        if (normalizedPatch.length === 0) {
          console.error("Empty normalizedPatch after parsing. Raw args received from Gemini:", JSON.stringify(args));
          const fallbackReply = textPart?.text || "I need a bit more detail to update your schedule. Which day would you like to change, and what should happen?";
          return new Response(
            JSON.stringify({ reply: fallbackReply }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const profileId = context.profile_id;
        let recalibration;
        try {
          recalibration = await executeRecalibrationPipeline(
            profileId || "",
            normalizedPatch,
            {
              concurrent_activities: context.concurrent_activities || [],
              exercise_summary: context.exercise_summary || "",
              weekly_schedule: context.weekly_schedule || {},
            },
            supabaseUrl,
            serviceKey
          );
        } catch (err) {
          console.error("Schedule recalibration failed:", err);
          const fallbackReply = textPart?.text || "I ran into an issue updating your schedule. Could you try rephrasing what you'd like to swap?";
          return new Response(
            JSON.stringify({ reply: fallbackReply }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const actionPayload = {
          type: "update_workout_schedule",
          schedule_patch: normalizedPatch,
          recalibrated_days: recalibration.recalibrated_days,
          adaptations: recalibration.adaptations,
        };

        const rawScheduleText = textPart?.text || generateScheduleConfirmation(recalibration);
        // Strip any system-log-style lines that may have leaked into the AI's text response
        const scheduleReply = rawScheduleText
          .split("\n")
          .filter((line: string) => {
            const l = line.trim();
            if (l.match(/assigned \((ADD|REMOVE|MOVE)\)/i)) return false;
            if (l.match(/no fatigue conflicts detected/i)) return false;
            if (l.match(/active training days configured/i)) return false;
            if (l.match(/RECALIBRATED —/)) return false;
            if (l.match(/^Schedule updated —/)) return false;
            return true;
          })
          .join("\n")
          .trim() || "Done! Your schedule has been updated.";

        return new Response(
          JSON.stringify({ reply: scheduleReply, action: actionPayload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_workout_session") {
        const dayOfWeek = args.day || new Date().toLocaleDateString("en-US", { weekday: "long" });
        const logs = args.logs as Array<{ exercise_name: string; sets_completed: number; reps_completed: number; weight_kg: number }>;
        const profileId = context.profile_id;

        let dbSuccess = true;
        let dbError = "";
        let insertedSets = 0;

        if (profileId && logs && logs.length > 0) {
          try {
            const todayDate = new Date().toISOString().split("T")[0];
            const rows = logs.flatMap((log) =>
              Array.from({ length: log.sets_completed }, (_, i) => ({
                user_id: profileId,
                date: todayDate,
                exercise_name: log.exercise_name,
                set_number: i + 1,
                weight_kg: log.weight_kg || 0,
                reps_completed: log.reps_completed,
                is_bodyweight: (log.weight_kg || 0) === 0,
                completed_at: new Date().toISOString(),
              }))
            );

            const upsertResp = await fetch(
              `${supabaseUrl}/rest/v1/workout_logs`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceKey}`,
                  Apikey: serviceKey,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal,resolution=merge-duplicates",
                },
                body: JSON.stringify(rows),
              }
            );

            if (upsertResp.ok) {
              insertedSets = rows.length;
            } else {
              const errText = await upsertResp.text();
              console.error(`workout_logs upsert failed: ${upsertResp.status}`, errText);
              dbSuccess = false;
              dbError = `Database write failed (${upsertResp.status})`;
            }
          } catch (err) {
            dbSuccess = false;
            dbError = `Database error: ${err instanceof Error ? err.message : "unknown"}`;
            console.error("log_workout_session DB error:", err);
          }
        }

        const actionPayload = {
          type: "log_workout_session",
          day: dayOfWeek,
          logs: logs || [],
          db_success: dbSuccess,
        };

        let confirmText: string;
        if (dbSuccess && insertedSets > 0) {
          const logSummary = (logs || [])
            .map((l) => `**${l.exercise_name}**: ${l.sets_completed}x${l.reps_completed} @ ${l.weight_kg}kg`)
            .join("\n- ");
          confirmText = textPart?.text || `Logged your workout for ${dayOfWeek}:\n- ${logSummary}\n\n${insertedSets} sets saved — I'll track your progression.`;
        } else {
          confirmText = `I tried to log your workout but the save failed${dbError ? `: ${dbError}` : ""}. Your performance data was not recorded — please try again or log it manually.`;
        }

        return new Response(
          JSON.stringify({ reply: confirmText, action: actionPayload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_meal") {
        const profileId = context.profile_id;
        let dbSuccess = true;
        let dbError = "";

        if (profileId) {
          try {
            const todayDate = new Date().toISOString().split("T")[0];
            const insertResp = await fetch(
              `${supabaseUrl}/rest/v1/daily_food_logs`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceKey}`,
                  Apikey: serviceKey,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal",
                },
                body: JSON.stringify({
                  profile_id: profileId,
                  date: todayDate,
                  meal_slot: args.meal_slot,
                  food_name: args.food_name,
                  calories: args.estimated_calories,
                  protein: args.estimated_protein,
                  carbs: args.estimated_carbs,
                  fat: args.estimated_fat,
                }),
              }
            );

            if (!insertResp.ok) {
              const errText = await insertResp.text();
              console.error(`daily_food_logs insert failed: ${insertResp.status}`, errText);
              dbSuccess = false;
              dbError = `Database write failed (${insertResp.status})`;
            }
          } catch (err) {
            dbSuccess = false;
            dbError = `Database error: ${err instanceof Error ? err.message : "unknown"}`;
          }
        }

        let confirmText: string;
        if (dbSuccess) {
          confirmText = textPart?.text || `Logged **${args.food_name}** for ${args.meal_slot}: ${args.estimated_calories} kcal (P: ${args.estimated_protein}g, C: ${args.estimated_carbs}g, F: ${args.estimated_fat}g).`;
        } else {
          confirmText = `I tried to log your meal but the save failed${dbError ? `: ${dbError}` : ""}. The meal was not recorded — please try again.`;
        }

        return new Response(
          JSON.stringify({ reply: confirmText, action: dbSuccess ? { type: "log_meal", ...args } : undefined }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "swap_meal") {
        const actionPayload = {
          type: "replace_food",
          meal_slot: args.meal_slot,
          old_item: args.old_item,
          new_item: args.new_item,
          ingredients: args.ingredients || [],
          protein: args.estimated_macros?.protein || 0,
          carbs: args.estimated_macros?.carbs || 0,
          fat: args.estimated_macros?.fat || 0,
          portion_size: null,
          prep: null,
          is_verified: false,
        };

        const confirmText = textPart?.text || `I'll swap **${args.old_item}** for **${args.new_item}** in your ${args.meal_slot}. The meal plan will be updated once calibration completes.`;

        return new Response(
          JSON.stringify({ reply: confirmText, action: actionPayload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_workout_set") {
        const profileId = context.profile_id;
        let dbSuccess = true;
        let dbError = "";

        if (profileId) {
          try {
            const todayDate = new Date().toISOString().split("T")[0];
            const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
            const insertResp = await fetch(
              `${supabaseUrl}/rest/v1/workout_logs`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceKey}`,
                  Apikey: serviceKey,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal,resolution=merge-duplicates",
                },
                body: JSON.stringify({
                  user_id: profileId,
                  date: todayDate,
                  exercise_name: args.exercise_name,
                  set_number: args.set_number,
                  weight_kg: args.weight_kg || 0,
                  reps_completed: args.reps,
                  is_bodyweight: (args.weight_kg || 0) === 0,
                  completed_at: new Date().toISOString(),
                }),
              }
            );

            if (!insertResp.ok) {
              const errText = await insertResp.text();
              console.error(`workout_logs insert failed: ${insertResp.status}`, errText);
              dbSuccess = false;
              dbError = `Database write failed (${insertResp.status})`;
            }
          } catch (err) {
            dbSuccess = false;
            dbError = `Database error: ${err instanceof Error ? err.message : "unknown"}`;
          }
        }

        let confirmText: string;
        if (dbSuccess) {
          confirmText = textPart?.text || `Logged set ${args.set_number} of **${args.exercise_name}**: ${args.reps} reps @ ${args.weight_kg}kg${args.rpe ? ` (RPE ${args.rpe})` : ""}.`;
        } else {
          confirmText = `I tried to log your set but the save failed${dbError ? `: ${dbError}` : ""}. Please try again.`;
        }

        return new Response(
          JSON.stringify({
            reply: confirmText,
            action: dbSuccess ? { type: "log_workout_set", ...args } : undefined,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const confirmationText = textPart?.text || generateConfirmation(name, args);

      return new Response(
        JSON.stringify({
          reply: confirmationText,
          action: { type: name, ...args },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "MAX_TOKENS") {
      const partialText = parts.find((p: { text?: string }) => p.text)?.text;
      const reply = partialText || "My response was too long. Could you ask again more specifically?";
      return new Response(
        JSON.stringify({ reply, truncated: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "SAFETY" || finishReason === "RECITATION" || finishReason === "OTHER") {
      return new Response(
        JSON.stringify({
          reply: `I couldn't process that one — it may have triggered a content filter. Could you rephrase what you meant by "${message.length > 60 ? message.slice(0, 60) + '...' : message}"?`,
          error_type: "content_filter",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text =
      parts.find((p: { text?: string }) => p.text)?.text ??
      `I didn't quite catch that. Could you try rephrasing "${message.length > 50 ? message.slice(0, 50) + '...' : message}"?`;

    return new Response(
      JSON.stringify({ reply: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        error_type: "internal",
        user_message: typeof message === "string" ? message : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateConfirmation(name: string, args: Record<string, unknown>): string {
  if (name === "replace_exercise") {
    return `Done! I've swapped **${args.old_item}** for **${args.new_item}** on ${args.day}. You'll do ${args.sets} sets of ${args.reps} with ${args.rest} rest.`;
  }
  if (name === "adjust_volume") {
    return `Done! I've adjusted the volume for your ${args.day} session (${args.adjustment}). ${args.reason || ""}`;
  }
  if (name === "ban_exercise") {
    return `Got it — I've permanently removed **${args.exercise_name}** from your plan. It will never appear in future workout cycles. ${args.reason ? `Reason noted: ${args.reason}` : ""}`;
  }
  return "Your plan has been updated.";
}

function generateScheduleConfirmation(recalibration: RecalibrationResult): string {
  const recalCount = recalibration.recalibrated_days.length;

  let reply = "Done! I've updated your training schedule.";

  if (recalCount > 0) {
    reply += ` I also made some smart adjustments to ${recalCount} day${recalCount > 1 ? "s" : ""} to avoid fatigue overlap with your other activities.`;
  }

  return reply;
}
