// ---------------------------------------------------------------------------
// MEALS COOKED FOR HIM ELSEWHERE, on the three screens that show them.
//
// Ashley, 11 Nov 2026: "I have breakfast and lunch cooked for me at work Monday
// to Friday". His ruling, "Set days + optional menu", in his words: "I dont
// want it to stop posing the meals, I want it to incorporate the meals into
// its plan." `test:meals-elsewhere` holds the rules (which dates, the assumed
// meal's size, leftovers, a pick wins, the list). This holds what only a screen
// can, at 390x844:
//
//   A. PROFILE (Meals & shopping): the grid is there and tappable, "Mon to Fri"
//      is one tap, every tap is SAVED BEFORE IT IS BELIEVED (the table is read,
//      not the screen), a tap that cannot save is put back and says so where he
//      tapped, and a database without the column says the setting is not on yet.
//   B. NUTRITION: on a working day the two meals are IN the list, labelled,
//      counted in the day's total, with none of a plan dish's controls; they can
//      be logged; on a day he cooks his own, one of his plan's meals takes the
//      place for that day; a weekend day has none; an upcoming working day has
//      them and no log button.
//   C. SHOPPING LIST: a rebuild leaves them out and says how many, once.
//
// WHAT THIS CANNOT PROVE, so it is not overread: App's own wiring (no harness
// page boots App). Pages B and C are handed the answer on the meal shape, as
// App puts it there (INPUT only); the week, the rows and the list are the
// app's own code. That Profile's saved answer REACHES the shape is App.tsx's,
// held by source in test:meals-elsewhere §9.
//
// TODAY IS WEDNESDAY 16 SEP 2026 (anchor.mjs): a working day.
//
// PORT 9897.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9897, page: 'profile.html', name: 'meals-elsewhere' })
const { origin, send, ev, check, until, wait, go, clickAt, shoot, finish } = d

const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').trim()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const inViewport = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight })()`)
let loads = 100
const open = async (page, query, hash = '') => { await send('Page.navigate', { url: `${origin}/.tour-harness/${page}?load=${++loads}${query}${hash}` }) }

// ---------------------------------------------------------------- A. PROFILE
/** What the TABLE holds, never what the screen shows. */
const stored = () => ev(`JSON.stringify(window.__fakeDb.fitness_profiles[0].meals_elsewhere ?? null)`)
const pressed = () => ev(`JSON.stringify([...document.querySelectorAll('[data-meals-elsewhere-day]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.getAttribute('data-meals-elsewhere-day')))`)
const summary = () => text('[data-testid="meals-elsewhere-summary"]')
const note = () => text('[data-testid="meals-elsewhere-note"]')
const openMeals = async () => {
  await ev(`document.querySelector('[data-profile-sheet]') && document.querySelector('[data-profile-back]')?.click()`)
  await wait(250)
  await ev(`document.querySelector('[data-profile-row="Meals & shopping"]')?.click()`)
  return until(() => has('[data-testid="profile-meals-elsewhere"]'), v => v)
}
const tap = async sel => { await clickAt(`document.querySelector(${JSON.stringify(sel)})`); await wait(350) }

