// ---------------------------------------------------------------------------
// READING AN INGREDIENT AMOUNT (1 Oct 2026; docs/plans/ingredient-units.md).
//
// ONE reader for "how much is this line", used by the app AND by the coach's
// edge function. It has ZERO imports so a straight file copy is the sync
// mechanism (supabase/functions/_shared/ingredient-units.ts, held identical by
// test:ingredient-units), the same pattern as the food database.
//
// WHAT IT REPLACES, measured the same day: the old reader knew grams, spoons,
// cups and a short list of named counts, and sent everything else to "a count of
// N whole things, with the unit word left in the name". "8 oz chicken breast"
// became 8 "whole" of "oz chicken breast", which the grams function then costed
// at 8 g. 31 of 53 ordinary recipe lines came out more than 25% wrong, and the
// meal's coverage still read 100%, because coverage is weighted by mass and the
// mass was the misread number.
//
// THE RULE, so it cannot go back: an amount is either UNDERSTOOD or it is
// marked `unread`, with the reason and the line as written. It is never guessed.
// What this file converts is only what has ONE exact answer (oz, lb, kg, l, fl
// oz, fractions, ranges, "2 x 150g", a stated pack size). Anything that depends
// on the FOOD (a cup of oats, a tin of tuna, a handful of rocket, a carrot) is
// handed back as the unit word and decided by the food's own table in
// food-db.ts (resolveGrams), where it is understood or unread the same way.
// ---------------------------------------------------------------------------

/** A parsed line. Same shape the food database reads, plus the two fields that carry "I could not read this". */
export interface ReadLine {
  name: string
  quantity: number
  unit: string
  /** Why the amount was not understood. Present means: do not trust quantity and unit, ask. */
  unread?: string
  /** The line as it was written, kept ONLY on an unread line so the question can quote it. */
  source?: string
}

const OZ_G = 28.3495
const LB_G = 453.592
const FL_OZ_ML = 29.5735

const FRACTION_CHARS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
}

/** Unicode fractions, a decimal comma and dash variants, so the patterns below see one alphabet. */
function normaliseText(raw: string): string {
  let t = raw.trim()
  t = t.replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_m, d: string, f: string) => `${d} ${FRACTION_CHARS[f]}`)
  t = t.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, f => FRACTION_CHARS[f])
  t = t.replace(/(\d),(\d)(?!\d{3}\b)/g, '$1.$2')
  t = t.replace(/[–—−]/g, '-')
  return t.replace(/\s+/g, ' ')
}

