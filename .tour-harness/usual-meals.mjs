// ---------------------------------------------------------------------------
// HIS OWN MEALS, ADDED ON THE SCREEN HE WOULD ADD THEM ON (Profile → Foods you like).
//
// Ashley, 11 Nov 2026: "how do we ensure we are helping users fit meals around
// foods they already enjoy". His ruling: "My usual meals first".
// `test:usual-meals` holds the rules (what counts as his, the week's menu, the
// day's pick, the refusals). This holds what only a screen can, at 390x844:
// the form is there and tappable, a line the app cannot read and a food he
// avoids are each said IN THE FORM and on screen, the meal is shown as the app
// costed it BEFORE anything is saved, saving writes one marked row and lists
// it, a meal that cannot be sized is kept at his amounts and says so, and
// removing one takes the row out.
//
// WHAT THIS CANNOT PROVE, so it is not overread: App's own wiring (no harness
// page boots App). The page (profile.tsx ?mymeals=1) builds the controller with
// the app's own `makeMyMealsController`, reads the meals through the app's own
// read and restriction marking, and takes the targets from the app's own
// calculation; `test:usual-meals` §8 holds App's half by source. And it cannot
// prove a meal of his is then SERVED: that is the day search, held by
// test:usual-meals §3-4 and measured by measure:usual-meals.
//
// PORT 9893.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9893, page: 'profile.html', name: 'usual-meals' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d

const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').trim()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const inViewport = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight })()`)
/** What the TABLE holds, not what the screen shows. */
const rows = () => ev(`JSON.stringify((window.__fakeDb.meal_plan_slots ?? []).map(r => ({ slot: r.slot, name: r.name, tags: r.tags ?? [], ing: (r.ingredients ?? []).map(i => i.quantity + (i.unit || '') + ' ' + i.name) })))`).then(JSON.parse)
const mine = async () => (await rows()).filter(r => r.tags.includes('my-meal'))
const listed = () => ev(`JSON.stringify([...document.querySelectorAll('[data-my-meal]')].map(li => ({ name: li.getAttribute('data-my-meal'), line: li.textContent.trim(), h: Math.round(li.getBoundingClientRect().height) })))`).then(JSON.parse)
const type = async (id, value) => {
  await ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(120)
}
const pickSlot = slot => clickAt(`document.querySelector('[data-my-meal-slot="${slot}"]')`)
const fill = async (name, slot, lines) => { await type('my-meal-name', name); await pickSlot(slot); await type('my-meal-lines', lines.join('\n')); await wait(150) }
const checkIt = async () => { await clickAt(`document.querySelector('[data-testid="my-meal-check"]')`); await wait(300) }

const openLikes = async () => {
  await ev(`document.querySelector('[data-profile-sheet]') && document.querySelector('[data-profile-back]')?.click()`)
  await wait(250)
  await ev(`document.querySelector('[data-profile-row="Foods you like"]')?.click()`)
  return until(() => has('[data-testid="profile-my-meals"]'), v => v)
}

await go('&mymeals=1')
await until(() => has('[data-slot="dialog-content"]'), v => v)
check('0. "My meals" sits on the Foods you like sheet', (await openLikes()) === true)
await until(async () => (await rows()).length, n => n >= 60)
const seeded = await rows()
const N = seeded.length
const PLAN_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'].filter(sl => seeded.some(r => r.slot === sl))
check('0a. harness: the plan is a real-sized one (the library\'s dishes, deep in every meal) and none is his yet', PLAN_MEALS.length >= 3 && PLAN_MEALS.every(sl => seeded.filter(r => r.slot === sl).length > 10) && (await mine()).length === 0, { N, PLAN_MEALS })