await go('')
await until(() => has('[data-slot="dialog-content"]'), v => v)
check('A0. "Meals cooked for me" sits on the Meals & shopping sheet', (await openMeals()) === true)
check('A1. with nothing set it says None, and the table holds nothing', (await summary()) === 'None' && ['null', '{}'].includes(await stored()), [await summary(), await stored()])
const grid = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-meals-elsewhere-day]')].map(b => ({ k: b.getAttribute('data-meals-elsewhere-day'), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), label: b.getAttribute('aria-label') })))`))
const rowsShown = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-meals-elsewhere-row]')].map(r => r.getAttribute('data-meals-elsewhere-row')))`))
check('A2. a row for each meal his day has, seven days each', rowsShown.length >= 3 && grid.length === rowsShown.length * 7, [rowsShown, grid.length])
check('A3. every day is a 44px target and fits the screen', grid.every(g => g.h >= 44 && g.w >= 40) && await ev(`document.documentElement.scrollWidth <= innerWidth`), grid.filter(g => g.h < 44 || g.w < 40).slice(0, 3))
check('A4. each says its meal and its weekday to a screen reader, no two alike', new Set(grid.map(g => g.label)).size === grid.length && grid.some(g => g.label === 'Lunch, Monday') && grid.some(g => g.label === 'Breakfast, Friday'), grid.slice(0, 3))
const shortcutH = await ev(`Math.round(document.querySelector('[data-meals-elsewhere-weekdays="lunch"]').getBoundingClientRect().height)`)
check('A5. "Mon to Fri" is a 44px target', shortcutH >= 44, shortcutH)
check('A6. the section says what these meals are, and claims nothing about what is on the plate', /stay in your day and count towards it, and are never on your shopping list/.test(await text('[data-testid="profile-meals-elsewhere"]')) && !/safe|suits|allerg|free of/i.test(await text('[data-testid="profile-meals-elsewhere"]')))

// His own example: breakfast and lunch, Monday to Friday. Two taps.
await ev(`document.querySelector('[data-meals-elsewhere-weekdays="lunch"]').scrollIntoView({ block: 'center' })`)
await tap('[data-meals-elsewhere-weekdays="lunch"]')
await until(stored, v => /lunch/.test(v))
check('A7. one tap on lunch\'s "Mon to Fri" SAVES Monday to Friday', (await stored()) === JSON.stringify({ lunch: [1, 2, 3, 4, 5] }), await stored())
await tap('[data-meals-elsewhere-weekdays="breakfast"]')
await until(stored, v => /breakfast/.test(v))
const both = JSON.parse(await stored())
check('A8. ...and breakfast\'s too: the table holds both', JSON.stringify(both.breakfast) === '[1,2,3,4,5]' && JSON.stringify(both.lunch) === '[1,2,3,4,5]', both)
check('A9. the summary reads as he would say it', (await summary()) === 'Breakfast and lunch, Monday to Friday', await summary())
check('A10. ten days are drawn as on, and they are the saved ones', JSON.parse(await pressed()).length === 10 && JSON.parse(await pressed()).every(k => /^(breakfast|lunch)-[1-5]$/.test(k)), await pressed())
check('A11. it says it saved, and that the shopping list is his to rebuild', /^Saved\. Those meals stay in your day and count towards it\. Rebuild your shopping list to take them off it\.$/.test(await note()) && await inViewport('[data-testid="meals-elsewhere-note"]'), await note())
await shoot('meals-elsewhere-profile')

// One day off: Friday's lunch.
await tap('[data-meals-elsewhere-day="lunch-5"]')
await until(stored, v => JSON.stringify(JSON.parse(v).lunch) === '[1,2,3,4]')
const oneOff = JSON.parse(await stored())
check('A12. a tap on one day switches only that day', Object.keys(oneOff).sort().join() === 'breakfast,lunch' && JSON.stringify(oneOff.breakfast) === '[1,2,3,4,5]' && JSON.stringify(oneOff.lunch) === '[1,2,3,4]', oneOff)
check('A12b. the summary now has a line for each set of days', JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-meals-elsewhere-clause]')].map(c => c.textContent.trim()))`)).join(' | ') === 'Breakfast, Monday to Friday | Lunch, Monday to Thursday')
check('A13. ...and the shortcut no longer reads as on', (await ev(`document.querySelector('[data-meals-elsewhere-weekdays="lunch"]').getAttribute('aria-pressed')`)) === 'false')

