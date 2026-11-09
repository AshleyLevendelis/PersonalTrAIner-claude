/**
 * test:greek-yoghurt-asked — a bare "Greek yoghurt" is asked about, never guessed (Ashley, 9 Nov 2026, "Ask which").
 *
 * Until that day the SPELLING decided: "greek yoghurt" was costed as 0% (57 kcal per 100 g) and "greek yogurt" as
 * full-fat (97 kcal). Now both bare spellings are a miss, so nothing is counted until the kind is known, and every
 * surface that would otherwise ask "how much" asks the kind instead.
 */
import { readFileSync } from 'fs'
import { lookupIngredient, whichKindQuestion, computeMealMacros } from '../src/lib/food-db'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { buildMealLogProposal } from '../src/lib/meal-log-proposal'
import { explainRejection } from '../src/lib/meal-addition'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}

console.log('1. The food table: the bare name is a miss, a named kind is found')
for (const bare of ['greek yoghurt', 'greek yogurt', 'Greek Yoghurt', '150g greek yogurt']) {
  check(`"${bare}" is not costed (it used to be, as whichever kind the spelling happened to point at)`, lookupIngredient(parseIngredientLine(bare).name) === null, lookupIngredient(parseIngredientLine(bare).name)?.name)
}
const kinds: [string, string][] = [['greek yoghurt 0%', 'greek yoghurt 0%'], ['0% greek yogurt', 'greek yoghurt 0%'], ['fat free greek yoghurt', 'greek yoghurt 0%'], ['greek yogurt 2%', 'greek yoghurt 2%'], ['low fat greek yoghurt', 'greek yoghurt 2%'], ['full fat greek yogurt', 'greek yoghurt full fat'], ['full fat greek yoghurt', 'greek yoghurt full fat']]
for (const [said, entry] of kinds) check(`"${said}" is ${entry}, in either spelling`, lookupIngredient(said)?.name === entry, lookupIngredient(said)?.name)
const m = computeMealMacros(['150g greek yoghurt', '100g blueberries'].map(parseIngredientLine))
check('a meal holding a bare one counts nothing for it: it is listed as not counted', m.unmatched.some(u => /greek yog/i.test(u)) && m.kcal < 100, { unmatched: m.unmatched, kcal: m.kcal })

console.log('\n2. The question names the kinds, not an amount')
const q = whichKindQuestion('greek yoghurt')
check('the question asks fat-free, low-fat or full-fat, in the words he chose', q === 'Was the Greek yoghurt fat-free (0%), low-fat (2%) or full-fat?', q)
check('...and keeps the spelling it was told ("Greek yogurt")', whichKindQuestion('greek yogurt') === 'Was the Greek yogurt fat-free (0%), low-fat (2%) or full-fat?', whichKindQuestion('greek yogurt'))
check('...and a food that names its kind gets no question', whichKindQuestion('greek yoghurt 0%') === null && whichKindQuestion('chicken') === null)

console.log('\n3. Every surface asks the kind')
const log = buildMealLogProposal({ rawArgs: { food_name: 'Yoghurt bowl', meal_slot: 'breakfast' }, computed: { kcal: 57, protein: 1, carbs: 14, fat: 0, unmatched: ['150g greek yoghurt'], coverage: 0.4 }, profileId: 'p', todayDate: '2026-11-09' })
check('the coach\'s meal log: no card, and the kind question rather than "how much"', !log.ok && /fat-free \(0%\), low-fat \(2%\) or full-fat\?/.test(log.reason) && !/How much/.test(log.reason), log)
const add = explainRejection(['[breakfast] "Yoghurt bowl": coverage 40% below 80% floor — unmatched: greek yoghurt'], 'Yoghurt bowl', 'breakfast')
check('adding a meal by name: the kind question rather than "describe it with more everyday ingredients"', /fat-free \(0%\), low-fat \(2%\) or full-fat\?/.test(add) && !/everyday ingredients/.test(add), add)
const control = buildMealLogProposal({ rawArgs: { food_name: 'Mystery bowl', meal_slot: 'breakfast' }, computed: { kcal: 57, protein: 1, carbs: 14, fat: 0, unmatched: ['150g dragonfruit jam'], coverage: 0.4 }, profileId: 'p', todayDate: '2026-11-09' })
check('...while any other uncountable food still gets the amount question (the detector is not firing on everything)', !control.ok && /How much/.test(control.reason) && !/fat-free/.test(control.reason), control)

console.log('\n4. The coach is told to ask, and carries the same table')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const coach = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('the coach\'s log_meal instruction asks the kind of a bare Greek yoghurt instead of assuming one', /Greek yoghurt said with no fat level is ASKED about, never assumed/.test(coach) && !/'greek yoghurt' could be 0% or full-fat/.test(coach))
const shared = readFileSync('supabase/functions/_shared/food-db.ts', 'utf8')
check('the coach\'s food table holds the same rule (the synced copy)', /export function whichKindQuestion/.test(shared) && !/'0% greek yogurt', 'greek yoghurt',/.test(shared))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} greek-yoghurt check(s) FAILED.`); process.exit(1) }
console.log('All greek-yoghurt checks passed.')
