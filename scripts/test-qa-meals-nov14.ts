// ---------------------------------------------------------------------------
// THE MEALS AND CHAT QA OF 14 NOV 2026 (after his live test). Each confirmed finding fixed here is held by the function
// or the line that now decides it (the "never bigger around a meal out" case is in test:eating-out, section 4):
//   1. a coach edit or custom meal for an UPCOMING day reaches the screen (the strip's own pick path, pool re-read);
//   2. a how-to naming no exercise gets no video button from an earlier message; "show me a video" still does;
//   3. the coach does not offer eating out for a meal already eaten;
//   5. "Show numbers" off: no figure in the meal sheet's header, the chat's pill or the eating-out card;
//   6. a freestyle day is never "added" to the shopping list;
//   7. eating out at breakfast or lunch is never "a night";
//  10. "1 option", never "1 options";
//  11. the day-swap card's "Unchanged" names the two swapped meals.
// One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { formVideoFor } from '../src/lib/exercise-video'
import { EATING_OUT_WORDS, EATING_OUT_SIZES, eatingOutSizeSaid } from '../src/lib/eating-out'
import { moreMealOptionsOffer, moreMealLibraryOffer, DAY_MOVE } from '../src/lib/coach-voice'
import type { MealSlotName } from '../src/lib/meal-store'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(fs.readFileSync(p, 'utf8'))

console.log('\n1. A coach change for an upcoming day reaches the screen')
{
  const chat = read('src/components/ChatAssistant.tsx')
  const uses = chat.match(/if \(onUpcomingMealPickApplied\) return await onUpcomingMealPickApplied\(p\.date, p\.slot, p\.option\.name\)/g) ?? []
  check('a food edit or custom meal, and a meal move, for an upcoming day go through the strip\'s pick path (both)', uses.length === 2, uses.length)
  const days = read('src/hooks/useMealDays.ts')
  const apply = days.slice(days.indexOf('const applyPick = async'), days.indexOf('const showPicks'))
  check('...which re-reads the pool, so a dish just added is found', apply.includes('await reloadPools?.()') && apply.indexOf('await setMealPick(') < apply.indexOf('await reloadPools?.()'))
}

console.log('\n2. The video button only where an exercise was asked about')
{
  check('"how do I brace my core?" after an RDL question: no button', formVideoFor('how do I brace my core?', 'Breathe in and brace.', 'how do I do a romanian deadlift') === null)
  check('...and "how do I eat more protein?" neither', formVideoFor('how should I eat more protein?', 'Add a shake.', 'how do I do a romanian deadlift') === null)
  check('"show me a video" after it: the RDL (the fixture binds)', /Romanian/i.test(formVideoFor('show me a video', 'Here you go.', 'how do I do a romanian deadlift')?.exercise ?? ''))
}

console.log('\n3. No eating-out offer for a meal already eaten')
{
  const chat = read('src/components/ChatAssistant.tsx')
  const builder = chat.slice(chat.indexOf('const buildEatingOutProposal'), chat.indexOf('const buildEatingOutProposal') + 3000)
  check('the card builder asks what is eaten before it offers', /if \(date === today && \(await slotsEatenToday\(\)\)\?\.includes\(slot\)\) return \{ ok: false, refusal: EATING_OUT_REFUSALS\.eaten\(slot\) \}/.test(builder)
    && builder.indexOf('slotsEatenToday()') < builder.indexOf('eatingOutSizeSaid(userSaid)'))
}

console.log('\n5. "Show numbers" off: no figure on the meal sheet, the chat pill or the eating-out card')
{
  const meal = read('src/components/MealPlan.tsx')
  const at = meal.indexOf('data-testid="meal-sheet-kcal"')
  check('the meal sheet\'s calories and macros sit under the switch', at > 0 && /\{useShowNumbersFlag && \(<div className="mt-1\.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">\s*<span className="flex items-baseline gap-1" data-testid="meal-sheet-kcal">/.test(meal))
  const chat = read('src/components/ChatAssistant.tsx')
  check('the chat\'s calorie pill is not built with the switch off', /kcal: showNumbers && macros && stripEaten != null/.test(chat))
  check('...nor the eating-out card\'s range', /after: showNumbers \? `\$\{EATING_OUT_WORDS\.label\}.*eatingOutRangeWords\(est\.calories\).*: `\$\{EATING_OUT_WORDS\.label\}, \$\{EATING_OUT_WORDS\.sizeLabel\[size\]\.toLowerCase\(\)\} \(an estimate\)`/.test(chat))
  check('...read once, at the top of the chat (a hook)', /const showNumbers = useShowNumbers\(\)/.test(chat))
}

console.log('\n6. A freestyle day is never "added" to the shopping list')
{
  const week = read('src/components/nutrition/NutritionWeek.tsx')
  check('the week view says a freestyle day has nothing to shop for, and offers no add', /\{isFreestyleDay\(chosen\)\s*\?\s*<p[^>]*data-testid="meal-day-grocery-freestyle"/.test(week) && /: <AddDayToGrocery key=\{date\} upcoming=\{upcoming\} \/>\}/.test(week))
}

console.log('\n7. Only dinner is a night out')
{
  const slots: MealSlotName[] = ['breakfast', 'lunch', 'snack']
  const lines = slots.flatMap(s => [EATING_OUT_WORDS.chatAsk(s, "Thursday's"), EATING_OUT_WORDS.marked(s, "Today's", 'light'), EATING_OUT_WORDS.note('big', 1200, s),
    ...EATING_OUT_SIZES.map(z => EATING_OUT_WORDS.chatChip(z, s, 'on Thursday'))])
  check('breakfast, lunch and a snack out never say "night"', lines.every(l => !/night/i.test(l)), lines.filter(l => /night/i.test(l)))
  check('...dinner still does (the fixture binds)', /night out/.test(EATING_OUT_WORDS.chatAsk('dinner', "Thursday's")) && /night/.test(EATING_OUT_WORDS.marked('dinner', "Today's", 'big')))
  const misread = (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlotName[]).flatMap(s => EATING_OUT_SIZES.filter(z => eatingOutSizeSaid(EATING_OUT_WORDS.chatChip(z, s, 'on Thursday')) !== z).map(z => `${s}:${z}`))
  check('every size button still reads back as its own size', misread.length === 0, misread)
}

console.log('\n10-11. Wording')
{
  check('"1 option each", never "1 options"', /1 option each/.test(moreMealOptionsOffer([1, 1], 5)) && /1 option each/.test(moreMealLibraryOffer([1, 1])) && /only 1 option\./.test(moreMealOptionsOffer([1, 3], 5)))
  check('...and "3 options" stays plural', /3 options each/.test(moreMealOptionsOffer([3, 3], 5)))
  check('the day swap\'s "Unchanged" names the two swapped meals, so other meals changing is not a contradiction', /^The two swapped meals/.test(DAY_MOVE.unchanged))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:qa-meals-nov14 FAILED'); process.exit(1) }
console.log('The meals and chat QA findings of 14 Nov hold.')