// A SAVE THAT FAILS IS PUT BACK AND SAYS SO.
const before = await stored()
await ev(`window.__failWrite = (t, o) => t === 'fitness_profiles' && o === 'update'`)
await tap('[data-meals-elsewhere-day="lunch-6"]')
await until(note, v => /didn't save/.test(v))
check('A14. a tap that did not save says so, as an alert, on screen', (await note()) === "That didn't save. Check your connection and try again." && (await ev(`document.querySelector('[data-testid="meals-elsewhere-note"]').getAttribute('role')`)) === 'alert' && await inViewport('[data-testid="meals-elsewhere-note"]'), await note())
check('A15. ...the day is NOT left drawn as on', !JSON.parse(await pressed()).includes('lunch-6'), await pressed())
check('A16. ...and the table is as it was', (await stored()) === before, [await stored(), before])
await ev(`window.__failWrite = undefined`)

// A DATABASE THAT HAS NOT GOT THE COLUMN YET.
await ev(`window.__missingColumns = ['meals_elsewhere']`)
await tap('[data-meals-elsewhere-day="lunch-6"]')
await until(note, v => /switched on/.test(v))
check('A17. before the database step, it says the setting is not switched on yet', (await note()) === "That didn't save: this setting isn't switched on for your account yet." && await inViewport('[data-testid="meals-elsewhere-note"]'), await note())
check('A18. ...and the day is put back, the table untouched', !JSON.parse(await pressed()).includes('lunch-6') && (await stored()) === before, [await pressed(), await stored()])
await ev(`window.__missingColumns = undefined`)
await shoot('meals-elsewhere-not-yet')

// Everything off again.
await tap('[data-meals-elsewhere-weekdays="breakfast"]')
await until(stored, v => !/breakfast/.test(v))
for (const dnum of [1, 2, 3, 4]) { await tap(`[data-meals-elsewhere-day="lunch-${dnum}"]`); await until(stored, v => !(JSON.parse(v).lunch ?? []).includes(dnum)) }
check('A19. switching everything off stores an empty answer and says None', (await stored()) === '{}' && (await summary()) === 'None', [await stored(), await summary()])
check('A20. ...and says every meal is his to cook again', /^Saved\. Every meal is yours to cook again\./.test(await note()), await note())

// -------------------------------------------------------------- B. NUTRITION
const TODAY = '2026-09-16' // Wednesday
const openNutrition = async query => {
  await open('real.html', `&tour=off&daymove=1&regen=1${query}`, '#/tab/nutrition')
  return until(() => ev(`window.__poolsRead === true && !!document.querySelector('[data-testid="meal-day-strip"]') && document.querySelectorAll('[data-meal-row]').length >= 3`), v => v === true, 80)
}
const rows = () => ev(`JSON.stringify([...document.querySelectorAll('[data-meal-row]')].map(r => ({ slot: r.getAttribute('data-meal-row'), away: r.getAttribute('data-elsewhere'), variant: r.getAttribute('data-variant'), name: r.querySelector('[data-meal-name]')?.textContent.trim() ?? '', kcal: Number(r.querySelector('[data-testid="meal-row-kcal"]')?.textContent.replace(/[^0-9]/g, '') ?? 0), badge: r.querySelector('[data-testid="elsewhere-badge"]')?.textContent.trim() ?? null, label: r.querySelector('[data-testid="elsewhere-label"]')?.textContent.trim() ?? null })))`).then(JSON.parse)
const heroKcal = () => ev(`(() => { const el = document.querySelector('[data-testid="totals-hero-kcal"], [data-totals-kcal]'); return el ? Number(el.textContent.replace(/[^0-9]/g, '')) : -1 })()`)
const tapDay = async date => { await ev(`document.querySelector('[data-meal-day="${date}"]').click()`); await wait(500) }
const events = () => ev(`JSON.stringify((window.__fakeDb.meal_events ?? []).filter(e => !e.voided_at).map(e => ({ slot: e.slot, name: e.meal_name ?? e.mealName, kcal: e.macros?.kcal })))`).then(JSON.parse)
const picks = () => ev(`JSON.stringify((window.__fakeDb.meal_plan_picks ?? []).map(p => ({ date: p.plan_date ?? p.date, slot: p.slot, name: p.meal_name ?? p.name })))`).then(JSON.parse)

check('B0. harness: the plain week loads', (await openNutrition('')) === true)
const plainRows = await rows()
check('B1. with nothing cooked for him, no row is one', plainRows.length >= 3 && plainRows.every(r => r.away === null), plainRows)

// Where a dinner can be MOVED to, on the plain week (so the same question below means something).
const moveDestinations = async () => {
  await clickAt(`document.querySelector('[data-meal-row="dinner"] button')`)
  await until(() => has('[data-meal-row="dinner"] [data-meal-sheet-root]'), v => v)
  await clickAt(`document.querySelector('[data-testid="meal-move-open"]')`)
  await until(() => has('[data-testid="meal-move-sheet"]'), v => v)
  const dests = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid^="meal-move-to-"]')].map(b => b.getAttribute('data-testid').replace('meal-move-to-', '')))`))
  await ev(`document.querySelector('[data-meal-sheet-scrim]')?.click()`)
  await until(() => has('[data-meal-sheet-root]'), v => !v)
  return dests
}
const plainDests = await moveDestinations()
check('B1b. harness: on the plain week a dinner can move to breakfast or lunch', plainDests.includes('lunch') && plainDests.includes('breakfast'), plainDests)

