// ---------------------------------------------------------------------------
// "REGENERATE ALL", PRESSED ON THE REAL NUTRITION TAB.
//
// 9 Oct 2026, the test log's M22: about twenty seconds behind a 12px spinner,
// and an edited lunch gone from the screen afterwards. No driver could reach
// the button — the harness page handed the tab `noop` — until the handlers
// moved into a hook the page shares (useMealPlanActions). This:
//   1. edits today's lunch (a food added — the app's own sheet), so there is
//      a meal of HERS on the plan;
//   2. presses Regenerate all and reads the screen WHILE it runs: a working
//      state she can read, the old meals dimmed and out of reach;
//   3. reads it when it ends, WITHOUT a reload: the edited lunch is still
//      today's lunch, its pick still saved, and the other meals are new.
//
// The model call behind the meal writer is the page's stand-in and answers
// after 1.5 s; everything between the tap and the screen is the app's.
//
// PORT 9653.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9653, page: 'real.html', name: 'meal-regenerate', timeoutMs: 300_000 })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

const week = () => ev(`window.__weekMeals ? window.__weekMeals() : {}`)
const picks = () => ev(`(window.__mealPicks ? window.__mealPicks() : []).map(r => r.date + '|' + r.slot + '|' + r.meal_name)`)
const options = () => ev(`(window.__mealOptions ? window.__mealOptions() : []).map(r => r.slot + '|' + r.name)`)
const setInput = (testid, value) => ev(`(() => {
  const n = document.querySelector('[data-testid="${testid}"]')
  if (!n) return false
  n.focus()
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, ${JSON.stringify(String(value))})
  n.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
const working = () => ev(`(() => {
  const panel = document.querySelector('[data-testid="meals-regenerating"]')
  const list = document.querySelector('[data-testid="meal-list"]')
  if (!list) return null
  const r = panel ? panel.getBoundingClientRect() : null
  // What a thumb landing on the first meal row would hit.
  const row = list.querySelector('button')
  const rr = row ? row.getBoundingClientRect() : null
  const hit = rr ? document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2) : null
  return {
    panel: panel ? panel.innerText.replace(/\\s+/g, ' ').trim() : null,
    panelBox: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), h: innerHeight } : null,
    spinner: panel ? Math.round(panel.querySelector('svg')?.getBoundingClientRect().width ?? 0) : 0,
    inert: list.inert === true, busy: list.getAttribute('aria-busy'),
    opacity: Number(getComputedStyle(list).opacity),
    rowReachable: !!hit && !!row && (hit === row || row.contains(hit)),
  }
})()`)

await go('&tour=off&daymove=1&regen=1&regenwait=1500', '#/tab/nutrition')
const w0 = await until(week, v => v && Object.keys(v).length === 7, 60)
const dates = Object.keys(w0 ?? {}).sort()
const today = dates[0]

console.log('\n1. A lunch of hers on the plan\n')
check('1a. the week is served', dates.length === 7 && !!w0[today].lunch && !!w0[today].dinner, w0?.[today])
await clickAt(`[...document.querySelectorAll('button')].find(b => /^\\s*Lunch/i.test(b.textContent || '') && !b.hasAttribute('data-ingredient-row'))`)
await until(() => ev(`!!document.querySelector('[data-testid="meal-food-add-open"]')`), v => v === true, 20)
await ev(`(() => { const b = document.querySelector('[data-testid="meal-food-add-open"]'); if (b) { b.scrollIntoView({ block: 'center' }); b.click() } })()`)
await until(() => ev(`!!document.querySelector('[data-testid="meal-food-add-search"]')`), v => v === true, 20)
await setInput('meal-food-add-search', 'banana')
await wait(350)
await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="meal-food-add-result"]')].find(x => x.textContent.trim() === 'banana'); if (b) b.click() })()`)
await until(() => ev(`(() => { const b = document.querySelector('[data-testid="meal-food-add-confirm"]'); return !!b && !b.disabled })()`), v => v === true, 60)
await ev(`document.querySelector('[data-testid="meal-food-add-confirm"]').click()`)
const w1 = await until(week, v => v && /\+ 100g banana$/.test(v[today]?.lunch ?? ''), 60)
const edited = w1?.[today]?.lunch
check('1b. today\'s lunch is now her edited one', /\+ 100g banana$/.test(edited ?? ''), edited)
check('1c. ...saved as today\'s pick', (await picks()).includes(`${today}|lunch|${edited}`), await picks())
const optionsBefore = await options()
const dinnerBefore = w1?.[today]?.dinner
const callsBefore = await ev(`window.__generatorCalls`)
const idle = await working()
check('1d. before the tap there is no working state and the meals can be tapped', idle?.panel === null && idle?.inert === false && idle?.opacity === 1 && idle?.rowReachable === true, idle)

