// ---------------------------------------------------------------------------
// CHANGING ONE FOOD INSIDE A MEAL — the safety half.
//
// Ashley chose "make meals as adjustable as workouts" on 12 Sep 2026. Three
// operations were MISSING from CLAUDE.md's must-have list: remove a food,
// replace a food, resize a portion.
//
// THIS IS DIETARY ENFORCEMENT, so the rule that matters is not that the three
// operations work — it is that none of them is a way around the checks. Every
// edited meal goes back through verifyProposal in keepPortions mode, the same
// call a custom meal makes, because "a parallel 'custom' path with its own
// subset of the checks is how the almond butter got through the swap path"
// (meal-generation.ts). A removal cannot introduce an allergen; a replacement
// obviously can; both are verified identically anyway, because deciding
// per-operation which checks to run is the shape of that bug.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import {
  buildMealFoodRemoveProposal, buildMealFoodReplaceProposal, buildMealFoodResizeProposal,
  matchIngredient, MIN_FOODS_PER_MEAL,
} from '../src/lib/meal-food-edit'
import { computeMealMacros } from '../src/lib/food-db'
import { parseIngredientLines, withQuantity } from '../src/lib/portion-scaler'
import type { MacroTargets } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const LINES = ['122g raw chicken breast', '80g white rice', '100g broccoli', '1 tbsp olive oil']
const macrosOf = (lines: string[]): MacroTargets => {
  const m = computeMealMacros(parseIngredientLines(lines))
  return { calories: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat } as MacroTargets
}
const mealOf = (lines: string[]) => ({ name: 'Chicken, rice and broccoli', ingredients: lines, macros: macrosOf(lines) })
const base = (over: Record<string, unknown> = {}) => ({
  currentMeal: mealOf(LINES),
  profileId: 'p1', todayDate: '2026-09-12',
  targets: { calories: 2400, protein: 180, carbs: 240, fat: 70 } as MacroTargets,
  mealsPerDay: 3, includeSnacks: false,
  dietaryPreferences: [] as string[], dislikedFoods: [] as string[],
  ...over,
})
const row = (r: { diff: { rows: { field: string; note?: string }[] } }, field: string) => r.diff.rows.find(x => x.field === field)
/**
 * The names of the foods a verified option ended up with.
 *
 * NOT `option.ingredients` DIRECTLY: those are parsed {name, quantity, unit}
 * objects, and `/chicken/i.test(obj)` coerces to "[object Object]" and passes
 * whatever the meal contains. The first version of this file did exactly that
 * and its opening check was green while proving nothing.
 */
const foodsIn = (o: { ingredients: { name: string; quantity: number; unit: string }[] }) => o.ingredients.map(i => i.name)

console.log('\n1. Taking one food out')
{
  const r = buildMealFoodRemoveProposal({ ...base(), rawArgs: { meal_slot: 'lunch', food: 'chicken' } })
  check('it is allowed', r.ok === true, r.ok === false ? r.reason : '')
  if (r.ok) {
    const foods = foodsIn(r.payload.option)
    check('the chicken is gone from the meal', !foods.some(n => /chicken/i.test(n)), foods)
    check('...and nothing else moved', foods.length === LINES.length - 1
      && ['rice', 'broccoli', 'olive oil'].every(f => foods.some(n => n.includes(f))), foods)
    // HER RULING: say what it costs. The number must be real, not a shrug.
    const p = row(r, 'Protein')
    check('the card says what the protein costs, as a negative', !!p?.note?.startsWith('-'), p)
    check('...and the calories too', !!row(r, 'Calories')?.note?.startsWith('-'), row(r, 'Calories'))
    // HER RULING, PART TWO (12 Sep 2026): the offer is 2-3 NAMED foods, not
    // an invitation to type one. Pinned on the offer being real and usable —
    // a list that exists, is capped, and whose entries carry an amount — not
    // on the sentence beside it, which is wording and will move.
    const alts = r.diff.alternatives ?? []
    check('...and offers named swaps, not a text box', alts.length >= 2 && alts.length <= 3, alts)
    check('...each one a food and an amount', alts.every(a => /^\d+g \S/.test(a.label)), alts)
    check('...each saying what it keeps', alts.every(a => /same (protein|carbs|fat)/.test(a.note)), alts)
    check('...and none of them the food being removed', !alts.some(a => /chicken/i.test(a.label)), alts)
    check('...while promising NOT to quietly re-portion the rest',
      r.diff.implications.some(i => /nothing is re-portioned/i.test(i.text)), r.diff.implications)
    check('it is undoable', r.diff.reversible === true)
  }
}