check('B2. harness: the week with breakfast and lunch at work loads', (await openNutrition('&atwork=1')) === true)
const today = await rows()
const bf = today.find(r => r.slot === 'breakfast'), lu = today.find(r => r.slot === 'lunch'), di = today.find(r => r.slot === 'dinner')
check('B3. on a working day breakfast and lunch are STILL IN the list, as meals cooked for him', bf?.away === 'assumed' && lu?.away === 'assumed' && bf.name === 'Breakfast cooked for you' && lu.name === 'Lunch cooked for you', today)
check('B4. ...each labelled "Cooked for you" and badged "Assumed"', [bf, lu].every(r => r?.label === 'Cooked for you' && r?.badge === 'Assumed'), [bf, lu])
check('B5. ...each with a real size, not zero', bf?.kcal > 200 && lu?.kcal > 300, [bf?.kcal, lu?.kcal])
check('B6. dinner is still the plan\'s own dish', di && di.away === null && di.name.length > 0 && !/cooked for you/i.test(di.name), di)
const dayKcal = Number((await text('[data-testid="day-kcal"]')).replace(/[^0-9]/g, ''))
const sumRows = today.reduce((n, r) => n + r.kcal, 0)
check('B7. the day\'s planned total COUNTS them: it is the sum of the three rows', dayKcal > 0 && Math.abs(dayKcal - sumRows) <= 3, [dayKcal, sumRows])
const verdict = await text('[data-planned-day]')
check('B8. ...and the day is still on target with them in it', /on target/.test(verdict), verdict)
await shoot('meals-elsewhere-today')
const awayDests = await moveDestinations()
check('B8b. his dinner is NOT offered a move into a meal cooked for him', !awayDests.includes('lunch') && !awayDests.includes('breakfast'), awayDests)

