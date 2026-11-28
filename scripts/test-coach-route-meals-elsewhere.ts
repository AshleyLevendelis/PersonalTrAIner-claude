// MEALS COOKED FOR HIM, FROM THE CHAT: the shared planner and controller (28 Nov 2026, coach-awareness audit (b) 4).
// Held by behaviour: the new answer is the one the Profile grid would store for the same change (setMealElsewhereDays),
// the card's words are the screen's (describeDays), the tap re-reads the live answer, and Undo only undoes its own change.
import { makeMealsElsewhereController, planMealsElsewhere, readWeekdays, mealsElsewhereDaysFor, MEALS_ELSEWHERE_REFUSALS } from '../src/lib/coach-routes/meals-elsewhere'
import { setMealElsewhereDays, type MealsElsewhere } from '../src/lib/meals-elsewhere'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

async function main() {
  console.log('1. Reading the days: names, numbers, shortcuts; anything unreadable is null, never a guess')
  check('names and short names', JSON.stringify(readWeekdays(['Monday', 'wed', 'FRI'])) === '[1,3,5]', readWeekdays(['Monday', 'wed', 'FRI']))
  check('"weekdays" is Monday to Friday', JSON.stringify(readWeekdays(['weekdays'])) === '[1,2,3,4,5]')
  check('"weekend" is Saturday and Sunday', JSON.stringify(readWeekdays(['weekend'])) === '[6,7]')
  check('"every day" is all seven', readWeekdays(['every day'])?.length === 7)
  check('numbers 1-7, sorted, once each', JSON.stringify(readWeekdays([5, 1, 5])) === '[1,5]')
  check('a number out of range is unreadable', readWeekdays([8]) === null && readWeekdays([0]) === null)
  check('a word that is not a day is unreadable', readWeekdays(['payday']) === null)
  check('two letters are too few to be sure', readWeekdays(['mo']) === null)

  console.log('2. The plan: the same answer the Profile grid stores, the screen\'s words, nothing written')
  {
    const before: MealsElsewhere = { breakfast: [6] }
    const plan = planMealsElsewhere(before, { slot: 'lunch', days: ['weekdays'], mode: 'set' })
    check('a set plan succeeds', plan.ok, plan)
    if (plan.ok) {
      check('the new answer is setMealElsewhereDays\'s', JSON.stringify(plan.next) === JSON.stringify(setMealElsewhereDays(before, 'lunch', [1, 2, 3, 4, 5])), plan.next)
      check('other meals are untouched', JSON.stringify(plan.next.breakfast) === '[6]')
      check('the card row says before and after in the screen\'s words', plan.row.field === 'Lunch cooked for you' && plan.row.before === 'none' && plan.row.after === 'Monday to Friday', plan.row)
      check('the lead asks, never announces', /^Want me to set lunch as cooked for you Monday to Friday\?$/.test(plan.lead), plan.lead)
      check('the note says the shopping list is not rebuilt behind his back', /Rebuild your shopping list/.test(plan.note), plan.note)
    }
    check('the stored answer is not changed by planning', JSON.stringify(before) === '{"breakfast":[6]}')
    const add = planMealsElsewhere({ lunch: [1, 2] }, { slot: 'Lunch', days: ['friday'], mode: 'add' })
    check('add keeps the old days and adds the new', add.ok && JSON.stringify(add.next.lunch) === '[1,2,5]', add)
    const rem = planMealsElsewhere({ lunch: [1, 2, 3] }, { slot: 'lunch', days: ['tue'], mode: 'remove' })
    check('remove takes only the named days off', rem.ok && JSON.stringify(rem.next.lunch) === '[1,3]', rem)
    const all = planMealsElsewhere({ lunch: [1, 2, 3], dinner: [5] }, { slot: 'lunch', days: [], mode: 'remove' })
    check('remove with no days ends that meal, the others stay', all.ok && all.next.lunch === undefined && JSON.stringify(all.next.dinner) === '[5]', all)
    check('...and the lead says it is his to cook again', all.ok && /yours to cook every day again/.test(all.lead), all)
    const last = planMealsElsewhere({ lunch: [1] }, { slot: 'lunch', days: [], mode: 'remove' })
    check('the last meal ended: the note says every meal is his again', last.ok && /Every meal is yours to cook again/.test(last.note), last)
    const messy = planMealsElsewhere({ lunch: [3, 1, 9], brunch: [1] }, { slot: 'lunch', days: ['friday'], mode: 'add' })
    check('a stored answer from an older release is read as the screen reads it (junk dropped, days cleaned)', messy.ok && JSON.stringify(messy.next) === '{"lunch":[1,3,5]}' && messy.row.before === 'Monday and Wednesday', messy)
    const nothingStored = planMealsElsewhere(undefined, { slot: 'lunch', days: ['monday'], mode: 'set' })
    check('before the column exists (nothing stored) it still plans', nothingStored.ok && nothingStored.row.before === 'none', nothingStored)
    const plural = planMealsElsewhere({}, { slot: 'dinners', days: ['monday'], mode: 'set' })
    check('"dinners" is dinner', plural.ok && plural.slot === 'dinner', plural)
  }

  console.log('3. Refusals: nonsense only, in words')
  {
    const bad = planMealsElsewhere({}, { slot: 'brunch', days: ['monday'], mode: 'set' })
    check('an unknown meal is asked about', !bad.ok && bad.reason === MEALS_ELSEWHERE_REFUSALS.slot, bad)
    const noDays = planMealsElsewhere({}, { slot: 'lunch', days: [], mode: 'set' })
    check('setting no days is asked about', !noDays.ok && noDays.reason === MEALS_ELSEWHERE_REFUSALS.days, noDays)
    const badDay = planMealsElsewhere({}, { slot: 'lunch', days: ['monday', 'someday'], mode: 'add' })
    check('one unreadable day refuses the whole change', !badDay.ok && badDay.reason === MEALS_ELSEWHERE_REFUSALS.days, badDay)
    const same = planMealsElsewhere({ lunch: [1, 2, 3, 4, 5] }, { slot: 'lunch', days: ['weekdays'], mode: 'set' })
    check('a change that changes nothing says what is already there', !same.ok && /Lunch is already down as cooked for you Monday to Friday/.test(same.reason), same)
    const none = planMealsElsewhere({}, { slot: 'lunch', days: ['monday'], mode: 'remove' })
    check('removing what is not there says it is already his', !none.ok && /already yours to cook every day/.test(none.reason), none)
  }

  console.log('4. The controller: the tap re-reads the live answer; Undo only undoes its own change')
  {
    let stored: unknown = { lunch: [1] }
    let saves = 0
    let failNext = false
    const ctl = makeMealsElsewhereController({
      read: () => stored,
      save: async next => { if (failNext) { failNext = false; return false } saves++; stored = next; return true },
    })
    const req = { slot: 'lunch', days: ['weekdays'], mode: 'set' as const }
    const shown = ctl.plan(req)
    const done = await ctl.confirm(req, shown)
    check('a confirm saves the planned answer', done.ok && saves === 1 && JSON.stringify(stored) === '{"lunch":[1,2,3,4,5]}', { done, stored })
    const undone = done.ok ? await ctl.undo(done.receipt) : null
    check('Undo puts the old answer back', undone?.ok === true && JSON.stringify(stored) === '{"lunch":[1]}', { undone, stored })

    stored = { lunch: [1] }
    const shown2 = ctl.plan({ slot: 'lunch', days: ['friday'], mode: 'add' })
    stored = { lunch: [1, 3] }
    const stale = await ctl.confirm({ slot: 'lunch', days: ['friday'], mode: 'add' }, shown2)
    check('a change made on Profile meanwhile: nothing saved, said why', !stale.ok && stale.message === MEALS_ELSEWHERE_REFUSALS.stale && JSON.stringify(stored) === '{"lunch":[1,3]}', { stale, stored })

    stored = { lunch: [1] }
    const savesBefore = saves
    const done2 = await ctl.confirm(req, ctl.plan(req))
    stored = { lunch: [1, 2] }
    const undo2 = done2.ok ? await ctl.undo(done2.receipt) : null
    check('Undo after another change leaves the newer answer alone', undo2?.ok === false && undo2.message === MEALS_ELSEWHERE_REFUSALS.undoStale && JSON.stringify(stored) === '{"lunch":[1,2]}' && saves === savesBefore + 1, { undo2, stored })

    stored = { lunch: [1] }
    failNext = true
    const failed = await ctl.confirm(req, ctl.plan(req))
    check('a save that fails says so and changes nothing', !failed.ok && failed.message === MEALS_ELSEWHERE_REFUSALS.notSaved && JSON.stringify(stored) === '{"lunch":[1]}', { failed, stored })
    const refusedTap = await ctl.confirm({ slot: 'brunch', days: [1], mode: 'set' }, ctl.plan({ slot: 'brunch', days: [1], mode: 'set' }))
    check('a refused request never saves', !refusedTap.ok && JSON.stringify(stored) === '{"lunch":[1]}')
  }

  console.log('5. The days in words, for the coach')
  check('a meal with days', mealsElsewhereDaysFor({ lunch: [1, 2, 3, 4, 5] }, 'lunch') === 'Monday to Friday')
  check('a meal without', mealsElsewhereDaysFor({ lunch: [1] }, 'dinner') === 'none')

  console.log(`${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
  console.log('PASS')
}
void main()