console.log('\n2. A meal is not a way to reach zero foods')
{
  const one = mealOf(['122g raw chicken breast'])
  const r = buildMealFoodRemoveProposal({ ...base({ currentMeal: one }), rawArgs: { meal_slot: 'lunch', food: 'chicken' } })
  check(`removing the last food is refused (floor ${MIN_FOODS_PER_MEAL})`, r.ok === false, r)
  check('...and says what to do instead', r.ok === false && /swap the whole meal/i.test(r.reason), r)
}

console.log('\n3. Swapping one food for another')
{
  const r = buildMealFoodReplaceProposal({ ...base(), rawArgs: { meal_slot: 'lunch', food: 'rice', with_food: '200g potato' } })
  check('it is allowed', r.ok === true, r.ok === false ? r.reason : '')
  if (r.ok) {
    const foods = foodsIn(r.payload.option)
    check('the rice is out and the potato is in',
      !foods.some(n => /rice/i.test(n)) && foods.some(n => /potato/i.test(n)), foods)
    check('...in the same position, so the meal reads the same way',
      /potato/i.test(foods[1] ?? ''), foods)
    check('...and the other three are untouched', foods.length === 4, foods)
  }
  // THE AMOUNT IS HERS AND MUST BE STATED — same rule as adding a food.
  const vague = buildMealFoodReplaceProposal({ ...base(), rawArgs: { meal_slot: 'lunch', food: 'rice', with_food: 'potato' } })
  check('a replacement with no amount is a question, not a guess',
    vague.ok === false && /how much/i.test(vague.reason), vague)
}

console.log('\n4. Resizing a portion keeps her words')
{
  const r = buildMealFoodResizeProposal({ ...base(), rawArgs: { meal_slot: 'lunch', food: 'rice', amount: 40 } })
  check('it is allowed', r.ok === true, r.ok === false ? r.reason : '')
  if (r.ok) {
    const rice = r.payload.option.ingredients.find(i => /rice/i.test(i.name))
    check('only the number changed', rice?.quantity === 40 && rice?.unit === 'g' && rice?.name === 'white rice', rice)
    check('...and the carbs came down with it', (row(r, 'Carbs')?.note ?? '').startsWith('-'), row(r, 'Carbs'))
  }
  // THE PARSER NORMALISES UNITS ("slices" -> "slice"), so rebuilding a line
  // from its parsed form rewrites her text. Resizing edits the number in
  // place instead, and this is where that is pinned.
  check('a plural unit survives a resize verbatim',
    withQuantity('3 slices wholemeal bread', 2) === '2 slices wholemeal bread',
    withQuantity('3 slices wholemeal bread', 2))
  check('a line with no amount cannot be resized, and says so',
    withQuantity('salt to taste', 5) === null)
  const noAmount = buildMealFoodResizeProposal({ ...base({ currentMeal: mealOf(['salt to taste', '80g white rice']) }),
    rawArgs: { meal_slot: 'lunch', food: 'salt', amount: 5 } })
  check('...and the app offers to swap it instead', noAmount.ok === false && /swap it instead/i.test(noAmount.reason), noAmount)
}

console.log('\n5. Which food she meant is asked, never guessed')
{
  const two = ['100g chicken breast', '50g chicken thigh', '80g rice']
  const m = matchIngredient(two, 'chicken')
  check('two matching foods is a question', m.ok === false && m.reason === 'ambiguous', m)
  check('...naming both, so she can pick', m.ok === false && m.candidates.length === 2, m)
  check('a food that is not there is not silently ignored',
    matchIngredient(two, 'salmon').ok === false)
  check('"the chicken" finds it without quoting the amount back',
    matchIngredient(['122g raw chicken breast', '80g rice'], 'the chicken').ok === true)
  const amb = buildMealFoodRemoveProposal({ ...base({ currentMeal: mealOf(two) }), rawArgs: { meal_slot: 'lunch', food: 'chicken' } })
  check('the builder refuses rather than removing the wrong one',
    amb.ok === false && /which one/i.test(amb.reason), amb)
}

