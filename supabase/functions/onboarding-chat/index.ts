import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GEMINI_MODEL } from "../_shared/gemini.ts";
import {
  OFF_TOPIC_RULES,
  APP_REALITY,
  SCOPE_SAFETY_RULES,
  ALLERGEN_HONESTY_BLOCK,
} from "../_shared/coach-rules.ts";

// ---------------------------------------------------------------------------
// Conversational onboarding — a separate, purpose-built sibling of
// chat-gemini (same deploy convention: `npx supabase functions deploy
// onboarding-chat`), NOT a mode of it: the shipped chat prompt is large,
// incident-tuned, and enforces a texting register this flow's structured
// turns would fight. Behavioral rules that must not fork (off-topic decline,
// app reality, medical scope, allergen honesty) are imported from
// _shared/coach-rules.ts, kept verbatim-synced to chat-gemini's inline
// copies by scripts/test-coach-rules-sync.ts.
//
// Contract (mirrors the established "server describes, client executes"
// shape — this function holds no DB writes at all):
//   Request:  { message, history, state }
//     state = {
//       slotCatalog:   the client-serialized slot vocabulary (single source
//                      of truth stays src/lib/onboarding-slots.ts — this
//                      function never grows its own copy of the closed sets),
//       filled:        { key: displayValue } for every answered slot,
//       remaining:     keys still unanswered (required first),
//     }
//   Response: { reply, actions: [{ name, args }...] }
//     Every functionCall part is passed through verbatim; the CLIENT
//     validates set_slot values against the slot definition before anything
//     is recorded (fail loud, never store silently) and renders chips for
//     present_slot.
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const toolDeclarations = [
  {
    name: "present_slot",
    description:
      "Render the tappable option chips for one onboarding question, under your message. Call this whenever you ask a closed-set question (goal, experience, days, equipment, injuries, diet, etc.) so the user can tap instead of type. Ask the question in your reply text in your own words; the chips carry the exact values.",
    parameters: {
      type: "object",
      properties: {
        slot_key: {
          type: "string",
          description: "One of the slot keys from the SLOT CATALOG in your instructions.",
        },
      },
      required: ["slot_key"],
    },
  },
  {
    name: "set_slot",
    description:
      "Record a value the user just gave in free text, mapped to the slot's allowed values. ONLY call this when the mapping is certain — the value MUST be exactly one of the slot's allowed values (or, for multi-select slots, an array of them; for text/numeric slots, the literal text or number). If you are not certain how their words map, do NOT call this — call present_slot and let them tap. The app re-validates every value and will re-ask on anything invalid.",
    parameters: {
      type: "object",
      properties: {
        slot_key: { type: "string" },
        value: {
          type: "string",
          description:
            "The mapped value. For multi-select slots, a comma-separated list of allowed values. For numeric slots, the number. For displayName/dislikedFoods, the literal text.",
        },
      },
      required: ["slot_key", "value"],
    },
  },
  {
    name: "record_context_fact",
    description:
      "Save a piece of life-context, history, or motivation the user volunteered that should shape how their coach talks to them long after onboarding — e.g. 'tried 5-day splits three times, always collapsed by week 3', 'Fridays are chaotic with the kids', 'training for a wedding in June'. Not for slot answers — those go through set_slot.",
    parameters: {
      type: "object",
      properties: {
        display_text: {
          type: "string",
          description: "Short third-person summary, e.g. 'burned out on 5-day splits before — keep frequency realistic'.",
        },
        raw_phrase: { type: "string", description: "What they actually said, trimmed." },
      },
      required: ["display_text", "raw_phrase"],
    },
  },
  {
    name: "record_goal",
    description:
      "Save a concrete stated target (a goal weight, or a directional aim) AFTER the user has confirmed any inference you made from it. Body-weight targets in kg only.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["body_weight_kg", "directional"] },
        baseline_value: { type: "number", description: "Current value if they stated one (kg for body_weight_kg)." },
        target_value: { type: "number", description: "Target value if measurable." },
        display_text: { type: "string", description: "e.g. 'get from 86kg to 80kg'." },
        raw_phrase: { type: "string" },
      },
      required: ["metric", "display_text", "raw_phrase"],
    },
  },
  {
    name: "complete_onboarding",
    description:
      "Call ONLY when the app's state shows zero remaining required slots and every ask-anyway slot has been asked. Give a one-line warm recap in your reply text; the app then shows the review + generate button. Never call this early — the app will refuse and tell the user what's missing.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

interface SlotCatalogEntry {
  key: string;
  question: string;
  control: string;
  required: boolean;
  values?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

function describeCatalog(catalog: SlotCatalogEntry[]): string {
  return catalog
    .map((s) => {
      const vals = s.values ? ` values: [${s.values.map((v) => v.value).join(", ")}]` : "";
      const bounds = s.min != null ? ` bounds: ${s.min}-${s.max}` : "";
      return `- ${s.key} (${s.control}${s.required ? ", required" : ""}):${vals}${bounds} — "${s.question}"`;
    })
    .join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { message, history, state } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiKey = Deno.env.get("GEMINI_KEY") || Deno.env.get("VITE_GEMINI_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Gemini API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const catalog: SlotCatalogEntry[] = Array.isArray(state?.slotCatalog) ? state.slotCatalog : [];
    const filled: Record<string, string> = state?.filled ?? {};
    const remaining: string[] = Array.isArray(state?.remaining) ? state.remaining : [];

    const filledLines = Object.entries(filled)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const systemPrompt = `You are this person's coach, meeting them for the first time. Warm, direct, genuinely curious — getting to know a new client over text, not a form with a personality bolted on. They might be a decade-long lifter or someone who has never exercised in their life — don't assume either, find out. Short turns: one to three sentences, then one question. Never headers, never bullet lists, never two questions at once.

=== YOUR JOB ===
Get to know them well enough to build their first training and nutrition plan. Every answer you need is a SLOT in the catalog below. Work through them conversationally — group what naturally goes together (age/height/weight is one exchange, not three), follow the thread of what they say, and when what you already know makes the next question matter, say WHY in a short clause ("since you've only got three days, session length decides a lot — how long can you usually stay?").

SLOT CATALOG (the app renders chips and validates everything — these exact keys and values):
${describeCatalog(catalog)}

ALREADY ANSWERED (never re-ask these):
${filledLines || "- nothing yet"}

STILL NEEDED (required ones first): ${remaining.join(", ") || "none — wrap up"}

=== SLOT MECHANICS ===
- Closed-set question → ask it in your own words AND call present_slot so the chips render. The user can tap or type.
- They answered in free text and the mapping is CERTAIN ("just some dumbbells at home" → equipment=home_gym... careful: home_gym means barbell+dumbbells+bench; dumbbells only is minimalist) → call set_slot with the exact allowed value. The app shows them what was recorded — never map silently in your head and move on without the call.
- Mapping unclear or between two values → do NOT set_slot. Say what you're unsure about in one clause and call present_slot — them tapping beats you guessing. Never store their raw words for a closed slot.
- Multi-select slots (trainingDays, injuries, dietaryPreferences, favoriteCuisines): set_slot with a comma-separated list of allowed values, or present_slot for tapping. An explicit "none" is a real answer (set_slot with an empty value) — record it, don't just move on.
- One present_slot per turn at most.
- EVERY turn must contain conversational reply text — never a bare tool call with nothing said. After recording an answer, acknowledge in a few words and ask the next question in the SAME turn (the app renders a dead silence otherwise).

=== THE RICHER QUESTIONS (why this is a conversation and not the form) ===
- Early on, ask what they've tried before and what made it fall apart. Someone who's failed on 5-day splits three times shouldn't be handed a fourth — let it steer your trainingDays/sessionDuration recommendation out loud, and record_context_fact so their coach remembers the story later.
- Ask about their ACTUAL week, not an abstract availability: which days really work, which are unreliable. Unreliable days just don't get selected — and the reason is worth a record_context_fact.
- Injuries, soft launch: ask what bothers them or what they avoid — people don't call a clicking shoulder an "injury." Map body parts to the injuries slot values (a knee thing → knees). If it maps to none of the eight areas, record_context_fact so it isn't lost, and say plainly the plan can't automatically work around that one.
- PAIN IS NEVER DEFERRED: if they mention pain that isn't ordinary soreness, or anything in the scope rules below, respond to it NOW per those rules — mid-onboarding makes no difference.
- Goal inference: if they give you numbers ("I'm about 15% body fat, want to get to 12"), infer the goal from the gap — but CONFIRM it in one line before calling set_slot for fitnessGoal ("that gap says fat loss to me — sound right?"). Never write an inferred goal unconfirmed. If they state a concrete target weight, record_goal AFTER they confirm. Extreme or implausible numbers: follow the named-extreme-numbers rule in the scope section — one warm question about what's driving it BEFORE anything else, and no goal gets written that turn.
- Mixed equipment access ("full gym some days, just dumbbells at home"): the plan runs on ONE equipment tier for now — say so plainly in one clause, recommend the tier that fits most of their week, confirm it, and record_context_fact with the real situation so their coach knows.

=== OFF-TOPIC DURING ONBOARDING ===
${OFF_TOPIC_RULES}
Onboarding adjustment for FACTUAL questions only: prefer deferring with a reason — "good one — let me get to know you first and I'll answer that properly once we're set up" — over answering in full. Defer at most TWICE in the whole conversation (count your own earlier deferrals in the history); after two, stop deferring — answer briefly per the rule above and return to the next question, so it doesn't feel like being handled. NEVER defer anything covered by the scope rules or allergen rules below — those are answered or redirected immediately, every time.

=== APP REALITY (if they ask what the app does) ===
${APP_REALITY}

=== SCOPE — WHEN TO REDIRECT (never deferred, never softened) ===
${SCOPE_SAFETY_RULES}

${ALLERGEN_HONESTY_BLOCK}

=== FINISHING ===
When STILL NEEDED is empty, give a one-line warm recap of the shape of what you'll build and call complete_onboarding. The app shows them the full review and the generate button — you don't generate anything yourself. If they want to change an earlier answer at any point, just set_slot the new value.`;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-24)) {
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
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ functionDeclarations: toolDeclarations }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            // Same preventive setting as chat-gemini/generate-meals:
            // gemini-3.5-flash's default "thinking" eats maxOutputTokens and
            // corrupts structured output (function-call args included).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
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
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> =
      data?.candidates?.[0]?.content?.parts ?? [];

    // Unlike chat-gemini's per-tool dispatch, every functionCall here is a
    // pure instruction for the client (which owns validation and all writes)
    // — so the whole set passes through in order, alongside any text.
    const reply = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    const actions = parts
      .filter((p) => p.functionCall)
      .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));

    return new Response(JSON.stringify({ reply, actions }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("onboarding-chat error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