// The row opens in place: what it is, and only what is true of it.
await clickAt(`document.querySelector('[data-meal-row="lunch"] button')`)
await until(() => has('[data-testid="elsewhere-panel"]'), v => v)
const noteText = await text('[data-testid="elsewhere-note"]')
check('B9. opened, it says the size is assumed and the app does not know the plate', /A normal-sized lunch, assumed\. The app doesn't know what's on the plate\./.test(noteText) && /Tell the coach what's on the menu/.test(noteText), noteText)
check('B10. it has no recipe, no foods, no heart, no move: none is true of it', !(await has('[data-meal-row="lunch"] [data-meal-sheet-root]')) && !(await has('[data-meal-row="lunch"] [data-testid="meal-move-open"]')) && !(await has('[data-meal-row="lunch"] [data-testid="meal-food-add-open"]')))
const logH = await ev(`Math.round(document.querySelector('[data-testid="elsewhere-log"]').getBoundingClientRect().height)`)
check('B11. "I ate this" is on screen and a 44px target', logH >= 44 && await inViewport('[data-testid="elsewhere-log"]'), logH)
await shoot('meals-elsewhere-open')

// Log it.
await clickAt(`document.querySelector('[data-testid="elsewhere-log"]')`)
await until(events, e => e.length === 1)
const logged = await events()
check('B12. logging it records the meal, by its own name and size', logged.length === 1 && logged[0].slot === 'lunch' && logged[0].name === 'Lunch cooked for you' && Math.abs(logged[0].kcal - lu.kcal) <= 1, logged)
const afterLog = await until(rows, r => r.find(x => x.slot === 'lunch')?.variant === 'eaten')
check('B13. ...and the row reads as eaten', afterLog.find(r => r.slot === 'lunch')?.variant === 'eaten', afterLog)
// WHAT HE ATE, NOT WHAT THE PLAN SAYS. He tells the coach what was really on the plate and the coach logs it to
// lunch: the record then carries its own name and size. Stood in for here by changing the stored record (INPUT), and
// read back the way the screen reads it, on its next read of the day (logging breakfast).
await ev(`(() => { const e = window.__fakeDb.meal_events.find(x => !x.voided_at && x.slot === 'lunch'); if ('meal_name' in e) e.meal_name = 'Beef lasagne at work'; if ('mealName' in e) e.mealName = 'Beef lasagne at work'; e.macros = { ...e.macros, kcal: 777 } })()`)
await clickAt(`document.querySelector('[data-meal-row="breakfast"] button')`)
await until(() => has('[data-meal-row="breakfast"] [data-testid="elsewhere-log"]'), v => v)
await clickAt(`document.querySelector('[data-meal-row="breakfast"] [data-testid="elsewhere-log"]')`)
await until(events, e => e.length === 2)
const asEaten = await until(rows, r => r.find(x => x.slot === 'lunch')?.kcal === 777)
check('B13b. a logged meal shows what was LOGGED: its own name and size, not the assumed meal\'s', asEaten.find(r => r.slot === 'lunch')?.name === 'Beef lasagne at work' && asEaten.find(r => r.slot === 'lunch')?.kcal === 777, asEaten.find(r => r.slot === 'lunch'))
check('B13c. ...and once logged it no longer wears the "Assumed" badge', asEaten.find(r => r.slot === 'lunch')?.badge === null && asEaten.find(r => r.slot === 'breakfast')?.badge === null, asEaten)
await clickAt(`document.querySelector('[data-meal-row="breakfast"] [data-testid="elsewhere-unlog"]')`)
await until(events, e => e.length === 1)
await clickAt(`document.querySelector('[data-meal-row="lunch"] button')`)
await until(() => has('[data-meal-row="lunch"] [data-testid="elsewhere-unlog"]'), v => v)
await clickAt(`document.querySelector('[data-meal-row="lunch"] [data-testid="elsewhere-unlog"]')`)
await until(events, e => e.length === 0)
check('B14. each can be taken off again', (await events()).length === 0)
const backToPlan = await until(rows, r => r.find(x => x.slot === 'lunch')?.variant !== 'eaten')
check('B14b. ...and the row is the assumed meal again', backToPlan.find(r => r.slot === 'lunch')?.name === 'Lunch cooked for you' && backToPlan.find(r => r.slot === 'lunch')?.badge === 'Assumed', backToPlan.find(r => r.slot === 'lunch'))

// A day he cooks his own: one of his plan's meals takes the place, for today only.
await until(() => has('[data-testid="elsewhere-own"]'), v => v)
await clickAt(`document.querySelector('[data-testid="elsewhere-own"]')`)
await until(() => has('[data-testid="elsewhere-own-list"]'), v => v)
const own = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-elsewhere-own]')].map(b => ({ name: b.getAttribute('data-elsewhere-own'), h: Math.round(b.getBoundingClientRect().height) })))`))
check('B15. "Cooking my own today" offers his plan\'s lunches, each a 44px target', own.length >= 2 && own.length <= 6 && own.every(o => o.h >= 44 && !/cooked for you/i.test(o.name)), own)
check('B16. ...and says it changes today only', /Pick one of your meals for today\. Your other days stay as they are\./.test(await text('[data-testid="elsewhere-own-list"]')))
await clickAt(`document.querySelector('[data-elsewhere-own=${JSON.stringify(own[0]?.name ?? '')}]')`)
const swapped = await until(rows, r => r.find(x => x.slot === 'lunch')?.away === null, 60)
check('B17. picking one makes it today\'s lunch', swapped.find(r => r.slot === 'lunch')?.name === own[0]?.name && swapped.find(r => r.slot === 'lunch')?.away === null, swapped)
check('B18. ...breakfast is still the one cooked for him', swapped.find(r => r.slot === 'breakfast')?.away === 'assumed', swapped)
const saved = await picks()
check('B19. ...saved as a pick for TODAY and that meal only', saved.length === 1 && saved[0].date === TODAY && saved[0].slot === 'lunch' && saved[0].name === own[0]?.name, saved)