/** A decimal ("1.5"), a fraction ("1/2") or a mixed number ("1 1/2"). */
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`

function toNumber(raw: string): number {
  const mixed = raw.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseFloat(mixed[1]) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10)
  const fraction = raw.match(/^(\d+)\/(\d+)$/)
  if (fraction) return parseInt(fraction[1], 10) / parseInt(fraction[2], 10)
  return parseFloat(raw)
}

/** Round to a sensible precision: whole grams above 10, one decimal below, so "8 oz" is 227 and "1/2 oz" is 14.2. */
function tidy(n: number): number {
  return n >= 10 ? Math.round(n) : Math.round(n * 10) / 10
}

type Conversion = { unit: string; factor: number }

/**
 * Units with ONE exact answer, longest spelling first so "lbs" is not read as "l".
 * Each maps to the unit the rest of the app already speaks (g or ml) and a factor.
 */
const EXACT_UNITS: [RegExp, Conversion][] = [
  [/^(?:kilograms?|kilos?|kgs?)\b/i, { unit: 'g', factor: 1000 }],
  [/^(?:grams?|gr|g)\b/i, { unit: 'g', factor: 1 }],
  [/^(?:ounces?|oz)\b\.?/i, { unit: 'g', factor: OZ_G }],
  [/^(?:pounds?|lbs?)\b\.?/i, { unit: 'g', factor: LB_G }],
  [/^(?:fl\.?\s?oz|fluid\s+ounces?)\b\.?/i, { unit: 'ml', factor: FL_OZ_ML }],
  [/^(?:millilit(?:re|er)s?|mls?)\b/i, { unit: 'ml', factor: 1 }],
  [/^(?:centilit(?:re|er)s?|cl)\b/i, { unit: 'ml', factor: 10 }],
  [/^(?:decilit(?:re|er)s?|dl)\b/i, { unit: 'ml', factor: 100 }],
  [/^(?:lit(?:re|er)s?|l)\b/i, { unit: 'ml', factor: 1000 }],
]

/** Units the rest of the app already uses: kept as written so every line that read correctly still reads the same. */
const KEPT_UNITS: [RegExp, string][] = [
  [/^(?:tablespoons?|tbsps?|tbs|tbl)\b\.?/i, 'tbsp'],
  [/^(?:teaspoons?|tsps?)\b\.?/i, 'tsp'],
  [/^cups?\b/i, 'cup'],
  [/^(?:medium|large|small|whole)\b/i, ''],
  [/^slices?\b/i, 'slice'],
  [/^cloves?\b/i, 'clove'],
  [/^scoops?\b/i, 'scoop'],
  [/^(?:halves|halfs?)\b/i, 'half'],
]

/** Containers and measures whose weight depends on the food (decided in food-db.ts) or on a size written beside them. */
const FOOD_DEPENDENT: [RegExp, string][] = [
  [/^(?:cans?|tins?)\b/i, 'can'],
  [/^(?:handfuls?)\b/i, 'handful'],
  [/^(?:bunch(?:es)?)\b/i, 'bunch'],
  [/^(?:heads?)\b/i, 'head'],
  [/^(?:sticks?)\b/i, 'stick'],
  [/^(?:sprigs?)\b/i, 'sprig'],
  [/^(?:stalks?)\b/i, 'stalk'],
  [/^(?:packs?|packets?|packages?)\b/i, 'pack'],
  [/^(?:bags?)\b/i, 'bag'],
  [/^(?:jars?)\b/i, 'jar'],
  [/^(?:bottles?)\b/i, 'bottle'],
  [/^(?:cartons?)\b/i, 'carton'],
  [/^(?:sachets?)\b/i, 'sachet'],
]

/** Loose amounts that weigh a fraction of a gram or a few, the same for every food. */
const LOOSE: [RegExp, string][] = [
  [/^pinch(?:es)?\b/i, 'pinch'],
  [/^dash(?:es)?\b/i, 'dash'],
  [/^splash(?:es)?\b/i, 'splash'],
  [/^drops?\b/i, 'drop'],
]

/** Measures that differ by country or have no weight at all: asked about, never guessed. */
const AMBIGUOUS_UNITS = /^(?:pints?|quarts?|gallons?|knobs?|glugs?|squeezes?|sprinkles?|couple|few|some|several)\b/i

const CONTAINER_UNITS = new Set(['can', 'jar', 'pack', 'bag', 'bottle', 'carton'])

function unread(source: string, reason: string): ReadLine {
  return { name: source.trim(), quantity: 1, unit: 'g', unread: reason, source: source.trim() }
}

/** `(14 oz)`, `(400g)` or `(2 x 400g)`: a stated size for the container beside it, in grams or ml. Removed from the text. */
function takeStatedSize(text: string): { text: string; size: { amount: number; unit: 'g' | 'ml' } | null } {
  const re = new RegExp(String.raw`\(\s*(${NUM})\s*(kg|g|oz|ounces?|lbs?|pounds?|ml|l|litres?|liters?|fl\.?\s?oz)\s*\)`, 'i')
  const m = text.match(re)
  if (!m) return { text, size: null }
  const n = toNumber(m[1])
  for (const [pattern, conv] of EXACT_UNITS) {
    if (pattern.test(m[2])) {
      return { text: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim(), size: { amount: n * conv.factor, unit: conv.unit as 'g' | 'ml' } }
    }
  }
  return { text, size: null }
}

/** The leading amount: "2", "1/2", "1 1/2", "2-3", "2 to 3", or "2 x 150" (a count times a size). */
function takeQuantity(text: string): { qty: number; rest: string; times?: number } | null {
  const times = text.match(new RegExp(String.raw`^(${NUM})\s*[x×]\s*(${NUM})(?=\s*[a-zA-Z])\s*(.*)$`, 'i'))
  if (times) return { qty: toNumber(times[2]), times: toNumber(times[1]), rest: times[3] }
  const range = text.match(new RegExp(String.raw`^(${NUM})\s*(?:-|to)\s*(${NUM})(?![\d/])\s*(.*)$`, 'i'))
  if (range) return { qty: (toNumber(range[1]) + toNumber(range[2])) / 2, rest: range[3] }
  const single = text.match(new RegExp(String.raw`^(${NUM})(?![\d/])\s*(.*)$`))
  if (single) return { qty: toNumber(single[1]), rest: single[2] }
  return null
}

/**
 * Reads one ingredient line. Every line that READ CORRECTLY before reads the
 * same now (same name, quantity and unit); what changes is that lines which were
 * silently wrong are either converted exactly or marked unread.
 */
export function readIngredientText(text: string): ReadLine {
  const source = text.trim()
  let t = normaliseText(text)
  if (t.length === 0) return unread(source, 'the line is empty')

  const stated = takeStatedSize(t)
  t = stated.text

  // "juice of 1 lemon", "zest of half an orange": an amount of a part of a fruit, not something to weigh.
  if (/^(?:the\s+)?(?:juice|zest|rind)\s+of\b/i.test(t)) return unread(source, 'juice or zest cannot be weighed from a count')
  // "to taste", "as needed": no amount at all.
  if (/\b(?:to taste|as needed|for serving|for garnish|for frying)\b/i.test(t) && !/^\d/.test(t)) return unread(source, 'it has no amount ("to taste")')

  let qty: number | null = null
  let times = 1
  let rest = t

  // WORD AMOUNTS: "a banana", "an egg", "one onion", "half an avocado", "a pinch of salt".
  const word = t.match(/^(a half(?:\s+an?)?|half(?:\s+an?)?|an|a|one)\s+(.+)$/i)
  if (word && !/^\d/.test(t)) {
    const lead = word[1].toLowerCase()
    qty = lead.startsWith('half') || lead.startsWith('a half') ? 0.5 : 1
    rest = word[2]
  } else {
    const taken = takeQuantity(t)
    if (taken) { qty = taken.qty; rest = taken.rest; if (taken.times) times = taken.times }
  }
  if (qty === null) return unread(source, 'it has no amount')
  if (qty <= 0) return unread(source, 'the amount is zero')
  qty *= times

  rest = rest.trim()
  if (rest.length === 0) return unread(source, 'it names no food')

  // 1. EXACT units: one answer whatever the food.
  for (const [pattern, conv] of EXACT_UNITS) {
    const m = rest.match(pattern)
    if (m) {
      const name = rest.slice(m[0].length).replace(/^\s*(?:of\s+)?/i, '').trim()
      if (name.length === 0) return unread(source, 'it names no food')
      return { name, quantity: tidy(qty * conv.factor), unit: conv.unit }
    }
  }

  // 2. Units the rest of the app already speaks, kept exactly as they were.
  for (const [pattern, canonical] of KEPT_UNITS) {
    const m = rest.match(pattern)
    if (m) {
      const unit = canonical || m[0].toLowerCase()
      const name = rest.slice(m[0].length).replace(/^\s*(?:of\s+)?/i, '').trim()
      if (name.length === 0) return unread(source, 'it names no food')
      return { name, quantity: qty, unit }
    }
  }

  // 3. Loose amounts: a pinch, a dash, a splash.
  for (const [pattern, canonical] of LOOSE) {
    const m = rest.match(pattern)
    if (m) {
      const name = rest.slice(m[0].length).replace(/^\s*(?:of\s+)?/i, '').trim()
      if (name.length === 0) return unread(source, 'it names no food')
      return { name, quantity: qty, unit: canonical }
    }
  }

  // 4. Measures that differ by country or weigh nothing in particular: asked about.
  if (AMBIGUOUS_UNITS.test(rest)) return unread(source, `"${rest.split(' ')[0]}" is not a measure I can turn into grams`)

  // 5. Containers and measures that depend on the food.
  for (const [pattern, canonical] of FOOD_DEPENDENT) {
    const m = rest.match(pattern)
    if (m) {
      const name = rest.slice(m[0].length).replace(/^\s*(?:of\s+)?/i, '').trim()
      if (name.length === 0) return unread(source, 'it names no food')
      // A stated size beside a container ("1 (14 oz) can coconut milk") IS its weight.
      if (stated.size && CONTAINER_UNITS.has(canonical)) {
        return { name, quantity: tidy(qty * stated.size.amount), unit: stated.size.unit }
      }
      return { name, quantity: qty, unit: canonical }
    }
  }

  // 6. No unit word: a count of the food ("3 eggs", "2 carrots", "a banana"). A stated size without a container is the weight of one.
  if (stated.size) return { name: rest, quantity: tidy(qty * stated.size.amount), unit: stated.size.unit }
  return { name: rest, quantity: qty, unit: 'whole' }
}
