// THE COACH'S OFFERS SAY ONLY WHAT IS TRUE (17 Nov 2026, the chat review, his "Build it all"). Four of the six
// reported defects, held by behaviour:
//   1. an amount on a meal card is one he said, never the coach's guess ("2 large"); a swap he gave no amount for is
//      sized to the calories of the food it replaces and the card says so; an addition with no amount is asked;
//   2. no "raw" / "dry" in a dish's NAME (the lines keep their weighing word);
//   3. sweet potato sizes are the USDA small / medium / large, and a bare one is a medium;
//   4. a "Just today / Whole block" choice he has already answered in his own words is not asked again.
import { amountSaid, unsaidAmounts, sizedToReplace } from '../src/lib/amount-said'
import { appAsksFirst } from '../src/lib/app-asks-first'
import { dishNameWords } from '../src/lib/as-weighed'
import { computeMealMacros } from '../src/lib/food-db'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { scopeChoiceNeeded } from '../src/lib/offer-rules'
import { buildMealFoodReplaceProposal } from '../src/lib/meal-food-edit'
import { buildMealFoodAddProposal } from '../src/lib/meal-food-add'
import { readFileSync } from 'node:fs'
import { shareLineIfReal } from '../src/lib/meal-food-add'
import { mealOnDay } from '../src/lib/meal-on-day'
import { foodDislikesToAsk } from '../src/lib/food-exclusions'
import { offerWordsProblem } from '../src/lib/offer-rules'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail).slice(0, 300)})` : ''}`) }
}

console.log('1. An amount on the card is one he said')
check('"2 large sweet potato" is not his when he said "swap the rice for sweet potato"', !amountSaid('2 large sweet potato', 'swap the rice for sweet potato'))
check('...and is his when he said "two large sweet potatoes"', amountSaid('2 large sweet potato', 'make it two large sweet potatoes'))
check('"1 banana" is his when he said "add a banana"', amountSaid('1 banana', 'add a banana to breakfast'))
check('"200g rice" is his when he said "200g"', amountSaid('200g rice', 'swap for 200g rice'))
check('"150g rice" is not his when he said "200g"', !amountSaid('150g rice', 'swap for 200g rice'))
check('unsaidAmounts lists only the guessed one', JSON.stringify(unsaidAmounts(['1 banana', '30g honey'], 'add a banana and some honey')) === JSON.stringify(['30g honey']))
const sized = sizedToReplace('2 large sweet potato', '70g dry basmati rice')
const kcal = (l: string) => computeMealMacros([parseIngredientLine(l)]).kcal
check('a swap with no amount is sized to the calories of what it replaces', !!sized && Math.abs(kcal(sized) - kcal('70g dry basmati rice')) / kcal('70g dry basmati rice') < 0.06, { sized, a: sized && kcal(sized), b: kcal('70g dry basmati rice') })

const meal = { name: 'Chicken and rice', ingredients: ['150g raw chicken breast', '70g dry basmati rice', '100g broccoli'], macros: { calories: 520, protein: 45, carbs: 60, fat: 6 } }
const base = { currentMeal: meal, profileId: 'p', todayDate: '2026-11-17', targets: { calories: 2400, protein: 160, carbs: 260, fat: 75 } as never, mealsPerDay: 3, skipBreakfast: false, includeSnacks: false, dietaryPreferences: [] }
const rep = buildMealFoodReplaceProposal({ ...base, userSaid: 'swap the rice for sweet potato at lunch', rawArgs: { meal_slot: 'lunch', food: 'rice', with_food: ['2 large sweet potato'] } } as never)
const repLine = rep.ok ? JSON.stringify(rep.diff) : rep.reason
check('the replace card does not carry the guessed "2 large"', rep.ok && !/2 large/.test(repLine), repLine)
check('...it carries a sized line and says why', rep.ok && /Sized to match the .*rice.* it replaces/.test(repLine), repLine)
const said = buildMealFoodReplaceProposal({ ...base, userSaid: 'swap the rice for 2 large sweet potatoes', rawArgs: { meal_slot: 'lunch', food: 'rice', with_food: ['2 large sweet potato'] } } as never)
check('an amount he said is kept as he said it', said.ok && /2 large sweet potato/.test(JSON.stringify(said.diff)) && !/Sized to match/.test(JSON.stringify(said.diff)), said.ok ? said.diff : said.reason)
const add = buildMealFoodAddProposal({ ...base, userSaid: 'add some honey to lunch', rawArgs: { meal_slot: 'lunch', food_lines: ['30g honey'] } } as never)
check('an addition with a guessed amount is ASKED, never built', !add.ok && /How much/.test(add.reason), add.ok ? 'built' : add.reason)

