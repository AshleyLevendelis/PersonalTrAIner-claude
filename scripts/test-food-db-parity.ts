/**
 * Gate: there is ONE food database, and the coach's copy of it cannot drift.
 *
 * The app reads src/lib/food-db.ts. The coach (the chat-gemini edge function)
 * runs on Deno, cannot import across the src/lib boundary, and so reads its
 * own file: supabase/functions/_shared/food-db.ts.
 *
 * UNTIL 9 OCT 2026 THIS GATE COMPARED ALLERGEN TAGS, ONE WAY, AND SAID SO:
 * "rather than demanding the files be identical, which they are not and need
 * not be". They did need to be. That day's test log had two typed-in meals
 * logged at a quarter of their real calories, and the cause was drift this
 * gate could not see: the coach's copy was 9 foods short and still read
 * "2 eggs" as two grams of egg — fixed in the app's copy on 1 Sep — while a
 * 9 Sep plural fix had gone into the coach's copy and never reached the app.
 * Same words, 266 kcal from the coach and 417 from the screen.
 *
 * So the coach's copy is now GENERATED from the app's (scripts/sync-food-db.mjs)
 * and this gate holds three things:
 *   1. the generated file is exactly what the script would write today;
 *   2. the source can run on Deno at all (no imports, nothing Node-only);
 *   3. the two modules, loaded separately, AGREE — entry count, what a phrase
 *      resolves to, what a meal comes to — over a fixed list that includes
 *      every phrase that has gone wrong here before.
 * (3) is implied by (1) while (1) holds. It is kept because it states the
 * property the app actually needs, and still stands if the sync is ever
 * replaced by something cleverer than a copy.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as app from '../src/lib/food-db'
import * as coach from '../supabase/functions/_shared/food-db.ts'
import { validateMealAgainstDiet } from '../src/lib/diet-rules'
// @ts-expect-error — a plain .mjs script, no types; scripts/ is not type-checked anyway
import { foodDbSyncState, denoProblems, renderEdgeFoodDb, FOOD_DB_SOURCE, FOOD_DB_EDGE_COPY } from './sync-food-db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
let ran = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

type Entry = { name: string; aliases: string[]; tags: Record<string, boolean>; units?: Record<string, number>; per100g: Record<string, number> }
const appFoods = app.FOOD_DB as unknown as Entry[]
const coachFoods = coach.FOOD_DB as unknown as Entry[]

console.log('\n1. The coach\'s copy is what the app\'s file generates, today')
{
  const state = foodDbSyncState(ROOT) as { fresh: boolean; expected: string; actual: string; problems: string[] }
  let firstDiff = -1
  if (!state.fresh) {
    const a = state.expected.split('\n'), b = state.actual.split('\n')
    firstDiff = a.findIndex((line, i) => line !== b[i])
  }
  check(`${FOOD_DB_EDGE_COPY} is byte-for-byte the generated file — if this fails: npm run sync:food-db`, state.fresh,
    state.fresh ? undefined : { firstDifferingLine: firstDiff + 1, expected: state.expected.split('\n')[firstDiff]?.slice(0, 120), found: state.actual.split('\n')[firstDiff]?.slice(0, 120) })
  check('the generated file says, at the top, that it is generated and how to regenerate it',
    /^\/\/ =+\n\/\/ GENERATED FILE — DO NOT EDIT\./.test(state.actual) && /npm run sync:food-db/.test(state.actual.slice(0, 900)))
  // Prove the detector: a one-character change to the source must read stale.
  const source = readFileSync(join(ROOT, FOOD_DB_SOURCE), 'utf8')
  check('the staleness check can fail: a source that differs by one character does not match the file on disk',
    renderEdgeFoodDb(source.replace('kcal: 165', 'kcal: 166')) !== state.actual && source.includes('kcal: 165'))
}

{
  // And the moment a stale copy would do harm is the deploy, so the deploy
  // script refuses one BEFORE it asks for the production phrase or links.
  const deploy = readFileSync(join(ROOT, 'scripts/deploy-functions.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const iCheck = deploy.indexOf('foodDbSyncState(')
  const iConfirm = deploy.indexOf('await confirmProduction()')
  const iLink = deploy.indexOf('link(target)')
  check('the deploy script found its own landmarks (sanity check on this check)', iConfirm > 0 && iLink > 0, { iConfirm, iLink })
  check('the deploy script checks the copy before confirming or linking anything', iCheck > 0 && iCheck < iConfirm && iCheck < iLink, { iCheck, iConfirm, iLink })
  check('...and a stale copy stops it', /if \(!state\.fresh[^)]*\)\s*\{[\s\S]{0,500}process\.exit\(1\)/.test(deploy.slice(iCheck > 0 ? iCheck : 0, iCheck + 900)))
}

console.log('\n2. The source can run on Deno')
{
  const source = readFileSync(join(ROOT, FOOD_DB_SOURCE), 'utf8')
  check('no imports, no require, no process.*, no import.meta.env', (denoProblems(source) as string[]).length === 0, denoProblems(source))
  // ...and the detector fires on each thing it exists to refuse.
  check('the Deno check refuses an import', (denoProblems(`import { x } from './y'\n${source}`) as string[]).length > 0)
  check('the Deno check refuses process.env', (denoProblems(`${source}\nconst k = process.env.X\n`) as string[]).length > 0)
  check('the Deno check is not fooled by the word in a comment', (denoProblems(`// import nothing, process.nothing\nexport const a = 1\n`) as string[]).length === 0)
}

console.log('\n3. Same foods, same facts about each')
{
  check('the app copy has foods', appFoods.length > 300, appFoods.length)
  check('the two copies hold the same NUMBER of foods', appFoods.length === coachFoods.length, { app: appFoods.length, coach: coachFoods.length })
  const coachByName = new Map(coachFoods.map(e => [e.name, e]))
  const missing = appFoods.filter(e => !coachByName.has(e.name)).map(e => e.name)
  check('every food in the app copy is in the coach\'s', missing.length === 0, missing)
  const appNames = new Set(appFoods.map(e => e.name))
  check('...and the coach has none of its own', coachFoods.every(e => appNames.has(e.name)), coachFoods.filter(e => !appNames.has(e.name)).map(e => e.name))
  // The one that matters most. A food tagged contains_sesame in the app and
  // untagged for the coach is filtered on the screen and costed in the chat.
  const differing = appFoods.filter(e => JSON.stringify(e) !== JSON.stringify(coachByName.get(e.name))).map(e => e.name)
  check('every food carries identical tags, macros, aliases and piece weights in both', differing.length === 0, differing.slice(0, 10))
  for (const [food, tag] of [
    ['celery', 'contains_celery'], ['mustard', 'contains_mustard'], ['sesame oil', 'contains_sesame'],
    ['sesame seeds', 'contains_sesame'], ['peanut butter', 'contains_nuts'], ['pork sausage', 'contains_pork'],
  ] as [string, string][]) {
    check(`"${food}" is ${tag} in the app copy`, appFoods.find(e => e.name === food)?.tags[tag] === true)
    check(`"${food}" is ${tag} for the coach`, coachByName.get(food)?.tags[tag] === true)
  }
}

console.log('\n4. The same words resolve to the same food')
{
  // Every phrase here has a history. The first block is the drift itself:
  // each resolved differently in the two copies on 9 Oct 2026.
  const PHRASES: [string, string | null | undefined][] = [
    ['crème fraîche', 'creme fraiche'],          // accents: only the app copy folded them
    ['half-fat crème fraîche', 'creme fraiche'],
    ['coffee', 'black coffee'],                  // one of 9 foods the coach lacked
    ['rye crispbreads', 'rye crispbread'],
    ['mixed berries', 'mixed berries'],
    ['ricotta', 'ricotta cheese'],
    ['marinara', 'marinara sauce'],
    ['cannellini beans', 'cannellini beans'],
    ['brown lentils', 'brown lentils'],
    ['pancake mix', 'pancake mix'],
    ['chocolate rice cake', 'rice cakes'],       // stored plural: only the coach's copy folded it
    ['rice cake', 'rice cakes'],
    // AGREEMENT ONLY (undefined = "the same in both, whatever it is"). These
    // three disagreed on 9 Oct, and what they resolve to today is not right
    // either — "potatoes" reaches mashed potato through an alias. That is the
    // name matcher's problem (docs/plans/ingredient-lookup-truth.md), and
    // pinning today's answer here would enforce it.
    ['potatoes', undefined],                     // -oes plural: only the app copy had the rule
    ['seitan-based strips', undefined],          // punctuation to a space: only the app copy
    ['blueberry pancakes with berries', undefined],
    // ...and everyday names, so a regression in either pass shows here.
    ['eggs', 'egg'], ['scrambled egg', 'egg'], ['bread', 'white bread'], ['whole milk', 'milk whole'],
    ['grilled chicken breast fillet', 'chicken breast'], ['cooked white rice', 'white rice cooked'],
    ['scallions', 'spring onion'], ['greek yoghurt 0%', 'greek yoghurt 0%'], ['butter', 'butter'],
    ['sausage', 'pork sausage'], ['xyzzy powder', null], ['latte', null], ['', null],
  ]
  for (const [phrase, expected] of PHRASES) {
    const a = app.lookupIngredient(phrase)?.name ?? null
    const c = coach.lookupIngredient(phrase)?.name ?? null
    if (expected === undefined) check(`"${phrase}" resolves the same in both (${a ?? 'nothing'})`, a === c, { app: a, coach: c })
    else check(`"${phrase}" → ${expected ?? 'nothing'} in both`, a === expected && c === expected, { app: a, coach: c })
  }
  // And wholesale: every stored name and alias, as written.
  const keys = appFoods.flatMap(e => [e.name, ...e.aliases])
  const disagree = keys.filter(k => app.lookupIngredient(k)?.name !== coach.lookupIngredient(k)?.name)
  check(`all ${keys.length} stored names and aliases resolve identically`, keys.length > 600 && disagree.length === 0, disagree.slice(0, 10))
}

console.log('\n5. The same meal comes to the same numbers')
{
  type Line = { name: string; quantity: number; unit: string }
  const MEALS: [string, Line[]][] = [
    ['2 eggs', [{ name: 'egg', quantity: 2, unit: 'whole' }]],
    ['2 eggs, sent as "eggs"', [{ name: 'eggs', quantity: 2, unit: 'eggs' }]],
    ['2 slices of bread', [{ name: 'bread', quantity: 2, unit: 'slices' }]],
    ['eggs on buttered toast', [{ name: 'scrambled egg', quantity: 2, unit: 'whole' }, { name: 'bread', quantity: 2, unit: 'slice' }, { name: 'butter', quantity: 10, unit: 'g' }]],
    ['2 chocolate rice cakes', [{ name: 'chocolate rice cake', quantity: 2, unit: 'whole' }]],
    ['100 g crème fraîche', [{ name: 'crème fraîche', quantity: 100, unit: 'g' }]],
    ['a coffee', [{ name: 'coffee', quantity: 250, unit: 'ml' }]],
    ['yoghurt, whey and berries', [{ name: 'greek yoghurt 0%', quantity: 160, unit: 'g' }, { name: 'whey protein powder', quantity: 1, unit: 'scoop' }, { name: 'raspberries', quantity: 70, unit: 'g' }]],
    ['a wrap and a large latte', [{ name: 'chicken caesar wrap', quantity: 1, unit: 'whole' }, { name: 'whole milk latte', quantity: 1, unit: 'large' }]],
    ['something neither knows', [{ name: 'flargle root', quantity: 50, unit: 'g' }, { name: 'oats', quantity: 50, unit: 'g' }]],
  ]
  for (const [said, lines] of MEALS) {
    const a = app.computeMealMacros(lines)
    const c = coach.computeMealMacros(lines)
    const pick = (m: typeof a) => ({ kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, coverage: m.coverage, unmatched: m.unmatched })
    check(`${said}: ${a.kcal} kcal in both`, JSON.stringify(pick(a)) === JSON.stringify(pick(c)), { app: pick(a), coach: pick(c) })
  }
  // Agreement alone would pass two copies that are wrong together, which is
  // the state the eggs were in for five weeks. So three absolute figures.
  const eggs = coach.computeMealMacros([{ name: 'egg', quantity: 2, unit: 'whole' }])
  check('the coach\'s 2 eggs are about 155 kcal, not 3', eggs.kcal >= 140 && eggs.kcal <= 190, eggs.kcal)
  const toast = coach.computeMealMacros([{ name: 'bread', quantity: 2, unit: 'slices' }])
  check('the coach\'s 2 slices of bread are about 190 kcal, not 5', toast.kcal >= 150 && toast.kcal <= 230, toast.kcal)
  const cake = coach.computeMealMacros([{ name: 'chocolate rice cake', quantity: 2, unit: 'whole' }])
  check('the app\'s and coach\'s 2 rice cakes are counted at all', cake.kcal > 40 && cake.unmatched.length === 0 && app.computeMealMacros([{ name: 'chocolate rice cake', quantity: 2, unit: 'whole' }]).kcal === cake.kcal, cake)
}

console.log('\n6. Merging the two files did not loosen the diet check')
{
  // The merge brought the coach's extra singular keys into the app ("prawn"
  // for "prawns"), which is what lets "chocolate rice cake" be costed. On the
  // DIET check a new match is a weaker answer — unresolved is refused for
  // every restriction, resolved is judged by one entry's tags — so that check
  // keeps reading the names exactly as stored. Measured on the day: 238,194
  // verdicts (10,827 phrases x 22 restrictions), none changed.
  const DISHES: [string, string, string][] = [
    ['prawn cocktail', 'prawns', 'egg-free'],        // mayonnaise is egg; plain prawns are not
    ['sausage roll', 'pork sausage', 'dairy-free'],  // pastry is butter; a plain sausage is not
    ['peanut sauce', 'peanuts', 'gluten-free'],      // soy sauce is wheat; plain peanuts are not
    ['date syrup', 'dates', 'low-carb'],
  ]
  for (const [dish, widerReading, restriction] of DISHES) {
    check(`the costing lookup reads "${dish}" as ${widerReading} (the wider reading exists)`, app.lookupIngredient(dish)?.name === widerReading, app.lookupIngredient(dish)?.name)
    check(`...the diet check's lookup does not resolve it`, app.lookupIngredientAsStored(dish) === null, app.lookupIngredientAsStored(dish)?.name)
    const verdict = validateMealAgainstDiet([{ name: dish, quantity: 100, unit: 'g' }], [restriction])
    check(`...so "${dish}" is still refused for ${restriction}, as it was before the merge`, verdict.ok === false && /could not be resolved/.test(verdict.violations[0]?.reason ?? ''), verdict)
  }
  check('the as-stored lookup still finds what is stored: "prawns", "rice cakes", "grilled chicken breast fillet"',
    app.lookupIngredientAsStored('prawns')?.name === 'prawns' && app.lookupIngredientAsStored('rice cakes')?.name === 'rice cakes' && app.lookupIngredientAsStored('grilled chicken breast fillet')?.name === 'chicken breast')
  const dietSrc = readFileSync(join(ROOT, 'src/lib/diet-rules.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('the diet rules call the as-stored lookup, and only that one',
    /\blookupIngredientAsStored\(/.test(dietSrc) && !/\blookupIngredient\(/.test(dietSrc))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('One food database: the coach reads what the app reads.\n')
