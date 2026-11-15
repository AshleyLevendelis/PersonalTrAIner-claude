// A food the app cannot count, in a log (Marcus test, 15 Nov 2026; his ruling "Estimate when asked").
// One exit: the count of failures.
import { readFileSync } from 'node:fs'
import { askedToEstimate, acceptEstimates, estimateAssumption, notCountedQuestion } from '../src/lib/log-estimate'
import { lookupIngredient, computeMealMacros } from '../src/lib/food-db'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('§1 The takeaway basics are in the food list')
for (const [said, want] of [['chips', 'chips'], ['potato chips', 'chips'], ['oven chips', 'chips'], ['fries', 'french fries'], ['chicken burger', 'chicken burger'], ['crisps', 'crisps'], ['tortilla chips', 'tortilla chips']] as const) {
  ok(lookupIngredient(said)?.name === want, `"${said}" is ${want}`, lookupIngredient(said)?.name ?? null)
}
const meal = computeMealMacros([{ name: 'chicken burger', quantity: 1, unit: 'burger' }, { name: 'chips', quantity: 1, unit: 'portion' }] as never)
ok(meal.unmatched.length === 0 && meal.kcal > 700 && meal.kcal < 1000, 'one chicken burger and a portion of chips adds up (700-1000 kcal)', meal.kcal)
ok(lookupIngredient('chicken burger')?.tags.contains_meat === true && lookupIngredient('chips')?.tags.contains_meat !== true, 'the burger is meat, the chips are not')

console.log('§2 The question never asks "how much"')
const q1 = notCountedQuestion(['flargle'])
ok(/^I don't have \*\*flargle\*\* in my food list/.test(q1) && !/how much/i.test(q1), 'names the food, no "how much"', q1)
ok(/say "estimate it"/.test(q1) && /leave it out\.$/.test(q1), 'offers an estimate or to leave it out', q1)
ok(/\*\*a\*\* and \*\*b\*\*/.test(notCountedQuestion(['a', 'b'])) && /them out\.$/.test(notCountedQuestion(['a', 'b'])), 'two foods: "and", "them"')

console.log('§3 An estimate only when HE asked, and only when it adds up')
const burger = { name: 'mystery burger', portion: '1 regular', kcal: 500, protein: 25, carbs: 45, fat: 24 }
ok(askedToEstimate('one regular burger, you estimate it') && askedToEstimate('best guess is fine') && !askedToEstimate('I had a burger'), 'asking is read off his words')
ok(acceptEstimates(['mystery burger'], [burger], 'I had a burger') === null, 'not asked: no estimate used')
ok(acceptEstimates(['mystery burger'], [burger], 'you estimate it')?.length === 1, 'asked, adds up: used')
ok(acceptEstimates(['mystery burger'], [{ ...burger, kcal: 1500 }], 'you estimate it') === null, 'macros that do not make the kcal: refused')
ok(acceptEstimates(['mystery burger'], [{ ...burger, kcal: 2400, protein: 120, carbs: 216, fat: 115 }], 'you estimate it') === null, 'over 2000 kcal for one food: refused')
ok(acceptEstimates(['mystery burger', 'flargle'], [burger], 'you estimate it') === null, 'one missing food without an estimate: none used (all or nothing)')
ok(acceptEstimates(['flargle'], [burger], 'you estimate it') === null, 'an estimate for a different food is not used')
ok(estimateAssumption(burger) === '1 regular mystery burger (an estimate, about 500 kcal)', 'the card says it is an estimate, with its kcal', estimateAssumption(burger))

console.log('§4 Both sides use it')
const fn = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
const h = fn.slice(fn.indexOf('name === "log_meal"'), fn.indexOf('if (name === "log_workout")'))
ok(/acceptEstimates\(notCounted, args\.estimates, message\)/.test(h), "the coach's server checks estimates against his message")
ok(/assumptions: \[\.\.\.assumptions, \.\.\.estimates\.map\(estimateAssumption\)\]/.test(h) && /unmatched: \[\], coverage: 1/.test(h), 'an estimated card carries the assumption lines and counts every food')
ok(/estimates: \{\s*type: "array"/.test(fn), 'the tool can send estimates')
const client = strip(readFileSync('src/lib/meal-log-proposal.ts', 'utf8'))
ok(/reason: notCountedQuestion\(notCounted\)/.test(client), "the app's backstop asks the same question")
ok(readFileSync('supabase/functions/_shared/log-estimate.ts', 'utf8').includes(readFileSync('src/lib/log-estimate.ts', 'utf8').slice(400, 900)), "the server's copy is the app's file")

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
