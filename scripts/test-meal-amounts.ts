// ---------------------------------------------------------------------------
// Gate: "2 eggs" is two eggs, not two grams of egg.
//
// 9 Oct 2026, the test log's worst finding (H6). Two meals typed to the coach:
//
//   "a chicken caesar wrap and a large latte"            -> card: 187 kcal
//   "2 scrambled eggs on 2 slices of buttered toast"     -> card: 266 kcal
//
// Real figures are roughly 750 and 420. Nothing was dropped: every food was
// FOUND and then costed at one or two grams, because the amount reader ended
// "unknown unit — treat the number as grams". Coverage stayed 100%, so nothing
// was flagged. The same line made "5 rye crispbreads" five grams on the
// shopping list (M23).
//
// WHAT THIS HOLDS, in both copies of the food database (the app's and the
// coach's — they are one file now, see test:food-db-parity):
//   1. everyday counted foods come to a sensible weight;
//   2. an amount that cannot be read is UNKNOWN — listed, counted against
//      coverage by line — and is never the bare number;
//   3. the two meals from the test log end as a card of at least 350 kcal or
//      as a question/refusal, never as a confident card under 300;
//   4. the stop in front of the card, and what the card says.
//
// One exit, at the bottom. Every check runs every time.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as appDb from '../src/lib/food-db'
import * as coachDb from '../supabase/functions/_shared/food-db.ts'
import { buildMealLogProposal } from '../src/lib/meal-log-proposal'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { resolveGroceryTarget } from '../src/lib/grocery-store'
import { buildCustomMealProposal } from '../src/lib/custom-meal'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

type Line = { name: string; quantity: number; unit: string }
// Loosely typed on purpose: this gate is also run against the code as it was
// BEFORE the fix, where some of these did not exist or returned a number.
type Db = {
  FOOD_DB: unknown[]
  lookupIngredient: (n: string) => { name: string } | null
  unitToGrams: (e: unknown, unit: string, q: number, name?: string) => number | null
  computeMealMacros: (l: Line[]) => { kcal: number; protein: number; carbs: number; fat: number; coverage: number; unmatched: string[]; amountUnknown?: string[]; lines: { grams: number | null; entry: unknown }[] }
  doubtAboutLoggedMeal?: (c: unknown, slot: unknown) => string | null
}
const COPIES: [string, Db][] = [['app', appDb as unknown as Db], ['coach', coachDb as unknown as Db]]

const gramsOf = (db: Db, l: Line): number | null => db.unitToGrams(db.lookupIngredient(l.name), l.unit, l.quantity, l.name)

/**
 * What the coach's log_meal does with a parsed meal, end to end: cost it, ask
 * the stop whether to trust it, and only then let the card's verifier build
 * the card. The handler itself cannot be run here (it is a Deno server), so
 * section 7 holds it to this same order from its source.
 */
function logOutcome(db: Db, ingredients: Line[], slot: string, name: string):
  { kind: 'card'; kcal: number; text: string } | { kind: 'question' | 'refused'; text: string } {
  const computed = db.computeMealMacros(ingredients)
  const question = typeof db.doubtAboutLoggedMeal === 'function' ? db.doubtAboutLoggedMeal(computed, slot) : null
  if (question) return { kind: 'question', text: question }
  const built = buildMealLogProposal({
    rawArgs: { food_name: name, meal_slot: slot },
    computed: { kcal: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat, unmatched: computed.unmatched, coverage: computed.coverage },
    assumptions: [], profileId: 'p1', todayDate: '2026-10-09',
  })
  return built.ok
    ? { kind: 'card', kcal: built.payload.macros.kcal, text: JSON.stringify(built.diff) }
    : { kind: 'refused', text: built.reason }
}

