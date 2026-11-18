// THE ALLERGY CARD (his ruling 15 Nov 2026, "Allergy card, peanuts split"; docs/plans/allergy-card.md).
// Run: npm run test:allergy-card
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { FOOD_DB } from '../src/lib/food-db'
import { validateMealAgainstDiet, SELECTABLE_DIETARY_PREFERENCES, DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { mealRestrictionsOf } from '../src/lib/health-conditions'
import { allergiesOf, allergyRestrictions, allergyForRule, allergyName, carriesPen, describesReaction, REACTION_FIRST_LINE,
  labelLines, allergyLine, allergensSaid, recordFor, withoutSafetyPromises, NO_PROMISE_LINE, ALLERGEN_RULES, ALLERGY_OFFER_WORDS,
  type AllergyRecord } from '../src/lib/allergies'
import { namedFoodClash, clashSentence, allergyRefusal, likeRefusal } from '../src/lib/named-food-clash'
import { detectAllergenTags } from '../src/lib/onboarding-slots'

const ROOT = process.cwd()
let ran = 0, failures = 0
function ok(label: string, cond: boolean, extra?: unknown) {
  ran++
  if (cond) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}`, extra === undefined ? '' : JSON.stringify(extra)) }
}
const meal = (...lines: string[]) => ({ ingredients: lines })
const toLine = (l: string) => { const m = /^(\d+)(g|ml)\s+(.+)$/.exec(l); return m ? { name: m[3], quantity: Number(m[1]), unit: 'g' } : { name: l, quantity: 50, unit: 'g' } }
const passes = (lines: string[], rules: string[]) => validateMealAgainstDiet(lines.map(toLine) as never, rules as never).ok
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function main() {
  console.log('[1] Peanuts and tree nuts are two rules; "nut-free" still means both')
  ok('peanut-free refuses peanut butter', !passes(['30g peanut butter'], ['peanut-free']))
  ok('peanut-free refuses peanut oil and suya spice', !passes(['10g peanut oil'], ['peanut-free']) && !passes(['5g suya spice rub'], ['peanut-free']))
  ok('peanut-free allows almonds, walnuts and pesto', passes(['30g almonds'], ['peanut-free']) && passes(['30g walnuts'], ['peanut-free']) && passes(['20g pesto'], ['peanut-free']))
  ok('tree-nut-free refuses almonds, almond milk, pesto and chocolate spread', ['30g almonds', '200ml almond milk', '20g pesto', '15g chocolate spread'].every(l => !passes([l], ['tree-nut-free'])))
  ok('tree-nut-free allows peanut butter and peanuts', passes(['30g peanut butter'], ['tree-nut-free']) && passes(['30g peanuts'], ['tree-nut-free']))
  for (const both of ['mixed nuts', 'trail mix', 'granola', 'muesli', 'cereal bar', 'protein bar generic', 'chocolate bar']) {
    ok(`"${both}" is refused by BOTH rules (the safe side)`, !passes([`40g ${both}`], ['peanut-free']) && !passes([`40g ${both}`], ['tree-nut-free']))
  }
  ok('nut-free still refuses a peanut food and a tree-nut food', !passes(['30g peanut butter'], ['nut-free']) && !passes(['30g almonds'], ['nut-free']))
  const nutFoods = FOOD_DB.filter(e => e.tags.contains_nuts)
  ok(`every nut food carries at least one of the two tags (${nutFoods.length} foods)`, nutFoods.length >= 20 && nutFoods.every(e => e.tags.contains_peanuts || e.tags.contains_tree_nuts))
  ok('no food without the nut tag carries either', FOOD_DB.filter(e => !e.tags.contains_nuts).every(e => !e.tags.contains_peanuts && !e.tags.contains_tree_nuts))
  ok('a chicken dinner passes both', passes(['150g chicken breast', '200g rice'], ['peanut-free', 'tree-nut-free']))

  console.log('\n[2] Oats, for a coeliac who avoids them all')
  for (const o of ['oats', 'oat milk', 'oatcakes', 'granola', 'muesli', 'flapjack', 'oat flour']) ok(`oat-free refuses "${o}"`, !passes([`50g ${o}`], ['oat-free']))
  ok('oat-free allows rice and potatoes', passes(['200g rice', '200g potato boiled'], ['oat-free']))
  ok('at least 6 foods carry the oat tag', FOOD_DB.filter(e => e.tags.contains_oats).length >= 6)

  console.log('\n[3] The record is read clean and switches the right rules on')
  const rec = (a: Partial<AllergyRecord> & { allergen: string }) => a as unknown
  ok('rubbish is dropped, one record per allergen', allergiesOf({ allergies: [rec({ allergen: 'peanuts', pen: true }), rec({ allergen: 'peanuts' }), rec({ allergen: 'unicorn' }), null, 'x'] }).length === 1)
  ok('a missing or malformed column is none', allergiesOf({}).length === 0 && allergiesOf({ allergies: 'peanuts' }).length === 0 && allergiesOf(null).length === 0)
  ok('pen and traces keep their types, anything else is "not said"', (() => { const [a] = allergiesOf({ allergies: [{ allergen: 'egg', pen: 'yes', traces: 'maybe' }] }); return a.pen === null && a.traces === null })())
  ok('peanuts switches on peanut-free and not nut-free', JSON.stringify(mealRestrictionsOf({ dietary_preferences: [], allergies: [{ allergen: 'peanuts' }] })) === '["peanut-free"]')
  ok('tree nuts switches on tree-nut-free only', JSON.stringify(mealRestrictionsOf({ dietary_preferences: ['vegetarian'], allergies: [{ allergen: 'tree nuts' }] })) === '["vegetarian","tree-nut-free"]')
  ok('a stored copy of a card-only rule is ignored without the record', mealRestrictionsOf({ dietary_preferences: ['peanut-free', 'oat-free', 'vegan'] }).join() === 'vegan')
  ok('coeliac who avoids oats: gluten-free and oat-free', mealRestrictionsOf({ allergies: [{ allergen: 'gluten', coeliac: true, oats: 'avoid' }] }).join() === 'gluten-free,oat-free')
  ok('coeliac with certified oats: gluten-free only', mealRestrictionsOf({ allergies: [{ allergen: 'gluten', coeliac: true, oats: 'certified' }] }).join() === 'gluten-free')
  ok('crustaceans and molluscs share the shellfish rule, once', allergyRestrictions(allergiesOf({ allergies: [{ allergen: 'crustaceans' }, { allergen: 'molluscs' }] })).join() === 'shellfish-free')
  ok('a rule already picked is not doubled', mealRestrictionsOf({ dietary_preferences: ['dairy-free'], allergies: [{ allergen: 'milk' }] }).join() === 'dairy-free')
  ok('nobody can pick the three card-only rules', ['peanut-free', 'tree-nut-free', 'oat-free'].every(r => !SELECTABLE_DIETARY_PREFERENCES.includes(r as never) && DIETARY_PREFERENCES.includes(r as never)))
  ok('setup\'s words never set a card-only rule', (() => { const t = detectAllergenTags("I'm allergic to peanuts"); return t.includes('nut-free') && !t.includes('peanut-free' as never) })())

  console.log('\n[4] What is said (his answers 1 and 2)')
  const treeNut = allergiesOf({ allergies: [{ allergen: 'tree nuts', pen: true, traces: 'avoid' }] })
  const clash = namedFoodClash('swap my snack for almond butter on toast', ['tree-nut-free'])
  ok('almond butter clashes with tree-nut-free', !!clash && clash.restriction === 'tree-nut-free' && clash.allergen === true, clash)
  ok('peanut butter does NOT clash with tree-nut-free', namedFoodClash('add peanut butter to my breakfast', ['tree-nut-free']) === null)
  ok('with the allergy recorded the refusal says "you have a tree-nut allergy"', !!clash && /and you have a tree-nut allergy, so I won't suggest/.test(clashSentence(clash, treeNut)), clash && clashSentence(clash, treeNut))
  ok('and points at Profile, Food, Allergies', !!clash && /Your allergies are on Profile, under Food, Allergies\.$/.test(allergyRefusal(clash, treeNut) ?? ''))
  const tick = namedFoodClash('add almond butter', ['nut-free'])
  ok('a plain diet tick keeps "your profile says nut-free" and never claims an allergy', !!tick && /your profile says nut-free/.test(clashSentence(tick, treeNut)) && !/allergy/.test(allergyRefusal(tick, treeNut) ?? ''))
  ok('the like refusal follows the same rule', !!clash && /you have a tree-nut allergy, so I haven't saved/.test(likeRefusal(clash, treeNut)))
  ok('a coeliac is "you have coeliac disease"', (() => { const c = namedFoodClash('add oats to breakfast', ['gluten-free', 'oat-free']); const a = allergiesOf({ allergies: [{ allergen: 'gluten', coeliac: true, oats: 'avoid' }] }); return !!c && /you have coeliac disease/.test(clashSentence(c, a)) })())
  ok('allergyName: "egg allergy" takes "an"', /you have an egg allergy/.test(clashSentence({ food: 'omelette', restriction: 'egg-free', allergen: true } as never, allergiesOf({ allergies: [{ allergen: 'egg' }] }))))
  ok('allergyForRule finds the record behind a rule and nothing for another', allergyForRule(treeNut, 'tree-nut-free')?.allergen === 'tree nuts' && allergyForRule(treeNut, 'peanut-free') === null && allergyName(treeNut[0]) === 'tree-nut allergy')
  ok('the first-aid line is the one he approved', REACTION_FIRST_LINE === 'Use your adrenaline pen now and call 999.')
  ok('carriesPen reads the pen and nothing else', carriesPen(treeNut) && !carriesPen(allergiesOf({ allergies: [{ allergen: 'egg', pen: false }, { allergen: 'milk' }] })))
  for (const s of ["my lips are swelling", "I can't breathe properly", 'my throat feels tight after that curry', "I think I'm having an allergic reaction", 'tingling mouth after the satay', 'struggling to swallow']) ok(`a reaction: "${s}"`, describesReaction(s))
  for (const s of ['what should I eat before the gym?', 'I have a nut allergy, can I have pesto?', 'my legs are tight today', 'can I swap the almonds', 'I feel breathless after sprints']) ok(`not a reaction: "${s}"`, !describesReaction(s))
  ok('the line on Profile reads in words', allergyLine(treeNut[0]) === 'Tree nuts · carries an adrenaline pen · avoids traces')

  console.log('\n[5] Said in the chat')
  ok('"I\'m allergic to tree nuts" is tree nuts', allergensSaid("I'm allergic to tree nuts").join() === 'tree nuts')
  ok('"peanut allergy" is peanuts only', allergensSaid('I have a peanut allergy').join() === 'peanuts')
  ok('a bare "nuts" is both, the safe side', allergensSaid("I'm allergic to nuts").sort().join() === 'peanuts,tree nuts')
  ok('"shellfish" is crustaceans and molluscs, never fish', allergensSaid('allergic to shellfish').sort().join() === 'crustaceans,molluscs')
  ok('"fish allergy" is fish', allergensSaid('I have a fish allergy').join() === 'fish')
  ok('"I\'m coeliac" is gluten, recorded as coeliac', allergensSaid("I'm coeliac").join() === 'gluten' && recordFor('gluten', "I'm coeliac").coeliac === true && recordFor('gluten', 'allergic to wheat').coeliac === null)
  ok('a denial records nothing', allergensSaid("I'm not allergic to nuts").length === 0 && allergensSaid('I have no allergies').length === 0)
  ok('a food with no allergy word records nothing', allergensSaid('I love peanut butter').length === 0 && allergensSaid('can I have eggs for breakfast').length === 0)
  ok('the offer names it and promises nothing', /Shall I record your tree-nut allergy/.test(ALLERGY_OFFER_WORDS.offer('tree-nut allergy')) && /filtered, not verified/.test(ALLERGY_OFFER_WORDS.offer('x')))

  console.log('\n[6] The coach never promises what the app cannot check')
  const promised = withoutSafetyPromises('Great choice. Everything in your plan strictly avoids cross-contamination. Enjoy your dinner!')
  ok('the promise sentence is taken out and the app\'s line said once', promised.removed === 1 && !/strictly avoids/.test(promised.reply) && promised.reply.endsWith(NO_PROMISE_LINE) && /Great choice\./.test(promised.reply), promised)
  for (const s of ['This meal is completely safe for you.', 'It is guaranteed gluten-free.', 'There is no risk of cross-contamination.', 'Your dinner is free from traces of nuts.', 'That curry is safe for a coeliac.']) ok(`a promise: "${s}"`, withoutSafetyPromises(s).removed === 1)
  for (const s of ["I can't guarantee it's safe, so check the label.", 'Ingredients are filtered, not verified. Check labels if you have an allergy.', NO_PROMISE_LINE, 'Almond butter has tree nuts in it, and you have a tree-nut allergy, so I won\'t suggest it or add it to your meals.', 'Squat to a safe depth and keep your chest up.', 'Tamari is a good swap for soy sauce.']) ok(`left alone: "${s.slice(0, 50)}"`, withoutSafetyPromises(s).removed === 0, withoutSafetyPromises(s))
  ok('the rules that switch the check on include the three new ones', ['peanut-free', 'tree-nut-free', 'oat-free', 'nut-free', 'gluten-free'].every(r => ALLERGEN_RULES.includes(r)) && !ALLERGEN_RULES.includes('vegan'))

  console.log('\n[7] Traces and coeliac change what is SAID, never a filter')
  ok('traces: avoid adds a "may contain" line and no rule', labelLines(treeNut).length === 1 && /may contain/.test(labelLines(treeNut)[0]) && allergyRestrictions(treeNut).join() === 'tree-nut-free')
  ok('a coeliac gets the certified mark line; certified oats get their own', (() => { const l = labelLines(allergiesOf({ allergies: [{ allergen: 'gluten', coeliac: true, oats: 'certified' }] })); return l.length === 2 && /certified gluten-free mark/.test(l[0]) && /oats marked certified/.test(l[1]) })())
  ok('nothing recorded says nothing', labelLines([]).length === 0 && labelLines(allergiesOf({ allergies: [{ allergen: 'egg', traces: 'fine' }] })).length === 0)

  console.log('\n[8] It is wired, not only written')
  const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf-8'))
  const profile = strip(readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf-8'))
  const app = strip(readFileSync(join(ROOT, 'src/App.tsx'), 'utf-8'))
  const grocery = strip(readFileSync(join(ROOT, 'src/components/GroceryList.tsx'), 'utf-8'))
  const coach = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf-8')
  ok('the chat says the pen line when he carries one and describes a reaction', /carriesPen\(allergiesOf\(profile\)\)\s*&&\s*describesReaction\(userText\)/.test(chat) && /content:\s*REACTION_FIRST_LINE/.test(chat))
  ok('the pen line is added before the coach is asked', chat.indexOf('content: REACTION_FIRST_LINE') > 0 && chat.indexOf('content: REACTION_FIRST_LINE') < chat.indexOf("await offerFromApp('propose_pregnancy_tick'"))
  ok('the refusal and the like refusal are given the record', /allergyRefusal\(clash,\s*allergiesOf\(profile\)\)/.test(chat) && /likeRefusal\(c,\s*allergiesOf\(profile\)\)/.test(chat))
  ok('the coach\'s words go through the promise check when an allergen rule is on', /ALLERGEN_RULES\.includes\(r\)/.test(chat) && /withoutSafetyPromises\(out\.text\)\.reply/.test(chat))
  ok('the chat offers the card and its confirm writes the column', /offerFromApp\('propose_allergy_record'/.test(chat) && /update\(\{\s*allergies:\s*next\s*\}\)/.test(chat) && /isMissingColumnError\(error,\s*'allergies'\)/.test(chat))
  ok('the coach is sent the record in words', /allergies:\s*allergiesOf\(profile\)\.map\(allergyLine\)/.test(chat) && /context\.allergies\.join\(/.test(coach))
  ok('Profile has the Allergies row above Diet and saves through the one save', profile.indexOf('label="Allergies"') > 0 && profile.indexOf('label="Allergies"') < profile.indexOf('label="Diet"') && /savePatch\(\{\s*allergies:\s*next\s*\}\)/.test(profile))
  ok('a save before the database step says so', /'due_date',\s*'allergies'\]/.test(profile))
  ok('the profile is loaded with the record, and the shopping list is handed its lines', /allergies:\s*allergiesOf\(profileRow\)/.test(app) && /labelLines=\{allergyLabelLines\(allergiesOf\(profile\)\)\}/.test(app) && /labelLines\.map\(/.test(grocery))
  ok('the database step exists', existsSync(join(ROOT, 'supabase/migrations/20261118120000_add_allergies.sql')))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} allergy-card check(s) FAILED.`); process.exit(1) }
  console.log('The allergy card holds.')
}
main()
