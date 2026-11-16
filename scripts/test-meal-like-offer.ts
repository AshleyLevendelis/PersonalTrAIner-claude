// A meal he likes can go in the plan (16 Nov 2026). His screenshot: "I like having greek yoghurt with fruit and almonds
// for breakfast" was saved as a like and the plan did not change.
// Holds: which messages are a whole meal for a named meal; the offer and its buttons; "every day" only where the app
// offers it; the days a repeated meal covers; the add-a-meal card naming those days and its payload carrying them; and
// the chat wiring (offer after the save, "Just remember it" answered by the app, each later day picked and undone).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEAL_LIKE_OFFER, wholeMealLike, offersEveryDay, repeatDates, datesLabel } from '../src/lib/meal-like-offer'
import { buildMealAdditionProposal } from '../src/lib/meal-addition'

const ROOT = process.cwd()
let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

console.log('1. A whole meal he likes, for a named meal')
const his = wholeMealLike('I like having greek yoghurt with fruit and almonds for breakfast')
check('his own message: the meal and the meal of the day', his?.meal === 'greek yoghurt with fruit and almonds' && his.slot === 'breakfast', his)
const yes: [string, string][] = [
  ['I usually have eggs on toast for breakfast', 'breakfast'],
  ['I love chicken, rice and broccoli for dinner', 'dinner'],
  ['I often eat a tuna sandwich with crisps at lunch.', 'lunch'],
  ['I really like apple and peanut butter as a snack', 'snack'],
]
for (const [text, slot] of yes) {
  if (!slot) continue
  check(`"${text}" is a ${slot}`, wholeMealLike(text)?.slot === slot, wholeMealLike(text))
}
const no = [
  'I like eggs for breakfast',                      // one food: a like, not a meal
  'Do you like greek yoghurt with fruit for breakfast?', // a question
  'I like having eggs and toast for breakfast, is that ok?', // a question about it, not a like to act on
  'I like greek yoghurt with fruit and almonds',    // no meal of the day named
  "I don't like porridge with raisins for breakfast",
  '',
]
for (const text of no) check(`"${text}" is not offered as a meal`, wholeMealLike(text) === null, wholeMealLike(text))

console.log('\n2. The offer and its buttons')
const turn = MEAL_LIKE_OFFER.turn('greek yoghurt with fruit and almonds', 'breakfast')
check('it asks, in the app\'s words, whether to put it in the plan', /^Want it in your plan too\? It can be one of your breakfasts\./.test(turn), turn)
check('...with tomorrow, every day this week and just remember as buttons',
  turn.includes(`"Put greek yoghurt with fruit and almonds in tomorrow's breakfast"`) && turn.includes('"Have greek yoghurt with fruit and almonds every breakfast this week"') && turn.includes('"Just remember it"'), turn)
const dinner = MEAL_LIKE_OFFER.turn('chicken and rice', 'dinner')
check('every day is offered for breakfast and a snack only (lunch and dinner rotate)', offersEveryDay('breakfast') && offersEveryDay('snack') && !offersEveryDay('lunch') && !offersEveryDay('dinner') && !/every dinner/.test(dinner), dinner)

console.log('\n3. The days a repeated meal covers')
check('7 days from tomorrow stop at the last day the plan shows (today + 6)', JSON.stringify(repeatDates('2026-11-17', 7, '2026-11-16')) === JSON.stringify(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']), repeatDates('2026-11-17', 7, '2026-11-16'))
check('one day is one day; nonsense is one day', repeatDates('2026-11-17', 1, '2026-11-16').length === 1 && repeatDates('2026-11-17', NaN, '2026-11-16').length === 1)
check('the days are named', datesLabel(['2026-11-17', '2026-11-22']) === 'Tue 17 Nov to Sun 22 Nov' && datesLabel(['2026-11-17']) === 'Tue 17 Nov', datesLabel(['2026-11-17', '2026-11-22']))

console.log('\n4. The add-a-meal card for every day')
const base = {
  profileId: 'p1', targets: { calories: 2400, protein: 160, carbs: 260, fat: 80 } as never, mealsPerDay: 3, skipBreakfast: false, includeSnacks: false,
  dietaryPreferences: [], dislikedFoods: [], todayDate: '2026-11-16',
}
const rawArgs = { meal_slot: 'breakfast', meal_name: 'Greek yoghurt with berries and almonds', ingredients: ['250g low-fat greek yoghurt', '100g blueberries', '20g almonds'], date: '2026-11-17' }
const week = buildMealAdditionProposal({ ...base, rawArgs: { ...rawArgs, days: 7 } })
check('the dish is built and checked by the usual route', week.ok, week.ok ? '' : week.reason)
if (week.ok) {
  check('...its payload carries every later day', JSON.stringify(week.payload.alsoDates) === JSON.stringify(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']), week.payload.alsoDates)
  check('...and the headline names the days before the tap', /every day from Tue 17 Nov to Sun 22 Nov:$/.test(week.diff.lead ?? ''), week.diff.lead)
  check('...as does the line under it', week.diff.implications.some(i => /every day from Tue 17 Nov to Sun 22 Nov/.test(i.text)), week.diff.implications)
}
const one = buildMealAdditionProposal({ ...base, rawArgs })
check('one day carries no later days, and the headline names the day', one.ok && !one.payload.alsoDates && /for Tue 17 Nov:$/.test(one.diff.lead ?? ''), one.ok ? one.diff.lead : one.reason)
const today = buildMealAdditionProposal({ ...base, rawArgs: { ...rawArgs, date: undefined } })
check('today keeps its old headline (no lead)', today.ok && !today.diff.lead, today.ok ? today.diff.lead : today.reason)

console.log('\n5. Wired')
const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
const save = chat.indexOf('const likedMeal =')
check('after a like is saved, a whole meal gets the offer (polarity like only)', save > 0 && /polarity === 'like' \? wholeMealLike\(userSaid/.test(chat.slice(save, save + 300)) && /MEAL_LIKE_OFFER\.turn\(likedMeal\.meal, likedMeal\.slot\)/.test(chat.slice(save, save + 600)))
const remember = chat.indexOf('if (userText.trim() === MEAL_LIKE_OFFER.justRemember)')
const coachCall = chat.indexOf('const result = await callGemini(userText, placeholderId)')
check('"Just remember it" is answered by the app, before the coach', remember > 0 && remember < coachCall && /MEAL_LIKE_OFFER\.remembered/.test(chat.slice(remember, remember + 800)) && /\n\s*return\n/.test(chat.slice(remember, remember + 900)))
const each = chat.indexOf('for (const d of payload.alsoDates) {')
check('Apply picks the meal for each later day, and says a day that did not save', each > 0 && /onUpcomingMealPickApplied\(d, payload\.slot, payload\.option\.name\)/.test(chat.slice(each, each + 500)) && /receipt\.failed\.push/.test(chat.slice(each, each + 600)))
const undo = chat.indexOf('for (const d of payload.alsoDates ?? []) {')
check('Undo takes it off each later day that still holds it', undo > 0 && /picks\[payload\.slot\] === payload\.option\.name/.test(chat.slice(undo, undo + 300)) && /clearMealPick\(profile\.id, d, payload\.slot\)/.test(chat.slice(undo, undo + 300)))
const server = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
check('the coach\'s add-a-meal tool takes "days", and the coach is told a button is his instruction', /days: \{\s*type: "integer"/.test(server) && /A MEAL HE LIKES REACHES THE PLAN/.test(server))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('All meal-like-offer checks passed.')