console.log('\n1. Everyday counted foods come to a sensible weight (both copies)\n')
{
  // [what was said, the parsed line, lightest and heaviest believable grams]
  // The bands are a kitchen's, not the table's exact figure: they fail on
  // "2 g" and on "2 kg", and pass any honest reference weight between.
  const TABLE: [string, Line, number, number][] = [
    ['2 eggs (unit: whole)', { name: 'egg', quantity: 2, unit: 'whole' }, 80, 140],
    ['2 eggs (unit: eggs)', { name: 'egg', quantity: 2, unit: 'eggs' }, 80, 140],
    ['2 eggs (unit: egg)', { name: 'eggs', quantity: 2, unit: 'egg' }, 80, 140],
    ['2 eggs (unit: piece)', { name: 'scrambled egg', quantity: 2, unit: 'piece' }, 80, 140],
    ['2 eggs (unit: pieces)', { name: 'eggs', quantity: 2, unit: 'pieces' }, 80, 140],
    ['2 eggs (unit: each)', { name: 'egg', quantity: 2, unit: 'each' }, 80, 140],
    ['2 eggs (unit: item)', { name: 'egg', quantity: 2, unit: 'item' }, 80, 140],
    ['2 eggs (unit: "")', { name: 'egg', quantity: 2, unit: '' }, 80, 140],
    ['2 large eggs', { name: 'egg', quantity: 2, unit: 'large' }, 100, 140],
    ['2 "large egg" by count', { name: 'large egg', quantity: 2, unit: 'whole' }, 100, 140],
    ['2 slices of bread', { name: 'bread', quantity: 2, unit: 'slices' }, 50, 100],
    ['2 slices of bread (unit: "slices of")', { name: 'white bread', quantity: 2, unit: 'slices of' }, 50, 100],
    ['2 slice wholemeal bread', { name: 'wholemeal bread', quantity: 2, unit: 'slice' }, 50, 100],
    ['1 large banana', { name: 'banana', quantity: 1, unit: 'large' }, 110, 160],
    ['1 small banana', { name: 'banana', quantity: 1, unit: 'small' }, 80, 117],
    ['1 banana', { name: 'banana', quantity: 1, unit: 'whole' }, 90, 150],
    ['1 banana (unit: banana)', { name: 'banana', quantity: 1, unit: 'banana' }, 90, 150],
    ['1 large apple', { name: 'apple', quantity: 1, unit: 'large' }, 185, 240],
    ['1 orange', { name: 'orange', quantity: 1, unit: 'whole' }, 100, 200],
    ['2 kiwi', { name: 'kiwi', quantity: 2, unit: 'whole' }, 100, 180],
    ['1 tortilla wrap', { name: 'tortilla wrap', quantity: 1, unit: 'whole' }, 40, 80],
    ['1 large wrap', { name: 'wrap', quantity: 1, unit: 'large' }, 55, 90],
    ['1 medium wrap', { name: 'wrap', quantity: 1, unit: 'medium' }, 40, 80],
    ['5 rye crispbreads', { name: 'rye crispbreads', quantity: 5, unit: 'whole' }, 40, 65],
    ['2 crispbread (unit: slices)', { name: 'crispbread', quantity: 2, unit: 'slices' }, 15, 30],
    ['2 rice cakes', { name: 'rice cakes', quantity: 2, unit: 'whole' }, 14, 24],
    ['2 weetabix', { name: 'weetabix', quantity: 2, unit: 'biscuits' }, 30, 45],
    ['1 croissant', { name: 'croissant', quantity: 1, unit: 'whole' }, 40, 75],
    ['1 bagel', { name: 'bagel', quantity: 1, unit: 'whole' }, 80, 110],
    ['1 can of tuna', { name: 'canned tuna', quantity: 1, unit: 'can' }, 90, 150],
    ['1 tin of tuna', { name: 'tuna in water', quantity: 1, unit: 'tin' }, 90, 150],
    ['1 salmon fillet (unit: fillet)', { name: 'salmon', quantity: 1, unit: 'fillet' }, 85, 150],
    ['1 salmon fillet (by count)', { name: 'salmon fillet', quantity: 1, unit: 'whole' }, 85, 150],
    ['2 cod fillets', { name: 'cod', quantity: 2, unit: 'fillets' }, 180, 300],
    ['1 chicken breast', { name: 'chicken breast', quantity: 1, unit: 'whole' }, 100, 180],
    ['1 pot of natural yoghurt', { name: 'natural yoghurt', quantity: 1, unit: 'pot' }, 100, 180],
    ['2 chicken breasts (unit: breasts)', { name: 'chicken', quantity: 2, unit: 'breasts' }, 0, 0], // see below: bare "chicken" is not chicken breast
    ['3 rashers of bacon', { name: 'bacon', quantity: 3, unit: 'rashers' }, 45, 100],
    ['3 bacon rashers (by count)', { name: 'bacon rashers', quantity: 3, unit: 'whole' }, 45, 100],
    ['2 sausages', { name: 'pork sausages', quantity: 2, unit: 'whole' }, 60, 130],
    ['2 slices of ham', { name: 'ham', quantity: 2, unit: 'slices' }, 30, 70],
    ['1 slice of cheddar', { name: 'cheddar', quantity: 1, unit: 'slice' }, 15, 35],
    ['1 glass of whole milk', { name: 'whole milk', quantity: 1, unit: 'glass' }, 180, 260],
    ['2 garlic cloves (by count)', { name: 'garlic cloves', quantity: 2, unit: 'whole' }, 4, 12],
    ['1 medium onion', { name: 'onion', quantity: 1, unit: 'medium' }, 80, 160],
    ['1 large onion', { name: 'onion', quantity: 1, unit: 'large' }, 120, 200],
    ['2 tomatoes', { name: 'tomatoes', quantity: 2, unit: 'whole' }, 160, 320],
    ['1 bell pepper', { name: 'bell pepper', quantity: 1, unit: 'whole' }, 90, 180],
    ['half an avocado', { name: 'avocado', quantity: 1, unit: 'half' }, 50, 110],
    ['half a banana (unit: half)', { name: 'banana', quantity: 1, unit: 'half' }, 45, 75],
    ['1 baked potato', { name: 'jacket potato', quantity: 1, unit: 'medium' }, 140, 260],
    ['a handful of almonds', { name: 'almonds', quantity: 1, unit: 'handful' }, 15, 35],
    ['10 almonds', { name: 'almonds', quantity: 10, unit: 'whole' }, 9, 16],
    ['1 can of chickpeas', { name: 'chickpeas', quantity: 1, unit: 'can' }, 200, 420],
    ['1 scoop whey', { name: 'whey protein powder', quantity: 1, unit: 'scoop' }, 22, 40],
  ]
  for (const [said, line, min, max] of TABLE) {
    if (min === 0 && max === 0) continue // handled in section 3
    for (const [copy, db] of COPIES) {
      const g = gramsOf(db, line)
      check(`${said} is ${min}-${max} g in the ${copy} copy`, g != null && g >= min && g <= max, g)
    }
  }
}

