import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GEMINI_MODEL } from "../_shared/gemini.ts";
import { computeMealMacros, type MealIngredientLine } from "../_shared/food-db.ts";
import { classifyImperative } from "../_shared/imperative-classifier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// C0 unified logging (Part 3): chat writes land in the SAME store the app and
// the progression engine read — exercise_set_logs, session-linked — instead of
// the legacy workout_logs table nothing reads anymore. Keep the slug scheme in
// lockstep with slugifyExerciseName in src/lib/exercise-db.ts.
// ---------------------------------------------------------------------------

function slugifyExerciseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Get-or-create the day's workout_sessions row ((profile_id, date) is unique) and return its id. */
async function ensureWorkoutSession(
  supabaseUrl: string,
  serviceKey: string,
  profileId: string,
  date: string,
  day: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    Apikey: serviceKey,
    "Content-Type": "application/json",
  };
  const selectResp = await fetch(
    `${supabaseUrl}/rest/v1/workout_sessions?profile_id=eq.${profileId}&date=eq.${date}&select=id`,
    { headers },
  );
  if (selectResp.ok) {
    const rows = await selectResp.json();
    if (rows.length > 0) return rows[0].id;
  }
  const insertResp = await fetch(`${supabaseUrl}/rest/v1/workout_sessions`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({
      profile_id: profileId,
      date,
      split_type: "training",
      duration_minutes: 45,
      is_completed: false,
      started_at: new Date().toISOString(),
      day,
    }),
  });
  if (insertResp.ok) {
    const rows = await insertResp.json();
    if (rows.length > 0) return rows[0].id;
  }
  // Conflict race — the row exists now; re-select.
  const retryResp = await fetch(
    `${supabaseUrl}/rest/v1/workout_sessions?profile_id=eq.${profileId}&date=eq.${date}&select=id`,
    { headers },
  );
  if (retryResp.ok) {
    const rows = await retryResp.json();
    if (rows.length > 0) return rows[0].id;
  }
  throw new Error(`Failed to resolve workout session (${insertResp.status})`);
}

interface UnifiedSetRow {
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps_completed: number;
  rpe?: number | null;
  is_bodyweight: boolean;
}

/**
 * A batched upsert whose payload contains two rows resolving to the same
 * (exercise_id, set_number) — e.g. "Push-Ups" and "Push ups", both slugging
 * to push-ups — makes Postgres reject the WHOLE statement with 21000 ("ON
 * CONFLICT DO UPDATE command cannot affect row a second time"), dropping
 * every exercise in the batch, not just the colliding one (C0 fix #7/#16).
 * Renumbers any collision to continue after the highest set_number already
 * used for that slug in this batch, so a collision degrades to continuous
 * numbering across name variants instead of failing outright.
 */
function dedupeAndRenumberBatch(rows: UnifiedSetRow[]): UnifiedSetRow[] {
  const maxSetBySlug = new Map<string, number>();
  const seenKeys = new Set<string>();
  return rows.map((r) => {
    const slug = slugifyExerciseName(r.exercise_name);
    let setNumber = r.set_number;
    let key = `${slug}|${setNumber}`;
    while (seenKeys.has(key)) {
      setNumber = (maxSetBySlug.get(slug) ?? setNumber) + 1;
      key = `${slug}|${setNumber}`;
    }
    seenKeys.add(key);
    maxSetBySlug.set(slug, Math.max(maxSetBySlug.get(slug) ?? 0, setNumber));
    return setNumber === r.set_number ? r : { ...r, set_number: setNumber };
  });
}

/** Upserts set rows into exercise_set_logs on the natural key — same semantics as set-log-store.ts. */
async function upsertUnifiedSets(
  supabaseUrl: string,
  serviceKey: string,
  profileId: string,
  sessionId: string,
  day: string,
  rows: UnifiedSetRow[],
): Promise<void> {
  const payload = dedupeAndRenumberBatch(rows).map((r) => ({
    session_id: sessionId,
    user_id: profileId,
    exercise_id: slugifyExerciseName(r.exercise_name),
    exercise_name: r.exercise_name,
    week_number: null,
    day,
    set_number: r.set_number,
    weight_kg: r.weight_kg,
    reps_completed: r.reps_completed,
    rpe: r.rpe ?? null,
    unit: "reps",
    is_bodyweight: r.is_bodyweight,
    is_warmup: false,
    completed_at: new Date().toISOString(),
  }));
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/exercise_set_logs?on_conflict=user_id,session_id,exercise_id,set_number,is_warmup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        Apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`exercise_set_logs upsert failed (${resp.status}): ${errText}`);
  }
}

// ---------------------------------------------------------------------------
// Weight resolution (C0 fix #2) — the tool schema can no longer default an
// unstated weight to 0 and have it treated as a real lift. When the user
// doesn't state a weight AND the exercise isn't bodyweight, resolve it from
// (in order) the trainee's last logged working weight for that exercise,
// then the current plan's suggested load. If neither exists, the set is
// skipped entirely — never written as a fabricated 0kg row — and the model
// asks the user for the weight instead.
// ---------------------------------------------------------------------------

