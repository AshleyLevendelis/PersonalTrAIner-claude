/**
 * test:calamari-asked — a bare "calamari" is asked about, breaded or plain, never guessed (Ashley, 10 Nov 2026,
 * "Ask which", from three options: ask / "can't confirm it's gluten-free" / leave it as plain squid).
 *
 * MEASURED BEFORE: "150g calamari" was plain squid, so a gluten-free person's calamari passed the diet check, and
 * calamari is very often floured or breaded. Unlike Greek yoghurt and mince (whose kind changes the numbers), this
 * kind changes an ALLERGEN TAG, so the gate holds three things the other two never needed:
 *   - what is true of EVERY kind stays a definite answer: shellfish is "contains", never "can't confirm";
 *   - a restriction NEITHER kind breaks (nut-free) does not block the food: it goes on to be asked about;
 *   - the chat asks off HIS message, so the coach writing "grilled calamari" into a card cannot answer for him.
 */
import { readFileSync } from 'fs'
import { lookupIngredient, whichKindQuestion, computeMealMacros, findFoodsNamedIn, kindsItCouldBe, calamariSaid } from '../src/lib/food-db'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { validateMealAgainstDiet, FORBIDDEN_TAGS } from '../src/lib/diet-rules'
import { checkMealAgainstRestrictions } from '../src/lib/meal-restriction-check'
import { namedFoodClash, namedFoodKindAsk } from '../src/lib/named-food-clash'
import { buildMealLogProposal } from '../src/lib/meal-log-proposal'
import { explainRejection } from '../src/lib/meal-addition'
import { verifyProposal } from '../src/lib/meal-generation'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const text = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => text(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const found = (line: string) => lookupIngredient(parseIngredientLine(line).name)?.name ?? null
const QUESTION = 'Was the calamari breaded or fried in flour, or plain (grilled or boiled)?'

console.log('1. The food table: a bare name is a miss, a word for the kind settles it')
const BARE = ['150g calamari', '150g Calamari', '150g calamari rings', '150g frozen calamari rings', '150g fresh calamari', '150g raw calamari', '150g cooked calamari', '1 portion calamari', '150g calamares']
for (const line of BARE) check(`"${line}" is not costed (it was plain squid, whatever it was)`, found(line) === null, found(line))
const PLAIN = ['150g grilled calamari', '150g plain calamari', '150g boiled calamari', '150g steamed calamari', '150g chargrilled calamari', '150g calamari, grilled', '150g calamari tubes', '150g squid']
for (const line of PLAIN) check(`"${line}" is plain squid`, found(line) === 'squid', found(line))
const COATED = ['150g fried calamari', '150g breaded calamari', '150g battered calamari', '150g crispy calamari', '150g pan-fried calamari', '150g salt and pepper calamari', '150g calamari rings, breaded', '150g breaded squid']
for (const line of COATED) check(`"${line}" is the fried, floured entry`, found(line) === 'calamari fried', found(line))
const squid = lookupIngredient('squid')!
const fried = lookupIngredient('fried calamari')!
check('the two kinds are both shellfish, and differ on gluten (the reason the kind is asked)', squid.tags.contains_shellfish === true && fried.tags.contains_shellfish === true && !squid.tags.contains_gluten && fried.tags.contains_gluten === true, { squid: squid.tags, fried: fried.tags })
check('every tag plain squid carries, the fried one carries too: "true of every kind" is squid\'s own tags', Object.entries(squid.tags).every(([k, v]) => !v || (fried.tags as Record<string, boolean | undefined>)[k] === true), { squid: squid.tags, fried: fried.tags })
const m = computeMealMacros(['150g calamari', '70g dry basmati rice'].map(parseIngredientLine))
check('a meal holding a bare one counts nothing for it: it is listed as not counted', m.unmatched.some(u => /calamari/i.test(u)), m.unmatched)
check('a phrase is read for its kind: coated, plain, ask, or not calamari at all', calamariSaid('crispy calamari') === 'coated' && calamariSaid('calamari, grilled') === 'plain' && calamariSaid('calamari rings') === 'ask' && calamariSaid('squid') === null && calamariSaid('grilled breaded calamari') === 'coated', [calamariSaid('crispy calamari'), calamariSaid('calamari, grilled'), calamariSaid('calamari rings'), calamariSaid('squid'), calamariSaid('grilled breaded calamari')])

console.log('\n2. The question names the two kinds, never an amount')
check('the question asks breaded or plain', whichKindQuestion('calamari') === QUESTION, whichKindQuestion('calamari'))
check('...for every bare name', ['calamari rings', 'Calamari', 'frozen calamari rings', 'raw calamari', 'calamares'].every(n => whichKindQuestion(n) === QUESTION), ['calamari rings', 'Calamari', 'frozen calamari rings', 'raw calamari', 'calamares'].map(n => whichKindQuestion(n)))
check('...and none once the kind is said, or for squid', [whichKindQuestion('grilled calamari'), whichKindQuestion('fried calamari'), whichKindQuestion('breaded calamari rings'), whichKindQuestion('squid'), whichKindQuestion('prawns')].every(x => x === null))
check('...and Greek yoghurt and mince keep their own questions', /fat-free \(0%\)/.test(whichKindQuestion('greek yoghurt') ?? '') && /5%, 10%, 12%, 15% or 20%/.test(whichKindQuestion('beef mince') ?? ''))

console.log('\n3. The diet check: refused where the kind decides, definite where it does not, free where it cannot matter')
const dish = (line: string) => [parseIngredientLine(line), parseIngredientLine('70g dry basmati rice')]
const verdict = (line: string, prefs: string[]) => ({ diet: validateMealAgainstDiet(dish(line), prefs), card: checkMealAgainstRestrictions('Calamari and rice', dish(line), prefs, []) })
const gf = verdict('150g calamari', ['gluten-free'])
check('gluten-free: bare calamari is refused (it PASSED as plain squid before)', gf.diet.ok === false && gf.card.ok === false, gf.card)
check('...as "can\'t confirm", never as "contains"', gf.card.message === "I can't confirm calamari is gluten-free, so this one's off for you." && gf.diet.violations.every(v => v.unidentified === true), gf.card.message)
const sf = verdict('150g calamari', ['shellfish-free'])
check('shellfish-free: bare calamari is refused as a DEFINITE "contains" (true of every kind)', sf.diet.ok === false && sf.diet.violations.length === 1 && sf.diet.violations[0].unidentified !== true && sf.card.message === 'Contains calamari, which doesn\'t fit "shellfish-free".', { v: sf.diet.violations, m: sf.card.message })
const both = verdict('150g calamari', ['shellfish-free', 'gluten-free'])
check('both: one definite (shellfish), one "can\'t confirm" (gluten)', both.diet.violations.length === 2 && both.diet.violations.filter(v => v.unidentified).map(v => v.preference).join() === 'gluten-free' && both.diet.violations.filter(v => !v.unidentified).map(v => v.preference).join() === 'shellfish-free', both.diet.violations)
check('vegan and vegetarian: definite, since no kind of squid is either', ['vegan', 'vegetarian'].every(p => { const v = verdict('150g calamari', [p]).diet; return !v.ok && v.violations.every(x => !x.unidentified) }))
const nf = verdict('150g calamari', ['nut-free'])
check('nut-free: NOT blocked (neither kind has nuts), so it goes on to be asked about', nf.diet.ok === true && nf.card.ok === true, nf.card)
check('no restriction: not blocked', verdict('150g calamari', []).diet.ok === true)
check('gluten-free with the kind said: grilled passes, fried is a definite "contains"', verdict('150g grilled calamari', ['gluten-free']).diet.ok === true && verdict('150g fried calamari', ['gluten-free']).diet.violations.some(v => v.preference === 'gluten-free' && !v.unidentified))
check('an ordinary unknown food is still refused for EVERY restriction (the fail-closed rule is untouched)', (() => { const v = validateMealAgainstDiet(dish('150g zorblefruit'), ['nut-free', 'gluten-free']); return !v.ok && v.violations.length === 2 && v.violations.every(x => x.unidentified === true) })())
check('kindsItCouldBe names two kinds for the bare word and none otherwise', kindsItCouldBe('calamari')?.map(k => k.name).join() === 'squid,calamari fried' && kindsItCouldBe('grilled calamari') === null && kindsItCouldBe('squid') === null && kindsItCouldBe('chicken breast') === null, kindsItCouldBe('calamari')?.map(k => k.name))
// The premise, for every restriction the app has: no restriction is broken by plain squid and NOT by the fried one.
const worse = Object.keys(FORBIDDEN_TAGS).filter(p => FORBIDDEN_TAGS[p as keyof typeof FORBIDDEN_TAGS].some(t => squid.tags[t]) && !FORBIDDEN_TAGS[p as keyof typeof FORBIDDEN_TAGS].some(t => fried.tags[t]))
check('no restriction is broken by plain squid and not by fried: "breaded" is always the stricter answer', worse.length === 0, worse)

console.log('\n4. Said in the chat: the shellfish block is kept, and the kind is asked off his words')
check('the prose scanner still knows calamari (the shellfish word list does not name it)', findFoodsNamedIn('fry the calamari rings until golden').some(h => h.entry.tags.contains_shellfish === true))
const shellfish = namedFoodClash('can I have calamari tonight?', ['shellfish-free'], [])
check('shellfish-free: naming calamari is still refused outright', shellfish?.restriction === 'shellfish-free' && shellfish.allergen === true, shellfish)
check('...and is not asked about (the answer would change nothing)', namedFoodKindAsk('can I have calamari tonight?', ['shellfish-free']) === null)
const ask = namedFoodKindAsk('can I have calamari tonight?', ['gluten-free'])
check('gluten-free: naming bare calamari gets the app\'s question (before: nothing, and the coach was free to add it)', ask === 'Is the calamari breaded or fried in flour, or plain (grilled or boiled)? Breaded or floured calamari has gluten in it, and your profile says gluten-free, so I need to know before I suggest it or add it to your meals.', ask)
check('...whatever else he avoids', namedFoodKindAsk('add calamari rings to dinner', ['nut-free', 'gluten-free']) !== null)
check('...and none once he says the kind', ['can I have grilled calamari tonight?', 'add plain calamari to dinner', 'swap dinner for fried calamari', 'calamari, grilled, for dinner'].every(t => namedFoodKindAsk(t, ['gluten-free']) === null), ['can I have grilled calamari tonight?', 'add plain calamari to dinner', 'swap dinner for fried calamari', 'calamari, grilled, for dinner'].map(t => namedFoodKindAsk(t, ['gluten-free'])))
check('...none when he is not asking for it ("no calamari", "instead of the calamari")', namedFoodKindAsk('a dinner with no calamari please', ['gluten-free']) === null && namedFoodKindAsk('something instead of the calamari', ['gluten-free']) === null)
check('...none for a restriction the kind cannot change, or with no restriction', namedFoodKindAsk('can I have calamari tonight?', ['nut-free']) === null && namedFoodKindAsk('can I have calamari tonight?', []) === null)
check('...none for a food that is not calamari', namedFoodKindAsk('can I have squid tonight?', ['gluten-free']) === null && namedFoodKindAsk('can I have chicken tonight?', ['gluten-free']) === null)
const breaded = namedFoodClash('can I have calamari, breaded, tonight?', ['gluten-free'], [])
check('gluten-free: "calamari, breaded" is refused as gluten (the kind beside the word, not a listed name)', breaded?.restriction === 'gluten-free', breaded)
check('...and fried calamari by its listed name too', namedFoodClash('swap dinner for fried calamari', ['gluten-free'], [])?.restriction === 'gluten-free')
check('...while grilled calamari is no clash for gluten-free', namedFoodClash('can I have grilled calamari tonight?', ['gluten-free'], []) === null)
const chat = code('src/components/ChatAssistant.tsx')
const guard = chat.slice(chat.indexOf('const processResponse = async'), chat.indexOf('const processResponseInner = async'))
check('the chat reads the question off HIS message, before any card is built', /namedFoodKindAsk\(userSaid, /.test(guard) && guard.indexOf('namedFoodKindAsk(') < guard.indexOf('processResponseInner(result, userSaid)'), guard.slice(0, 200))
check('...a food card on that turn is not built: the question is the reply', /if \(kindAsk && result\.proposal && FOOD_OFFER_KINDS\.has\(result\.proposal\.kind\)\) return \{ text: kindAsk \}/.test(guard))
check('...and a turn that is only talk is answered with the question, never over a card or a record', /kindAsk && !result\.proposal && !plain\.pendingAction && !plain\.receipt && !plain\.action && !plain\.clarification \? \{ \.\.\.plain, text: kindAsk \} : plain/.test(guard))

console.log('\n5. Every surface that would count or add it asks the kind')
const log = buildMealLogProposal({ rawArgs: { food_name: 'Calamari and rice', meal_slot: 'dinner' }, computed: { kcal: 270, protein: 6, carbs: 58, fat: 1, unmatched: ['150g calamari'], coverage: 0.33 }, profileId: 'p', todayDate: '2026-11-10' })
check('the coach\'s meal log: no card, and the kind question rather than "how much"', !log.ok && log.reason.startsWith(QUESTION) && !/How much/.test(log.reason), log)
const proposal = { name: 'Calamari salad', ingredients: ['150g calamari', '70g dry basmati rice', '100g tomato', '10g olive oil'], prep: 'quick' } as unknown as Parameters<typeof verifyProposal>[0]
const budget = { calories: 650, protein: 40, carbs: 70, fat: 20 } as unknown as Parameters<typeof verifyProposal>[2]
const gfLog: string[] = []
const gfDish = verifyProposal(proposal, 'dinner', budget, ['gluten-free'], gfLog)
check('a dish with bare calamari is not accepted for a gluten-free person (run through the real verifier)', gfDish === null && /calamari/.test(gfLog[gfLog.length - 1] ?? ''), gfLog)
check('...and he is ASKED which, not told it is on his avoid list', explainRejection(gfLog, 'Calamari salad', 'dinner') === `${QUESTION} I'll add Calamari salad once I know.`, explainRejection(gfLog, 'Calamari salad', 'dinner'))
// The same question when calamari is a SMALL part of the dish: coverage passes, and the diet check is what stops it.
const small = { ...proposal, name: 'Rice bowl with calamari', ingredients: ['30g calamari', '90g dry basmati rice', '150g raw chicken breast', '100g tomato', '10g olive oil'] } as typeof proposal
const smallLog: string[] = []
const smallDish = verifyProposal(small, 'dinner', budget, ['gluten-free'], smallLog)
check('a little calamari in a big dish: stopped by the diet check itself, and still asked about', smallDish === null && /diet violation/.test(smallLog[smallLog.length - 1] ?? '') && explainRejection(smallLog, 'Rice bowl with calamari', 'dinner') === `${QUESTION} I'll add Rice bowl with calamari once I know.`, { smallLog, said: explainRejection(smallLog, 'Rice bowl with calamari', 'dinner') })
const sfLog: string[] = []
verifyProposal(proposal, 'dinner', budget, ['shellfish-free'], sfLog)
const sfSaid = explainRejection(sfLog, 'Calamari salad', 'dinner')
check('for a shellfish-free person the same dish is refused, not asked about', /^I can't add Calamari salad/.test(sfSaid) && /shellfish-free/.test(sfSaid) && !sfSaid.includes('breaded'), sfSaid)
const bothLog: string[] = []
verifyProposal(proposal, 'dinner', budget, ['gluten-free', 'shellfish-free'], bothLog)
check('...and with both, refused: a dish that is out anyway is not worth a question', /^I can't add Calamari salad/.test(explainRejection(bothLog, 'Calamari salad', 'dinner')), explainRejection(bothLog, 'Calamari salad', 'dinner'))
const openLog: string[] = []
const openDish = verifyProposal(proposal, 'dinner', budget, [], openLog)
check('with no restriction the dish is still not accepted with calamari uncounted, and the kind is asked', openDish === null && explainRejection(openLog, 'Calamari salad', 'dinner').startsWith(QUESTION), { openLog, said: explainRejection(openLog, 'Calamari salad', 'dinner') })
const grilled = verifyProposal({ ...proposal, ingredients: ['150g grilled calamari', '70g dry basmati rice', '100g tomato', '10g olive oil'] } as typeof proposal, 'dinner', budget, ['gluten-free'], [])
check('once the kind is said (grilled), the gluten-free dish is no longer refused for its diet', (() => { const l: string[] = []; verifyProposal({ ...proposal, ingredients: ['150g grilled calamari', '70g dry basmati rice', '100g tomato', '10g olive oil'] } as typeof proposal, 'dinner', budget, ['gluten-free'], l); return grilled !== null || !l.some(x => /diet violation/.test(x)) })())

console.log('\n6. Our own words name the kind')
const bareInLibrary = MEAL_LIBRARY.flatMap(d => d.ingredients.filter(l => calamariSaid(parseIngredientLine(l).name) === 'ask').map(l => `${d.name}: ${l}`))
check('no dish in our library has a bare calamari line', bareInLibrary.length === 0, bareInLibrary)
const writer = text('supabase/functions/generate-meals/index.ts')
check('the meal writer is told to write squid or fried calamari, never the bare word', /write "squid" for plain squid and "fried calamari" when it is floured, breaded or battered; a bare "calamari" cannot be counted/.test(writer))
const coach = text('supabase/functions/chat-gemini/index.ts')
check('the coach is told to ask, and never to choose for him', /Calamari is the same: [^.]*ASK whether it was breaded or fried in flour, or plain/.test(coach) && /NEVER choose for them, because breaded or floured calamari has gluten in it/.test(coach))
const shared = text('supabase/functions/_shared/food-db.ts')
check('the coach\'s food table holds the same rule (the synced copy)', /export function calamariSaid/.test(shared) && /if \(calamariNeedsKind\(key\)\) return null/.test(shared) && shared.includes(QUESTION))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} calamari check(s) FAILED`); process.exitCode = 1 } else console.log('All calamari checks passed.')