console.log('\n2. A measured amount is exactly what it was\n')
for (const [copy, db] of COPIES) {
  check(`150 g chicken breast is 150 g (${copy})`, gramsOf(db, { name: 'chicken breast', quantity: 150, unit: 'g' }) === 150)
  check(`150 "grams" is 150 g (${copy})`, gramsOf(db, { name: 'chicken breast', quantity: 150, unit: 'grams' }) === 150)
  check(`200 ml milk is 200 g (${copy})`, gramsOf(db, { name: 'milk whole', quantity: 200, unit: 'ml' }) === 200)
  check(`1 tbsp olive oil is the oil's own 14 g, not the 15 g default (${copy})`, gramsOf(db, { name: 'olive oil', quantity: 1, unit: 'tbsp' }) === 14)
  check(`2 "tablespoons" honey is 42 g (${copy})`, gramsOf(db, { name: 'honey', quantity: 2, unit: 'tablespoons' }) === 42)
  check(`1 tsp of a food with no spoon weight is the 5 g default (${copy})`, gramsOf(db, { name: 'paprika', quantity: 1, unit: 'tsp' }) === 5)
  check(`0.5 kg potatoes is 500 g (${copy})`, gramsOf(db, { name: 'potato', quantity: 0.5, unit: 'kg' }) === 500)
  check(`a food the table does not know still weighs what the scale said (${copy})`, db.unitToGrams(null, 'g', 80) === 80)
}

