// ---------------------------------------------------------------------------
// verify:nutrition-3a — NUTRITION 3a (closed) AND 3b (the recipe sheet), DRIVEN AT 390px (31 Oct 2026).
//
// The design handoff's Nutrition, built under her "build, keep my rulings": no rings on this screen (the top card
// is the legend, one row per macro and water, each with a bar), the shopping list as a pill on the "Today's meals"
// row with a round + beside it for off-plan food, meal rows with a status circle, and a tap opening the recipe
// sheet that holds every control the open row had.
//
// Reads the real MealPlan and NutritionDisplay on the harness page (real.tsx). App.tsx is not booted, so the
// coach the + opens is not proven here; that the + sets the prefill and goes to the chat tab is.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const d = await boot({ debugPort: 9873, passed: 'Nutrition 3a/3b: every check passed.' })
const { ev, check, finish, load, until, wait, shoot, tapExpr, q, J } = d

console.log('\nA. The top card (3a, rings left out)')
await load('', { tab: 'nutrition' })
await until(`!!document.querySelector('[data-meal-row]')`, 30000)
await wait(600)
check('1. no rings on Nutrition (her 17 Oct ruling)', await ev(`!document.querySelector('main [data-ring], [data-nutrition-hero] svg circle')`))
const rows = await ev(`[...document.querySelectorAll('[data-ring-key] [data-ring-key-row]')].map(r => r.dataset.ringKeyRow)`)
check('2. the legend is protein, carbs, fat, water, in that order', (rows ?? []).join(',') === 'protein,carbs,fat,water', rows)
const bars = await ev(`[...document.querySelectorAll('[data-ring-key] [data-ring-key-row]')].map(r => { const b = r.querySelector('[data-share]'); return b ? { h: Math.round(b.getBoundingClientRect().height), share: b.dataset.share } : null })`)
check('3. every row carries its own 3px bar', (bars ?? []).length === 4 && bars.every(b => b && b.h === 3), bars)
const hero = await ev(`(() => { const h = ${q('[data-nutrition-hero]')}; if (!h) return null; return { text: h.innerText.replace(/\\s+/g, ' '), eaten: ${q('[data-testid="kcal-eaten"]')}?.innerText, left: ${q('[data-testid="kcal-left"]')}?.innerText, leftN: ${q('[data-testid="kcal-left-number"]')}?.innerText, target: ${q('[data-testid="kcal-target"]')}?.innerText } })()`)
const n = s => Number(String(s ?? '').replace(/,/g, ''))
check('4. the calories say what is eaten of the target, and what is left from the phrasebook (left/over)',
  !!hero && /^kcal (left|over)$/.test(hero.left ?? '') && Math.abs(n(hero.target) - n(hero.eaten) - (hero.left === 'kcal over' ? -n(hero.leftN) : n(hero.leftN))) <= 1, hero)
const count = await ev(`${q('[data-testid="meals-count"]')}?.innerText ?? ''`)
const logged = await ev(`document.querySelectorAll('[data-meal-row][data-variant="eaten"]').length`)
const total = await ev(`document.querySelectorAll('[data-meal-row] [data-meal-name]').length`)
check('5. "Today · N of M meals" counts the rows below it', new RegExp(`^today · ${logged} of ${total} meals?$`, 'i').test(count.trim()), { count, logged, total })
await shoot('nutrition-3a-closed')

