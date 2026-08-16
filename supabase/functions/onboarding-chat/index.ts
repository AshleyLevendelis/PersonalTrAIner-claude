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

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
type GeminiPart = { text?: string; functionCall?: GeminiFunctionCall };

const textOf = (parts: GeminiPart[]) =>
  parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("").trim();
const callsOf = (parts: GeminiPart[]) =>
  parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

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
      // The trailing text is the app's own label for this answer — included
      // so the model knows what the slot MEANS, explicitly not as a script.
      return `- ${s.key} (${s.control}${s.required ? ", required" : ""}):${vals}${bounds} — means: "${s.question}"`;
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

    const systemPrompt = `You are this person's coach, meeting them for the first time. Warm, direct, genuinely curious — getting to know a new client over text, not a form with a personality bolted on. They might be a decade-long lifter or someone who has never exercised in their life — don't assume either, find out. TEXT-MESSAGE LENGTH. Two to four sentences per turn, total. One paragraph, never two. Never headers, never bullet lists. If your turn has a blank line in it, it is too long — cut it down before you send it.

=== TALK LIKE A PERSON, NOT A FORM ===
This is the thing that most often goes wrong, so it comes first. A real coach does not read questions off a list. They react to what you just told them, and the next question comes out of it.

- REACT BEFORE YOU ASK. Every turn, say something about the answer they just gave before moving on — a reaction, a consequence, a small piece of what it means for their plan. "Three days is plenty to work with." "Marmite, noted — I'll keep that well away from you." One clause is enough. A turn that goes straight from their answer to your next question is the form-feel we're avoiding.
- NEVER READ THE CATALOG'S WORDING BACK AT THEM. The quoted text on each slot below is the app's internal label for its own summary screen. It is NOT your script. Asking "How active is your day-to-day, outside training?" is a form field; "and outside the gym — are you on your feet much, or mostly desk?" is a coach. Always rephrase, in your own words, in the context of what they've already said.
- GROUP WHAT BELONGS TOGETHER. Age, height and weight is ONE natural ask, not three turns. So is "which days, and how long have you got on those days". Two closely-related things in one breath is conversational; a scattergun of four unrelated ones is an interrogation. Use judgement — if you'd ask them together out loud, ask them together here.
- VARY THE SHAPE. Don't open every turn the same way. Don't acknowledge every answer with the same word. Sometimes the thing to say is an observation, not a question at all — then the question follows in the same turn.
- NO STOCK CLOSERS. End on the question itself. Never append a tail like "Let me know", "Let's find one that fits your routine", "Let's make sure it fits your space", "so I can tailor it" — a real person doesn't explain why they asked, they just ask. If a sentence starts with "Let's" and adds nothing the question didn't already say, delete it.
- DON'T NAG. If you asked something and they answered something else instead, take what they gave you and move on — you can come back to the missed one later. Asking the same question two turns running reads as not listening.
- FOLLOW WHAT THEY GIVE YOU. If they mention something interesting in passing — an old sport, a job, a bad experience, a reason they stopped — pick it up. Ask about it. That is worth more than getting to the next slot quickly, and it's usually where record_context_fact material comes from.

=== YOUR JOB ===
Get to know them well enough to build their first training and nutrition plan. Every answer you need is a SLOT in the catalog below.

SLOT CATALOG — the answers you need, and the exact values the app accepts. These are DATA, not a running order and not a script:
${describeCatalog(catalog)}

ALREADY ANSWERED (never re-ask these — and refer back to them; that's what makes it feel like they're being listened to):
${filledLines || "- nothing yet"}

STILL UNKNOWN — ${remaining.join(", ") || "none — wrap up"}
This is a checklist for YOU, never a route to march. Pick whatever comes next naturally from what they just said, not whatever is first in that list. When what you already know makes a question matter, say WHY in a short clause ("since you've only got three days, session length decides a lot — how long can you usually stay?"). The only ordering rule: don't leave required things until they're bored.

=== SLOT MECHANICS ===
- Closed-set question → ask it in your own words AND call present_slot so the chips render. The user can tap or type.
- They answered in free text and the mapping is CERTAIN ("just some dumbbells at home" → equipment=home_gym... careful: home_gym means barbell+dumbbells+bench; dumbbells only is minimalist) → call set_slot with the exact allowed value. The app shows them what was recorded — never map silently in your head and move on without the call.
- Mapping unclear or between two values → do NOT set_slot. Say what you're unsure about in one clause and call present_slot — them tapping beats you guessing. Never store their raw words for a closed slot.
- Multi-select slots (trainingDays, injuries, dietaryPreferences, favoriteCuisines): set_slot with a comma-separated list of allowed values, or present_slot for tapping. An explicit "none" is a real answer (set_slot with an empty value) — record it, don't just move on.
- ONE ANSWER PER set_slot, AND ONE PER THING THEY TOLD YOU. If they hand you four values in one breath ("41, female, 170cm, 87kg"), that is FOUR separate set_slot calls in that turn — age, gender, heightCm, weightKg. Dropping three of them means asking again for something they already told you, which is the single most annoying thing you can do. Sweep their message for every slot it answers before you reply.
- One present_slot per turn at most — only one set of chips can render. So when you group two asks in a turn, at most ONE of them gets chips; ask the other in plain text and map their answer with set_slot. Numeric asks (age/height/weight) have no chips at all, which is exactly why they group so easily.
- EVERY turn must contain conversational reply text — never a bare tool call with nothing said. After recording an answer, react to it in a few words and carry on in the SAME turn (the app renders a dead silence otherwise).
- The app shows the user a small confirmation line for anything you map from their free text, so they can catch a wrong mapping. Don't also repeat the value back in your own words — reacting to what they said is not the same as reading it back to them.

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
When STILL UNKNOWN is empty, give a one-line warm recap of the shape of what you'll build and call complete_onboarding. The app shows them the full review and the generate button — you don't generate anything yourself. If they want to change an earlier answer at any point, just set_slot the new value.`;

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

    const callGemini = async (turns: unknown[], withTools = true, toolConfig?: unknown) =>
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: turns,
            ...(withTools ? { tools: [{ functionDeclarations: toolDeclarations }] } : {}),
            ...(toolConfig ? { toolConfig } : {}),
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

    const upstreamFailure = (status: number, body: string) => {
      console.error("Gemini API error:", status, body);
      return new Response(
        JSON.stringify({
          error: `Gemini API returned ${status}`,
          error_type: "ai_upstream",
          user_message: message,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    const response = await callGemini(contents);
    if (!response.ok) return upstreamFailure(response.status, await response.text());

    const data = await response.json();
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];

    // Unlike chat-gemini's per-tool dispatch, every functionCall here is a
    // pure instruction for the client (which owns validation and all writes)
    // — so the whole set passes through in order, alongside any text.
    let reply = textOf(parts);
    const actions = callsOf(parts).map((c) => ({ name: c.name, args: c.args ?? {} }));

    // ---------------------------------------------------------------------
    // Second leg of the function-calling loop. Gemini answers a tool-using
    // turn with functionCall parts and NOTHING ELSE — measured, not assumed:
    // across a full 15-turn scripted onboarding, EVERY turn came back with
    // zero text. The coach's voice never reached the screen at all; what the
    // user read was the client's dead-air fallback printing each slot's
    // canonical question, which is exactly why the flow read like a form
    // being filled in rather than a conversation.
    //
    // The protocol's own answer is to feed the calls' results back and let
    // the model produce its natural-language turn. The calls are pure client
    // instructions here (this function owns no state), so every response is
    // simply "recorded" — the point of the round trip is the prose, not the
    // payload. Any further calls it makes on this leg are merged in.
    // ---------------------------------------------------------------------
    if (!reply && actions.length > 0) {
      const resolvedTurns = [
        ...contents,
        { role: "model", parts: callsOf(parts).map((functionCall) => ({ functionCall })) },
        {
          role: "user",
          parts: callsOf(parts).map((c) => ({
            functionResponse: { name: c.name, response: { status: "recorded" } },
          })),
        },
        {
          role: "user",
          parts: [{
            text:
              "(System: those are recorded and the app has already shown the user a confirmation for each. Now write your actual turn to them — react to what they just told you, then carry on. Two to four sentences, one paragraph, no lists, no \"let me know\" ending, and do not repeat the recorded values back at them. If your turn asks a closed-set question, call present_slot for it in this same turn so the chips render.)",
          }],
        },
      ];

      const followUp = await callGemini(resolvedTurns);
      if (followUp.ok) {
        const followData = await followUp.json();
        const followParts: GeminiPart[] = followData?.candidates?.[0]?.content?.parts ?? [];
        reply = textOf(followParts);
        for (const c of callsOf(followParts)) {
          // Drop what the first leg already asked for. A repeated present_slot
          // is the damaging one — it renders a second copy of the same
          // question — so identical (tool, slot) pairs never merge twice.
          const dup = actions.some(
            (a) => a.name === c.name && a.args?.slot_key === (c.args ?? {}).slot_key,
          );
          if (!dup) actions.push({ name: c.name, args: c.args ?? {} });
        }
      } else {
        console.error("onboarding-chat: follow-up leg failed", followUp.status, await followUp.text());
      }

      // Given tools, the model can answer with tool calls again and still say
      // nothing — measured at roughly a third of turns. Taking the tools away
      // removes the option: there is nothing left to emit but prose. Only the
      // voice is at stake by this point; every call it wanted has already been
      // collected from the legs above.
      if (!reply) {
        const forcedText = await callGemini(resolvedTurns, false);
        if (forcedText.ok) {
          const forcedData = await forcedText.json();
          reply = textOf(forcedData?.candidates?.[0]?.content?.parts ?? []);
        } else {
          // Non-fatal: the client's dead-air guard still asks the next
          // question, so a failed leg costs voice, not the flow.
          console.error("onboarding-chat: text-only leg failed", forcedText.status, await forcedText.text());
        }
      }
    }

    // -----------------------------------------------------------------------
    // Chips must not depend on the model remembering to ask for them.
    // present_slot fires on most turns but not all, and a missed one leaves a
    // closed-set question with nothing to tap — the user has to guess the
    // wording of an answer the app will only accept from a fixed list.
    //
    // So when a turn asks something and no chips were requested, ask one
    // narrow question with function calling FORCED: which slot is this about?
    // The answer is checked against what's actually still unanswered, and
    // dropped if it isn't one of them — that's what makes a free-text or
    // numeric question (age, weight, "what went wrong last time") correctly
    // produce no chips rather than the wrong ones.
    // -----------------------------------------------------------------------
    if (reply.includes("?") && !actions.some((a) => a.name === "present_slot") && remaining.length > 0) {
      const identify = await callGemini(
        [
          { role: "user", parts: [{ text: `The coach just said this to the user:

"${reply}"

Still unanswered: ${remaining.join(", ")}. If that message is asking the user one of those questions AND it has a fixed set of answers to choose from, call present_slot with its key. If it is asking for something free-form or a plain number, call present_slot with slot_key "none".` }] },
        ],
        true,
        { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["present_slot"] } },
      );
      if (identify.ok) {
        const identifyData = await identify.json();
        const key = callsOf(identifyData?.candidates?.[0]?.content?.parts ?? [])[0]?.args?.slot_key;
        const named = catalog.find((c) => c.key === key);
        // Only a still-unanswered slot that genuinely renders chips.
        if (typeof key === "string" && remaining.includes(key) && named &&
            (named.control === "single" || named.control === "multi")) {
          actions.push({ name: "present_slot", args: { slot_key: key } });
        }
      } else {
        console.error("onboarding-chat: chip-recovery leg failed", identify.status, await identify.text());
      }
    }

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