console.log('\n3. An amount that cannot be read is UNKNOWN — never the bare number\n')
{
  const UNREADABLE: [string, Line][] = [
    ['1 large latte — milk has no "large"', { name: 'whole milk', quantity: 1, unit: 'large' }],
    ['1 serving of chicken breast', { name: 'chicken breast', quantity: 1, unit: 'serving' }],
    ['1 bowl of pasta', { name: 'pasta', quantity: 1, unit: 'bowl' }],
    ['1 plate of rice', { name: 'white rice', quantity: 1, unit: 'plate' }],
    ['3 "portions" of quark', { name: 'quark', quantity: 3, unit: 'portions' }],
    ['2 of a food with no piece weight (hummus)', { name: 'hummus', quantity: 2, unit: 'whole' }],
    ['a made-up unit', { name: 'oats', quantity: 4, unit: 'xyzzy' }],
    ['2 chicken "breasts" when the food resolved is not chicken breast', { name: 'chicken', quantity: 2, unit: 'breasts' }],
    ['a count of a food the table does not know', { name: 'flargle root', quantity: 2, unit: 'whole' }],
    ['a size of a food the table does not know', { name: 'latte', quantity: 1, unit: 'large' }],
  ]
  for (const [said, line] of UNREADABLE) {
    for (const [copy, db] of COPIES) {
      const g = gramsOf(db, line)
      check(`${said}: unknown, not ${line.quantity} g (${copy})`, g === null, g)
    }
  }
  for (const [copy, db] of COPIES) {
    // The shape that hid H6: a real food beside one whose amount is unknown.
    const m = db.computeMealMacros([
      { name: 'tortilla wrap', quantity: 1, unit: 'whole' },
      { name: 'whole milk', quantity: 1, unit: 'large' },
    ])
    check(`an unreadable amount is listed as not counted (${copy})`, m.unmatched.includes('whole milk'), m.unmatched)
    check(`...and named as an AMOUNT problem, not an unknown food (${copy})`, (m.amountUnknown ?? []).includes('whole milk'), m.amountUnknown)
    check(`...and costs coverage by LINE: one of two lines is 50%, where a 1 g weight read 98% (${copy})`,
      Math.abs(m.coverage - 0.5) < 0.001, m.coverage)
    check(`...and adds nothing to the calories (${copy})`, m.kcal > 150 && m.kcal < 220, m.kcal)
    const food = db.computeMealMacros([{ name: 'flargle root', quantity: 50, unit: 'g' }, { name: 'oats', quantity: 50, unit: 'g' }])
    check(`an unknown FOOD with a known weight is still costed by weight, as before (${copy})`, Math.abs(food.coverage - 0.5) < 0.001 && (food.amountUnknown ?? ['x']).length === 0, food)
    const all = db.computeMealMacros([{ name: 'pasta', quantity: 1, unit: 'bowl' }])
    check(`a meal made only of unreadable amounts has coverage 0, not 100% (${copy})`, all.coverage === 0 && all.kcal === 0, all)
    const clean = db.computeMealMacros([{ name: 'oats', quantity: 50, unit: 'g' }, { name: 'egg', quantity: 2, unit: 'whole' }])
    check(`a meal that is all readable has coverage exactly 1 (${copy})`, clean.coverage === 1 && clean.unmatched.length === 0, clean)
  }
}