// 1. NOTHING ADDED YET.
check('1a. no list is drawn when he has none', !(await has('[data-testid="my-meals-list"]')))
const addH = await ev(`Math.round(document.querySelector('[data-testid="my-meals-add"]').getBoundingClientRect().height)`)
check('1b. "Add a meal" is a 44px target', addH >= 44, addH)
check('1c. the section says what his meals are for, without promising a share of the week',
  /Meals you already eat\. They come first when each week's meals are chosen/.test(await text('[data-testid="profile-my-meals"]')) && !/half|%/.test(await text('[data-testid="profile-my-meals"]')), await text('[data-testid="profile-my-meals"]'))

// 2. THE FORM.
await clickAt(`document.querySelector('[data-testid="my-meals-add"]')`)
await until(() => has('[data-testid="my-meals-form"]'), v => v)
const slots = await ev(`JSON.stringify([...document.querySelectorAll('[data-my-meal-slot]')].map(b => ({ s: b.getAttribute('data-my-meal-slot'), h: Math.round(b.getBoundingClientRect().height), on: b.getAttribute('aria-checked') })))`).then(JSON.parse)
check('2a. the meals offered are the ones his plan has, each a 44px target, the first chosen', slots.map(s => s.s).join() === PLAN_MEALS.join() && slots.every(s => s.h >= 44) && slots[0].on === 'true' && slots.slice(1).every(s => s.on === 'false'), slots)
await checkIt()
check('2b. Check with nothing typed asks for a name, in the form', /Give the meal a name/.test(await text('[data-testid="my-meal-refused"]')) && await inViewport('[data-testid="my-meal-refused"]'), await text('[data-testid="my-meal-refused"]'))

// 3. A LINE THE APP CANNOT READ IS ASKED ABOUT, NEVER GUESSED (his 1 Oct ruling).
await fill('Mystery lunch', 'lunch', ['a knob of butter', '150g chicken breast'])
check('3a. typing clears the last refusal', !(await has('[data-testid="my-meal-refused"]')))
await checkIt()
const unread = await text('[data-testid="my-meal-refused"]')
check('3b. the amount it could not read is named and asked about', /a knob of butter/.test(unread) && /how many grams/i.test(unread), unread)
check('3c. ...where he can see it, with no card and nothing to save', await inViewport('[data-testid="my-meal-refused"]') && !(await has('[data-testid="my-meal-card"]')) && !(await has('[data-testid="my-meal-keep"]')))
check('3d. NOTHING WAS SAVED', (await rows()).length === N)
await shoot('usual-meals-unread')

// 3e-3g. WHAT IS ON SCREEN IS ABOUT WHAT IS TYPED. Each field on its own clears the last answer: a refusal about
// foods he has since changed, or a card sized for a meal he has since moved it out of, would be about something else.
await type('my-meal-lines', '150g chicken breast')
check('3e. changing only the foods clears the refusal', !(await has('[data-testid="my-meal-refused"]')))
await checkIt()
await until(() => has('[data-testid="my-meal-card"]'), v => v)
check('3f. harness: with the unreadable line gone the same meal is shown as a card', await has('[data-testid="my-meal-card"]'))
await type('my-meal-name', 'Plain chicken lunch')
check('3f2. changing only the name clears the card: the card names the meal, and that is no longer its name', !(await has('[data-testid="my-meal-card"]')))
await checkIt()
await until(() => has('[data-testid="my-meal-card"]'), v => v)
await pickSlot('dinner')
await wait(150)
check('3g. changing only the meal clears the card: it was sized for the other meal', !(await has('[data-testid="my-meal-card"]')) && !(await has('[data-testid="my-meal-keep"]')))
check('3h. ...and still nothing was saved', (await rows()).length === N)

// 4. A FOOD HE AVOIDS.
await fill('Mushroom omelette', 'breakfast', ['3 eggs', '100g mushrooms'])
await checkIt()
const avoided = await text('[data-testid="my-meal-refused"]')
check('4a. a meal holding a food he avoids is refused, naming the food', /mushroom/i.test(avoided) && !(await has('[data-testid="my-meal-card"]')), avoided)
check('4b. ...and nothing was saved', (await rows()).length === N)

// 5. A MEAL THE APP CAN SIZE: SHOWN AS COSTED BEFORE ANYTHING IS KEPT.
await fill('Chicken, rice and veg', 'dinner', ['150g chicken breast', '70g dry rice', '100g broccoli'])
await checkIt()
await until(() => has('[data-testid="my-meal-card"]'), v => v)
const numbers = await text('[data-testid="my-meal-numbers"]')
const portions = await text('[data-testid="my-meal-portions"]')
const what = await text('[data-testid="my-meal-what"]')
check('5a. the card names the meal', /^Chicken, rice and veg/.test(await text('[data-testid="my-meal-card"]')))
check('5b. ...with its numbers', /^\d{3,4} kcal · \d+g protein · \d+g carbs · \d+g fat$/.test(numbers), numbers)
check('5c. ...and its portions, sized to that meal, every food he typed', /^Sized to your dinner: /.test(portions) && /chicken breast/.test(portions) && /rice/.test(portions) && /broccoli/.test(portions), portions)
check('5d. ...and what happens to it: it joins his options and comes first', /^Joins your dinner options\. Your own meals come first when each week\'s meals are chosen\.$/.test(what), what)
const chicken = Number((/(\d+)g (?:raw )?chicken breast/.exec(portions) ?? [])[1] ?? 0)
check('5d2. the chicken is still a dinner\'s worth, not doubled to fill the meal (150g typed; sizing by energy alone made it 350g)', chicken >= 100 && chicken <= 260, chicken)
check('5e. NOTHING IS SAVED YET', (await rows()).length === N && (await listed()).length === 0)
await ev(`document.querySelector('[data-testid="my-meal-keep"]').scrollIntoView({ block: 'center' })`)
await wait(200)
const keepH = await ev(`Math.round(document.querySelector('[data-testid="my-meal-keep"]').getBoundingClientRect().height)`)
check('5f. "Add to my meals" is on screen and a 44px target', await inViewport('[data-testid="my-meal-keep"]') && keepH >= 44, keepH)
await shoot('usual-meals-card')

// 6. KEEP IT.
await clickAt(`document.querySelector('[data-testid="my-meal-keep"]')`)
const saved = await until(() => text('[data-testid="my-meals-note"]'), v => v.length > 0, 60)
check('6a. a line says it was added', saved === 'Chicken, rice and veg added to your meals.', saved)
const afterOne = await mine()
check('6b. the table holds ONE new row, in dinner, marked as his', (await rows()).length === N + 1 && afterOne.length === 1 && afterOne[0].slot === 'dinner' && afterOne[0].name === 'Chicken, rice and veg', afterOne)
check('6c. ...with the portions the card showed', afterOne.length === 1 && afterOne[0].ing.length === 3 && afterOne[0].ing.every(i => /^\d/.test(i)), afterOne[0]?.ing)
const list1 = await until(listed, l => l.length === 1)
check('6d. it is listed, with its meal and numbers, on a 44px row', list1.length === 1 && list1[0].name === 'Chicken, rice and veg' && /Dinner · \d{3,4} kcal · \d+g protein/.test(list1[0].line) && list1[0].h >= 44, list1)
check('6e. the form has closed and Add is back', !(await has('[data-testid="my-meals-form"]')) && await has('[data-testid="my-meals-add"]'))
check('6f. no day\'s pick was written: nothing on his plan moved', (await ev(`(window.__fakeDb.meal_plan_picks ?? []).length`)) === 0)

// 7. A USUAL MEAL THAT CANNOT BE SIZED IS KEPT AT HIS AMOUNTS, AND SAYS SO.
await clickAt(`document.querySelector('[data-testid="my-meals-add"]')`)
await until(() => has('[data-testid="my-meals-form"]'), v => v)
await fill('Morning porridge', 'breakfast', ['80g oats', '300ml semi-skimmed milk', '120g banana'])
await checkIt()
await until(() => has('[data-testid="my-meal-card"]'), v => v)
const kept = await text('[data-testid="my-meal-portions"]')
check('7a. the card says the amounts are his, not resized', /^Kept at your amounts: /.test(kept) && /80g/.test(kept) && /120g/.test(kept) && !/Sized/.test(kept), kept)
check('7a2. ...and a food held raw says its cooked weight beside it, so the number he typed is on the card', /\(about \d+g cooked\)/.test(portions), portions)
await clickAt(`document.querySelector('[data-testid="my-meal-keep"]')`)
await until(listed, l => l.length === 2)
const porridge = (await mine()).find(r => r.name === 'Morning porridge')
check('7b. the row holds what he typed: 80 of oats, 120 of banana', !!porridge && porridge.slot === 'breakfast' && porridge.ing.some(i => /^80g .*oats/.test(i)) && porridge.ing.some(i => /^120g .*banana/.test(i)), porridge)
const list2 = await listed()
check('7c. both are listed, in meal order', list2.map(l => l.name).join('|') === 'Morning porridge|Chicken, rice and veg', list2)

// 8. THE SAME NAME TWICE.
await clickAt(`document.querySelector('[data-testid="my-meals-add"]')`)
await until(() => has('[data-testid="my-meals-form"]'), v => v)
await fill('chicken, rice and veg', 'dinner', ['150g chicken breast', '70g dry rice'])
await checkIt()
check('8a. a name already among that meal\'s options is refused, and nothing is saved', /already one of your dinner options/.test(await text('[data-testid="my-meal-refused"]')) && (await rows()).length === N + 2, await text('[data-testid="my-meal-refused"]'))
await ev(`[...document.querySelectorAll('[data-testid="my-meals-form"] button')].find(b => b.textContent.trim() === 'Cancel').click()`)
await wait(200)
await ev(`document.querySelector('[data-testid="my-meals-list"]').scrollIntoView({ block: 'center' })`)
await wait(200)
await shoot('usual-meals-list')

// 9. TAKE ONE BACK OUT.
await clickAt(`document.querySelector('button[aria-label="Remove Chicken, rice and veg from your meals"]')`)
const removed = await until(() => text('[data-testid="my-meals-note"]'), v => /removed/.test(v), 60)
check('9a. a line says it was removed', removed === 'Chicken, rice and veg removed from your meals.', removed)
const afterRemove = await rows()
check('9b. the row is gone from the table, and only that row', afterRemove.length === N + 1 && !afterRemove.some(r => r.name === 'Chicken, rice and veg') && afterRemove.some(r => r.name === 'Morning porridge') && seeded.every(s => afterRemove.some(r => r.name === s.name)), afterRemove.map(r => r.name))
check('9c. ...and from the list', (await until(listed, l => l.length === 1)).map(l => l.name).join() === 'Morning porridge')

// 10. THE WAY HERE FROM NUTRITION: a meal's swap list has "Add a meal you already eat". On the Nutrition page of the
// harness (real.html), handed what App hands it: there it opens Profile at My meals, here it only says it was asked.
// That Profile then opens on the right sheet is held by source (test:usual-meals §13): no page boots App.
await d.send('Page.navigate', { url: `${d.origin}/.tour-harness/real.html?load=900&tour=off&daymove=1&regen=1#/tab/nutrition` })
await until(() => ev(`window.__poolsRead === true && document.querySelectorAll('[data-meal-row]').length >= 3`), v => v === true, 80)
await clickAt(`document.querySelector('[data-meal-row="dinner"] button')`)
await until(() => has('[data-meal-row="dinner"] [data-meal-sheet-root]'), v => v)
await clickAt(`document.querySelector('[data-meal-sheet-tab="swap"]')`)
const linkThere = await until(() => has('[data-testid="meal-open-my-meals"]'), v => v)
const link = JSON.parse(await ev(`JSON.stringify((() => { const b = document.querySelector('[data-testid="meal-open-my-meals"]'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight } })())`))
check('10a. a meal\'s swap list offers "Add a meal you already eat", on screen, a 44px target', linkThere === true && link?.text === 'Add a meal you already eat' && link.h >= 44 && link.inView, link)
await shoot('usual-meals-from-nutrition')
await clickAt(`document.querySelector('[data-testid="meal-open-my-meals"]')`)
await wait(400)
check('10b. tapping it asks the app to open My meals, once', (await ev(`window.__openedMyMeals ?? 0`)) === 1, await ev(`window.__openedMyMeals ?? 0`))
check('10c. ...and the meal sheet has closed first, so Profile is not opened over an open sheet', !(await has('[data-meal-sheet-root]')))

await finish('his own meals are added, checked, shown as costed, kept and removed on the screen')
