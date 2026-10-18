// ---------------------------------------------------------------------------
// test:named-food-clash — a food she names that her restrictions keep out is said first and never offered
// (runs 7-10, H41, 18 Oct 2026; her ruling "Say 'nut-free'"). docs/plans/runs-7-10-batch-1-safety.md.
//
// Sam (tree-nut allergy, stored as nut-free) asked to swap his snack for almond butter on toast and was handed a
// protein-shake card with nothing said; asked why not, the coach offered to add it as a "custom dish". This holds:
//   1. the check reads the food she NAMED, through the food database's tags and the allergen word list
//   2. what she is NOT asking for is not read as asking ("no nuts", "nut-free", "without almonds", "allergic to")
//   3. her sentence, in her words, for an allergen; the avoid list in its own words
//   4. the swap builder never swaps a named dish for a different one
//   5. the chat: no card that would put the food on her plate, and her sentence first on any reply
//   6. the coach is told the same (model behaviour; the exam's to grade, not this gate's)
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const { namedFoodClash, clashSentence, allergyRefusal } = await import('../src/lib/named-food-clash')
  const SAM = ['nut-free'], AVOID = ['pork', 'mushrooms']
  const said = (m: string, prefs = SAM, avoid = AVOID) => { const c = namedFoodClash(m, prefs, avoid); return c ? clashSentence(c) : null }

  console.log('\n1. The food she names is read against what she cannot eat')
  check("Sam's own request: almond butter on toast is a nut clash", namedFoodClash("can you swap today's snack for almond butter on toast?", SAM, AVOID)?.restriction === 'nut-free')
  check('...and his follow-up "why not the almond butter?" is too ("not" is not a refusal)', namedFoodClash('why not the almond butter?', SAM)?.food === 'almond butter')
  check('a nut the food database has no entry for is read from the allergen word list ("macadamia")', namedFoodClash('add macadamia to my oats', SAM)?.restriction === 'nut-free', namedFoodClash('add macadamia to my oats', SAM))
  check('the avoid list is read through the database tags: "pork" catches bacon', namedFoodClash('bacon sandwich for lunch?', SAM, AVOID)?.avoided === 'pork', namedFoodClash('bacon sandwich for lunch?', SAM, AVOID))
  check('...and a plain avoided word ("mushrooms")', namedFoodClash('swap dinner for mushroom risotto', SAM, AVOID)?.avoided === 'mushrooms')
  check('a diet, not only an allergen: a vegetarian naming chicken', namedFoodClash('can I have chicken tonight', ['vegetarian'])?.restriction === 'vegetarian')
  check('one food that breaks both a diet and an allergen filter is reported as the allergen', namedFoodClash('a salmon fillet', ['vegetarian', 'fish-free'])?.restriction === 'fish-free', namedFoodClash('a salmon fillet', ['vegetarian', 'fish-free']))
  check('a food nothing keeps out is no clash', namedFoodClash('chicken and rice please', SAM, AVOID) === null && namedFoodClash('coconut yoghurt', SAM) === null && namedFoodClash('doughnuts?', SAM) === null)
  check('no restrictions at all, no clash', namedFoodClash('almond butter on toast', [], []) === null)

  console.log('\n2. What she is NOT asking for is not read as asking')
  check('"egg-free" names the restriction, not an egg she wants (egg IS a food the database knows)', namedFoodClash("I'm egg-free, any breakfast ideas?", ['egg-free']) === null, namedFoodClash("I'm egg-free, any breakfast ideas?", ['egg-free']))
  for (const m of ["I'm nut-free, what's a good snack?", 'something without almonds please', 'I am allergic to cashews, what can I snack on', 'no nuts in my lunch please', 'swap out the almond butter', 'instead of peanut butter what can I have']) {
    check(`"${m}" is no clash`, namedFoodClash(m, SAM, AVOID) === null, namedFoodClash(m, SAM, AVOID))
  }

  console.log('\n3. Her sentence, in her words')
  check('almond butter, exactly as she ruled', said('almond butter on toast') === "Almond butter has tree nuts in it, and your profile says nut-free, so I won't suggest it or add it to your meals.", said('almond butter on toast'))
  check('says what the profile says, never "allergic"', !/allerg/i.test(said('almond butter on toast') ?? ''))
  check('peanuts are named as peanuts, not tree nuts', /^Peanut butter has peanuts in it/.test(said('can I have peanut butter') ?? ''), said('can I have peanut butter'))
  check('a plural reads as one: "Almonds have tree nuts in them"', /^Almonds have tree nuts in them, .*won't suggest them or add them/.test(said('some almonds as a snack') ?? ''), said('some almonds as a snack'))
  check('the avoid list says it is on the list', said('bacon sandwich?') === "Bacon is on your avoid list, so I won't suggest it or add it to your meals.", said('bacon sandwich?'))
  // Her second ruling: refuse, and say where to change it if there is no allergy.
  const refuse = (m: string, prefs = SAM, avoid = AVOID) => { const c = namedFoodClash(m, prefs, avoid); return c ? allergyRefusal(c) : 'no clash' }
  check('an allergen: her sentence, then where to change it, exactly', refuse('almond butter on toast') === "Almond butter has tree nuts in it, and your profile says nut-free, so I won't suggest it or add it to your meals. If you don't have a nut allergy, change it on Profile, under Food, Diet.", refuse('almond butter on toast'))
  check('...naming the allergy each filter is ("an egg allergy")', /If you don't have an egg allergy, change it on Profile, under Food, Diet\.$/.test(refuse('two eggs on toast', ['egg-free']) ?? ''), refuse('two eggs on toast', ['egg-free']))
  check('a diet is not an allergy: no refusal line for a vegetarian naming chicken', refuse('can I have chicken tonight', ['vegetarian']) === null)
  check('...nor for the avoid list', refuse('bacon sandwich?') === null)
  const ui = readFileSync('src/components/ProfileScreen.tsx', 'utf8')
  check('the place it names is real: Profile has a Food group whose Diet row opens the restrictions', /<ProfileGroup label="Food">[\s\S]{0,400}<SheetRow label="Diet"[^\n]*setSheet\('diet'\)/.test(ui) && /case 'diet':[\s\S]{0,1200}Dietary restrictions[\s\S]{0,800}dietary_preferences: next/.test(ui))

  console.log('\n4. The swap builder never swaps a named dish for a different one')
  const rows = ['Protein shake', 'Apple and cheese'].map((name, i) => ({
    slot: 'snack', pool_index: i, name, ingredients: [{ name: 'apple', quantity: 150, unit: 'g' }],
    macros: { kcal: 200, protein: 20, carbs: 20, fat: 5 }, tags: [],
  }))
  const stub = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }) }) }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(stub as any)
  const { buildMealSwapProposal } = await import('../src/lib/meal-swap-proposal')
  const base = { profileId: 'p', today: '2026-10-14', dislikedFoods: [], dietaryPreferences: ['nut-free'] }
  const unknown = await buildMealSwapProposal({ ...base, rawArgs: { meal_slot: 'snack', old_item: 'Protein shake', new_item: 'almond butter on toast' } })
  check('a named dish that is not one of her options is refused, never rotated to another', !unknown.ok && /isn't one of your saved snack options/.test(unknown.ok ? '' : unknown.reason), unknown)
  check('...in plain words (no "pool", no "verified")', !unknown.ok && !/pool|verified/i.test(unknown.reason))
  const known = await buildMealSwapProposal({ ...base, rawArgs: { meal_slot: 'snack', old_item: 'Protein shake', new_item: 'Apple and cheese' } })
  check('a named dish that IS one of her options still swaps to it', known.ok && known.payload.chooseName === 'Apple and cheese', known)
  const rotate = await buildMealSwapProposal({ ...base, rawArgs: { meal_slot: 'snack', old_item: 'Protein shake' } })
  check('no dish named: the rotation still picks the next option', rotate.ok && rotate.payload.chooseName === 'Apple and cheese', rotate)

  console.log('\n5. The chat reads her message before any card')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const wrap = chat.slice(chat.indexOf('const processResponse = async'), chat.indexOf('const processResponseInner = async'))
  check('every reply is read against her restrictions and her avoid list (both stores)', /namedFoodClash\(userSaid, profile\.dietary_preferences \?\? \[\], \[\.\.\.compileFoodDislikes\(memoryFacts\), \.\.\.\(profile\.disliked_foods \?\? \[\]\)\]\)/.test(wrap), wrap.slice(0, 300))
  check('the refusal is her allergy line on an allergen, her sentence otherwise', /const refusal = allergyRefusal\(clash\) \?\? clashSentence\(clash\)/.test(wrap))
  check('a card that would put the food on her plate is not built: the refusal is the reply', /if \(result\.proposal && FOOD_OFFER_KINDS\.has\(result\.proposal\.kind\)\) \{\s*return \{ text: refusal, outcome: 'refused' \}/.test(wrap))
  const kinds = chat.match(/const FOOD_OFFER_KINDS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ''
  check('...the swap, the addition, her own meal, and a food added to or put into a meal', ['propose_meal_swap', 'propose_meal_addition', 'propose_custom_meal', 'propose_meal_food_add', 'propose_meal_food_replace'].every(k => kinds.includes(`'${k}'`)), kinds)
  check('...but a log of what she already ate is a record and is not blocked', !kinds.includes('propose_meal_log'))
  check("on an allergen filter every other reply IS the refusal: the coach's words are dropped on that turn", /return clash\.allergen \? \{ \.\.\.inner, text: refusal \} : inner/.test(wrap))
  check('the two send paths both go through it', (chat.match(/await processResponse\(result, /g) ?? []).length >= 2)

  console.log('\n6. The coach is told the same (model behaviour: graded by the exam, not here)')
  const prompt = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the dietary block: say it first, in her words, never offer to build it', /WHEN THEY NAME A FOOD THESE RESTRICTIONS KEEP OUT/.test(prompt) && /your FIRST words say so/.test(prompt) && /never "you're allergic"/.test(prompt) && /Never offer to add it, build it/.test(prompt))
  check("...and an allergen is refused with where to change it, the same place the app names", /if they don't have that allergy they can change it on Profile, under Food, Diet/.test(prompt))
  check('the add tool no longer tells it the app will refuse a clash for it', !/will refuse it if it clashes, so never promise/.test(prompt))
  check('plain words: never "pool", "verified", "pre-verified" or "custom dish" to her (L59)', /PLAIN WORDS, NEVER THE APP'S INSIDE WORDS/.test(prompt))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('A food she names that her restrictions keep out is said first, and never put on her plate.')
}
main().catch(e => { console.error(e); process.exit(1) })