console.log('\n4. The two meals from the test log\n')
{
  // The model only parses; these are the lines it plausibly sent. Which unit
  // word it used for the eggs is not recorded — eight candidates all gave the
  // 266 on the card — so every one of them is run.
  const EGG_UNITS = ['whole', 'egg', 'eggs', 'piece', 'each', 'item', 'large', 'medium', '']
  for (const [copy, db] of COPIES) {
    for (const unit of EGG_UNITS) {
      const out = logOutcome(db, [
        { name: 'scrambled egg', quantity: 2, unit },
        { name: 'bread', quantity: 2, unit: 'slice' },
        { name: 'butter', quantity: 10, unit: 'g' },
      ], 'breakfast', '2 scrambled eggs on 2 slices of buttered toast')
      check(`eggs on toast, eggs sent as "${unit}": a card of 350+ kcal (${copy})`, out.kind === 'card' && out.kcal >= 350 && out.kcal <= 520, out)
    }
    // "slices" in the plural was 2 g of bread.
    const plural = logOutcome(db, [
      { name: 'egg', quantity: 2, unit: 'eggs' }, { name: 'white bread', quantity: 2, unit: 'slices' }, { name: 'butter', quantity: 10, unit: 'g' },
    ], 'breakfast', 'eggs on toast')
    check(`...and with every unit in the plural (${copy})`, plural.kind === 'card' && plural.kcal >= 350, plural)

    // The wrap and the latte, as sent on the day (reproduced to the decimal by
    // the tracer): a dish name with unit whole, and "whole milk latte", large.
    const WRAP_AND_LATTE: [string, Line[]][] = [
      ['as sent on the day', [{ name: 'chicken caesar wrap', quantity: 1, unit: 'whole' }, { name: 'whole milk latte', quantity: 1, unit: 'large' }]],
      ['latte named plainly', [{ name: 'chicken caesar wrap', quantity: 1, unit: 'whole' }, { name: 'latte', quantity: 1, unit: 'large' }]],
      ['latte as a serving', [{ name: 'chicken caesar wrap', quantity: 1, unit: 'whole' }, { name: 'whole milk latte', quantity: 1, unit: 'serving' }]],
      ['latte as a cup', [{ name: 'chicken caesar wrap', quantity: 1, unit: 'whole' }, { name: 'latte', quantity: 1, unit: 'cup' }]],
    ]
    for (const [how, lines] of WRAP_AND_LATTE) {
      const out = logOutcome(db, lines, 'lunch', 'chicken caesar wrap and a large latte')
      check(`wrap and latte, ${how}: never a confident card under 300 kcal (${copy})`,
        out.kind !== 'card' || out.kcal >= 300, out)
      check(`...it is a question or a refusal, or a card of 350+ (${copy})`,
        out.kind === 'question' || out.kind === 'refused' || (out.kind === 'card' && out.kcal >= 350), out)
    }
    const asSent = logOutcome(db, WRAP_AND_LATTE[0][1], 'lunch', 'chicken caesar wrap and a large latte')
    check(`...and for the meal as sent, the app ASKS how big the latte was (${copy})`,
      asSent.kind === 'question' && /How big/.test(asSent.text) && /latte/.test(asSent.text), asSent)
  }
}

console.log('\n5. The stop in front of the card\n')
for (const [copy, db] of COPIES) {
  const doubt = (lines: Line[], slot: string) => {
    const c = db.computeMealMacros(lines)
    return typeof db.doubtAboutLoggedMeal === 'function' ? db.doubtAboutLoggedMeal(c, slot) : undefined
  }
  check(`the stop exists (${copy})`, typeof db.doubtAboutLoggedMeal === 'function')
  check(`a real breakfast is not questioned (${copy})`,
    doubt([{ name: 'egg', quantity: 2, unit: 'whole' }, { name: 'bread', quantity: 2, unit: 'slice' }], 'breakfast') === null)
  const tiny = doubt([{ name: 'black coffee', quantity: 300, unit: 'ml' }], 'breakfast')
  check(`a "breakfast" of 3 kcal is questioned, with the figure (${copy})`, typeof tiny === 'string' && /3 kcal/.test(tiny) && /breakfast/.test(tiny), tiny)
  check(`...and the same coffee as a snack is not: a coffee is a snack (${copy})`,
    doubt([{ name: 'black coffee', quantity: 300, unit: 'ml' }], 'snack') === null)
  check(`a 99 kcal lunch is questioned and a 101 kcal one is not (${copy})`,
    typeof doubt([{ name: 'chicken breast', quantity: 60, unit: 'g' }], 'lunch') === 'string'
    && doubt([{ name: 'chicken breast', quantity: 62, unit: 'g' }], 'lunch') === null,
    [db.computeMealMacros([{ name: 'chicken breast', quantity: 60, unit: 'g' }]).kcal, db.computeMealMacros([{ name: 'chicken breast', quantity: 62, unit: 'g' }]).kcal])
  const two = doubt([{ name: 'pasta', quantity: 1, unit: 'bowl' }, { name: 'whole milk', quantity: 1, unit: 'large' }, { name: 'egg', quantity: 1, unit: 'whole' }], 'dinner')
  check(`two unreadable amounts are asked about together, in one question (${copy})`,
    typeof two === 'string' && /pasta and whole milk/.test(two) && /How big were/.test(two) && (two.match(/\?/g) ?? []).length === 1, two)
  // An unknown FOOD is not a "how big" question: the card's own verifier
  // names it. The stop says nothing so the two never talk over each other.
  check(`a food the table does not know is left to the card's verifier (${copy})`,
    doubt([{ name: 'flargle root', quantity: 200, unit: 'g' }, { name: 'oats', quantity: 100, unit: 'g' }], 'lunch') === null)
  // A clove of garlic really is 3 g. A counted food that small is only
  // doubted when the food itself says one of them weighs more.
  check(`a counted food that really is tiny is not questioned — 1 clove of garlic in a dinner (${copy})`,
    doubt([{ name: 'garlic', quantity: 1, unit: 'clove' }, { name: 'chicken breast', quantity: 150, unit: 'g' }], 'dinner') === null)
}
{
  // The tripwire behind the amounts fix: were the old fall-through ever put
  // back, a counted egg would come to 2 g. Hand the stop that state directly.
  const egg = appDb.lookupIngredient('egg')
  const forged = { kcal: 265, unmatched: [], lines: [
    { input: { name: 'egg', quantity: 2, unit: 'whole' }, entry: egg, grams: 2, basis: 'counted' as const, macros: null },
    { input: { name: 'bread', quantity: 72, unit: 'g' }, entry: appDb.lookupIngredient('bread'), grams: 72, basis: 'measured' as const, macros: null },
  ] }
  const fn = (appDb as unknown as Db).doubtAboutLoggedMeal
  const q = typeof fn === 'function' ? fn(forged, 'breakfast') : undefined
  check('a counted food that came to 2 g is questioned even though the total looks like a meal', typeof q === 'string' && /How big was the egg\?/.test(q), q)
  const weighed = { ...forged, lines: [{ ...forged.lines[0], basis: 'measured' as const }, forged.lines[1]] }
  check('...while 2 g that was WEIGHED is believed', typeof fn === 'function' && fn(weighed, 'breakfast') === null)
}