console.log('\n5b. The swaps offered when a food comes out')
{
  const alts = (over: Record<string, unknown>, food = 'chicken') => {
    const r = buildMealFoodRemoveProposal({ ...base(over), rawArgs: { meal_slot: 'lunch', food } })
    return r.ok ? (r.diff.alternatives ?? []) : []
  }

  // THE PROMISE THE OFFER MAKES. Every suggestion is a tap that must work —
  // so every one of them is fed straight back through the replace builder and
  // has to be accepted. This is the whole safety argument for the feature: an
  // offer is a claim that the confirm will succeed.
  const offered = alts({})
  check('every swap offered can actually be confirmed', offered.length > 0 && offered.every(a =>
    buildMealFoodReplaceProposal({ ...base(), rawArgs: { meal_slot: 'lunch', food: 'chicken', with_food: a.label } }).ok === true
  ), offered)

  // AND THE FILTERS REACH THE OFFER, not just the confirm. A card that lists a
  // food she cannot have has already done the harm by the time she taps it.
  const vegan = alts({ dietaryPreferences: ['vegan'] })
  check('a vegan filter leaves no meat on the offer', vegan.length === 0, vegan)
  const hated = alts({ dislikedFoods: ['turkey breast', 'turkey mince', 'venison'] })
  check('a disliked food is never offered', !hated.some(a => /turkey|venison/i.test(a.label)), hated)

  // WHAT SHE ALREADY EATS COMES FIRST — the difference between a suggestion a
  // trainer would make and one that merely matches the macros.
  const known = alts({ pantryFoods: ['turkey breast', 'salmon fillet'] })
  check('a food already on her plan leads the list',
    /turkey breast|salmon/i.test(known[0]?.label ?? ''), known)
  check('...and the offer is still capped at three', known.length <= 3, known)

  // A PORTION NOBODY WOULD SERVE IS NOT A SUGGESTION. Pinned with fixtures
  // that FORCE the far candidate to the front (a pantry entry jumps the
  // queue), because ranking by density means the ordinary case never gets
  // near the limits and a check that only looks at the ordinary case cannot
  // fail. Silken tofu has 5.5g of protein per 100g against whey's 80: the
  // arithmetic says 870g and nobody eats 870g of tofu.
  const grams = (l: string) => parseInt(l, 10)
  const whey = buildMealFoodRemoveProposal({
    ...base({ currentMeal: mealOf(['60g whey protein powder', '200ml semi skimmed milk', '1 banana']),
              pantryFoods: ['tofu silken'] }),
    rawArgs: { meal_slot: 'breakfast', food: 'whey' },
  })
  check('a swap needing a bucketful is not offered',
    whey.ok === true && !(whey.diff.alternatives ?? []).some(a => /tofu/i.test(a.label)),
    whey.ok ? whey.diff.alternatives : whey)
  const leaves = buildMealFoodRemoveProposal({
    ...base({ currentMeal: mealOf(['300g watercress', '122g raw chicken breast', '10g olive oil']),
              pantryFoods: ['garlic'] }),
    rawArgs: { meal_slot: 'lunch', food: 'watercress' },
  })
  check('...nor a swap that is a garnish beside what it replaces',
    leaves.ok === true && !(leaves.diff.alternatives ?? []).some(a => /garlic/i.test(a.label)),
    leaves.ok ? leaves.diff.alternatives : leaves)
  check('and the everyday case stays under the ceiling',
    offered.every(a => grams(a.label) <= 500), offered)

  // NOTHING TO CLOSE MEANS NOTHING OFFERED, rather than a stretch. Garlic and
  // not salt: salt carries no macros at all, so the portion clamp would catch
  // it too and the check would pass whatever this guard did. Two grams of
  // garlic carries two thirds of a gram of carbohydrate — real, and nothing
  // worth replacing — and the amount that would match it rounds to 5g, which
  // sails through the clamp. Only the guard stops it.
  const trace = buildMealFoodRemoveProposal({
    ...base({ currentMeal: mealOf(['122g raw chicken breast', '80g white rice', '2g garlic']) }),
    rawArgs: { meal_slot: 'lunch', food: 'garlic' },
  })
  check('a pinch of something is removed without a pretend swap',
    trace.ok === true && (trace.diff.alternatives ?? []).length === 0,
    trace.ok ? trace.diff.alternatives : trace)
}

