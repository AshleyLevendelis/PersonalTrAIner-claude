// ---------------------------------------------------------------------------
// WHAT THE USER'S OWN MESSAGE SAYS — read deterministically, so a server-
// authored reply can be checked against it rather than against the model's
// account of it.
//
// Three things went wrong on 8 Sep 2026 because nothing on the server read
// the message: the model INVENTED "banana and honey" for a "what should I
// eat" question and the handler printed its macros as if she had named it;
// it GUESSED 60 minutes for a Muay Thai class that had not happened yet and
// the handler logged it; and a "was that a good idea?" about rice cakes got a
// macro table, because the only intent the tool knows is question|logging.
//
// Everything here is a plain function of the text. No model, no network, no
// Deno API — imported by the edge function and by scripts/test-message-
// evidence.ts alike. False negatives are the acceptable failure (the reply
// is still coach prose, never a dead end); false positives are not, which is
// why the food-naming check ignores nutrient words, slot words and the small
// words of asking.
// ---------------------------------------------------------------------------

/** Words that appear in a food question without naming any food. */
const STOP = new Set([
  // nutrients and units
  "calorie", "calories", "kcal", "cal", "cals", "protein", "carb", "carbs", "carbohydrate", "carbohydrates",
  "fat", "fats", "macro", "macros", "sugar", "fibre", "fiber", "salt", "gram", "grams", "kilo", "kilos",
  // slots, meals, the act of eating
  "breakfast", "lunch", "dinner", "snack", "snacks", "meal", "meals", "food", "foods", "eat", "eating",
  "ate", "eaten", "had", "have", "having", "drink", "drank", "portion", "serving", "plate", "bowl",
  // the small words of asking
  "what", "which", "how", "much", "many", "should", "could", "would", "can", "good", "bad", "idea",
  "best", "better", "before", "after", "during", "with", "for", "and", "the", "this", "that", "some",
  "something", "about", "roughly", "just", "like", "any", "give", "make", "get", "need", "want",
  // times and training words that ride along with food talk
  "today", "tonight", "morning", "evening", "afternoon", "later", "tomorrow", "yesterday",
  "training", "session", "workout", "gym", "class", "energy", "fuel", "pre", "post", "quick", "big",
  "little", "bit", "lot", "lots", "more", "less", "enough", "too",
]);

/** Conservative de-pluralising, the same rule food-db.ts uses: long words only, never "-ss". */
const fold = (token: string) =>
  token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;

/** Lower-cased, punctuation-free content words, plurals folded, stoplist and short words dropped. */
export function contentTokens(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9%\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t))
    .map(fold);
}

export interface NamedFoodEvidence {
  /** True when the food the tool was called with is traceable to the user's words. */
  named: boolean;
  /** The content words that tie them together (empty when not named). */
  matched: string[];
  /** 'message' when the words are in what they typed; 'plan' when they pointed at a meal on their plan. */
  via: "message" | "plan" | null;
}

/**
 * Did the USER name this food, or did the model? The tool's food_name and
 * ingredient names are compared, as content words, against the message —
 * one shared content word is enough ("honey" ties "20g of honey" to
 * "Honey"); nutrient words, slot words and the words of asking never count.
 * A message that points at a meal on the plan ("my breakfast", "tonight's
 * dinner on the plan") counts when the plan's own text shares a word with
 * the food, because then the food is theirs even though they did not type it.
 */