console.log('\n6. What the card says\n')
{
  const base = {
    rawArgs: { food_name: 'Eggs on toast', meal_slot: 'breakfast' },
    computed: { kcal: 417, protein: 19.6, carbs: 35.3, fat: 21.6, unmatched: [] as string[], coverage: 1 },
    profileId: 'p1', todayDate: '2026-10-09',
  }
  const withAssumptions = buildMealLogProposal({ ...base, assumptions: ['assumed large eggs', 'Assuming whole wheat toast', 'assume 10 g butter.', '10 g jam'] })
  const text = withAssumptions.ok ? JSON.stringify(withAssumptions.diff) : ''
  check('assumptions print once, as "Assumed: …"', /Assumed: large eggs; whole wheat toast; 10 g butter; 10 g jam\./.test(text), text)
  check('...never "Assuming assumed"', withAssumptions.ok && !/assum\w*\s+assum/i.test(text), text)
  const none = buildMealLogProposal({ ...base, assumptions: [] })
  check('no assumptions, no "Assumed" line', none.ok && !/Assumed/.test(JSON.stringify(none.diff)), none)
  const partial = buildMealLogProposal({ ...base, computed: { ...base.computed, unmatched: ['mystery sauce'], coverage: 0.9 }, assumptions: [] })
  const ptext = partial.ok ? JSON.stringify(partial.diff) : ''
  check('a food left out of the numbers is named on the card: "Not counted: mystery sauce"', /Not counted: mystery sauce/.test(ptext), ptext || partial)
  check('...as a warning line, not buried in the quote', partial.ok && (partial.diff as { implications?: { severity: string; text: string }[] }).implications?.some(i => i.severity === 'warn' && /Not counted/.test(i.text)) === true, partial)
  const small = buildMealLogProposal({ ...base, rawArgs: { food_name: 'Coffee', meal_slot: 'lunch' }, computed: { ...base.computed, kcal: 40 }, assumptions: [] })
  check('the card\'s own verifier also refuses a 40 kcal lunch', small.ok === false && /40 kcal/.test(small.ok ? '' : small.reason), small)
  const snack = buildMealLogProposal({ ...base, rawArgs: { food_name: 'Coffee', meal_slot: 'snack' }, computed: { ...base.computed, kcal: 40 }, assumptions: [] })
  check('...and logs a 40 kcal snack', snack.ok === true, snack)
}

