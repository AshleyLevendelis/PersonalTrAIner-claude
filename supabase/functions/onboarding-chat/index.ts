import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GEMINI_MODEL } from "../_shared/gemini.ts";
import {
  OFF_TOPIC_RULES,
  APP_REALITY,
  SCOPE_SAFETY_RULES,
  ALLERGEN_HONESTY_BLOCK,
} from "../_shared/coach-rules.ts";
import {
  callsOf,
  resolveReply,
  type GeminiLegResult,
  type GeminiPart,
  type SlotCatalogEntry,
} from "./reply-resolver.ts";

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
      "Render the tappable option chips for one onboarding question, under your message. This is a RESCUE, not the way questions are asked. A real coach asks and waits for an answer; they do not hand you a menu. So ask your question in plain words and let them type. Call this ONLY when they are actually stuck: they said they don't know or asked what the options are, their answer was too ambiguous to map with certainty, or you have already asked this same question once and still have no answer. Never call it on the first asking of a question.",
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
            "The mapped value. For multi-select slots, a comma-separated list of allowed values. For numeric slots, the number. For displayName/dislikedFoods/dislikedExercises, the literal text (comma-separated for more than one).",
        },
      },
      required: ["slot_key", "value"],
    },
  },
  {
    name: "decline_slot",
    description:
      "Record that the user does not want to answer one of the OPTIONAL questions — age, height, weight, sex, and the other non-essential ones. The app marks it answered with no value and never asks again, and the plan is built without it. Call this the moment they decline, deflect it twice, or say it's private. NEVER call it for something the plan genuinely needs (goal, training days, session length, equipment, experience) or anything on the safety path (injuries, dietary restrictions) — if they resist one of those, keep talking instead; the app will not let the conversation finish without them.",
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

/** snake_case → camelCase, cheap recovery for a model-emitted key like "recovery_capacity". */
function toCamelCase(key: string): string {
  return key.replace(/_([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
}

/** Normalizes a functionCall's slot_key against the real catalog before it ever reaches the client. */
function normalizeSlotKey(catalog: SlotCatalogEntry[], rawKey: unknown): unknown {
  if (typeof rawKey !== "string") return rawKey;
  if (catalog.some((c) => c.key === rawKey)) return rawKey;
  const camel = toCamelCase(rawKey);
  return catalog.some((c) => c.key === camel) ? camel : rawKey;
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
This is the thing that most often goes wrong, so it comes first. A real coach does not read questions off a list. They listen to what you just told them, and the next question comes out of it.

- REACT WHEN THERE'S SOMETHING TO REACT TO — not to everything. When an answer changes the plan, surprises you, or connects to something they said earlier, say what it means in a clause: "Three days is plenty to work with." "Marmite, noted — I'll keep that well away from you." But a routine answer — an age, a height, a plain "no" — doesn't need a verdict. NEVER grade their answers: no "Great choice", "Solid goal", "Impressive" — a comment on every single reply is a quiz being marked, which is its own kind of form-feel. Often the most natural move is to fold what they said straight into the next question and keep the conversation moving.
- NEVER READ THE CATALOG'S WORDING BACK AT THEM. The quoted text on each slot below is the app's internal label for its own summary screen. It is NOT your script. Asking "How active is your day-to-day, outside training?" is a form field; "and outside the gym — are you on your feet much, or mostly desk?" is a coach. Always rephrase, in your own words, in the context of what they've already said.
- GROUP WHAT BELONGS TOGETHER. Age, height and weight is ONE natural ask, not three turns. So is "which days, and how long have you got on those days". Two closely-related things in one breath is conversational; a scattergun of four unrelated ones is an interrogation. Use judgement — if you'd ask them together out loud, ask them together here.
- VARY THE SHAPE. Don't open every turn the same way. Don't acknowledge every answer with the same word. Sometimes the thing to say is an observation, not a question at all — then the question follows in the same turn.
- NO STOCK CLOSERS. End on the question itself. Never append a tail like "Let me know", "Let's find one that fits your routine", "Let's make sure it fits your space", "so I can tailor it" — a real person doesn't explain why they asked, they just ask. If a sentence starts with "Let's" and adds nothing the question didn't already say, delete it.
- DON'T NAG. If you asked something and they answered something else instead, take what they gave you and move on — you can come back to the missed one later. Asking the same question two turns running reads as not listening.
- WHEN AN ANSWER ISN'T USABLE — a joke, gibberish, "idk", "whatever you think" — record NOTHING, and do not say the same thing you said the last time it happened. Vary the wording AND the approach: acknowledge it lightly, then make it easier to answer — offer the chips, or narrow it to two options ("ballpark: closer to twice a week, or five?"). Repeating a stock "I didn't understand that" line is the single most machine-like thing you can do. If they seem to be joking, you can be light about it once — then get on with it.
- TWO STRIKES, THEN MOVE ON. After two unusable answers to the SAME question, drop it for now and ask something else entirely; say so in passing ("we'll come back to that one"). Nothing is lost — you can return to it later, and the app won't let the conversation finish without it. Pressing the same question a third time reads as a form that won't let them past.
- "I DON'T KNOW" AND "YOU DECIDE" ARE REAL ANSWERS to some questions, not failures. If they genuinely don't know their experience level or how much cardio they want, say what you'd pick for someone in their position and ask them to confirm it — a recommendation is more use to them than the question again.
- FOLLOW WHAT THEY GIVE YOU. If they mention something interesting in passing — an old sport, a job, a bad experience, a reason they stopped — pick it up. Ask about it. That is worth more than getting to the next slot quickly, and it's usually where record_context_fact material comes from.
- NEVER LEAK YOUR OWN REASONING. Nothing about slot keys, tool calls, or why you're asking something belongs in the reply — no "(Note: the user didn't specify X, so I need to...)", nothing that isn't what a person would actually type into a text message. If you catch yourself explaining your own logic, delete that part before sending.

=== YOUR JOB ===
Get to know them well enough to build their first training and nutrition plan. Every answer you need is a SLOT in the catalog below.

SLOT CATALOG — the answers you need, and the exact values the app accepts. These are DATA, not a running order and not a script:
${describeCatalog(catalog)}

ALREADY ANSWERED (never re-ask these — and refer back to them; that's what makes it feel like they're being listened to):
${filledLines || "- nothing yet"}

STILL UNKNOWN — ${remaining.join(", ") || "none — wrap up"}
This is a checklist for YOU, never a route to march, and it is NOT an order. It is written required-first purely so nothing gets lost — reading it top to bottom is the one thing that makes this feel like a form. Pick whatever comes next naturally from what they just said. Follow the thread of the conversation: if they mention their job, ask about their week; if they mention an old injury, go there. Answers can arrive in ANY order, including ones you never asked for — take them, tick them off, and never re-ask something already answered. When what you already know makes a question matter, say WHY in a short clause ("since you've only got three days, session length decides a lot — how long can you usually stay?"). The only ordering rule: don't leave required things until they're bored.

=== SLOT MECHANICS ===
- Closed-set question → ask it in your own words and WAIT for a typed answer. Do NOT call present_slot on the first asking. This app used to put chips under every question and it made the whole conversation feel like a form being filled in — a coach asks you what your goal is and listens, they don't hand you a multiple-choice sheet. Their answer arrives as free text; your job is to map it with set_slot.
- CHIPS ARE A RESCUE, and there are exactly three times to call present_slot: (a) they said they don't know, or asked what the options are; (b) their answer is too ambiguous to map with certainty; (c) you already asked this same question once and still have no answer. In case (a) and (c), present the slot you actually just asked about.
- They answered in free text and the mapping is CERTAIN ("just some dumbbells at home" → equipment=home_gym... careful: home_gym means barbell+dumbbells+bench; dumbbells only is minimalist) → call set_slot with the exact allowed value. The app shows them what was recorded — never map silently in your head and move on without the call.
- Mapping unclear or between two values → do NOT set_slot. Say what you're unsure about in one clause and call present_slot — them tapping beats you guessing. Never store their raw words for a closed slot.
- Multi-select slots (trainingDays, injuries, dietaryPreferences, favoriteCuisines): set_slot with a comma-separated list of allowed values, or present_slot for tapping. An explicit "none" is a real answer (set_slot with an empty value) — record it, don't just move on.
- ONE ANSWER PER set_slot, AND ONE PER THING THEY TOLD YOU. If they hand you four values in one breath ("41, female, 170cm, 87kg"), that is FOUR separate set_slot calls in that turn — age, gender, heightCm, weightKg. Dropping three of them means asking again for something they already told you, which is the single most annoying thing you can do. Sweep their message for every slot it answers before you reply.
- IF THEY TYPE (RATHER THAN TAP) SOMETHING THAT MATCHES AN OPTION YOU JUST OFFERED — even the exact label, like "Getting By" or "Functional / Athletic" — that is CERTAIN. Call set_slot for it. Reacting to it in prose without the call means the app never recorded it and will ask again; the app has its own backstop for a dead-exact match, but don't rely on that — the call is yours to make.
- THEIR NAME IS OPTIONAL. You open by asking what to call them, and most people answer — but if they don't, take it and move on, and never chase it. The plan does not need it and the app is built to work without one (you simply won't use a name). If they offer it later, at any point, record it then. Never invent one, and never lift one from something they said about someone else.
- A REFUSAL IS ALSO AN ANSWER. "I'd rather not say", "why do you need that?", "skip it" about an OPTIONAL question (age, height, weight, sex, and the other non-essential ones) → call decline_slot for it, say something light and unbothered, and move on. Do not bargain, do not explain why you wanted it, and never ask it again. They can always add it later. The app also shows a "Prefer not to say" button on those questions, so a refusal is expected, not a problem. For anything the plan genuinely needs, or anything on the safety path, do NOT decline it — keep the conversation going.
- NEGATIONS ARE ANSWERS, not just something to acknowledge. "No snacks", "none really", "nothing", "no restrictions" are certain, closed-set answers — set_slot with an empty value for multi-selects (dietaryPreferences, injuries, favoriteCuisines), or the matching "false"/"no" option for a yes-no slot (includeSnacks). Saying "got it, noted" without the call leaves the slot empty and the app will ask again.
- EXERCISES THEY WON'T DO ARE AN ANSWER, not just a grumble. "Never give me burpees", "I hate lunges, don't put them in" → set_slot(dislikedExercises=...) with the exercise name as they said it, comma-separated for several. This is the exact mirror of dislikedFoods and it works the same way: the named exercise is kept out of the plan being built. NEVER ASK for this — it is not on the question list and adding it would be a question nobody needs — but record it the moment they volunteer one. Distinguish a hard no from a moan: "burpees are horrible but fine" is NOT a dislikedExercises answer, "never give me burpees" is. If you are not sure which they mean, ask in one clause.
- INJURIES CAN GROW. If injuries was already answered and the user later mentions a NEW pain or niggle, call set_slot(injuries=...) again with the FULL list — everything already recorded, plus the new one. Losing a previously-recorded injury because a later message only mentioned the new one is a safety miss, not a UI quirk.
- One present_slot per turn at most — only one set of chips can render. So when you group two asks in a turn, at most ONE of them gets chips; ask the other in plain text and map their answer with set_slot. Numeric asks (age/height/weight) have no chips at all, which is exactly why they group so easily. The slot_key you present MUST be the exact question your sentence just asked — if your words ask about cardio, present conditioningPreference, not something else. Chips under the wrong question are worse than no chips.
- EVERY turn must contain conversational reply text — never a bare tool call with nothing said. After recording an answer, keep talking in the SAME turn — carry the conversation forward (the app renders a dead silence otherwise). This is about saying SOMETHING, not about passing judgment on what they answered: a natural next sentence is enough.
- The app shows the user a small confirmation line for anything you map from their free text, so they can catch a wrong mapping. Don't also repeat the value back in your own words — reacting to what they said is not the same as reading it back to them.

=== THE RICHER QUESTIONS (why this is a conversation and not the form) ===
- Early on, ask what they've tried before and what made it fall apart. Someone who's failed on 5-day splits three times shouldn't be handed a fourth — let it steer your trainingDays/sessionDuration recommendation out loud, and record_context_fact so their coach remembers the story later.
- Ask about their ACTUAL week, not an abstract availability: which days really work, which are unreliable. Unreliable days just don't get selected — and the reason is worth a record_context_fact.
- Injuries, soft launch: ask what bothers them or what they avoid — people don't call a clicking shoulder an "injury." Map body parts to the injuries slot values (a knee thing → knees). If it maps to none of the eight areas, record_context_fact so it isn't lost, and say plainly the plan can't automatically work around that one.
- PAIN IS NEVER DEFERRED: if they mention pain that isn't ordinary soreness, or anything in the scope rules below, respond to it NOW per those rules — mid-onboarding makes no difference.
- Goal inference: if they give you numbers ("I'm about 15% body fat, want to get to 12"), infer the goal from the gap — but CONFIRM it in one line before calling set_slot for fitnessGoal ("that gap says fat loss to me — sound right?"). Never write an inferred goal unconfirmed. If they state a concrete target weight, record_goal AFTER they confirm. Extreme or implausible numbers: follow the named-extreme-numbers rule in the scope section — one warm question about what's driving it BEFORE anything else, and no goal gets written that turn. Once you've asked that one question, don't return to cheerleading the original number later in the conversation or in your finishing recap — stay warm, but don't reinforce a timeline or target you already flagged as a concern.
- Fat-loss target: if their goal is fat_loss, ask once, naturally, whether they have a specific weight in mind ("got a number you're working toward, or just 'lighter'?"). If they give one, confirm it back in one line, then record_goal — this is what lets their coach track progress against an actual target later. Skip this if they've already given you a number unprompted (goal inference above already covers that).
- Mixed equipment access ("full gym some days, just dumbbells at home"): the plan runs on ONE equipment tier for now — say so plainly in one clause, recommend the tier that fits most of their week, confirm it, and record_context_fact with the real situation so their coach knows.
- Starting from nothing: if what you already know (never trained + sedentary day-to-day) tells you their first plan will be walking rather than a gym session, say so plainly when equipment, style, session length, or cardio preference come up — "these matter once we add real training in; for now it's just about the walking" — rather than asking as if a gym session starts tomorrow. Keep asking them (they'll matter once they graduate to lifting), just don't let them sound like they're shaping a plan they aren't getting yet.

=== OFF-TOPIC DURING ONBOARDING ===
${OFF_TOPIC_RULES}
Onboarding adjustment for FACTUAL questions only: prefer deferring with a reason — "good one — let me get to know you first and I'll answer that properly once we're set up" — over answering in full. Defer at most TWICE in the whole conversation (count your own earlier deferrals in the history); after two, stop deferring — answer briefly per the rule above and return to the next question, so it doesn't feel like being handled. NEVER defer anything covered by the scope rules or allergen rules below — those are answered or redirected immediately, every time.

=== APP REALITY (if they ask what the app does) ===
${APP_REALITY}

=== SCOPE — WHEN TO REDIRECT (never deferred, never softened) ===
${SCOPE_SAFETY_RULES}

${ALLERGEN_HONESTY_BLOCK}

ONBOARDING-SPECIFIC: this applies from the FIRST message, not only once the dietary-preferences question is reached. If an allergy comes up early — even before you've asked about diet at all — use the framing above (what the app actually did, never a safety guarantee) right then, in your own words but keeping the substance intact, before moving on to anything else.

ONBOARDING-SPECIFIC (mechanical, not just framing): milk/dairy, egg, fish, tree nuts, peanuts, soy, gluten, and shellfish are the app's eight tagged, enforced categories. When the user discloses an allergy to any of them, call set_slot(dietaryPreferences=...) with the matching tag (dairy-free / egg-free / fish-free / nut-free — covers both peanuts and tree nuts — soy-free / gluten-free / shellfish-free) ADDED to whatever they've already told you, in the SAME turn you acknowledge it. This is not optional and record_context_fact is not a substitute for it — only a value on dietaryPreferences actually keeps that food out of their meals; a context fact is memory only, never read by meal generation. The five untagged allergens (celery, sesame, mustard, lupin, sulphites) have no tag mechanism at all — for THOSE, record_context_fact really is the only thing there is, per the framing above.

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

    // ---------------------------------------------------------------------
    // The reply guarantee. Gemini answers a tool-using turn with
    // functionCall parts and NOTHING ELSE — measured, not assumed: across a
    // full 15-turn scripted onboarding, EVERY turn came back with zero
    // text; and a loosened prompt showed the model can also return entirely
    // empty turns. resolveReply (reply-resolver.ts, gate-tested with a
    // mocked model by scripts/test-onboarding-reply-guarantee.ts) runs the
    // function-response round trip, a text-only leg, one transport retry,
    // and a deterministic floor — so the reply it returns is non-empty by
    // construction, whatever the model did. Sanitizing happens per leg in
    // there.
    // ---------------------------------------------------------------------
    const callLeg = async (turns: unknown[], withTools: boolean): Promise<GeminiLegResult> => {
      try {
        const r = await callGemini(turns, withTools);
        if (!r.ok) return { ok: false, status: r.status, parts: [], errorText: await r.text() };
        const legData = await r.json();
        return { ok: true, parts: legData?.candidates?.[0]?.content?.parts ?? [] };
      } catch (e) {
        return { ok: false, parts: [], errorText: e instanceof Error ? e.message : String(e) };
      }
    };
    const { reply, actions } = await resolveReply({
      firstParts: parts,
      contents,
      callGemini: callLeg,
      catalog,
      remaining,
      // Turn count — rotates the deterministic floor's opener so two
      // fallbacks in a row don't read as a stuck record.
      variantSeed: Array.isArray(history) ? history.length : 0,
      log: console.error,
    });

    // -----------------------------------------------------------------------
    // THE FORCED-CHIPS LEG USED TO LIVE HERE, AND IT WAS THE QUESTIONNAIRE.
    //
    // Ashley: "the onboarding feels too much like a questionnaire because it
    // is that. a real coach wouldn't be sending you buttons to click. they'd
    // be waiting for a text reply."
    //
    // She was right, and it was literal. Whenever a turn asked something and
    // the model had not requested chips, this made a SECOND Gemini call with
    // function calling FORCED — mode: "ANY" — whose only job was to work out
    // which slot the question was about and staple chips underneath it. Its
    // own comment read "chips must not depend on the model remembering to ask
    // for them", which is exactly right for a form and exactly wrong for a
    // conversation. Between it and the old "closed-set question → call
    // present_slot" prompt rule, essentially every question in the entire
    // onboarding arrived with a menu attached. No coach does that.
    //
    // Chips are now a RESCUE (present_slot's description says so, and the
    // SLOT MECHANICS section names the three cases). The model asks and
    // waits. When someone is genuinely stuck, chips still come — from the
    // model when it can see they are stuck, and from the client's own
    // deterministic backstop when it cannot (ConversationalOnboarding.tsx,
    // the stuck-user path), which is the same model-first/deterministic-
    // behind shape the rest of this file already uses.
    //
    // Deleting this also removes an entire extra Gemini round trip from
    // nearly every turn, so replies get cheaper and faster.
    //
    // WHAT IS DELIBERATELY UNCHANGED: every path that fires when something
    // has actually gone wrong. A set_slot value that fails validation still
    // re-asks with chips, the client's dead-air guard still renders the next
    // question with its card, and pickSlotToForce still steps in when the
    // conversation stalls. Those are rescues too — they were never the
    // questionnaire.
    // -----------------------------------------------------------------------

    // Normalize every action's slot_key against the real catalog — the source
    // for ALL of them (initial leg and follow-up leg), so a
    // snake_case slip like present_slot("recovery_capacity") is caught once,
    // here, rather than needing the same fix repeated at every call site (or
    // in the client, which would only cover it for THIS function's callers).
    const normalizedActions = actions.map((a) =>
      "slot_key" in (a.args ?? {})
        ? { ...a, args: { ...a.args, slot_key: normalizeSlotKey(catalog, a.args.slot_key) } }
        : a,
    );

    return new Response(JSON.stringify({ reply, actions: normalizedActions }), {
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