console.log('\n2. No weighing word in a dish name')
check('"raw" leaves the name', dishNameWords('200g raw potato') === '200g potato', dishNameWords('200g raw potato'))
check('"dry" leaves the name', dishNameWords('60g dry oats') === '60g oats')
check('a cooking word that says what the dish is stays', dishNameWords('roast chicken') === 'roast chicken')
check('the replace card\'s dish name has no "raw"', rep.ok && !/raw|dry /i.test(String((rep.payload as { option?: { name?: string } }).option?.name ?? JSON.stringify(rep.diff).match(/"name":"[^"]*"/)?.[0] ?? '')), rep.ok ? (rep.payload as never) : '')

console.log('\n3. Sweet potato sizes')
const g = (l: string) => computeMealMacros([parseIngredientLine(l)]).lines[0]?.grams
check('small 60 g, medium 114 g, large 180 g (baked, USDA)', g('1 small sweet potato') === 60 && g('1 medium sweet potato') === 114 && g('1 large sweet potato') === 180, [g('1 small sweet potato'), g('1 medium sweet potato'), g('1 large sweet potato')])
check('a bare one is a medium', g('1 sweet potato') === g('1 medium sweet potato'), g('1 sweet potato'))
check('raw is the same potato before the bake (heavier)', (g('1 large raw sweet potato') ?? 0) > (g('1 large sweet potato') ?? 0), g('1 large raw sweet potato'))
check('the coach\'s copy of the food table carries the same sizes', readFileSync('supabase/functions/_shared/food-db.ts', 'utf8').includes("'sweet potato baked': { whole: 114, small: 60, medium: 114, large: 180, cup: 200 }"))

console.log('\n4. A scope he has said is not asked again')
check('"swap squats for today" needs no "Just today" choice', !scopeChoiceNeeded('today', 'swap squats for leg press today'))
check('"from now on" needs no "Whole block" choice', !scopeChoiceNeeded('permanent', 'swap squats for leg press from now on'))
check('"swap squats for leg press" with no time still asks', scopeChoiceNeeded('today', 'swap squats for leg press'))
check('"tonight ... going forward" still asks (he said both)', scopeChoiceNeeded('today', 'swap squats tonight and going forward'))
check('a "today" card on a "from now on" message still asks', scopeChoiceNeeded('today', 'swap squats from now on'))
const chat = readFileSync('src/components/ChatAssistant.tsx', 'utf8')
check('the chat drops the choice off his words, for every card at once', /!scopeChoiceNeeded\(scopeNow, userSaid\)/.test(chat))

console.log('\n5. A calorie line only when it is real, about the day the card describes')
check('a 40 kcal gap on a 2,400 kcal day says nothing', shareLineIfReal('lunch', -40, 2400) === null)
check('a 300 kcal gap says it', /300 kcal over the usual lunch share/.test(shareLineIfReal('lunch', 300, 2400) ?? ''), shareLineIfReal('lunch', 300, 2400))
const add2 = readFileSync('src/lib/meal-food-add.ts', 'utf8') + readFileSync('src/lib/custom-meal.ts', 'utf8')
check('both meal cards use the thresholded line, never the bare one', (add2.match(/shareLineIfReal\(slot, vsBudget, input\.targets\.calories\)/g) ?? []).length === 2 && !/text: shareLine\(/.test(add2))
const plan = [{ meal: 'Breakfast', items: [{ name: 'Porridge' }, { name: 'Eggs on toast' }] }] as never
const upcoming = [{ date: '2026-11-18', dayName: 'Wednesday', meals: { breakfast: 'Eggs on toast' } }]
check('today\'s card edits today\'s meal', mealOnDay(plan, upcoming, 'breakfast', '2026-11-17', '2026-11-17').item?.name === 'Porridge')
check('tomorrow\'s card edits tomorrow\'s meal, never today\'s', mealOnDay(plan, upcoming, 'breakfast', '2026-11-18', '2026-11-17').item?.name === 'Eggs on toast')
const blind = mealOnDay(plan, upcoming, 'breakfast', '2026-11-20', '2026-11-17')
check('a day it cannot see is said, with no meal to price', !blind.item && /won't change it blind/.test(blind.unseen ?? ''), blind)
check('both meal-edit doors use it', (chat.match(/const onDay = mealOnDay\(slotName, /g) ?? []).length === 2 && !/const current = mealPlan\.find\(m => m\.meal\.toLowerCase\(\) === slotName\)\?\.items\[0\]/.test(chat))
check('a day whose meal it cannot see is said, never priced blind', (chat.match(/if \(onDay\.unseen\) \{ refusal = onDay\.unseen \}/g) ?? []).length === 2)

console.log('\n5b. One line, numbers on tap: a cost is never folded away')
const card = readFileSync('src/components/chat/ProposalCard.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const warnAt = card.indexOf('{warnings.map((imp, i) => implication(imp, `w${i}`))}'), foldAt = card.indexOf('data-testid="offer-details"')
check('a cost (warn) line is drawn before, and outside, the folded details', warnAt > 0 && foldAt > warnAt, { warnAt, foldAt })
check('...and only the quiet lines go inside', /const quiet = \(diff\.implications \?\? \[\]\)\.filter\(imp => imp\.severity !== 'warn'\)/.test(card) && /\{quiet\.map\(/.test(card.slice(foldAt)))
check('the details start folded', /useState\(false\)/.test(card.slice(card.indexOf('const [detailsOpen'), card.indexOf('const [detailsOpen') + 60)))

console.log('\n6. The exam of 17 Nov 2026: three things the app now holds itself')
check('"not really a fan of the salmon you\'ve put in tonight" is a dislike to ask about', JSON.stringify(foodDislikesToAsk("not really a fan of the salmon you've put in tonight")) === '["salmon"]', foodDislikesToAsk("not really a fan of the salmon you've put in tonight"))
check('...and so is "not a big fan of tuna"', JSON.stringify(foodDislikesToAsk('I am not a big fan of tuna')) === '["tuna"]')
// THE DECISION IS ONE FUNCTION NOW (19 Nov 2026, app-asks-first.ts): asked for what it does, plus the one thing only
// the chat's source can show, that it is called before any offer is built.
const asksAt = chat.indexOf('appAsksFirst(result.proposal.kind, result.proposal.rawArgs, userSaid)')
check('the chat asks that function before it builds any offer', asksAt > 0 && asksAt < chat.indexOf("    if (result.proposal && profile.id) {")
  && /if \(asksFirst && asksFirst\.why !== 'race_date'\) return \{ text: asksFirst\.text, outcome: 'refused' \}/.test(chat.slice(asksAt, asksAt + 300)), asksAt)
check('a bare dislike becomes the question before any meal-change card', appAsksFirst('propose_meal_swap', {}, "not really a fan of the salmon you've put in tonight")?.why === 'dislike')
check('...unless he asked for the change ("swap it")', appAsksFirst('propose_meal_swap', {}, "not a fan of the salmon tonight, swap it for something else") === null)
check('...and only for an offer that changes a meal', appAsksFirst('propose_exercise_swap', {}, "not really a fan of the salmon you've put in tonight") === null)
const usualAsk = appAsksFirst('propose_meal_addition', {}, 'most weeknights I do salmon with rice and broccoli')
check('a usual meal with no amounts is asked "how much of each" before a card', usualAsk?.why === 'usual_meal' && /How much of each do you usually have\?/.test(usualAsk.text), usualAsk)
check('...and with amounts it is not asked', appAsksFirst('propose_meal_addition', {}, 'most weeknights I do 150g salmon with rice') === null)
check('...and a meal he does not call usual is not asked', appAsksFirst('propose_meal_addition', {}, 'add a salmon and rice dinner tonight') === null)
check('a goal change is never refused as a one-off ("...instead")', offerWordsProblem('propose_goal_change', 'I want to stop cutting and start building muscle instead', { hedged: false }) === null)

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('The offers say only what he said and what is true.')