console.log('\n7. The coach\'s handler asks the stop before it hands over a card\n')
{
  const fnRaw = raw('supabase/functions/chat-gemini/index.ts')
  const fn = stripComments(fnRaw)
  const handler = fn.slice(fn.indexOf('name === "log_meal"'), fn.indexOf('if (name === "log_workout")'))
  check('the log_meal handler was located (sanity check on this check)', handler.length > 300, handler.length)
  const iCompute = handler.indexOf('computeMealMacros(')
  const iDoubt = handler.indexOf('doubtAboutLoggedMeal(')
  const iCard = handler.indexOf('kind: "propose_meal_log"')
  check('it costs the meal, asks the stop, and only then builds the card — in that order',
    iCompute > 0 && iDoubt > iCompute && iCard > iDoubt, { iCompute, iDoubt, iCard })
  // The value has to be USED: a call whose answer is dropped is the 9 Sep
  // "the string is there" mistake. Between the call and the card there must be
  // a return whose reply is the stop's own question.
  const between = iDoubt > 0 && iCard > iDoubt ? handler.slice(iDoubt, iCard) : ''
  const held = /const (\w+) = doubtAboutLoggedMeal\(/.exec(handler)?.[1] ?? '∅'
  check('the stop\'s answer is kept in a variable', held !== '∅', held)
  check('...and a doubt returns that question as the reply, before the card',
    new RegExp(`if \\(${held}\\)[\\s\\S]{0,400}reply: ${held}\\b`).test(between) || new RegExp(`if \\(!asked && ${held}\\)[\\s\\S]{0,400}reply: ${held}\\b`).test(between), between.slice(0, 300))
  check('the handler imports the stop from the shared food database', /import \{[^}]*doubtAboutLoggedMeal[^}]*\} from "\.\.\/_shared\/food-db\.ts"/.test(fn))
  check('logged food is no longer told to bend to the plan ("Scale portions to the meal slot budget")', !/Scale portions to the meal slot budget/i.test(fn))
  check('...the instruction to log straight away is still there', /When a food LOGGING command is given \(log_meal\), execute it immediately/.test(fn))
  check('a macro question no longer claims a share "by weight" (coverage is not only weight now)', !/of the meal by weight/.test(handler))
}

console.log('\n8. The shopping list (M23): five crispbreads are not five grams\n')
{
  const crisp = parseIngredientLine('5 rye crispbreads')
  const g = resolveGroceryTarget(crisp.name).toGrams(crisp.quantity, crisp.unit)
  check('"5 rye crispbreads" is about 50 g on the list', g != null && g >= 40 && g <= 65, { crisp, g })
  const cloves = parseIngredientLine('2 garlic cloves')
  const gc = resolveGroceryTarget(cloves.name).toGrams(cloves.quantity, cloves.unit)
  check('"2 garlic cloves" is two cloves, not 2 g', gc != null && gc >= 4 && gc <= 12, { cloves, gc })
  const odd = parseIngredientLine('2 hummus')
  check('a count the food database cannot weigh is unknown to the list, not grams', resolveGroceryTarget(odd.name).toGrams(odd.quantity, odd.unit) === null)
}