console.log('\nB. The "Today\'s meals" row')
const header = await ev(`(() => { const h = ${q('[data-meals-header]')}; const list = ${q('[data-testid="meal-list"]')}; if (!h || !list) return null; return { text: h.innerText.replace(/\\s+/g, ' '), above: h.getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1, pill: !!h.querySelector('[data-grocery-pill]'), plus: !!h.querySelector('[data-log-something-else]') } })()`)
check('6. "Today\'s meals" sits above the list with the Grocery list pill and the round +', !!header && /today's meals/i.test(header.text) && /grocery list/i.test(header.text) && header.above && header.pill && header.plus, header)
await tapExpr(q('[data-grocery-pill]'))
check('7. the pill opens the grocery list', await ev(`/grocery/.test(location.hash)`), await ev('location.hash'))
await load('', { tab: 'nutrition' })
await until(`!!document.querySelector('[data-log-something-else]')`, 30000)
await tapExpr(q('[data-log-something-else]'))
check('8. the + goes to the coach with "I also ate " ready to finish (her M51 rule: off-plan food goes through the coach)',
  await ev(`/chat/.test(location.hash)`) && await ev(`(() => { try { return Object.values(sessionStorage).concat(Object.values(localStorage)).some(v => String(v).includes('I also ate')) || document.body.innerText.includes('I also ate') } catch { return document.body.innerText.includes('I also ate') } })()`),
  await ev('location.hash'))

console.log('\nC. The meal rows')
await load('', { tab: 'nutrition' })
await until(`!!document.querySelector('[data-meal-row]')`, 30000)
await wait(600)
const meta = await ev(`[...document.querySelectorAll('[data-meal-row]')].map(r => { const s = r.querySelector('[data-meal-status]'); const b = r.querySelector('button'); const name = r.querySelector('[data-meal-name]'); return { slot: r.dataset.mealRow, variant: r.dataset.variant, status: s?.dataset.mealStatus, size: s ? Math.round(s.getBoundingClientRect().width) : 0, h: b ? Math.round(b.getBoundingClientRect().height) : 0, macros: (r.querySelector('[data-meal-macros]')?.innerText ?? '').replace(/\\s+/g, ' '), kcal: r.querySelector('[data-testid="meal-row-kcal"]')?.innerText, ink: name ? getComputedStyle(name).color : null, opacity: name ? getComputedStyle(name).opacity : null } })`)
check('9. every row has a 26px status circle matching its state, and is at least 44px tall', (meta ?? []).length > 0 && meta.every(m => m.status === m.variant && m.size === 26 && m.h >= 44), meta)
check('10. every row with a dish shows its P · C · F', meta.every(m => /P\s*\d+g\s*C\s*\d+g\s*F\s*\d+g/.test(m.macros)), meta.map(m => m.macros))
const nextRow = meta.find(m => m.variant === 'upnext')
check('11. exactly one row is next, labelled "· next"', meta.filter(m => m.variant === 'upnext').length === 1 && await ev(`/· next/i.test(${q('[data-meal-row][data-variant="upnext"]')}?.innerText ?? '')`), meta.map(m => m.variant))
const later = meta.filter(m => m.variant === 'later')
check('12. a later meal is softer ink, never lower opacity', later.length > 0 && later.every(m => m.opacity === '1' && m.ink !== meta.find(x => x.variant === 'upnext')?.ink), { later, nextRow })

console.log('\nD. The recipe sheet (3b)')
// ?leftovers=1: three dishes a meal, so the open meal has others to swap to and the Swap tab is drawn.
await load('leftovers=1', { tab: 'nutrition' })
await until(`!!document.querySelector('[data-meal-row][data-variant="upnext"] [data-meal-name]')`, 30000)
await wait(600)
const nextSlot = await ev(`${q('[data-meal-row][data-variant="upnext"]')}?.dataset.mealRow ?? null`)
await tapExpr(`${q('[data-meal-row][data-variant="upnext"] [data-meal-name]')}`)
await wait(500)
const sheet = await ev(`(() => { const s = ${q('[role="dialog"][data-meal-sheet]')}; if (!s) return null; const r = s.getBoundingClientRect(); const row = s.closest('[data-meal-row]'); return { slot: s.dataset.mealSheet, row: row?.dataset.mealRow, bottom: Math.round(r.bottom), top: Math.round(r.top), h: innerHeight, text: s.innerText.replace(/\\s+/g, ' ').slice(0, 400), tabs: [...s.querySelectorAll('[data-meal-sheet-tab]')].map(t => t.innerText.trim()), foot: s.querySelector('[data-meal-log]')?.innerText.trim(), method: s.querySelectorAll('[data-method-step]').length, ingredients: s.querySelectorAll('[data-ingredient-row]').length } })()`)
check('13. tapping a meal opens a bottom sheet for that meal, from the bottom of the screen', !!sheet && sheet.slot === nextSlot && sheet.row === sheet.slot && sheet.bottom === sheet.h && sheet.top > 0, sheet)
check('14. it has Recipe and Swap tabs and "I ate this" at the foot', !!sheet && sheet.tabs[0] === 'Recipe' && /^Swap/.test(sheet.tabs[1] ?? '') && /I ate this/.test(sheet.foot ?? ''), sheet)
check('15. the recipe lists the ingredients', !!sheet && sheet.ingredients > 0, sheet)
const scrim = await ev(`(() => { const s = ${q('[data-meal-sheet-scrim]')}; return s ? getComputedStyle(s).backgroundColor : null })()`)
check('16. the list behind it is dimmed', !!scrim && /rgba\(8, 6, 20, 0\.62\)/.test(scrim), scrim)
check('17. the page under it does not scroll', await ev(`document.body.style.overflow === 'hidden'`))
await shoot('nutrition-3b-sheet')
await tapExpr(q('[data-meal-sheet-tab="swap"]'))
const swap = await ev(`(() => { const s = ${q('[data-meal-sheet]')}; return s ? { list: !!s.querySelector('[data-meal-swap-list]'), ingredients: s.querySelectorAll('[data-ingredient-row]').length } : null })()`)
check('18. Swap shows the swap list in place of the recipe', !!swap && swap.list && swap.ingredients === 0, swap)
await tapExpr(q('[data-meal-sheet-close]'))
check('19. the close button shuts it, and the page scrolls again', await ev(`!document.querySelector('[data-meal-sheet]') && document.body.style.overflow !== 'hidden'`))
await tapExpr(`${q('[data-meal-row][data-variant="upnext"] [data-meal-name]')}`)
await d.escape()
check('20. Escape shuts it too', await ev(`!document.querySelector('[data-meal-sheet]')`))

console.log('\nE. "I ate this"')
const firstNext = await ev(`${q('[data-meal-row][data-variant="upnext"]')}?.dataset.mealRow ?? null`)
const eatenBefore = n(await ev(`${q('[data-testid="kcal-eaten"]')}?.innerText`))
await tapExpr(`${q('[data-meal-row][data-variant="upnext"] [data-meal-name]')}`)
await tapExpr(q('[data-meal-sheet] [data-meal-log]'))
await wait(600)
const state = await ev(`(() => { const r = document.querySelector('[data-meal-row=${J(firstNext ?? '')}]'); return { variant: r?.dataset.variant, status: r?.querySelector('[data-meal-status]')?.dataset.mealStatus, foot: r?.querySelector('[data-meal-log]')?.innerText.trim(), eaten: document.querySelector('[data-testid="kcal-eaten"]')?.innerText } })()`)
check('21. it logs the meal: the row turns eaten with a filled tick, the footer says Logged, and the eaten kcal moves',
  state.variant === 'eaten' && state.status === 'eaten' && /^Logged/.test(state.foot ?? '') && n(state.eaten) > eatenBefore, { firstNext, state, eatenBefore })
const kcalInk = await ev(`(() => { const k = document.querySelector('[data-meal-row=${J(firstNext ?? '')}] [data-testid="meal-row-kcal"]'); const p = document.createElement('span'); p.style.color = 'var(--primary-text)'; document.body.appendChild(p); const want = getComputedStyle(p).color; p.remove(); return k ? { got: getComputedStyle(k).color, want } : null })()`)
check('22. a logged meal\'s kcal is mint', !!kcalInk && kcalInk.got === kcalInk.want, kcalInk)
await d.escape()
await shoot('nutrition-3a-logged')

console.log('\nF. Meals already eaten (?ate=1: one eaten as planned, one eaten under another name)')
await load('ate=1', { tab: 'nutrition' })
await until(`document.querySelectorAll('[data-meal-row][data-variant="eaten"]').length > 0`, 30000)
await wait(600)
const ate = await ev(`[...document.querySelectorAll('[data-meal-row][data-variant="eaten"]')].map(r => ({ slot: r.dataset.mealRow, status: r.querySelector('[data-meal-status]')?.dataset.mealStatus, name: r.querySelector('[data-meal-name]')?.textContent.trim(), note: (r.querySelector(':scope > p')?.textContent ?? '').trim() }))`)
check('24. an eaten row has the filled tick and keeps the name that was eaten, its quiet note on the row itself',
  ate.length >= 2 && ate.every(r => r.status === 'eaten') && ate.some(r => r.name === 'Porridge with almond butter' && r.note.length > 0), ate)
await ev(`window.scrollTo(0, document.querySelector('[data-meals-header]').getBoundingClientRect().top + scrollY - 80)`)
await wait(300)
await shoot('nutrition-3a-ate')

console.log('\nG. An upcoming day from the strip')
await load('', { tab: 'nutrition' })
await until(`document.querySelectorAll('[data-meal-day]').length > 1`, 30000)
const upDay = await ev(`document.querySelectorAll('[data-meal-day]')[1].getAttribute('data-meal-day')`)
await ev(`document.querySelector('[data-meal-day=${J(upDay ?? '')}]').click()`)
await until(`!!document.querySelector('[data-testid="meal-day-grocery"]')`, 20000)
await wait(500)
const up = await ev(`(() => { const h = document.querySelector('[data-meals-header]'); return { header: h?.innerText.replace(/\\s+/g, ' '), plus: !!document.querySelector('[data-log-something-else]'), pill: !!h?.querySelector('[data-grocery-pill]'), add: !!document.querySelector('[data-testid="meal-day-grocery"]'), heading: document.querySelector('[data-testid="meal-day-heading"]')?.innerText, rows: [...document.querySelectorAll('[data-meal-row]')].map(r => r.querySelector('[data-meal-status]')?.dataset.mealStatus), hero: !!document.querySelector('[data-nutrition-hero]') } })()`)
check('25. the day\'s own meals row: "<Day>\'s meals", the grocery pill, no + (nothing to log yet), and "Add … to the shopping list"',
  !!up.heading && new RegExp(`^${up.heading}'s meals`, 'i').test(up.header ?? '') && up.pill && !up.plus && up.add && !up.hero, up)
check('26. every meal of that day is a plain row with a faint ring (nothing on it is eaten or next)', up.rows.length > 0 && up.rows.every(s => s === 'later'), up.rows)
await tapExpr(`document.querySelector('[data-meal-row] [data-meal-name]')`)
const upSheet = await ev(`(() => { const s = document.querySelector('[data-meal-sheet]'); return s ? { log: !!s.querySelector('[data-meal-log]'), regen: !!s.querySelector('[data-meal-regenerate]'), heart: !!s.querySelector('[data-meal-favourite]') } : null })()`)
check('27. its sheet offers no logging and no regenerate (each changes today, or the dish everywhere), but keeps the heart', !!upSheet && !upSheet.log && !upSheet.regen && upSheet.heart, upSheet)
await d.escape()
await shoot('nutrition-3a-upcoming')

const errs = await ev('window.__err ?? null')
check('23. no uncaught error on the page', errs === null, errs)
finish()