/** Most recent logged working weight (weight_kg > 0, never a warmup) for this exercise — mirrors set-log-store.ts's getLastSessionSets base-weight semantics closely enough for a one-shot lookup. */
async function getLastLoggedWeight(
  supabaseUrl: string,
  serviceKey: string,
  profileId: string,
  exerciseSlug: string,
): Promise<number | null> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/exercise_set_logs?user_id=eq.${profileId}&exercise_id=eq.${exerciseSlug}&is_warmup=eq.false&weight_kg=gt.0&order=completed_at.desc&limit=1&select=weight_kg`,
    { headers: { Authorization: `Bearer ${serviceKey}`, Apikey: serviceKey } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0]?.weight_kg != null ? Number(rows[0].weight_kg) : null;
}

/** The current mesocycle's suggested_load_kg for this exercise name, searched across every persisted week (small, bounded per profile). */
async function getPlanSuggestedWeight(
  supabaseUrl: string,
  serviceKey: string,
  profileId: string,
  exerciseName: string,
): Promise<number | null> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/mesocycle_weeks?profile_id=eq.${profileId}&select=days`,
    { headers: { Authorization: `Bearer ${serviceKey}`, Apikey: serviceKey } },
  );
  if (!resp.ok) return null;
  const weeks = await resp.json();
  const target = exerciseName.trim().toLowerCase();
  for (const week of weeks) {
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (
          typeof ex.name === "string" && ex.name.trim().toLowerCase() === target &&
          typeof ex.suggested_load_kg === "number" && ex.suggested_load_kg > 0
        ) {
          return ex.suggested_load_kg;
        }
      }
    }
  }
  return null;
}

interface ResolvedWeight {
  weightKg: number;
  isBodyweight: boolean;
  /** Set when the weight came from somewhere other than the user's own statement — surfaced in the confirmation reply so it's never silently assumed. */
  inferredFrom?: "history" | "plan";
}

/** Resolves one exercise's weight per the fix #2 order: explicit > bodyweight > last logged > plan suggestion > unresolved (caller must skip the write and ask). */
async function resolveWeight(
  supabaseUrl: string,
  serviceKey: string,
  profileId: string,
  exerciseName: string,
  statedWeightKg: number | null | undefined,
  statedIsBodyweight: boolean | null | undefined,
): Promise<ResolvedWeight | null> {
  if (statedIsBodyweight) return { weightKg: 0, isBodyweight: true };
  if (typeof statedWeightKg === "number" && statedWeightKg > 0) return { weightKg: statedWeightKg, isBodyweight: false };

  const slug = slugifyExerciseName(exerciseName);
  const lastLogged = await getLastLoggedWeight(supabaseUrl, serviceKey, profileId, slug);
  if (lastLogged != null) return { weightKg: lastLogged, isBodyweight: false, inferredFrom: "history" };

  const planSuggested = await getPlanSuggestedWeight(supabaseUrl, serviceKey, profileId, exerciseName);
  if (planSuggested != null) return { weightKg: planSuggested, isBodyweight: false, inferredFrom: "plan" };

  return null; // Unresolved — caller skips the write and asks the user.
}