console.log('\n9. A typed line: an amount said in words, and the "of" a unit leaves behind\n')
{
  const grams = (text: string) => {
    const p = parseIngredientLine(text)
    return appDb.unitToGrams(appDb.lookupIngredient(p.name), p.unit, p.quantity, p.name)
  }
  // "3 eggs, 150g greek yoghurt, a banana" is the custom-meal prompt's own
  // example. "a banana" was ONE GRAM of banana.
  const W: [string, number, number][] = [
    ['a banana', 90, 150], ['an egg', 40, 70], ['two eggs', 80, 140], ['one large egg', 50, 70],
    ['half an avocado', 50, 110], ['a handful of almonds', 15, 35], ['a medium onion', 80, 160],
    ['2 slices of bread', 50, 100], ['1 can of chickpeas', 200, 420], ['3 rashers of bacon', 45, 100],
  ]
  for (const [text, min, max] of W) {
    const g = grams(text)
    check(`"${text}" is ${min}-${max} g`, g != null && g >= min && g <= max, { parsed: parseIngredientLine(text), g })
  }
  check('"2 slices of toast" names the food "toast", not "of toast"', parseIngredientLine('2 slices of toast').name === 'toast', parseIngredientLine('2 slices of toast'))
  check('"100g of chicken breast" is 100 g of chicken breast', parseIngredientLine('100g of chicken breast').name === 'chicken breast' && grams('100g of chicken breast') === 100)
  const pinch = grams('1 pinch salt')
  check('"1 pinch salt" is a trace weight (under a gram), not unknown and not 1 g', pinch != null && pinch > 0 && pinch < 1, pinch)
  check('"2 pinches of salt" reads the plural', parseIngredientLine('2 pinches of salt').unit === 'pinch' && parseIngredientLine('2 pinches of salt').name === 'salt', parseIngredientLine('2 pinches of salt'))
  // Words that are not a count are left exactly as they were.
  const little = parseIngredientLine('a little olive oil')
  check('"a little olive oil" is NOT read as one olive oil', little.name === 'a little olive oil' && little.unit === 'g', little)
  const typed = appDb.computeMealMacros(['3 eggs', '150g greek yoghurt', 'a banana'].map(parseIngredientLine))
  check('"3 eggs, 150g greek yoghurt, a banana" comes to over 400 kcal with the banana in it (was 319)', typed.kcal > 400 && typed.kcal < 520 && typed.coverage === 1, typed.kcal)
}
{
  // The refusal has to be TRUE. "2 hummus" is a food the app knows in an
  // amount it cannot read; "I don't have hummus in my food data" would be a
  // false statement about the app, and "more everyday ingredients" no help.
  const base = { profileId: 'p', targets: { calories: 1700, protein: 164, carbs: 150, fat: 50 }, mealsPerDay: 3, includeSnacks: true, dietaryPreferences: [], dislikedFoods: [], todayDate: '2026-10-09' }
  const refused = buildCustomMealProposal({ ...base, rawArgs: { meal_slot: 'breakfast', food_lines: ['2 hummus', '100g oats'] } })
  check('a custom meal with an unreadable amount is refused, not costed at 2 g', refused.ok === false, refused)
  check('...saying it could not put a weight on the hummus', !refused.ok && /couldn't put a weight on hummus/.test(refused.reason) && /rough weight in grams/.test(refused.reason), refused)
  check('...and NOT that hummus is missing from the food data', !refused.ok && !/don't have hummus/.test(refused.reason), refused)
  const unknownFood = buildCustomMealProposal({ ...base, rawArgs: { meal_slot: 'breakfast', food_lines: ['50g flargle root', '30g oats'] } })
  check('a food the app does not know still gets the "not in my food data" sentence', !unknownFood.ok && /don't have flargle root in my food data/.test(unknownFood.reason), unknownFood)
}

console.log('\n10. Every piece weight names a real food and carries its source\n')
{
  const src = raw('src/lib/food-db.ts')
  const start = src.indexOf('const PIECE_WEIGHTS')
  const block = start > 0 ? src.slice(start, src.indexOf('\n}\n', start)) : ''
  const rows = [...block.matchAll(/^\s*'([^']+)':\s*\{([^}]*)\},?\s*(\/\/.*)?$/gm)]
  check('the piece-weight table was found and has rows (sanity check on this check)', rows.length >= 40, rows.length)
  const names = new Set((appDb.FOOD_DB as { name: string }[]).map(e => e.name))
  const orphans = rows.map(r => r[1]).filter(n => !names.has(n))
  check('every row is the exact name of a food in the table (a typo would silently weigh nothing)', orphans.length === 0, orphans)
  const unsourced = rows.filter(r => !r[3] || r[3].replace(/\/\/\s*/, '').trim().length < 8).map(r => r[1])
  check('every row says where its figure came from', unsourced.length === 0, unsourced)
  const absurd = rows.flatMap(r => [...r[2].matchAll(/(\w+):\s*([\d.]+)/g)].map(m => [r[1], m[1], Number(m[2])] as const)).filter(([, , g]) => !(g > 0.1 && g <= 500))
  check('no piece weighs nothing or more than half a kilo', absurd.length === 0, absurd)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
console.log('Counted foods weigh what they weigh, and an amount nobody could read is asked about.\n')
