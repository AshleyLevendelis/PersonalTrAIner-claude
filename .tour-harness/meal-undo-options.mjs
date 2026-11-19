// verify:meal-undo-options — AN UNDONE MEAL EDIT LEAVES NO DISH BEHIND IN THE SWAP LIST.
//
// The Nutrition walk of 18 Nov 2026 (finding N1): Lunch, take the rice out, Apply, Undo. The edit's own dish
// ("Chicken and rice without white rice") was deleted, as an Undo should, but the meal's tab still read "Swap · 1"
// and listed it, and choosing it answered "That swap didn't save". The Undo of an edit hands the app an EMPTY pick
// ("back to whatever the day chose"), and the app's handler returned on an empty pick before it re-read the options.
//
// THE WHOLE APP, on purpose: that handler lives in App.tsx, and app-boot is the only test page that runs it. Every
// other Nutrition page hands the meal list its own stand-in, which is why no driver had seen this.
//
// What each section proves:
//   1. the edit: the meal shows the edited dish, and the store holds one more option;
//   2. the Undo: the store is back to the options it had, AND the screen's count and list agree with the store;
//   3. the same after an ADDED food is undone (the other writer of an empty pick).
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9968, page: 'app-boot.html', name: 'meal-undo-options', timeoutMs: 280_000 })
const { ev, check, wait, go, until, shoot, finish, clickAt } = d

await go('')
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 160)
await wait(1200)
const NOT_NOW = `[...document.querySelectorAll('button')].find(b => /^Not now$/.test(b.innerText.trim()))`
if (await ev(`!!(${NOT_NOW})`)) { await clickAt(NOT_NOW); await wait(600) }
await ev(`location.hash = '#/tab/nutrition'`)
await until(() => ev(`document.querySelectorAll('[data-meal-row]').length`), v => v >= 3, 80)
await wait(800)

const inDlg = re => `[...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="tab"]')].find(b => ${re}.test((b.innerText || '').trim()))`
const tap = async expr => { const ok = await clickAt(expr); await wait(500); return ok }
/** The options the STORE holds for a meal, by name. */
const stored = slot => ev(`(window.__fakeDb.meal_plan_slots || []).filter(r => r.slot === ${JSON.stringify(slot)}).map(r => r.name).sort()`)
/** The number on the meal's Swap tab ("Swap · 6" is 6; a bare "Swap" is 0), or null when there is no such tab. */
const swapCount = () => ev(`(() => { const t = ${inDlg('/^Swap/')}; if (!t) return null; const m = /Swap · (\\d+)/.exec(t.innerText); return m ? Number(m[1]) : 0 })()`)
const dialogText = () => ev(`([...document.querySelectorAll('[role="dialog"]')].map(x => x.innerText).join(' ') || '').replace(/\\s+/g, ' ')`)
const openLunch = async () => {
  await tap(`[...document.querySelectorAll('button')].find(b => /^LUNCH/.test(b.innerText.trim()) && !b.closest('[role="dialog"]'))`)
  await until(() => ev(`!!document.querySelector('[role="dialog"]')`), v => v === true, 30)
  await wait(500)
}

console.log('\n  1. AN EDIT MAKES ONE NEW DISH')
await openLunch()
const before = await stored('lunch')
const countBefore = await swapCount()
// However many options the meal has (this plan's lunch has one, so the tab reads a bare "Swap": the tester saw it
// turn into "Swap · 1" after the Undo).
check('1a. lunch is open, and its Swap tab counts every option but the one on the plate', before.length >= 1 && countBefore === before.length - 1, { before: before.length, countBefore })
// The first ingredient line that can be changed, whatever the dish is.
const LINE = `[...document.querySelectorAll('[role="dialog"] [data-ingredient-row]')][0]`
const lineText = await ev(`(${LINE})?.getAttribute('data-ingredient-row') ?? null`)
check('1b. the dish has an ingredient line to change', !!lineText, lineText)
await tap(LINE)
check('1c. "Take it out" is offered', await tap(inDlg('/^Take it out$/')) === true)
await until(() => ev(`!!(${inDlg('/^Apply$/')}) && !(${inDlg('/^Apply$/')}).disabled`), v => v === true, 60)
check('1d. Apply is tapped', await tap(inDlg('/^Apply$/')) === true)
await until(() => ev(`!!document.querySelector('[data-testid="meal-edit-undo"]')`), v => v === true, 60)
const afterEdit = await stored('lunch')
const made = afterEdit.filter(n => !before.includes(n))
check('1e. the store holds exactly one new dish, the edited copy', afterEdit.length === before.length + 1 && made.length === 1, { before: before.length, after: afterEdit.length, made })
await shoot('meal-undo-options-1-edited')