// Other days of the week.
await tapDay('2026-09-17') // Thursday
const thu = await until(rows, r => r.length >= 3 && r.every(x => x.variant !== 'upnext'))
check('B20. tomorrow (Thursday) has both, his pick for today did not reach it', thu.find(r => r.slot === 'breakfast')?.away === 'assumed' && thu.find(r => r.slot === 'lunch')?.away === 'assumed', thu)
await clickAt(`document.querySelector('[data-meal-row="lunch"] button')`)
await until(() => has('[data-testid="elsewhere-panel"]'), v => v)
check('B21. an upcoming day\'s meal cannot be logged, and offers "Cooking my own that day"', !(await has('[data-testid="elsewhere-log"]')) && (await text('[data-testid="elsewhere-own"]')) === 'Cooking my own that day')
await tapDay('2026-09-19') // Saturday
const sat = await until(rows, r => r.length >= 3 && r.every(x => x.away === null))
check('B22. Saturday has none: every meal is his own', sat.length >= 3 && sat.every(r => r.away === null && !/cooked for you/i.test(r.name)), sat)
await tapDay('2026-09-21') // Monday
const mon = await until(rows, r => r.some(x => x.away === 'assumed'))
check('B23. Monday has both again', mon.find(r => r.slot === 'breakfast')?.away === 'assumed' && mon.find(r => r.slot === 'lunch')?.away === 'assumed', mon)
await shoot('meals-elsewhere-monday')

// A MENU HE TOLD THE COACH: Thursday's lunch is an estimate (stored as the coach's card stores it; ?estimate=1).
check('B24. harness: the week with an estimated Thursday lunch loads', (await openNutrition('&atwork=1&estimate=1')) === true)
const wedE = await rows()
check('B25. today is untouched by it: lunch is still the assumed one', wedE.find(r => r.slot === 'lunch')?.away === 'assumed' && wedE.find(r => r.slot === 'lunch')?.name === 'Lunch cooked for you', wedE)
await tapDay('2026-09-17')
const thuE = await until(rows, r => r.find(x => x.slot === 'lunch')?.away === 'estimate', 60)
const luE = thuE.find(r => r.slot === 'lunch')
check('B26. Thursday\'s lunch is the dish he named, labelled "Cooked for you" and badged "Estimate"', luE?.away === 'estimate' && luE.name === 'Canteen chicken curry' && luE.badge === 'Estimate' && luE.label === 'Cooked for you', luE)
check('B27. ...at the size the app works out from its foods, not a number anyone typed', luE?.kcal > 420 && luE?.kcal < 720 && luE?.kcal !== 610, luE?.kcal)
check('B28. ...Thursday\'s breakfast is still the assumed one', thuE.find(r => r.slot === 'breakfast')?.away === 'assumed', thuE)
const thuVerdict = await text('[data-planned-day]')
const thuDinner = thuE.find(r => r.slot === 'dinner')
check('B29. his own dinner is still there, and the day says where it lands', thuDinner?.away === null && thuDinner.kcal > 0 && /kcal/.test(thuVerdict), [thuDinner, thuVerdict])
await clickAt(`document.querySelector('[data-meal-row="lunch"] button')`)
await until(() => has('[data-testid="elsewhere-panel"]'), v => v)
const foods = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid="elsewhere-foods"] li')].map(li => li.textContent.trim()))`))
check('B30. opened, it says it is an estimate and lists the foods it was costed from', (await text('[data-testid="elsewhere-note"]')) === 'An estimate from what you told the coach, with ordinary portions.' && foods.length === 4 && foods.some(f => /chicken/.test(f)) && foods.some(f => /rice/.test(f)), foods)
check('B31. ...with no recipe, no food editing and no heart', !(await has('[data-meal-row="lunch"] [data-meal-sheet-root]')) && !(await has('[data-meal-row="lunch"] [data-testid="meal-food-add-open"]')))
await shoot('meals-elsewhere-estimate')
await tapDay('2026-09-18')
const friE = await until(rows, r => r.find(x => x.slot === 'lunch')?.away === 'assumed')
check('B32. Friday is back to the assumed lunch: the canteen\'s curry is served on the one day only', friE.find(r => r.slot === 'lunch')?.name === 'Lunch cooked for you' && friE.every(r => r.name !== 'Canteen chicken curry'), friE)
await tapDay('2026-09-19')
const satE = await until(rows, r => r.length >= 3 && r.every(x => x.away === null))
check('B33. ...and never on a day he cooks for himself', satE.every(r => r.name !== 'Canteen chicken curry' && r.away === null), satE)

