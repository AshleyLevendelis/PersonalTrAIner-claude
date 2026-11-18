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