console.log('\n2. While it runs\n')
await ev(`window.scrollTo(0, 0)`)
check('2a. tapping Regenerate all', await clickAt(`[...document.querySelectorAll('button')].find(b => /^\\s*Regenerate all\\s*$/.test(b.textContent || ''))`))
const during = await until(working, v => !!v && v.panel !== null, 20)
check('2b. it says what is happening, in words: building the meals, about how long, and what the meals underneath are',
  /Building your meals…/.test(during?.panel ?? '') && /up to a minute/.test(during?.panel ?? '') && /The meals below are the ones you had, until the new ones are ready\./.test(during?.panel ?? ''), during?.panel)
check('2c. ...in a panel, not a 12px spinner: a line of text she can read and a spinner at least 20px', (during?.panelBox?.height ?? 0) >= 48 && (during?.spinner ?? 0) >= 20, { box: during?.panelBox, spinner: during?.spinner })
// (The dimming fades in over a moment; wait for it rather than sampling mid-fade.)
const dimmed = await until(working, v => !!v && v.opacity < 0.7, 12)
check('2d. the old meals are dimmed', (dimmed?.opacity ?? 1) < 0.7 && dimmed?.panel !== null, dimmed?.opacity)
check('2e. ...and out of reach: not tappable, and hidden from the keyboard and a screen reader', during?.inert === true && during?.rowReachable === false && during?.busy === 'true', during)
await ev(`document.querySelector('[data-testid="meals-regenerating"]')?.scrollIntoView({ block: 'center' })`)
await wait(150)
const seen = await working()
check('2f. the working state is on screen where she is looking', !!seen?.panelBox && seen.panelBox.top >= 0 && seen.panelBox.bottom <= seen.panelBox.h, seen?.panelBox)
await shoot('meal-regenerate-working')

console.log('\n3. When it ends — with no reload\n')
const done = await until(working, v => !!v && v.panel === null && v.opacity === 1, 120)
check('3a. the working state goes and the meals can be tapped again', done?.panel === null && done?.inert === false && done?.opacity === 1 && done?.rowReachable === true, done)
check('3b. the meal writer really was asked', (await ev(`window.__generatorCalls`)) > callsBefore, { before: callsBefore, after: await ev(`window.__generatorCalls`) })
const optionsAfter = await options()
check('3c. the options really were replaced (new dishes are stored, the app\'s own old lunches are gone)', optionsAfter.some(o => /^dinner\|Fresh dinner plate/.test(o)) && optionsAfter.filter(o => o.startsWith('lunch|') && optionsBefore.includes(o)).every(o => o === `lunch|${edited}`), { before: optionsBefore.filter(o => o.startsWith('lunch|')), after: optionsAfter.filter(o => o.startsWith('lunch|')) })
check('3d. her edited lunch is still stored', optionsAfter.includes(`lunch|${edited}`), optionsAfter.filter(o => o.startsWith('lunch|')))
const w2 = await week()
check('3e. AND IT IS STILL TODAY\'S LUNCH ON SCREEN — it did not vanish until a reload', w2?.[today]?.lunch === edited && (await ev(`document.body.innerText`)).includes(edited), w2?.[today])
check('3f. ...with its pick still saved, so a reload would show the same', (await picks()).includes(`${today}|lunch|${edited}`), await picks())
check('3g. the dinner, which was the app\'s own, is a new dish', !!w2?.[today]?.dinner && w2[today].dinner !== dinnerBefore && /^Fresh dinner plate/.test(w2[today].dinner), { before: dinnerBefore, after: w2?.[today]?.dinner })
check('3h. nothing is reported as failed', !/couldn't|could not|unchanged — try again/i.test((await ev(`document.querySelector('[data-tour="meals"]')?.innerText ?? ''`))), (await ev(`document.querySelector('[data-tour="meals"]')?.innerText ?? ''`)).slice(0, 300))
await ev(`window.scrollTo(0, 0)`)
await wait(300)
await shoot('meal-regenerate-after')

await finish('Regenerate all says it is working, and her edited lunch is still her lunch.')