export function userNamedFood(input: {
  foodName: string;
  ingredientNames: string[];
  message: string;
  planText?: string;
}): NamedFoodEvidence {
  const food = new Set(contentTokens([input.foodName, ...input.ingredientNames].join(" ")));
  if (food.size === 0) return { named: false, matched: [], via: null };
  const said = new Set(contentTokens(input.message));
  const matched = [...food].filter((t) => said.has(t));
  if (matched.length > 0) return { named: true, matched, via: "message" };

  const pointsAtPlan = /\b(my|tonight'?s|today'?s|this morning'?s|the)\s+(breakfast|lunch|dinner|snack|meal)\b/i.test(input.message)
    || /\b(on|in|from)\s+(my|the)\s+plan\b/i.test(input.message);
  if (pointsAtPlan && input.planText) {
    const plan = new Set(contentTokens(input.planText));
    const viaPlan = [...food].filter((t) => plan.has(t));
    if (viaPlan.length > 0) return { named: true, matched: viaPlan, via: "plan" };
  }
  return { named: false, matched: [], via: null };
}

/**
 * "What should I eat?" and its relatives — a request for a suggestion, which
 * is answered in words and never computed. Deliberately does NOT match
 * "should I have had…" (that is an evaluation, below) or "how many calories
 * in X" (that is a numbers question about a food they named).
 */
export function isAdviceQuestion(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    /\bwhat\s+(should|could|can|do|would|shall)\s+i\s+(eat|have|drink|snack\s+on|take|make|cook|grab|go\s+for)\b/.test(m) ||
    /\bwhat(?:'s|\s+is)\s+(?:a\s+)?(?:good|decent|quick|easy|light|healthy|best)\s+(?:thing\s+to\s+eat|snack|breakfast|lunch|dinner|meal|option|pre-?workout|post-?workout)/.test(m) ||
    /\bany\s+(ideas?|suggestions?|recommendations?|thoughts\s+on\s+what\s+to\s+eat)\b/.test(m) ||
    /\b(recommend|suggest)\b[^.?!]*\b(eat|food|snack|meal|breakfast|lunch|dinner)\b/.test(m) ||
    /\bwhat\s+to\s+eat\b/.test(m) ||
    /\bhow\s+(much|many)\s+\w+\s+should\s+i\s+(eat|have|get|aim\s+for)\b/.test(m) ||
    /\b(should|could|can)\s+i\s+(eat|have|drink)\s+(?!had|eaten)\w+/.test(m) && !/\bshould\s+i\s+have\s+(had|eaten|skipped|avoided)\b/.test(m)
  );
}

/**
 * "Was that a good idea?" — a judgement about food they already named, past
 * or planned. Wants a coach's verdict, with the numbers as support at most.
 */
export function isEvaluationQuestion(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    /\b(was|is|were)\s+(that|this|it|they|those)\s+(a\s+|an\s+)?(good|bad|ok|okay|alright|fine|smart|wise|sensible|terrible|awful|dumb|stupid|mistake|problem)\b/.test(m) ||
    /\b(good|bad|ok|okay|smart|wise|sensible)\s+(idea|choice|call|move|shout|option)\b[^.!]*\?/.test(m) ||
    /\bshould\s+i\s+(have|not\s+have|'?ve)\s+(had|eaten|skipped|avoided|waited|gone\s+for)\b/.test(m) ||
    /\b(too\s+much|too\s+many|too\s+little|too\s+heavy|too\s+light|not\s+enough|enough)\b[^.!]*\?/.test(m) ||
    /\bis\s+that\s+(too|enough|bad|ok|okay|fine|alright)\b/.test(m) ||
    /\b(what\s+do\s+you\s+think|thoughts\??|did\s+i\s+do\s+(ok|okay|right|well|badly))\b/.test(m) ||
    /\b(did|was)\s+(i|that)\s+(mess|screw|blow)\b/.test(m)
  );
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
};

/**
 * Every duration the user actually STATED, in whole minutes. Numerals and
 * word forms, minutes and hours ("an hour and a half" → 90, "half an hour" →
 * 30). A duration that is an OFFSET rather than a length — "in 30 minutes",
 * "in an hour", "an hour ago" — is not a length of anything and is skipped.
 * Empty when they said none, which is the whole point: the model's own
 * duration_minutes is written only when it echoes a value found here.
 */
export function statedDurationsMinutes(message: string): number[] {
  const m = (message || "").toLowerCase().replace(/[–—]/g, "-");
  const out: number[] = [];
  const push = (n: number) => { if (Number.isFinite(n) && n > 0 && n <= 24 * 60) out.push(Math.round(n)); };
  const offset = (start: number) => /\b(in|about\s+in|ago)\s*$/.test(m.slice(Math.max(0, start - 10), start)) || /^\s*ago\b/.test(m.slice(start));

  const numeral = /(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(?:\d+(?:\.\d+)?\s*)?(minutes?|mins?|m\b|hours?|hrs?|hr\b|h\b)/g;
  for (const hit of m.matchAll(numeral)) {
    const start = hit.index ?? 0;
    const endAt = start + hit[0].length;
    if (offset(start) || /^\s*ago\b/.test(m.slice(endAt))) continue;
    const n = Number(hit[1]);
    const unit = hit[2];
    push(/^h/.test(unit) ? n * 60 : n);
  }

  const wordHour = /\b(an?|one|two|three|half\s+an?|a\s+quarter\s+of\s+an?)\s+hours?(\s+and\s+a\s+half|\s+and\s+a\s+quarter)?\b/g;
  for (const hit of m.matchAll(wordHour)) {
    const start = hit.index ?? 0;
    const endAt = start + hit[0].length;
    if (offset(start) || /^\s*ago\b/.test(m.slice(endAt))) continue;
    const head = hit[1].replace(/\s+/g, " ");
    let n = head.startsWith("half") ? 0.5 : head.startsWith("a quarter") ? 0.25 : (WORD_NUMBERS[head] ?? 1);
    if (hit[2]) n += /half/.test(hit[2]) ? 0.5 : 0.25;
    push(n * 60);
  }
  const wordMinutes = /\b(five|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety)(?:[- ]five)?\s+(minutes?|mins?)\b/g;
  for (const hit of m.matchAll(wordMinutes)) {
    const start = hit.index ?? 0;
    const endAt = start + hit[0].length;
    if (offset(start) || /^\s*ago\b/.test(m.slice(endAt))) continue;
    const base = WORD_NUMBERS[hit[1]] ?? 0;
    push(/five$/.test(hit[0].split(/\s+/)[0]) && !/^five$/.test(hit[1]) ? base + 5 : base);
  }
  return out;
}

export type EventTiming = "past" | "future" | "unclear";

const FUTURE = /\b(tonight|later|tomorrow|this\s+evening|this\s+afternoon|this\s+arvo|going\s+to|gonna|will|about\s+to|heading\s+(to|off)|off\s+to|after\s+work|in\s+(a\s+bit|a\s+while|an\s+hour|\d+\s*(min|mins|minutes|hours?|hrs?))|next\s+\w+|planning\s+to|plan\s+to|got\s+\w+\s+(tonight|later|tomorrow))\b/;
const PAST = /\b(did|done|just\s+(did|had|finished|got\s+back)|had|went|finished|earlier|this\s+morning|yesterday|last\s+night|was\s+at|been\s+to|came\s+back|got\s+back|\w+ed)\b/;

/**
 * Has the thing happened, or is it still to come? Judged on the CLAUSE that
 * names the subject, not the whole message — "I didn't train this morning
 * but I'm going to Muay Thai tonight" is past about the lift and future
 * about the class, and the swap tool needs the second. With no subject, or
 * a subject no clause names, the whole message decides; a message that
 * points both ways is unclear, and unclear never logs anything.
 */
export function eventTiming(message: string, subject?: string): EventTiming {
  const text = (message || "").toLowerCase();
  const clauses = text.split(/[.!?;,]|\b(?:but|and\s+then|and|so|then|though|although)\b/).map((c) => c.trim()).filter(Boolean);
  const subjectTokens = contentTokens(subject ?? "");
  const judge = (clause: string): EventTiming => {
    const f = FUTURE.test(clause);
    // "-ed" words are past only when they are verbs about the event; keep the
    // generic suffix rule but never let a future marker in the same clause
    // be outvoted by it ("I'm booked in for Muay Thai tonight").
    const p = PAST.test(clause);
    if (f && !p) return "future";
    if (p && !f) return "past";
    if (f && p) return /\b(tonight|tomorrow|later|this\s+evening|going\s+to|gonna|will)\b/.test(clause) ? "future" : "unclear";
    return "unclear";
  };
  if (subjectTokens.length > 0) {
    const named = clauses.filter((c) => subjectTokens.some((t) => c.includes(t)));
    if (named.length > 0) {
      const verdicts = new Set(named.map(judge).filter((v) => v !== "unclear"));
      if (verdicts.size === 1) return [...verdicts][0];
      if (verdicts.size > 1) return "unclear";
      // The naming clause is bare ("Muay Thai instead of weights") — fall
      // through to the message as a whole.
    }
  }
  return judge(text);
}
