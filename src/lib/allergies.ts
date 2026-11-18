// ---------------------------------------------------------------------------
// THE ALLERGY CARD (his ruling 15 Nov 2026, "Allergy card, peanuts split"; docs/plans/allergy-card.md).
// An allergy is its own record, not a diet tick: which allergen, whether he carries an adrenaline pen, whether traces
// ("may contain") matter, and for gluten whether he is coeliac and whether oats are out. Kept in the profile column
// `allergies` (jsonb, default []). ONE reader each way: `allergiesOf` reads what is stored, `allergyRestrictions`
// turns it into the food rules every meal path already obeys (through mealRestrictionsOf).
//
// What the app can and cannot do with it: the ALLERGEN filters the app's own food list. The pen changes nothing on a
// plate (the coach is told). Traces and cross-contamination are things the app cannot see: they change what is SAID
// (check the label), never a filter. Zero imports, so the coach's server can hold a copy.
// ---------------------------------------------------------------------------

export const ALLERGENS = [
  'peanuts', 'tree nuts', 'gluten', 'milk', 'egg', 'soy', 'sesame', 'fish', 'crustaceans', 'molluscs', 'celery',
  'mustard', 'lupin', 'sulphites',
] as const
export type Allergen = typeof ALLERGENS[number]

export interface AllergyRecord {
  allergen: Allergen
  /** Carries an adrenaline pen: true, false, or null when not said. */
  pen: boolean | null
  /** 'avoid' = "may contain" foods are out for him; 'fine'; null when not said. */
  traces: 'avoid' | 'fine' | null
  /** Gluten only: coeliac disease. */
  coeliac?: boolean | null
  /** Gluten only: 'certified' = certified gluten-free oats are fine; 'avoid' = no oats at all. */
  oats?: 'certified' | 'avoid' | null
}

/** The food rule each allergen switches on. Crustaceans and molluscs share the table's one shellfish tag. */
const RULE_FOR: Record<Allergen, string> = {
  peanuts: 'peanut-free', 'tree nuts': 'tree-nut-free', gluten: 'gluten-free', milk: 'dairy-free', egg: 'egg-free',
  soy: 'soy-free', sesame: 'sesame-free', fish: 'fish-free', crustaceans: 'shellfish-free', molluscs: 'shellfish-free',
  celery: 'celery-free', mustard: 'mustard-free', lupin: 'lupin-free', sulphites: 'sulphite-free',
}

/** What is stored, cleaned: unknown allergens dropped, one record per allergen (the first), fields to their types. */
export function allergiesOf(profile: { allergies?: unknown } | null | undefined): AllergyRecord[] {
  const raw = profile?.allergies
  if (!Array.isArray(raw)) return []
  const out: AllergyRecord[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const a = (r as { allergen?: unknown }).allergen
    if (typeof a !== 'string' || !(ALLERGENS as readonly string[]).includes(a)) continue
    if (out.some(o => o.allergen === a)) continue
    const x = r as Record<string, unknown>
    const rec: AllergyRecord = {
      allergen: a as Allergen,
      pen: typeof x.pen === 'boolean' ? x.pen : null,
      traces: x.traces === 'avoid' || x.traces === 'fine' ? x.traces : null,
    }
    if (a === 'gluten') {
      rec.coeliac = typeof x.coeliac === 'boolean' ? x.coeliac : null
      rec.oats = x.oats === 'certified' || x.oats === 'avoid' ? x.oats : null
    }
    out.push(rec)
  }
  return out
}

/** The food rules the recorded allergies switch on. A coeliac who avoids all oats gets the oat rule as well. */
export function allergyRestrictions(allergies: readonly AllergyRecord[]): string[] {
  const out: string[] = []
  for (const a of allergies) {
    const rule = RULE_FOR[a.allergen]
    if (!out.includes(rule)) out.push(rule)
    if (a.allergen === 'gluten' && a.oats === 'avoid' && !out.includes('oat-free')) out.push('oat-free')
  }
  return out
}

/** The allergy behind a rule, if one is recorded: the refusal then says "your tree-nut allergy" (his answer 1). */
export function allergyForRule(allergies: readonly AllergyRecord[], rule: string): AllergyRecord | null {
  return allergies.find(a => RULE_FOR[a.allergen] === rule || (rule === 'oat-free' && a.allergen === 'gluten' && a.oats === 'avoid')) ?? null
}

/** "tree-nut", "peanut", "milk": the allergen as it reads before the word "allergy". */
const ALLERGY_ADJECTIVE: Record<Allergen, string> = {
  peanuts: 'peanut', 'tree nuts': 'tree-nut', gluten: 'gluten', milk: 'milk', egg: 'egg', soy: 'soy', sesame: 'sesame',
  fish: 'fish', crustaceans: 'crustacean', molluscs: 'mollusc', celery: 'celery', mustard: 'mustard', lupin: 'lupin',
  sulphites: 'sulphite',
}