// ---------------------------------------------------------- C. SHOPPING LIST
const openList = async query => {
  await open('grocery.html', `&empty=1&nomemo=1${query}`)
  return until(() => has('[data-testid="grocery-rebuild"]'), v => v, 60)
}
const listRows = () => ev(`JSON.stringify((window.__fakeDb.grocery_items ?? []).filter(r => r.source === 'generated').map(r => ({ name: r.name, refs: (r.meal_refs ?? []).map(m => m.slot + '@' + (m.date ?? m.day)) })))`).then(JSON.parse)
const rebuild = async () => { await clickAt(`document.querySelector('[data-testid="grocery-rebuild"]')`); return until(listRows, r => r.length > 0, 60) }

check('C0. harness: the list page loads with breakfast and lunch at work', (await openList('&atwork=1')) === true)
const awayList = await rebuild()
const refs = awayList.flatMap(r => r.refs)
check('C1. a rebuild writes a list', awayList.length > 0, awayList.length)
const isWorkingDay = ref => { const dte = ref.split('@')[1]; const wd = new Date(`${dte}T12:00:00Z`).getUTCDay(); return wd >= 1 && wd <= 5 }
check('C2. NO line is bought for a breakfast or lunch on a working day', !refs.some(r => /^(breakfast|lunch)@/.test(r) && isWorkingDay(r)), refs.filter(r => /^(breakfast|lunch)@/.test(r) && isWorkingDay(r)).slice(0, 5))
check('C3. ...the weekend\'s breakfasts and lunches ARE bought', refs.some(r => /^(breakfast|lunch)@/.test(r) && !isWorkingDay(r)), refs.slice(0, 8))
check('C4. ...and every day\'s dinner', new Set(refs.filter(r => /^dinner@/.test(r))).size === 7, [...new Set(refs.filter(r => /^dinner@/.test(r)))])
const line = await until(() => text('[data-testid="grocery-elsewhere"]'), v => v.length > 0)
check('C5. the list says, once, that ten meals are cooked for him and not on it', line === '10 meals are cooked for you, so they are not on this list.' && (await ev(`document.querySelectorAll('[data-testid="grocery-elsewhere"]').length`)) === 1, line)
await ev(`document.querySelector('[data-testid="grocery-elsewhere"]').scrollIntoView({ block: 'center' })`)
await wait(200)
await shoot('meals-elsewhere-list')

check('C6. harness: the list page loads with nothing cooked for him', (await openList('')) === true)
const plainList = await rebuild()
const plainRefs = plainList.flatMap(r => r.refs)
check('C7. the plain week buys breakfasts and lunches on working days', plainRefs.some(r => /^(breakfast|lunch)@/.test(r) && isWorkingDay(r)), plainRefs.slice(0, 6))
check('C8. ...and says nothing about meals cooked for him', !(await has('[data-testid="grocery-elsewhere"]')))

await finish('Meals cooked for him are set on Profile, stay in the day on Nutrition, and are left off the shopping list.')