console.log('\n6. THE SAFETY HALF — no operation is a way round the checks')
{
  // A REPLACEMENT CAN INTRODUCE AN ALLERGEN. This is the one that matters.
  const nutFree = buildMealFoodReplaceProposal({
    ...base({ dietaryPreferences: ['nut-free'] }),
    rawArgs: { meal_slot: 'lunch', food: 'rice', with_food: '30g peanut butter' },
  })
  check('swapping in a nut under a nut-free filter is refused', nutFree.ok === false, nutFree)

  // AND A DISLIKE IS A BAN, not steering — the same rule the swap path holds.
  const disliked = buildMealFoodReplaceProposal({
    ...base({ dislikedFoods: ['mushroom'] }),
    rawArgs: { meal_slot: 'lunch', food: 'broccoli', with_food: '100g mushrooms' },
  })
  check('swapping in a disliked food is refused', disliked.ok === false, disliked)

  // A MADE-UP FOOD MUST NOT RIDE IN ON A REAL MEAL'S NUMBERS — the coverage
  // floor is what stops it, and it is measured over the whole proposal.
  const invented = buildMealFoodReplaceProposal({
    ...base(), rawArgs: { meal_slot: 'lunch', food: 'rice', with_food: '400g flargle root' },
  })
  check('swapping in a food the database has never heard of is refused', invented.ok === false, invented)

  // ALL THREE THROUGH ONE FUNCTION. Pinned on the source: a second verifier,
  // or one operation skipping it, is the defect this section exists for.
  const src = readFileSync('src/lib/meal-food-edit.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('there is exactly one call to the verifier in the whole module',
    (src.match(/verifyProposal\(/g) ?? []).length === 1, (src.match(/verifyProposal\(/g) ?? []).length)
  check('...and it is in keepPortions mode, like every other user-stated meal',
    /rejectLog, input\.dislikedFoods \?\? \[\], undefined, true\)/.test(src))
  check('all three operations go through the one settle path',
    (src.match(/return settle\(/g) ?? []).length === 3, (src.match(/return settle\(/g) ?? []).length)
}

console.log('\n7. Nothing is written without a confirm')
{
  const r = buildMealFoodRemoveProposal({ ...base(), rawArgs: { meal_slot: 'lunch', food: 'broccoli' } })
  check('a build returns a proposal, never a write', r.ok === true && 'payload' in r && 'diff' in r)
  check('...scoped so two of the same cannot stack',
    r.ok === true && r.scopeKey === 'p1:propose_meal_food_remove:lunch:2026-09-12', r.ok && r.scopeKey)
  check('...and the original stays in her options',
    r.ok === true && r.diff.implications.some(i => /original stays/i.test(i.text)))
}

console.log('\n8. BOTH SURFACES, and neither of them a stub')
{
  const chat = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  const ui = readFileSync('src/components/ChatAssistant.tsx', 'utf8')
  const card = readFileSync('src/components/chat/ProposalCard.tsx', 'utf8')
  const types = readFileSync('src/lib/types.ts', 'utf8')
  const KINDS = ['propose_meal_food_remove', 'propose_meal_food_replace', 'propose_meal_food_resize'] as const

  for (const k of KINDS) {
    check(`${k}: declared to the coach`, new RegExp(`name: "${k}"`).test(chat))
    // A DECLARED TOOL THAT DECLINES IS THE HOLE ban_exercise FELL THROUGH —
    // CLAUDE.md records that no gate tells the two apart. A courier is proved
    // by the handler forwarding the kind back for the client to build; a stub
    // has no such line.
    check(`${k}: a courier, not a declining stub`,
      new RegExp(`name === "${k}"`).test(chat) && new RegExp(`kind: "${k}"`).test(chat))
    check(`${k}: the client builds it`, ui.includes(`'${k}'`))
    check(`${k}: the receipt kind exists`, types.includes(`'${k}'`))
  }

  // ONE EXECUTOR AND ONE UNDO, shared with the three doors that came before.
  // Counted rather than located: what matters is that the confirm path and
  // the undo path each know all three, not which line they sit on.
  for (const k of KINDS) {
    check(`${k}: reaches the executor and the undo`, (ui.match(new RegExp(`row\\.kind === '${k}'`, 'g')) ?? []).length >= 2)
  }
  check('all three build through the meal-food-edit module',
    /buildMealFoodRemoveProposal/.test(ui) && /buildMealFoodReplaceProposal/.test(ui) && /buildMealFoodResizeProposal/.test(ui))

  // THE COACH IS TOLD WHICH DOOR IS WHICH. Four now share a slot and a meal,
  // and the failure mode is a removal routed to a swap.
  const rules = chat.slice(chat.indexOf('A FOOD JOINING A MEAL IS NEITHER'))
  for (const k of KINDS) check(`${k}: named in the routing rules`, rules.includes(k))
  check('...and told not to state the cost itself', /never state what comes out in protein or calories/i.test(chat))

  // THE OFFER IS TAPPABLE, not a sentence. Pinned on the card reading the
  // alternatives and calling back with the entry's own prompt.
  check('the card renders the swaps it is given', /diff\.alternatives/.test(card) && /onAlternative\(alt\.prompt\)/.test(card))
  check('...and the chat hands it a way to ask for one', /onAlternative=\{handleQuickReply\}/.test(ui))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nOne food in a meal can be taken out, swapped or resized — through the same checks as everything else.\n')