/** "tree-nut allergy", or "coeliac disease" for a coeliac. */
export function allergyName(a: AllergyRecord): string {
  if (a.allergen === 'gluten' && a.coeliac) return 'coeliac disease'
  return `${ALLERGY_ADJECTIVE[a.allergen]} allergy`
}

/** True when any recorded allergy carries a pen: a described reaction then gets the app's first-aid line first. */
export function carriesPen(allergies: readonly AllergyRecord[]): boolean {
  return allergies.some(a => a.pen === true)
}

/** The app's own first line for a described reaction when he carries a pen (his answer 2). First aid, never a diagnosis. */
export const REACTION_FIRST_LINE = 'Use your adrenaline pen now and call 999.'

/** His own words describing a reaction happening now. Read against what HE said, never the coach's reply. */
export function describesReaction(said: string): boolean {
  const t = said.toLowerCase()
  if (/\b(can'?t|cannot|struggling to|hard to|trouble) (breathe|swallow)\b/.test(t)) return true
  if (/\b(throat|tongue|lips?|face|mouth) (is |are |feels? |getting |has |have )?(swelling|swollen|swelled|closing|tight|tingling|tingly|itchy|itching|numb)\b/.test(t)) return true
  if (/\b(swelling|swollen|tingling|tingly) (throat|tongue|lips?|face|mouth)\b/.test(t)) return true
  if (/\b(having|got|getting) (an? )?(allergic )?reaction\b/.test(t)) return true
  if (/\banaphyla/.test(t)) return true
  if (/\b(hives|wheezing)\b/.test(t) && /\b(ate|eaten|after eating|just had)\b/.test(t)) return true
  return false
}

/** What the shopping list and meals add for things the app cannot see. Empty when nothing recorded asks for it. */
export function labelLines(allergies: readonly AllergyRecord[]): string[] {
  const out: string[] = []
  const g = allergies.find(a => a.allergen === 'gluten')
  if (g?.coeliac) out.push('Check the label for a certified gluten-free mark on stock, sauces, cereals, bars and baked goods.')
  if (g && g.oats === 'certified') out.push('Buy oats marked certified gluten-free.')
  if (allergies.some(a => a.traces === 'avoid')) out.push('Check for "may contain" warnings on stock, sauces, cereals, bars, protein powder and baked goods.')
  return out
}

/** One line per allergy for Profile and the coach: "Tree nuts · carries an adrenaline pen · avoids traces". */
export function allergyLine(a: AllergyRecord): string {
  const name = a.allergen === 'gluten' && a.coeliac ? 'Gluten (coeliac)' : a.allergen.charAt(0).toUpperCase() + a.allergen.slice(1)
  const bits = [name]
  if (a.pen === true) bits.push('carries an adrenaline pen')
  if (a.traces === 'avoid') bits.push('avoids traces')
  if (a.traces === 'fine') bits.push('traces are fine')
  if (a.allergen === 'gluten' && a.oats === 'avoid') bits.push('no oats')
  if (a.allergen === 'gluten' && a.oats === 'certified') bits.push('certified gluten-free oats are fine')
  return bits.join(' · ')
}

// ---------------------------------------------------------------------------
// SAID IN THE CHAT. "I'm allergic to tree nuts" offers the card (the app's offer, like the Pregnant tick); nothing is
// saved until he taps. Read off HIS words only.
// ---------------------------------------------------------------------------

const ALLERGY_SIGNAL = /\ballerg(?:y|ic|ies)\b|\banaphyla\w*|\bc(?:o)?eliac\b/i
const ALLERGY_DENIED = /\b(?:not|n't|no|never|without|any)\s+(?:\w+\s+){0,3}?(?:allerg(?:y|ic|ies)|c(?:o)?eliac)\b|\bno\s+(?:known\s+)?allergies\b/i

const SAID: [RegExp, Allergen[]][] = [
  [/\bpeanuts?\b|\bgroundnuts?\b/i, ['peanuts']],
  [/\b(?:tree nuts?|almonds?|walnuts?|cashews?|pistachios?|pecans?|hazelnuts?|brazil nuts?|macadamias?)\b/i, ['tree nuts']],
  [/\b(?:gluten|wheat|c(?:o)?eliac)\b/i, ['gluten']],
  [/\b(?:milk|dairy)\b/i, ['milk']],
  [/\beggs?\b/i, ['egg']],
  [/\bsoya?\b/i, ['soy']],
  [/\bsesame\b/i, ['sesame']],
  [/\b(?:prawns?|shrimps?|crab|lobster|crustaceans?)\b/i, ['crustaceans']],
  [/\b(?:mussels?|oysters?|clams?|scallops?|squid|mollus[ck]s?)\b/i, ['molluscs']],
  [/\bshellfish\b/i, ['crustaceans', 'molluscs']],
  [/\bcelery\b/i, ['celery']],
  [/\bmustard\b/i, ['mustard']],
  [/\blupins?\b/i, ['lupin']],
  [/\bsul(?:ph|f)ites?\b/i, ['sulphites']],
]

/**
 * The allergens he said he is allergic to. Empty unless the message carries an allergy word and does not deny it.
 * A bare "nuts" (no kind named) is BOTH peanuts and tree nuts, the safe side; "fish" never means shellfish.
 */
export function allergensSaid(text: string): Allergen[] {
  const t = text ?? ''
  if (!ALLERGY_SIGNAL.test(t) || ALLERGY_DENIED.test(t)) return []
  const out: Allergen[] = []
  const add = (a: Allergen) => { if (!out.includes(a)) out.push(a) }
  for (const [re, list] of SAID) if (re.test(t)) list.forEach(add)
  if (/\bfish\b/i.test(t.replace(/shellfish/gi, ''))) add('fish')
  if (/\bnuts?\b/i.test(t.replace(/\b(?:tree|brazil|pea|ground|pine|coco|dough|hazel|wal|chest)[ -]?nuts?\b/gi, '')) && !out.includes('peanuts') && !out.includes('tree nuts')) { add('peanuts'); add('tree nuts') }
  return out
}

/** A fresh record for an allergen said in the chat: coeliac is kept when the word was said; nothing else is assumed. */
export function recordFor(allergen: Allergen, said: string): AllergyRecord {
  return allergen === 'gluten'
    ? { allergen, pen: null, traces: null, coeliac: /\bc(?:o)?eliac\b/i.test(said) ? true : null, oats: null }
    : { allergen, pen: null, traces: null }
}

/** The chat's offer to record an allergy, and what it says after. */
export const ALLERGY_OFFER_WORDS = {
  offer: (names: string) => `Shall I record your ${names} on your profile? Your meals will leave it out and I'll know about it. Ingredients are filtered, not verified, so keep checking labels.`,
  unchanged: 'Your diet settings and your foods to avoid stay as they are.',
  done: 'Recorded. On Profile, under Food, Allergies, you can say whether you carry an adrenaline pen and whether you avoid traces.',
  failed: "I couldn't save that to your profile. Nothing has changed.",
  notOn: "Allergies aren't switched on yet, so I couldn't record it. Nothing has changed.",
}

// ---------------------------------------------------------------------------
// THE COACH NEVER PROMISES WHAT THE APP CANNOT CHECK (the coeliac tester was told "everything strictly avoids
// cross-contamination"). A sentence of the coach's that promises safety, a guarantee, or freedom from traces is taken
// out of the reply and the app's own honest line is said instead. A sentence saying it CANNOT promise is left alone.
// ---------------------------------------------------------------------------

const PROMISE = /\bstrictly\s+(?:avoids?|free|excludes?)\b|\bguarantee(?:d|s)?\b|\b(?:completely|totally|entirely|perfectly|100%|absolutely)\s+(?:safe|free)\b|\b(?:free|clear)\s+(?:from|of)\s+(?:any\s+|all\s+)?(?:traces?|cross[- ]contamination)\b|\bno\s+(?:risk\s+of\s+|chance\s+of\s+)?(?:traces?|cross[- ]contamination)\b|\bcross[- ]contamination[- ]free\b|\b(?:is|are|will be|'s)\s+(?:all\s+)?safe\s+for\s+(?:you|your|a\s+c(?:o)?eliac|someone\s+with)\b/i
const NOT_A_PROMISE = /\b(?:can't|cannot|can not|couldn't|won't|don't|doesn't|not|never|unable to|no way to)\b[^.?!]{0,60}\b(?:guarantee|promise|check|see|verify|confirm|tell|know|be sure|safe|free)/i

/** The app's sentence in place of a promise. */
export const NO_PROMISE_LINE = "I can't check traces or cross-contamination. Ingredients are filtered, not verified, so keep checking labels."

/** The reply with every promise sentence taken out and the app's line added once; unchanged when there is none. */
export function withoutSafetyPromises(reply: string): { reply: string; removed: number } {
  if (!reply) return { reply, removed: 0 }
  const sentences = reply.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [reply]
  let removed = 0
  const kept = sentences.filter(s => {
    const promise = PROMISE.test(s) && !NOT_A_PROMISE.test(s)
    if (promise) removed++
    return !promise
  })
  if (removed === 0) return { reply, removed: 0 }
  const body = kept.join('').trim()
  return { reply: body ? `${body}\n\n${NO_PROMISE_LINE}` : NO_PROMISE_LINE, removed }
}

/** The food rules that are allergens: with one on (a tick or a recorded allergy) the coach's reply goes through the check above. */
export const ALLERGEN_RULES: readonly string[] = ['nut-free', 'peanut-free', 'tree-nut-free', 'dairy-free', 'gluten-free', 'oat-free',
  'egg-free', 'soy-free', 'shellfish-free', 'fish-free', 'celery-free', 'sesame-free', 'mustard-free', 'lupin-free', 'sulphite-free']