const toolDeclarations = [
  {
    name: "propose_meal_swap",
    description:
      "PROPOSES swapping which verified pool option is assigned to a meal slot — this does NOT apply the change. Call this when the user gives an explicit command to change a meal (e.g. 'swap my lunch', 'change breakfast to something else'). Do NOT invent a new dish or ingredients — new_item, if given, must be the exact name of an existing alternative already in that slot's pool (mention one from the meal summary below if you know it; otherwise omit new_item and the app will pick the best available alternative). The app shows the user a card with the exact before/after macros and they tap Confirm themselves — do not describe the swap as already done.",
    parameters: {
      type: "object",
      properties: {
        meal_slot: {
          type: "string",
          description: "The meal slot to modify (breakfast, lunch, dinner, or snack)",
        },
        old_item: {
          type: "string",
          description: "The name of the food item being replaced (as it appears in the plan)",
        },
        new_item: {
          type: "string",
          description: "The exact name of an existing pool option to switch to. Omit if you don't know a specific alternative — the app picks one from the verified pool.",
        },
        reason: {
          type: "string",
          description: "One short sentence on why this swap makes sense — shown on the card as the rationale.",
        },
        origin_verbatim_quote: {
          type: "string",
          description: "The exact substring of the user's CURRENT message that is the imperative command for this swap. Must be copied verbatim, not paraphrased.",
        },
      },
      required: ["meal_slot", "old_item", "origin_verbatim_quote"],
    },
  },
  {
    name: "propose_exercise_swap",
    description:
      "PROPOSES swapping an exercise in the user's workout plan for a biomechanically similar alternative — this does NOT apply the change. Call this when the user gives an explicit command to modify their plan (e.g. 'swap bench press for push-ups', 'replace squats with leg press') OR proposes a swap due to pain/fatigue that the user has confirmed. The app shows the user a card with the exact before/after and they tap Confirm themselves — do not describe the swap as already done, and do not ask for a SEPARATE confirmation in your own text (the card IS the confirmation step). origin_verbatim_quote must be the exact substring of the user's message that makes this an imperative request, not a paraphrase.",
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
        scope: {
          type: "string",
          enum: ["today", "permanent"],
          description: "'today' (default) only swaps this session; 'permanent' swaps for the rest of the current training block. Use 'permanent' ONLY when the user explicitly asks for a lasting change (e.g. 'for the rest of the plan', 'I never want to do X again').",
        },
        reason: {
          type: "string",
          description: "One short sentence on why this swap makes sense — shown on the card as the rationale.",
        },
        origin_verbatim_quote: {
          type: "string",
          description: "The exact substring of the user's CURRENT message that is the imperative command for this swap (e.g. 'swap bench for push-ups'). Must be copied verbatim, not paraphrased.",
        },
      },
      required: ["day", "old_item", "new_item", "origin_verbatim_quote"],
    },
  },
  {
    name: "adjust_volume",
    description:
      "Adjust the total training volume (sets/reps) for a specific day's session. NOT SAFELY WIRED UP YET — calling this will decline with a message pointing the user at the in-app controls. Prefer discussing volume changes conversationally (what to do, why) and let the user apply it in the app, rather than calling this tool.",
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
      "NOT SAFELY WIRED UP YET — calling this will decline with a message pointing the user at the in-app controls. It used to write to a profile field the app doesn't actually render from, so schedule 'changes' looked applied in chat but never showed up on the Exercise tab. Prefer discussing schedule changes conversationally (what to do, why) and let the user apply it in the app.",
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
                description: "Weight used in kg, ONLY if the user actually stated one. Omit this field entirely if they didn't mention a weight — do NOT guess or default to 0. Zero has a specific meaning here: it means bodyweight (see is_bodyweight), never 'unstated'.",
              },
              is_bodyweight: {
                type: "boolean",
                description: "True if this is a bodyweight-only movement (push-ups, pull-ups, dips, planks, etc.) or the user explicitly said 'bodyweight'/'no weight'. Leave false/omitted if a weight is simply unmentioned for a normally-loaded exercise — the app will resolve it from history instead of assuming bodyweight.",
              },
            },
            required: ["exercise_name", "sets_completed", "reps_completed"],
          },
        },
      },
      required: ["day", "logs"],
    },
  },
  {
    name: "log_workout",
    description:
      "Logs a natural-language description of completed exercise sets (VISION-ARCHITECTURE.md §3.1: 'the model segments, code owns every number'). Segment the user's message into one entry per exercise — identify WHICH SPAN OF TEXT is the exercise name and which is the sets/reps/weight/RPE description. Copy those spans VERBATIM from the user's message. Do NOT compute, convert, round, or reinterpret any number yourself — the app parses every quantity deterministically from the phrases you pass through. Prefer this over log_workout_session whenever the user describes more than one exercise in natural language (e.g. 'did 6x8 @100kg bench, 4x12 @20kg DB flyes, felt like RPE 7 on the last set').",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "ISO date (YYYY-MM-DD) this session happened. Omit to default to today.",
        },
        entries: {
          type: "array",
          description: "One entry per exercise mentioned, in the order the user described them.",
          items: {
            type: "object",
            properties: {
              raw_text: {
                type: "string",
                description: "The full raw text span covering this exercise (name + sets/reps/weight/RPE), verbatim from the user's message.",
              },
              exercise_phrase: {
                type: "string",
                description: "Just the exercise-name portion of the text, verbatim (e.g. 'bench', 'DB flyes').",
              },
              sets_phrase: {
                type: "string",
                description: "Just the sets/reps/weight/RPE portion of the text, verbatim (e.g. '6x8 @100kg', 'RPE 7 on the last set').",
              },
            },
            required: ["raw_text", "exercise_phrase", "sets_phrase"],
          },
        },
      },
      required: ["entries"],
    },
  },
  {
    name: "log_weight",
    description:
      "Records the user's body-weight for today. Call whenever the user reports a weigh-in (e.g. 'I weighed 86.4 this morning', 'scale said 190 lbs today'). Convert pounds to kilograms before calling (1 lb = 0.453592 kg). One entry per day — a second weigh-in today overwrites the first.",
    parameters: {
      type: "object",
      properties: {
        weight_kg: {
          type: "number",
          description: "Body weight in kilograms (convert from lbs if the user used pounds)",
        },
      },
      required: ["weight_kg"],
    },
  },
  {
    name: "log_meal",
    description:
      "Call whenever the user describes food they ate, OR asks a nutrition question about specific food (e.g. 'how many calories is 2 eggs and toast', 'what's the protein in this shake'). Extract ONLY the ingredients the user actually stated, with their exact quantities and units — the app computes real macros from a verified food database from what you extract, so you must never calculate or state a macro number yourself. Never add an ingredient the user didn't mention (no assumed cooking oil, seasoning, or protein powder) — if an addition seems implied, ask instead of guessing. If an ingredient has an ambiguous variant (e.g. 'greek yoghurt' could be 0% or full-fat, 'milk' could be whole or skimmed), name the SPECIFIC variant you're assuming (e.g. 'greek yoghurt 0%', not 'greek yoghurt') and record it in assumptions. If a quantity is missing, use a typical portion and record that assumption too.",
    parameters: {
      type: "object",
      properties: {
        meal_slot: {
          type: "string",
          description: "Which meal slot (breakfast, lunch, dinner, snack_1, snack_2)",
        },
        food_name: {
          type: "string",
          description: "Short label for what was eaten, e.g. 'Post-workout shake'",
        },
        ingredients: {
          type: "array",
          description: "ONLY what the user actually stated — one entry per distinct ingredient. Never invent an addition they didn't mention.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Specific ingredient name, disambiguated where the base name is ambiguous (e.g. 'greek yoghurt 0%', not 'greek yoghurt'; 'whey protein powder' not 'protein').",
              },
              quantity: { type: "number", description: "Quantity in the given unit" },
              unit: { type: "string", description: "g, ml, medium, large, scoop, tbsp, tsp, slice, whole, clove, etc." },
            },
            required: ["name", "quantity", "unit"],
          },
        },
        assumptions: {
          type: "array",
          items: { type: "string" },
          description: "Plain-English notes on any assumption you made — an ambiguous variant you picked, or a portion size you guessed because none was given. Empty array if you made none.",
        },
      },
      required: ["meal_slot", "food_name", "ingredients", "assumptions"],
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
          description: "Weight in kg, ONLY if the user actually stated one. Omit this field entirely if unmentioned — do NOT guess or default to 0. Zero specifically means bodyweight (see is_bodyweight), never 'unstated'.",
        },
        is_bodyweight: {
          type: "boolean",
          description: "True if this is a bodyweight-only movement or the user explicitly said 'bodyweight'/'no weight'. Leave false/omitted if a weight is simply unmentioned for a normally-loaded exercise.",
        },
        rpe: {
          type: "number",
          description: "Rate of perceived exertion (1-10), if mentioned",
        },
      },
      required: ["exercise_name", "set_number", "reps"],
    },
  },
];

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
        // Unified store (C0): the same table chat's own writes land in, so the
        // assistant always sees sets it just logged (pre-C0 it read set_logs
        // but wrote workout_logs — its own writes were invisible to it).
        const logsResponse = await fetch(
          `${supabaseUrl}/rest/v1/exercise_set_logs?user_id=eq.${context.profile_id}&completed_at=gte.${cutoff}&is_warmup=eq.false&order=completed_at.desc`,
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
- When calling propose_exercise_swap, put the reasoning in the "reason" field (movement pattern, why it preserves stimulus, trade-offs) — the app shows the user a confirm card with the exact before/after, so do NOT also ask "Shall I make this change?" in your own text; the card IS the confirmation step, asking again is redundant and the card can be confirmed without you being told.
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
- Parse exercise names, sets, reps, and weights from the user's message. If a weight isn't mentioned, do NOT guess or default to 0 — omit weight_kg from that log entry entirely and let the app resolve it from their history or plan. Only set is_bodyweight (and weight_kg: 0) when the movement is genuinely bodyweight-only (push-ups, pull-ups, dips, planks, etc.) or the user explicitly says "bodyweight"/"no weight".
- If the day isn't mentioned, default to today.
- After logging, congratulate them and note if they hit the top of their rep range (which triggers progressive overload).
- If the user asks about their progress, reference logged data to show improvement trends.
${context.exercise_exclusions && context.exercise_exclusions.length > 0 ? `\nPERMANENTLY EXCLUDED EXERCISES (never suggest these):\n${context.exercise_exclusions.join(", ")}` : ""}

=== NATURAL LANGUAGE FOOD LOGGING & NUTRITION QUESTIONS (CRITICAL) ===
- You must NEVER calculate or state a macro number (calories, protein, carbs, fat) yourself in your reply text, for ANY reason — not for logging food someone ate, not for answering "how many calories is X", not for coaching analysis. Every macro number in this app comes from a verified food database computed server-side; your job is parsing, never arithmetic.
- Whenever the user describes food they ate, OR asks a nutrition/macro question about specific food, call log_meal with the ingredients parsed from their message. The tool's response already contains the real computed numbers (and any coverage/assumption caveats) — your reply must use ONLY those numbers, never your own math on top of them.
- Extract ONLY what the user actually stated. Never add an ingredient they didn't mention (no assumed cooking oil, seasoning, or protein powder) — if an addition seems implied, ask the user rather than silently including it.
- If an ingredient has an ambiguous variant (fat content, whole vs. skimmed, etc.), pick one explicit, precisely-named variant and record the assumption. If a quantity is missing, use a typical portion and record that assumption too. See log_meal's parameter descriptions for exact requirements.
- propose_meal_swap does not take a macro field at all — the app computes the swap's macros itself from the verified pool, shown on the confirm card.

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

When replacing a food item, scale the new dish's ingredient weights to hit THAT SLOT'S specific macro budget above. Your "estimated_macros" here is an internal scaling input only, never shown to the user as a verified number — the meal actually applied to the plan comes from a separately verified pool, not your estimate.

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
- Trigger propose_meal_swap or propose_exercise_swap when the user gives a DIRECT COMMAND to modify their plan. Command verbs include: "replace", "swap", "change", "switch", "use X instead". Both ALWAYS require origin_verbatim_quote — the exact substring of the CURRENT message that is the command; if the request is a question, a hypothetical, or a statement with no imperative verb (e.g. "I didn't train today", "should I switch to dumbbells?"), do NOT call the tool — answer in text instead.
- Neither propose_meal_swap nor propose_exercise_swap applies anything itself — both show the user a confirm card. Put your reasoning in the "reason" field, not in a preceding question; do not say "Shall I make this change?" or claim the swap happened.
- Exercise swaps default to scope: "today" (only applies to today's workout; the original exercise returns next time that day comes up). Only set scope: "permanent" when the user explicitly says they want a lasting change (e.g. "for the rest of the plan", "permanently", "I never want to do X", "always use Y instead").
- PLAN CHANGES NOT YET SAFE TO EXECUTE: update_workout_schedule (adding/moving/removing training days) and adjust_volume (adjusting sets for a session) are not safely wired up yet — calling either will always decline. For any request along these lines (rescheduling, clearing a day, adding a skill session, cutting volume, extra sets, fatigue/time-constraint adjustments), do NOT call the tool. Instead, briefly describe what you'd suggest and why, then tell the user to make it themselves via the in-app controls (the schedule editor for schedule changes, the swap (⇄) button or set-count controls on the exercise for volume changes).
- Answer exercise form/technique questions ("How do I do X?", "What muscles does X work?") directly in your text response. Provide step-by-step form cues, target muscles, common mistakes, and coaching tips.
- Trigger ban_exercise when the user says "I hate X", "never give me X", "remove X permanently", or explicitly flags an exercise to blacklist.
- When a food LOGGING command is given (log_meal), execute it immediately. Scale portions to the meal slot budget above. Do NOT ask for macro details.
- If the user does not specify which meal slot for a swap, infer it from the current meal plan.
- When calling propose_meal_swap, call the function FIRST. Do NOT write a long preamble — put reasoning in the "reason" field.
- Do NOT trigger function calls for hypothetical questions, comparisons, or educational questions about exercise technique (answer those directly as text).
- When genuinely unsure if the user wants a change applied, don't call a propose_* tool at all — ask in plain text first, and only call the tool on their next, unambiguous reply.

VIDEO & DEMONSTRATION REQUESTS:
- When a user asks for a video, demonstration, or visual guide for any exercise, NEVER respond with "I can't send videos" or similar disclaimers.
- Instead, ALWAYS provide a clickable YouTube search link formatted as: [Watch [Exercise Name] Tutorial on YouTube](https://www.youtube.com/results?search_query=[Exercise+Name]+tutorial+form)
- You may also include brief text-based form cues alongside the link for immediate reference.

${context.concurrent_activities && context.concurrent_activities.length > 0 ? `CONCURRENT ACTIVITIES (external training demands):\n${context.concurrent_activities.map((a: { name: string; intensity: number; days: string[]; movement_demands: string[] }) => `- ${a.name}: intensity ${Math.round(a.intensity * 100)}%, days: ${a.days.join(", ")}, demands: ${a.movement_demands.join(", ")}`).join("\n")}` : ""}

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
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
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
            // See generate-meals/index.ts — gemini-3.5-flash's default
            // "thinking" mode eats into maxOutputTokens and was confirmed to
            // truncate structured JSON output there. Function-call args are
            // exactly the kind of structured output that would silently
            // corrupt the same way, so disabled preventively here too.
            thinkingConfig: { thinkingBudget: 0 },
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

      if (name === "propose_meal_swap") {
        // VISION-ARCHITECTURE.md §2/Part 3 — replaces replace_food and
        // swap_meal entirely. Unlike propose_exercise_swap, the server CAN
        // cheaply build the full diff here: pool data is a plain REST
        // fetch (meal_plan_slots), no client-only TS modules needed. I1
        // still holds — this only READS meal_plan_slots, it never writes.
        const classification = classifyImperative(args.origin_verbatim_quote || "", message);
        if (!classification.imperative) {
          return new Response(
            JSON.stringify({
              reply: "",
              offer: { text: `Want me to swap **${args.old_item}** for something else in your ${args.meal_slot}?` },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const profileId = context.profile_id;
        const slot = String(args.meal_slot || "").toLowerCase();
        let proposalResult = null;
        if (profileId && slot) {
          try {
            const poolResp = await fetch(
              `${supabaseUrl}/rest/v1/meal_plan_slots?profile_id=eq.${profileId}&slot=eq.${slot}&select=name,macros&order=pool_index.asc`,
              { headers: { Authorization: `Bearer ${serviceKey}`, Apikey: serviceKey } }
            );
            const options: { name: string; macros?: { kcal?: number; protein?: number; carbs?: number; fat?: number } }[] = poolResp.ok ? await poolResp.json() : [];
            const oldOption = options.find((o) => o.name.toLowerCase() === String(args.old_item || "").toLowerCase());
            const requestedNew = args.new_item ? options.find((o) => o.name.toLowerCase() === String(args.new_item).toLowerCase()) : undefined;
            const alternatives = options.filter((o) => o.name.toLowerCase() !== String(args.old_item || "").toLowerCase());
            const newOption = requestedNew ?? alternatives[0];

            if (newOption) {
              const oldMacros = oldOption?.macros ?? {};
              const newMacros = newOption.macros ?? {};
              proposalResult = {
                kind: "propose_meal_swap",
                scopeKey: `${profileId}:propose_meal_swap:${slot}`,
                preconditions: { slot, currentItemName: args.old_item },
                payload: { slot, currentName: args.old_item, chooseName: newOption.name },
                diff: {
                  rows: [
                    { field: "Meal", before: args.old_item, after: newOption.name },
                    { field: "Calories", before: `${Math.round(oldMacros.kcal ?? 0)} kcal`, after: `${Math.round(newMacros.kcal ?? 0)} kcal` },
                    { field: "Protein", before: `${Math.round(oldMacros.protein ?? 0)}g`, after: `${Math.round(newMacros.protein ?? 0)}g` },
                  ],
                  implications: [],
                  rationale: typeof args.reason === "string" ? args.reason : undefined,
                  reversible: true,
                },
              };
            }
          } catch (err) {
            console.error("propose_meal_swap: pool lookup failed", err);
          }
        }

        if (!proposalResult) {
          return new Response(
            JSON.stringify({ reply: `I couldn't find another option for your ${args.meal_slot} right now.` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ reply: "", proposal: proposalResult }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "update_workout_schedule") {
        // Trace-report fix: this used to PATCH fitness_profiles.weekly_schedule
        // directly, server-side, on every call — no confirmation gate, and the
        // Exercise tab renders from mesocycle_weeks, which this never touched.
        // Every "Schedule updated" reply was true of a field nothing displays,
        // while silently diverging it from the schedule the user actually
        // sees (confirmed live: a real profile ended up with three different,
        // mutually disagreeing schedules — chat's claim, weekly_schedule, and
        // the mesocycle). Declines honestly until a real propose-then-confirm
        // rebuild through mesocycle-edit.ts lands (Phase B). No DB write, no action.
        return new Response(
          JSON.stringify({
            reply: "I can't safely make plan changes yet — that's coming in an update soon. For now, use the swap (⇄) button on the exercise itself.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_workout_session") {
        const dayOfWeek = args.day || new Date().toLocaleDateString("en-US", { weekday: "long" });
        const logs = args.logs as Array<{ exercise_name: string; sets_completed: number; reps_completed: number; weight_kg?: number; is_bodyweight?: boolean }>;
        const profileId = context.profile_id;

        let dbSuccess = true;
        let dbError = "";
        let insertedSets = 0;
        const loggedSummaries: string[] = [];
        const needsWeight: string[] = [];
        const inferredNotes: string[] = [];

        if (profileId && logs && logs.length > 0) {
          try {
            const todayDate = new Date().toISOString().split("T")[0];
            const rows: UnifiedSetRow[] = [];
            // Two logs[] entries can name the same exercise differently
            // ("Push-Ups" then "Push ups" later in one message) — both slug
            // to the same exercise_id, so set numbering must continue across
            // them rather than each entry restarting at 1 (which is exactly
            // what upsertUnifiedSets's dedupeAndRenumberBatch also guards,
            // but doing it right here keeps the numbers meaningful instead of
            // arbitrarily bumped).
            const setCounterBySlug = new Map<string, number>();

            for (const log of logs) {
              const resolved = await resolveWeight(supabaseUrl, serviceKey, profileId, log.exercise_name, log.weight_kg, log.is_bodyweight);
              if (!resolved) {
                needsWeight.push(log.exercise_name);
                continue;
              }
              const slug = slugifyExerciseName(log.exercise_name);
              let setNumber = setCounterBySlug.get(slug) ?? 0;
              for (let i = 0; i < log.sets_completed; i++) {
                setNumber += 1;
                rows.push({
                  exercise_name: log.exercise_name,
                  set_number: setNumber,
                  weight_kg: resolved.weightKg,
                  reps_completed: log.reps_completed,
                  is_bodyweight: resolved.isBodyweight,
                });
              }
              setCounterBySlug.set(slug, setNumber);
              if (resolved.inferredFrom) {
                inferredNotes.push(`${log.exercise_name} (used your ${resolved.inferredFrom === "history" ? "last logged" : "plan's suggested"} ${resolved.weightKg}kg — say the actual weight if that's off)`);
              }
              loggedSummaries.push(`**${log.exercise_name}**: ${log.sets_completed}x${log.reps_completed} @ ${resolved.weightKg}kg`);
            }

            if (rows.length > 0) {
              const sessionId = await ensureWorkoutSession(supabaseUrl, serviceKey, profileId, todayDate, dayOfWeek);
              await upsertUnifiedSets(supabaseUrl, serviceKey, profileId, sessionId, dayOfWeek, rows);
              insertedSets = rows.length;
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
        if (!dbSuccess) {
          confirmText = `I tried to log your workout but the save failed${dbError ? `: ${dbError}` : ""}. Your performance data was not recorded — please try again or log it manually.`;
        } else {
          const parts: string[] = [];
          if (insertedSets > 0) {
            parts.push(`Logged your workout for ${dayOfWeek}:\n- ${loggedSummaries.join("\n- ")}\n\n${insertedSets} sets saved — I'll track your progression.`);
          }
          if (inferredNotes.length > 0) {
            parts.push(`Weight wasn't stated for: ${inferredNotes.join(", ")}.`);
          }
          if (needsWeight.length > 0) {
            parts.push(`I couldn't log ${needsWeight.join(", ")} — no weight stated and no history or plan suggestion to fall back on. What weight did you use?`);
          }
          confirmText = parts.length > 0 ? parts.join("\n\n") : (textPart?.text || "Got it — no sets to log there.");
        }

        return new Response(
          JSON.stringify({ reply: confirmText, action: actionPayload }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_weight") {
        // Server-side write is fine here (single table, (profile_id, date)
        // unique upsert, no offline-sync complexity — same reasoning as
        // cardio logs). The client refreshes targets when the action
        // arrives, so a chat weigh-in updates the Nutrition tab's numbers
        // exactly like the tab's own capture field does.
        const profileId = context.profile_id;
        const weightKg = Number(args.weight_kg);
        if (!profileId || !Number.isFinite(weightKg) || weightKg < 25 || weightKg > 350) {
          return new Response(
            JSON.stringify({ reply: "That weight doesn't look right — could you give it to me in kilograms (e.g. 86.4)?" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let dbSuccess = true;
        try {
          const todayDate = new Date().toISOString().split("T")[0];
          const resp = await fetch(
            `${supabaseUrl}/rest/v1/daily_metrics?on_conflict=profile_id,date`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceKey}`,
                Apikey: serviceKey,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates,return=minimal",
              },
              body: JSON.stringify({
                profile_id: profileId,
                date: todayDate,
                weight_kg: weightKg,
                updated_at: new Date().toISOString(),
              }),
            }
          );
          if (!resp.ok) {
            console.error(`daily_metrics upsert failed: ${resp.status}`, await resp.text());
            dbSuccess = false;
          }
        } catch (err) {
          console.error("log_weight error:", err);
          dbSuccess = false;
        }

        const confirmText = dbSuccess
          ? (textPart?.text || `Logged **${weightKg} kg** for today. Your targets recalculate from your latest weigh-in.`)
          : "I couldn't save that weigh-in — please try again in a moment.";

        return new Response(
          JSON.stringify({ reply: confirmText, action: dbSuccess ? { type: "log_weight", weight_kg: weightKg } : undefined }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_meal") {
        // M0 retirement: this used to insert into `daily_food_logs`, a table
        // that exists in NO migration and not on the live database — every
        // log attempt since the tool shipped has failed. Rather than keep a
        // write path into a void, the tool still says plainly that meal
        // logging isn't live yet (M2 wires this to the real meal_events
        // ledger through the shared meal-store layer). What changed here
        // (chat-realism round): the macro NUMBERS are no longer the model's
        // own guess (estimated_calories/protein/carbs/fat, deleted from this
        // tool's schema) — they're computed from the ingredients the model
        // parsed, via the same verified food-db pipeline M1's meal
        // generation uses, never the model's arithmetic.
        const rawIngredients = Array.isArray(args.ingredients) ? args.ingredients : [];
        const ingredients: MealIngredientLine[] = rawIngredients
          .filter((i: unknown): i is { name: string; quantity: number; unit: string } =>
            !!i && typeof (i as any).name === "string" &&
            Number.isFinite(Number((i as any).quantity)) &&
            typeof (i as any).unit === "string"
          )
          .map((i) => ({ name: i.name, quantity: Number(i.quantity), unit: i.unit }));

        if (ingredients.length === 0) {
          return new Response(
            JSON.stringify({
              reply: `I couldn't quite tell what you ate — could you list it out with quantities (e.g. "160g greek yoghurt, 30g whey protein, 70g raspberries")?`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const computed = computeMealMacros(ingredients);
        const assumptions: string[] = Array.isArray(args.assumptions)
          ? args.assumptions.filter((a: unknown): a is string => typeof a === "string" && a.trim().length > 0)
          : [];

        // No unresolved lines: report the real total. Some unresolved: report
        // a PARTIAL total (from what resolved) plus a plain caveat — never a
        // guessed number for the ingredients the food database doesn't know.
        const macroLine = computed.unmatched.length > 0
          ? `roughly ${computed.kcal} kcal (P: ${computed.protein}g, C: ${computed.carbs}g, F: ${computed.fat}g) from what I could identify — that's ${Math.round(computed.coverage * 100)}% of the meal by weight`
          : `${computed.kcal} kcal (P: ${computed.protein}g, C: ${computed.carbs}g, F: ${computed.fat}g)`;

        const parts: string[] = [
          `Meal logging arrives in the next update — I can't record **${args.food_name}** yet. ` +
          `For now, keep an eye on your ${args.meal_slot} against its budget: this is ${macroLine}.`,
        ];
        if (computed.unmatched.length > 0) {
          parts.push(`I couldn't find these in my food database, so they're not counted above: ${computed.unmatched.join(", ")}.`);
        }
        if (assumptions.length > 0) {
          parts.push(`Assumptions: ${assumptions.join("; ")}.`);
        }

        return new Response(
          JSON.stringify({ reply: parts.join(" ") }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_workout") {
        // I1/§3.1 hard line: the server does NOT parse anything here — it
        // forwards the model's raw text spans untouched. src/lib/set-parse.ts
        // (client-side) is the only place a number becomes a number. `reply`
        // is empty on purpose: D1 means the client renders its own copy
        // (the parsed receipt or a clarification card), never this turn's
        // model prose, once it decides RECEIPT vs CLARIFICATION locally.
        return new Response(
          JSON.stringify({
            reply: "",
            logWorkout: { date: args.date || null, entries: Array.isArray(args.entries) ? args.entries : [] },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "log_workout_set") {
        const profileId = context.profile_id;
        let dbSuccess = true;
        let dbError = "";
        let resolved: ResolvedWeight | null = null;

        if (profileId) {
          try {
            resolved = await resolveWeight(supabaseUrl, serviceKey, profileId, args.exercise_name, args.weight_kg, args.is_bodyweight);
            if (resolved) {
              const todayDate = new Date().toISOString().split("T")[0];
              const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
              const sessionId = await ensureWorkoutSession(supabaseUrl, serviceKey, profileId, todayDate, dayOfWeek);
              await upsertUnifiedSets(supabaseUrl, serviceKey, profileId, sessionId, dayOfWeek, [{
                exercise_name: args.exercise_name,
                set_number: args.set_number,
                weight_kg: resolved.weightKg,
                reps_completed: args.reps,
                rpe: args.rpe ?? null,
                is_bodyweight: resolved.isBodyweight,
              }]);
            }
          } catch (err) {
            dbSuccess = false;
            dbError = `Database error: ${err instanceof Error ? err.message : "unknown"}`;
            console.error("log_workout_set DB error:", err);
          }
        }

        let confirmText: string;
        if (!dbSuccess) {
          confirmText = `I tried to log your set but the save failed${dbError ? `: ${dbError}` : ""}. Please try again.`;
        } else if (!resolved) {
          confirmText = `I couldn't log that set for **${args.exercise_name}** — no weight stated and no history or plan suggestion to fall back on. What weight did you use?`;
        } else {
          const inferredNote = resolved.inferredFrom
            ? ` (used your ${resolved.inferredFrom === "history" ? "last logged" : "plan's suggested"} weight — say the actual weight if that's off)`
            : "";
          confirmText = textPart?.text || `Logged set ${args.set_number} of **${args.exercise_name}**: ${args.reps} reps @ ${resolved.weightKg}kg${args.rpe ? ` (RPE ${args.rpe})` : ""}.${inferredNote}`;
        }

        return new Response(
          JSON.stringify({
            reply: confirmText,
            action: dbSuccess && resolved ? { type: "log_workout_set", ...args, weight_kg: resolved.weightKg } : undefined,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "adjust_volume") {
        // Trace-report fix: this only ever mutated the client's flat
        // exercisePlan/exercise_plans fallback state, never mesocycle_weeks —
        // dead for any user with an active mesocycle (i.e. everyone
        // post-C0). Declines honestly instead of claiming a change that
        // never reached the Exercise tab.
        return new Response(
          JSON.stringify({
            reply: "I can't safely make plan changes yet — that's coming in an update soon. For now, use the swap (⇄) button on the exercise itself.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "ban_exercise") {
        // VISION-ARCHITECTURE.md §7.2 phase A0/§2.1: ban_exercise touches
        // every week of every block and can drop a slot entirely when no
        // substitute exists — the highest-blast-radius mutation in the
        // app. It used to fall through to the generic catch-all below with
        // no real server-side handling at all (whatever the model sent
        // just got echoed back as an action). Explicit decline now, same
        // as adjust_volume/update_workout_schedule — this is a one-line
        // safety fix, not a re-enable; §2.1 demotes ban to PROPOSING and
        // it stays disabled via chat this round (Part 3 only re-enables
        // exercise swap and meal swap).
        return new Response(
          JSON.stringify({
            reply: "I can't ban exercises through chat yet — that's coming in an update soon. For now, use the ban button on the exercise itself.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (name === "propose_exercise_swap") {
        // VISION-ARCHITECTURE.md §2/Part 3 — replaces the old
        // replace_exercise tool entirely (both its permanent-decline
        // branch and its session-only immediate-write branch). I1: no
        // write happens here, not even for the "safe" session-only case
        // that used to fall through to the generic action-return below.
        // D2: the tool call must be triggered by an imperative quote, not
        // a question or a statement the model merely inferred a swap from.
        const classification = classifyImperative(args.origin_verbatim_quote || "", message);
        if (!classification.imperative) {
          return new Response(
            JSON.stringify({
              reply: "",
              offer: { text: `Want me to swap **${args.old_item}** for **${args.new_item}**?` },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // No server-side diff building (I1 + the client-only load-recompute
        // reasoning documented in ChatAssistant.tsx's buildExerciseSwapProposal)
        // — just the validated raw args for the client to resolve against
        // the live plan.
        return new Response(
          JSON.stringify({
            reply: "",
            proposal: {
              kind: "propose_exercise_swap",
              rawArgs: { day: args.day, old_item: args.old_item, new_item: args.new_item, scope: args.scope, reason: args.reason },
            },
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
  if (name === "ban_exercise") {
    return `Got it — I've permanently removed **${args.exercise_name}** from your plan. It will never appear in future workout cycles. ${args.reason ? `Reason noted: ${args.reason}` : ""}`;
  }
  return "Your plan has been updated.";
}
