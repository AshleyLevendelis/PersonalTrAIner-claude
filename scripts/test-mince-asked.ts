/**
 * test:mince-asked — plain beef mince is asked about, never guessed (Ashley, 10 Nov 2026, "Ask").
 *
 * Until that day the WORDS decided: "beef mince" and "ground beef" were costed as 20% fat (254 kcal per 100 g) and a
 * bare "mince" as 5% (137), the same food two ways. Now every bare name is a miss, the fat levels UK packs carry (5,
 * 10, 12, 15, 20%) are all found, and every surface that would ask "how much" asks the fat instead.
 */
import { readFileSync } from 'fs'
import { lookupIngredient, whichKindQuestion, computeMealMacros } from '../src/lib/food-db'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { buildMealLogProposal } from '../src/lib/meal-log-proposal'
import { explainRejection } from '../src/lib/meal-addition'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const found = (line: string) => lookupIngredient(parseIngredientLine(line).name)?.name ?? null

console.log('1. The food table: a bare name is a miss, a named fat level is found')
const BARE = ['150g beef mince', '150g raw beef mince', '150g mince', '150g minced beef', '150g ground beef', '150g steak mince', '150g mince beef', '150g beef mince raw']
for (const line of BARE) check(`"${line}" is not costed (it used to be, as 20% or 5% depending on the words)`, found(line) === null, found(line))
const LEVELS: [string, string][] = [
  ['150g beef mince 5% fat', 'beef mince 5% fat'], ['150g lean beef mince', 'beef mince 5% fat'], ['150g lean mince', 'beef mince 5% fat'],
  ['150g 10% beef mince', 'beef mince 10% fat'], ['150g beef mince 10% fat', 'beef mince 10% fat'],
  ['150g 12% fat beef mince', 'beef mince 12% fat'], ['150g raw beef mince 12% fat', 'beef mince 12% fat'],
  ['150g 15% beef mince', 'beef mince 15% fat'], ['150g 20% beef mince', 'beef mince 20% fat'], ['150g beef mince 20% fat', 'beef mince 20% fat'],
]
for (const [line, entry] of LEVELS) check(`"${line}" is ${entry}`, found(line) === entry, found(line))
check('other minces keep their own entries (turkey, pork, lamb, chicken, soy, quorn)', ['turkey mince', 'pork mince', 'lamb mince', 'chicken mince', 'soy mince', 'quorn mince'].every(n => found(`150g ${n}`) === n))

console.log('\n2. The figures run in order of fat, and 12% sits where its blend puts it')
const per = (n: string) => lookupIngredient(n)!.per100g
const order = ['beef mince 5% fat', 'beef mince 10% fat', 'beef mince 12% fat', 'beef mince 15% fat', 'beef mince 20% fat']
check('energy and fat rise and protein falls with each level', order.every((n, i) => i === 0 || (per(n).kcal > per(order[i - 1]).kcal && per(n).fat > per(order[i - 1]).fat && per(n).protein < per(order[i - 1]).protein)), order.map(n => per(n)))
const blend = 0.6 * per('beef mince 10% fat').kcal + 0.4 * per('beef mince 15% fat').kcal
check('12% is 60% of the 10% row and 40% of the 15% row, to the kilocalorie', Math.abs(per('beef mince 12% fat').kcal - blend) <= 1, { twelve: per('beef mince 12% fat').kcal, blend })
check('each level\'s fat is its name', order.every(n => per(n).fat === Number(/(\d+)%/.exec(n)![1])))
const m = computeMealMacros(['150g beef mince', '75g dry white rice'].map(parseIngredientLine))
check('a meal holding a bare one counts nothing for it: it is listed as not counted', m.unmatched.some(u => /mince/i.test(u)), m.unmatched)

console.log('\n3. The question names the fat levels, never an amount')
const q = whichKindQuestion('beef mince')
check('the question asks the fat and says where to find it', q === 'What fat was the beef mince: 5%, 10%, 12%, 15% or 20%? It says on the pack.', q)
check('...for every bare name', ['mince', 'ground beef', 'minced beef', 'steak mince', 'raw beef mince', 'beef mince raw'].every(n => whichKindQuestion(n) === q))
check('...and none for a named level or another mince', [whichKindQuestion('beef mince 5% fat'), whichKindQuestion('lean mince'), whichKindQuestion('turkey mince'), whichKindQuestion('lamb mince')].every(x => x === null))
check('...and Greek yoghurt keeps its own question', /fat-free \(0%\)/.test(whichKindQuestion('greek yoghurt') ?? ''))

console.log('\n4. Every surface asks the fat')
const log = buildMealLogProposal({ rawArgs: { food_name: 'Mince and rice', meal_slot: 'dinner' }, computed: { kcal: 270, protein: 6, carbs: 58, fat: 1, unmatched: ['150g beef mince'], coverage: 0.33 }, profileId: 'p', todayDate: '2026-11-10' })
check('the coach\'s meal log: no card, and the fat question rather than "how much"', !log.ok && /5%, 10%, 12%, 15% or 20%\?/.test(log.reason) && !/How much/.test(log.reason), log)
const add = explainRejection(['[dinner] "Chilli": coverage 40% below 80% floor — unmatched: ground beef'], 'Chilli', 'dinner')
check('adding a meal by name: the fat question rather than "describe it with more everyday ingredients"', /5%, 10%, 12%, 15% or 20%\?/.test(add) && !/everyday ingredients/.test(add), add)

console.log('\n5. Our own words name the fat')
const bareInLibrary = MEAL_LIBRARY.flatMap(d => d.ingredients.filter(l => whichKindQuestion(parseIngredientLine(l).name) !== null).map(l => `${d.name}: ${l}`))
check('no library dish has a line the app would ask about', bareInLibrary.length === 0, bareInLibrary.slice(0, 5))
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const coach = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('the coach\'s log_meal instruction asks the fat of plain beef mince instead of assuming one', /Beef mince is the same: said with no fat level[^.]*ASK what fat it was \(5%, 10%, 12%, 15% or 20%/.test(coach))
const writer = strip(readFileSync('supabase/functions/generate-meals/index.ts', 'utf8'))
check('the meal writer is told to name the fat of Greek yoghurt and beef mince, since a bare one drops its dish', /Name the fat level where the numbers depend on it: Greek yoghurt as 0%, 2% or full fat[^.]*beef mince with its fat/.test(writer))
const shared = readFileSync('supabase/functions/_shared/food-db.ts', 'utf8')
check('the coach\'s food table holds the same rule (the synced copy)', /f\('beef mince 12% fat'/.test(shared) && /What fat was the beef mince/.test(shared) && !/\['beef mince', 'ground beef'/.test(shared))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} mince check(s) FAILED.`); process.exit(1) }
console.log('All mince checks passed.')
