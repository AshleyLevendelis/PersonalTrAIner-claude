// ---------------------------------------------------------------------------
// verify:meal-regenerate-one — "REGENERATE" ON ONE MEAL CHANGES THAT MEAL, AND ONLY THAT MEAL.
//
// His ruling, 10 Nov 2026, "Only that meal" (over a warning before re-planning the week, and over leaving it).
// The button used to rebuild the meal's whole list of options, and the week's menu is drawn from that list: other
// days' meals changed, and today's other meals moved to fit, with no word.
//
// Pressed on the real Nutrition tab, with the week read before and after from the app's own hook:
//   1. a breakfast regenerated: today's breakfast is a new dish, and EVERY other meal of the week is the dish it was;
//      nothing the plan held is deleted; the new dish is stored as made for one day; the pick is saved;
//   2. the line under the meal says so, with an Undo, and Undo puts the whole week back as it was;
//   3. a dinner regenerated: the one meal that may follow it is tomorrow's leftovers lunch, and the line says so;
//   4. the meal writer failing changes nothing and says so.
// The meal writer's model call is the page's stand-in; everything between the tap and the screen is the app's.
//
// PORT 9891.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9891, page: 'real.html', name: 'meal-regenerate-one', timeoutMs: 300_000 })
const { ev, check, until, wait, go, shoot, finish } = d

const week = () => ev(`window.__weekMeals ? window.__weekMeals() : {}`)
const picks = () => ev(`(window.__mealPicks ? window.__mealPicks() : []).map(r => r.date + '|' + r.slot + '|' + r.meal_name)`)
const options = () => ev(`(window.__mealOptions ? window.__mealOptions() : []).map(r => r.slot + '|' + r.name)`)
const tagsOf = name => ev(`(window.__fakeDb?.meal_plan_slots ?? []).filter(r => r.name === ${JSON.stringify(name)}).map(r => r.tags ?? [])[0] ?? null`)
const openSheet = async slot => {
  await ev(`(() => { const r = document.querySelector('[data-meal-name="${slot}"]')?.closest('[data-meal-row]'); r?.querySelector('button')?.click() })()`)
  await until(() => ev(`!!document.querySelector('[data-meal-sheet-root]')`), v => v === true, 20)
  await wait(300)
}
const closeSheet = async () => { await ev(`document.querySelector('[data-meal-sheet-close]')?.click()`); await wait(300) }
const sheet = () => ev(`(() => {
  const root = document.querySelector('[data-meal-sheet-root]')
  if (!root) return null
  const note = root.querySelector('[data-testid="swap-knock-on"]')
  const undo = root.querySelector('[data-testid="swap-undo"]')
  const r = note ? note.getBoundingClientRect() : null
  return { note: note ? note.innerText.replace(/\\s+/g, ' ').trim() : null, undo: !!undo, regenerate: !!root.querySelector('[data-meal-regenerate]'),
    noteInView: !!r && r.top >= 0 && r.bottom <= innerHeight, text: root.innerText.replace(/\\s+/g, ' ').trim().slice(0, 400) }
})()`)
const tapRegenerate = () => ev(`(() => { const b = document.querySelector('[data-meal-sheet-root] [data-meal-regenerate]'); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true })()`)
/** Every meal of the week except the named ones, as "date|slot|dish" lines. */
const others = (w, except) => Object.keys(w).sort().flatMap(date => Object.keys(w[date]).sort().filter(slot => !except.includes(`${date}|${slot}`)).map(slot => `${date}|${slot}|${w[date][slot]}`))

await go('&tour=off&daymove=1&regen=1', '#/tab/nutrition')
const w0 = await until(week, v => v && Object.keys(v).length === 7, 60)
const dates = Object.keys(w0 ?? {}).sort()
const today = dates[0]
const tomorrow = dates[1]
const optionsBefore = await options()
const picksBefore = await picks()