console.log('\n  2. UNDO TAKES THE DISH OUT OF THE STORE AND OFF THE SCREEN')
check('2a. Undo is tapped', await tap(`document.querySelector('[data-testid="meal-edit-undo"]')`) === true)
await until(() => stored('lunch').then(s => s.length), v => v === before.length, 60)
const afterUndo = await stored('lunch')
check('2b. the store holds the options it had before the edit', JSON.stringify(afterUndo) === JSON.stringify(before), { afterUndo: afterUndo.length, before: before.length })
// The screen follows the store: the count goes back, and the deleted dish is nowhere in the meal's sheet.
const countAfter = await until(swapCount, v => v === countBefore, 40)
check('2c. THE SWAP TAB COUNTS WHAT THE STORE HOLDS (it kept the deleted dish)', countAfter === countBefore, { countBefore, countAfter })
await tap(inDlg('/^Swap/'))
await wait(700)
const listed = await dialogText()
check('2d. ...and the deleted dish is not offered as a swap', made.length === 1 && !listed.includes(made[0]), { dish: made[0], listed: listed.slice(0, 300) })
check('2e. ...and nothing on the sheet says a swap did not save', !/didn.t save/i.test(listed), listed.match(/[^.]*didn.t save[^.]*/i)?.[0])
await shoot('meal-undo-options-2-undone')

console.log('\n  3. THE SAME AFTER AN ADDED FOOD IS UNDONE')
await tap(inDlg('/^Recipe$/'))
await wait(500)
check('3a. the meal offers "Add food"', await tap(`document.querySelector('[role="dialog"] [data-testid="meal-food-add-open"]')`) === true)
await until(() => ev(`!!document.querySelector('[data-testid="meal-food-add-search"]')`), v => v === true, 30)
// Typed through the prototype setter plus an input event, the way every controlled field here is driven.
await ev(`(() => {
  const n = document.querySelector('[data-testid="meal-food-add-search"]')
  if (!n) return false
  n.focus()
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, 'almond')
  n.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await until(() => ev(`document.querySelectorAll('[data-testid="meal-food-add-result"]').length`), v => v > 0, 30)
check('3b. a food is found and chosen', await tap(`document.querySelector('[data-testid="meal-food-add-result"]')`) === true)
const CONFIRM = `document.querySelector('[data-testid="meal-food-add-confirm"]')`
await until(() => ev(`!!(${CONFIRM}) && !(${CONFIRM}).disabled`), v => v === true, 60)
check('3c. the addition is applied', await tap(CONFIRM) === true)
await until(() => ev(`!!document.querySelector('[data-testid="meal-edit-undo"]')`), v => v === true, 60)
const afterAdd = await stored('lunch')
const added = afterAdd.filter(n => !before.includes(n))
check('3d. the store holds one new dish for the addition', added.length === 1, { added, n: afterAdd.length })
check('3e. Undo is tapped', await tap(`document.querySelector('[data-testid="meal-edit-undo"]')`) === true)
await until(() => stored('lunch').then(s => s.length), v => v === before.length, 60)
const countAfterAdd = await until(swapCount, v => v === countBefore, 40)
check('3f. the Swap tab counts what the store holds again', countAfterAdd === countBefore && JSON.stringify(await stored('lunch')) === JSON.stringify(before), { countBefore, countAfterAdd })
await tap(inDlg('/^Swap/'))
await wait(700)
check('3g. ...and the removed dish is not offered', added.length === 1 && !(await dialogText()).includes(added[0]), added)
await shoot('meal-undo-options-3-add-undone')

check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('An undone meal edit or addition leaves no dish behind: the swap list is what the store holds.')
