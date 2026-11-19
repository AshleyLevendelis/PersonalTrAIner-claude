// verify:meal-shape-rows — NUTRITION LISTS ONLY THE MEALS THE PROFILE SERVES.
//
// The Profile walk of 18 Nov 2026 (finding P2): Profile set to two meals a day, or to no snacks, and Nutrition went on
// drawing "Lunch · No option generated" and "Snack · No option generated", each with a Generate button, for a meal he
// had just said he does not eat. The day's own dishes were right (his 14 Nov ruling, "a day serves only the meals the
// profile says", is held in the day engine); the LIST of rows was drawn for any meal that still had saved dishes, and
// a change of setting rightly keeps those dishes so that changing back brings them straight back.
//
// THE WHOLE APP: the list is handed the app's stored dishes for every meal, which only the page that boots App.tsx
// does as the app does. ?meals=2 and ?no-snacks choose what Profile holds, and nothing else.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9969, page: 'app-boot.html', name: 'meal-shape-rows', timeoutMs: 280_000 })
const { ev, check, wait, go, until, shoot, finish, clickAt } = d

const openNutrition = async query => {
  await go(query)
  await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 160)
  await wait(1000)
  const NOT_NOW = `[...document.querySelectorAll('button')].find(b => /^Not now$/.test(b.innerText.trim()))`
  if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(600) }
  await ev(`location.hash = '#/tab/nutrition'`)
  await until(() => ev(`document.querySelectorAll('[data-meal-row]').length`), v => v >= 1, 80)
  await wait(1200)
}
/** What the meal list shows: each row's meal, whether it names a dish, and anything that reads as an empty meal. */
const READ = `(() => {
  const rows = [...document.querySelectorAll('[data-meal-row]')].map(r => ({ slot: r.getAttribute('data-meal-row'), dish: (r.querySelector('[data-meal-name]')?.textContent || '').trim() }))
  const text = document.body.innerText
  return {
    rows, stored: [...new Set((window.__fakeDb.meal_plan_slots || []).map(r => r.slot))].sort(),
    noOption: (text.match(/No option generated/g) || []).length,
    generate: [...document.querySelectorAll('button')].filter(b => /^Generate/.test(b.innerText.trim())).length,
    meals: (text.match(/\\d OF (\\d) MEALS/) || [])[1] ?? null,
  }
})()`
const slots = r => r.rows.map(x => x.slot).join(',')

console.log('\n  1. THREE MEALS AND A SNACK (the control): every stored meal is a row')
await openNutrition('')
const all = await ev(READ)
check('1a. the store holds dishes for breakfast, lunch, dinner and the snack', all.stored.join(',') === 'breakfast,dinner,lunch,snack', all.stored)
check('1b. all four are listed, each with a dish', slots(all) === 'breakfast,lunch,dinner,snack' && all.rows.every(r => r.dish.length > 0), all.rows)
check('1c. the day counts four meals', all.meals === '4', all.meals)

console.log('\n  2. TWO MEALS A DAY, NO SNACKS: the dishes are still stored, and only the two meals are listed')
await openNutrition('&meals=2&no-snacks')
const two = await ev(READ)
check('2a. the store still holds lunch and the snack (a change of setting deletes nothing)', two.stored.join(',') === 'breakfast,dinner,lunch,snack', two.stored)
check('2b. ONLY BREAKFAST AND DINNER ARE LISTED (lunch and the snack stayed as empty rows)', slots(two) === 'breakfast,dinner', two.rows)
check('2c. ...each with its dish', two.rows.every(r => r.dish.length > 0), two.rows)
check('2d. ...and nothing reads "No option generated" or offers Generate', two.noOption === 0 && two.generate === 0, { noOption: two.noOption, generate: two.generate })
check('2e. the day counts two meals', two.meals === '2', two.meals)
await shoot('meal-shape-rows-two-meals')

console.log('\n  3. THREE MEALS, NO SNACKS: only the snack goes')
await openNutrition('&no-snacks')
const noSnack = await ev(READ)
check('3a. breakfast, lunch and dinner are listed, and no snack', slots(noSnack) === 'breakfast,lunch,dinner' && noSnack.noOption === 0 && noSnack.generate === 0, noSnack)

check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('Nutrition lists the meals the profile serves, and nothing for a meal it no longer does.')