console.log('\n1. A breakfast regenerated: that meal, and only that meal\n')
check('1a. the week is served: seven days, three meals a day', dates.length === 7 && dates.every(dt => ['breakfast', 'lunch', 'dinner'].every(s => !!w0[dt][s])), w0?.[today])
await openSheet('breakfast')
check('1b. the breakfast offers Regenerate', (await sheet())?.regenerate === true, await sheet())
check('1c. tapped it', await tapRegenerate())
const w1 = await until(week, v => v && v[today]?.breakfast && v[today].breakfast !== w0[today].breakfast, 120)
const newBreakfast = w1?.[today]?.breakfast
check('1d. today\'s breakfast is a different dish', !!newBreakfast && newBreakfast !== w0[today].breakfast, { was: w0[today].breakfast, now: newBreakfast })
check('1e. ...a NEW one: not a dish the plan already held', !!newBreakfast && !optionsBefore.includes(`breakfast|${newBreakfast}`), newBreakfast)
const moved = others(w1 ?? {}, [`${today}|breakfast`]).filter(l => !others(w0, [`${today}|breakfast`]).includes(l))
check('1f. EVERY OTHER MEAL OF THE WEEK IS THE DISH IT WAS (20 meals, none moved)', others(w0, [`${today}|breakfast`]).length === 20 && moved.length === 0, { moved, count: others(w0, [`${today}|breakfast`]).length })
const optionsAfter = await options()
check('1g. nothing the plan held was deleted (the old button deleted the meal\'s whole list)', optionsBefore.every(o => optionsAfter.includes(o)), optionsBefore.filter(o => !optionsAfter.includes(o)))
const added = optionsAfter.filter(o => !optionsBefore.includes(o))
check('1h. exactly one dish was added, and it is the new breakfast', added.length === 1 && added[0] === `breakfast|${newBreakfast}`, added)
check('1i. ...stored as made for one day, so no other day\'s search can ever pick it', ((await tagsOf(newBreakfast)) ?? []).includes('pin-only'), await tagsOf(newBreakfast))
check('1j. the pick is saved for today\'s breakfast, and no other pick was written', (await picks()).includes(`${today}|breakfast|${newBreakfast}`) && (await picks()).length === picksBefore.length + 1, await picks())
const s1 = await sheet()
check('1k. the meal says what happened, where he is looking, with an Undo', !!s1?.note && s1.note.includes(newBreakfast) && s1.undo === true && s1.noteInView === true, s1)
check('1l. nothing is reported as failed', !/couldn't|could not/i.test(s1?.text ?? ''), s1?.text)
await shoot('meal-regenerate-one-breakfast')

console.log('\n2. Undo puts the whole week back\n')
await ev(`document.querySelector('[data-meal-sheet-root] [data-testid="swap-undo"]')?.click()`)
const w2 = await until(week, v => v && v[today]?.breakfast === w0[today].breakfast, 60)
check('2a. today\'s breakfast is the dish it was', w2?.[today]?.breakfast === w0[today].breakfast, w2?.[today])
check('2b. ...and so is every meal of the week', JSON.stringify(others(w2 ?? {}, [])) === JSON.stringify(others(w0, [])), others(w2 ?? {}, []).filter(l => !others(w0, []).includes(l)))
check('2c. the pick is gone again', JSON.stringify((await picks()).sort()) === JSON.stringify([...picksBefore].sort()), await picks())
check('2d. the line says it was put back', /Put back as it was/.test((await sheet())?.note ?? ''), await sheet())
await closeSheet()

console.log('\n3. A dinner regenerated: tomorrow\'s leftovers follow it, and the app says so\n')
const leftoverTomorrow = w2?.[tomorrow]?.lunch
await openSheet('dinner')
check('3a. tapped Regenerate on dinner', await tapRegenerate())
const w3 = await until(week, v => v && v[today]?.dinner && v[today].dinner !== w0[today].dinner, 120)
const newDinner = w3?.[today]?.dinner
check('3b. today\'s dinner is a new dish', !!newDinner && !optionsBefore.includes(`dinner|${newDinner}`), newDinner)
const except3 = [`${today}|dinner`, `${tomorrow}|lunch`]
check('3c. every meal but tonight\'s dinner and tomorrow\'s lunch is the dish it was', JSON.stringify(others(w3 ?? {}, except3)) === JSON.stringify(others(w0, except3)), others(w3 ?? {}, except3).filter(l => !others(w0, except3).includes(l)))
const s3 = await sheet()
const lunchMoved = w3?.[tomorrow]?.lunch !== leftoverTomorrow
// NOT REACHED HERE, said plainly (mutation m5, 10 Nov 2026): this page's week has no leftovers lunch, so tomorrow's
// lunch stays and the knock-on line is never drawn. That a regenerate goes through the swap's own trial is held by
// test:meal-regenerate (it calls swapTo) and the trial itself by verify:swap-knock-on and test:meal-knock-on.
check('3d. tomorrow\'s lunch stayed (no leftovers lunch on this page\'s week); had it changed, the line must name it', !lunchMoved || (!!s3?.note && /lunch/i.test(s3.note)), { lunchMoved, was: leftoverTomorrow, now: w3?.[tomorrow]?.lunch, note: s3?.note })
check('3e. the dinner has its Undo', s3?.undo === true, s3)
await shoot('meal-regenerate-one-dinner')
await closeSheet()

console.log('\n4. The meal writer failing changes nothing, and says so\n')
await go('&tour=off&daymove=1&regen=1&topupfail=1&nolibrary=1', '#/tab/nutrition')
const f0 = await until(week, v => v && Object.keys(v).length === 7, 60)
const fOptions = await options()
await openSheet('breakfast')
await tapRegenerate()
const failed = await until(sheet, v => !!v?.note, 60)
const f1 = await week()
check('4a. it says it could not, in words, IN THE MEAL\'S OWN SHEET and in view (it was on the page behind the sheet)', /couldn't/i.test(failed?.note ?? '') && /Yours is as it was/.test(failed?.note ?? '') && failed?.noteInView === true, failed)
check('4a2. ...with no Undo, since nothing was done', failed?.undo === false, failed)
check('4b. the week is exactly as it was', JSON.stringify(f1) === JSON.stringify(f0), others(f1 ?? {}, []).filter(l => !others(f0 ?? {}, []).includes(l)))
check('4c. nothing was stored or deleted, and no pick written', JSON.stringify(await options()) === JSON.stringify(fOptions) && (await picks()).length === picksBefore.length, { options: (await options()).length, picks: await picks() })
await shoot('meal-regenerate-one-failed')

await finish('Regenerate on one meal changes that meal, and only that meal.')
